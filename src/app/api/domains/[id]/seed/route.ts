import { NextRequest, NextResponse } from 'next/server';
import { db, domains, keywords, articles, contentQueue } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 10;

const seedSchema = z.object({
    articleCount: z.number().int().min(1).max(20).default(5),
    priority: z.number().int().min(MIN_PRIORITY).max(MAX_PRIORITY).default(5),
});

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * Generate a URL-safe slug from a keyword.
 * Ensures non-empty result and handles edge cases like "C++" or pure symbols.
 */
function generateSlug(keyword: string, fallbackId: string): string {
    const slug = keyword
        .toLowerCase()
        .replaceAll(/\s+/g, '-')
        .replaceAll(/[^a-z0-9-]/g, '');

    // If slug is empty after sanitization, use a fallback
    if (!slug || slug === '-' || slug.replaceAll('-', '') === '') {
        // Generate a slug from the keyword using transliteration-style fallback
        const fallback = keyword
            .toLowerCase()
            .replaceAll(/\+/g, '-plus')
            .replaceAll(/#/g, '-sharp')
            .replaceAll(/\./g, '-dot')
            .replaceAll(/[^a-z0-9-]/g, '')
            .replaceAll(/-+/g, '-')
            .replaceAll(/^-|-$/g, '');

        if (!fallback) {
            // Last resort: use part of the fallback ID
            return `article-${fallbackId.slice(0, 8)}`;
        }
        return fallback;
    }

    return slug.replaceAll(/-+/g, '-').replaceAll(/^-|-$/g, '');
}

/**
 * Check for duplicate slugs and append suffix if needed.
 * Uses the existing slugs set to avoid duplicates within the same batch.
 */
function ensureUniqueSlug(baseSlug: string, existingSlugs: Set<string>): string {
    let slug = baseSlug;
    let counter = 1;

    while (existingSlugs.has(slug)) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }

    existingSlugs.add(slug);
    return slug;
}

// POST /api/domains/[id]/seed - Generate multiple articles for a domain
export async function POST(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        // Validate request body
        const body = await request.json();
        const { articleCount, priority } = seedSchema.parse(body);

        // Get domain
        const domain = await db
            .select()
            .from(domains)
            .where(eq(domains.id, id))
            .limit(1);

        if (domain.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const domainRecord = domain[0];

        // Note: Ownership check not required for single-operator system
        // If multi-user support is added, verify domain ownership here

        // Get available keywords for this domain that don't have articles yet
        const availableKeywords = await db
            .select()
            .from(keywords)
            .where(and(
                eq(keywords.domainId, id),
                isNull(keywords.articleId) // Not yet used in an article
            ))
            .limit(articleCount * 2); // Get extra in case some are filtered

        // If we don't have enough keywords, generate keyword research job first
        if (availableKeywords.length < articleCount) {
            // Clamp priority to avoid underflow (min is MIN_PRIORITY)
            const jobPriority = Math.max(priority - 1, MIN_PRIORITY);

            // Queue keyword research job
            const keywordJobId = randomUUID();
            await db.insert(contentQueue).values({
                id: keywordJobId,
                domainId: id,
                jobType: 'keyword_research',
                priority: jobPriority,
                payload: {
                    domain: domainRecord.domain,
                    niche: domainRecord.niche,
                    subNiche: domainRecord.subNiche,
                    targetCount: Math.max(20, articleCount * 3),
                },
                status: 'pending',
                scheduledFor: new Date(),
                maxAttempts: 3,
            });

            return NextResponse.json({
                message: 'Keyword research queued - seed will run after keywords are generated',
                keywordJobId,
                availableKeywords: availableKeywords.length,
                requestedArticles: articleCount,
            });
        }

        // Pre-fetch existing slugs from DB to ensure uniqueness across persisted + batch
        const existingArticles = await db
            .select({ slug: articles.slug })
            .from(articles)
            .where(eq(articles.domainId, id));

        const existingSlugs = new Set<string>(existingArticles.map(a => a.slug));

        // Create articles and queue generation jobs for each - wrapped in transaction
        const createdJobs: Array<{ articleId: string; keyword: string; jobId: string }> = [];

        for (let i = 0; i < articleCount && i < availableKeywords.length; i++) {
            const kw = availableKeywords[i];
            const articleId = randomUUID();
            const jobId = randomUUID();

            // Generate slug with guaranteed non-empty result and uniqueness
            const baseSlug = generateSlug(kw.keyword, articleId);
            const slug = ensureUniqueSlug(baseSlug, existingSlugs);

            // Wrap article insert, job insert, and keyword update in a transaction
            await db.transaction(async (tx) => {
                // Create article in draft status
                await tx.insert(articles).values({
                    id: articleId,
                    domainId: id,
                    title: kw.keyword, // Will be updated by outline generator
                    slug,
                    targetKeyword: kw.keyword,
                    secondaryKeywords: [],
                    status: 'generating',
                });

                // Queue outline generation job
                await tx.insert(contentQueue).values({
                    id: jobId,
                    domainId: id,
                    articleId,
                    jobType: 'generate_outline',
                    priority,
                    payload: {
                        targetKeyword: kw.keyword,
                        secondaryKeywords: [],
                        domainName: domainRecord.domain,
                        niche: domainRecord.niche,
                        subNiche: domainRecord.subNiche,
                        monthlyVolume: kw.monthlyVolume,
                        difficulty: kw.difficulty,
                    },
                    status: 'pending',
                    scheduledFor: new Date(),
                    maxAttempts: 3,
                });

                // Mark keyword as used by linking to article
                await tx
                    .update(keywords)
                    .set({ articleId, status: 'assigned' })
                    .where(eq(keywords.id, kw.id));
            });

            // Only add to createdJobs after transaction succeeds
            createdJobs.push({
                articleId,
                keyword: kw.keyword,
                jobId,
            });
        }

        return NextResponse.json({
            success: true,
            domain: domainRecord.domain,
            articlesQueued: createdJobs.length,
            jobs: createdJobs,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Seed domain failed:', error);
        return NextResponse.json(
            { error: 'Failed to seed domain' },
            { status: 500 }
        );
    }
}
