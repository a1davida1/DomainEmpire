/**
 * Batch internal linking for all articles in a domain.
 * POST /api/articles/interlink/batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, articles, contentRevisions } from '@/lib/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

const batchSchema = z.object({
    domainId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = batchSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        const { domainId } = parsed.data;

        // Get all published articles for this domain
        const published = await db
            .select({ id: articles.id, title: articles.title, slug: articles.slug, contentMarkdown: articles.contentMarkdown, targetKeyword: articles.targetKeyword })
            .from(articles)
            .where(and(
                eq(articles.domainId, domainId),
                eq(articles.status, 'published'),
                isNull(articles.deletedAt),
            ));

        if (published.length < 2) {
            return NextResponse.json({ message: 'Need at least 2 articles for interlinking', linked: 0 });
        }

        // Build keyword-to-slug map from all articles
        const linkTargets = published.map(a => ({
            slug: a.slug,
            phrases: [a.title, a.targetKeyword].filter(Boolean) as string[],
        }));

        let totalLinked = 0;

        for (const article of published) {
            let markdown = article.contentMarkdown || '';
            let linksAdded = 0;

            for (const target of linkTargets) {
                if (target.slug === article.slug) continue; // Don't self-link

                for (const phrase of target.phrases) {
                    if (phrase.length < 3) continue;
                    // Skip if already linked
                    const linkPattern = new RegExp(`\\[([^\\]]*${escapeRegex(phrase)}[^\\]]*)\\]\\(`);
                    if (linkPattern.test(markdown)) continue;

                    const phrasePattern = new RegExp(`(?<!\\[)\\b(${escapeRegex(phrase)})\\b(?!\\])`, 'i');
                    const match = phrasePattern.exec(markdown);
                    if (match) {
                        markdown = markdown.slice(0, match.index) +
                            `[${match[1]}](/${target.slug}/)` +
                            markdown.slice(match.index + match[0].length);
                        linksAdded++;
                        break; // One link per target per article
                    }
                }
            }

            if (linksAdded > 0) {
                const maxRev = await db.select({
                    max: sql<number>`COALESCE(MAX(${contentRevisions.revisionNumber}), 0)`,
                }).from(contentRevisions).where(eq(contentRevisions.articleId, article.id));

                await db.update(articles).set({
                    contentMarkdown: markdown,
                    updatedAt: new Date(),
                }).where(eq(articles.id, article.id));

                await db.insert(contentRevisions).values({
                    articleId: article.id,
                    revisionNumber: (maxRev[0]?.max ?? 0) + 1,
                    title: article.title,
                    contentMarkdown: markdown,
                    wordCount: markdown.split(/\s+/).length,
                    changeType: 'manual_edit',
                    changeSummary: `Batch interlink: added ${linksAdded} internal link${linksAdded > 1 ? 's' : ''}`,
                });

                totalLinked += linksAdded;
            }
        }

        return NextResponse.json({
            articlesProcessed: published.length,
            totalLinksAdded: totalLinked,
        });
    } catch (error) {
        console.error('Batch interlink error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
