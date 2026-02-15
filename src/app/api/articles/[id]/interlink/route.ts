import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, ne, and } from 'drizzle-orm';
import { isInternalLinkingEnabled } from '@/lib/content/link-policy';

function escapeRegExp(string: string) {
    return string.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/articles/[id]/interlink - Suggest internal links for an article
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    if (!isInternalLinkingEnabled()) {
        return NextResponse.json(
            { error: 'Automated interlinking is disabled by policy' },
            { status: 403 },
        );
    }

    const { id } = params;

    try {
        // 1. Fetch the target article
        const targetArticle = await db.query.articles.findFirst({
            where: eq(articles.id, id),
            with: {
                domain: true,
            }
        });

        if (!targetArticle || !targetArticle.contentMarkdown) {
            return NextResponse.json({ suggestions: [] });
        }

        // 2. Fetch all other published articles in the same domain
        const otherArticles = await db.query.articles.findMany({
            where: and(
                eq(articles.domainId, targetArticle.domainId),
                ne(articles.id, id),
                eq(articles.status, 'published')
            ),
            columns: {
                id: true,
                title: true,
                slug: true,
                targetKeyword: true,
            }
        });

        // Keep original for context snippets
        const originalContent = targetArticle.contentMarkdown;
        const lowerContent = originalContent.toLowerCase();
        const suggestions = [];

        // 3. Find opportunities
        for (const article of otherArticles) {
            // Check if title or keyword appears in content
            const phrase = article.targetKeyword || article.title;
            if (!phrase) continue;

            const lowerPhrase = phrase.toLowerCase();

            // Regex match for whole word
            const regex = new RegExp(`\\b${escapeRegExp(lowerPhrase)}\\b`, 'i');

            if (regex.test(lowerContent)) {
                // Check if already linked (rudimentary check)
                const alreadyLinked = originalContent.includes(`](${article.slug})`) || originalContent.includes(`](${article.slug}/)`);

                if (!alreadyLinked) {
                    // Find match position in lowercase, extract from original
                    const matchIdx = lowerContent.indexOf(lowerPhrase);
                    const start = Math.max(0, matchIdx - 30);
                    const end = Math.min(originalContent.length, matchIdx + lowerPhrase.length + 30);

                    suggestions.push({
                        articleId: article.id,
                        title: article.title,
                        slug: article.slug,
                        phrase: phrase,
                        context: `...${originalContent.substring(start, end)}...`,
                        relevance: 0.9
                    });
                }
            }
        }

        return NextResponse.json({
            articleId: id,
            suggestions: suggestions.slice(0, 10) // Limit to top 10
        });

    } catch (error) {
        console.error('Interlinking failed:', error);
        return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 });
    }
}
