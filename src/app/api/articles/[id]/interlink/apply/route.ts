/**
 * Apply internal link suggestions to article content.
 * POST /api/articles/[id]/interlink/apply
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, articles, contentRevisions } from '@/lib/db';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isInternalLinkingEnabled } from '@/lib/content/link-policy';

const applySchema = z.object({
    suggestions: z.array(z.object({
        phrase: z.string().min(1),
        slug: z.string().min(1),
    })).min(1).max(50),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    if (!isInternalLinkingEnabled()) {
        return NextResponse.json(
            { error: 'Automated interlinking is disabled by policy' },
            { status: 403 },
        );
    }

    try {
        const { id } = await params;
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const parsed = applySchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        // Load article
        const article = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
        if (article.length === 0) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        let markdown = article[0].contentMarkdown || '';
        let appliedCount = 0;

        for (const { phrase, slug } of parsed.data.suggestions) {
            // Only replace first unlinked occurrence
            // Skip if phrase is already inside a markdown link
            const linkPattern = new RegExp(`\\[([^\\]]*${escapeRegex(phrase)}[^\\]]*)\\]\\(`);
            if (linkPattern.test(markdown)) continue;

            const phrasePattern = new RegExp(`(?<!\\[)\\b(${escapeRegex(phrase)})\\b(?!\\])`, 'i');
            const match = phrasePattern.exec(markdown);
            if (match) {
                markdown = markdown.slice(0, match.index) +
                    `[${match[1]}](/${slug}/)` +
                    markdown.slice(match.index + match[0].length);
                appliedCount++;
            }
        }

        if (appliedCount === 0) {
            return NextResponse.json({ applied: 0, message: 'No links could be applied' });
        }

        // Get next revision number
        const maxRev = await db.select({
            max: sql<number>`COALESCE(MAX(${contentRevisions.revisionNumber}), 0)`,
        }).from(contentRevisions).where(eq(contentRevisions.articleId, id));

        const nextRevision = (maxRev[0]?.max ?? 0) + 1;

        // Update article and create revision
        // Update article and create revision inside transaction
        await db.transaction(async (tx) => {
            await tx.update(articles).set({
                contentMarkdown: markdown,
                updatedAt: new Date(),
            }).where(eq(articles.id, id));

            await tx.insert(contentRevisions).values({
                articleId: id,
                revisionNumber: nextRevision,
                title: article[0].title,
                contentMarkdown: markdown,
                metaDescription: article[0].metaDescription,
                wordCount: markdown.split(/\s+/).length,
                changeType: 'manual_edit',
                changeSummary: `Auto-applied ${appliedCount} internal link${appliedCount > 1 ? 's' : ''}`,
            });
        });

        return NextResponse.json({ applied: appliedCount, revision: nextRevision });
    } catch (error) {
        console.error('Interlink apply error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
