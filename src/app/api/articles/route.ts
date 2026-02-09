import { NextRequest, NextResponse } from 'next/server';
import { db, articles, contentQueue, domains, NewArticle } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';

// Validation schema for creating an article generation job
const generateArticleSchema = z.object({
    domainId: z.string().uuid(),
    targetKeyword: z.string().min(1),
    secondaryKeywords: z.array(z.string()).optional().default([]),
    priority: z.number().min(1).max(10).optional().default(5),
});

// GET /api/articles - List all articles with filters
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const searchParams = request.nextUrl.searchParams;
        const domainId = searchParams.get('domainId');
        const status = searchParams.get('status');
        const rawLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
        const rawOffset = Number.parseInt(searchParams.get('offset') || '0', 10);

        if (Number.isNaN(rawOffset) || rawOffset < 0) {
            return NextResponse.json({ error: 'Invalid offset' }, { status: 400 });
        }

        const limit = (Number.isNaN(rawLimit) || rawLimit < 1) ? 50 : Math.min(rawLimit, 100);
        const offset = rawOffset;

        const conditions: ReturnType<typeof eq>[] = [];

        if (domainId) {
            conditions.push(eq(articles.domainId, domainId));
        }
        if (status) {
            conditions.push(eq(articles.status, status as typeof articles.status.enumValues[number]));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const results = await db
            .select({
                id: articles.id,
                domainId: articles.domainId,
                title: articles.title,
                slug: articles.slug,
                targetKeyword: articles.targetKeyword,
                wordCount: articles.wordCount,
                status: articles.status,
                publishedAt: articles.publishedAt,
                createdAt: articles.createdAt,
                generationCost: articles.generationCost,
                domain: domains.domain,
            })
            .from(articles)
            .leftJoin(domains, eq(articles.domainId, domains.id))
            .where(whereClause)
            .orderBy(articles.createdAt)
            .limit(limit)
            .offset(offset);

        const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(articles)
            .where(whereClause);

        return NextResponse.json({
            articles: results,
            pagination: {
                total: countResult[0]?.count ?? 0,
                limit,
                offset,
            },
        });
    } catch (error) {
        console.error('Failed to fetch articles:', error);
        return NextResponse.json(
            { error: 'Failed to fetch articles' },
            { status: 500 }
        );
    }
}

// POST /api/articles - Queue a new article generation job
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const validationResult = generateArticleSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: validationResult.error.flatten() },
                { status: 400 }
            );
        }

        const data = validationResult.data;

        // Verify domain exists
        const domain = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(eq(domains.id, data.domainId))
            .limit(1);

        if (domain.length === 0) {
            return NextResponse.json(
                { error: 'Domain not found' },
                { status: 404 }
            );
        }

        // Generate slug from keyword
        let slug = data.targetKeyword
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '-')
            .replaceAll(/^-+|-+$/g, ''); // Remove one-or-more hyphens at start/end

        if (!slug) {
            slug = `untitled-${Date.now()}`;
        }

        // Create article in draft/generating status
        const newArticle: NewArticle = {
            domainId: data.domainId,
            title: data.targetKeyword, // Will be updated by AI
            slug,
            targetKeyword: data.targetKeyword,
            secondaryKeywords: data.secondaryKeywords,
            status: 'generating',
        };

        const result = await db.transaction(async (tx) => {
            const insertedArticle = await tx.insert(articles).values(newArticle).returning();
            const articleId = insertedArticle[0].id;

            // Create queue job for outline generation (first step)
            await tx.insert(contentQueue).values({
                jobType: 'generate_outline',
                domainId: data.domainId,
                articleId,
                priority: data.priority,
                payload: {
                    targetKeyword: data.targetKeyword,
                    secondaryKeywords: data.secondaryKeywords,
                    domainName: domain[0].domain,
                },
                status: 'pending',
            });

            return insertedArticle[0];
        });

        return NextResponse.json(
            {
                article: result,
                message: 'Article generation queued successfully',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to queue article generation:', error);
        return NextResponse.json(
            { error: 'Failed to queue article generation' },
            { status: 500 }
        );
    }
}
