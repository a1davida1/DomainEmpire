import { NextRequest, NextResponse } from 'next/server';
import { db, articles, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, isNotNull } from 'drizzle-orm';

// Helper: Tokenize content into 3-word shingles (simple n-grams)
function getShingles(text: string, n: number = 3): Set<string> {
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 0);
    const shingles = new Set<string>();
    if (words.length < n) return shingles;

    for (let i = 0; i <= words.length - n; i++) {
        shingles.add(words.slice(i, i + n).join(' '));
    }
    return shingles;
}

// Helper: Calculate Jaccard Similarity between two sets of shingles
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    if (setA.size === 0 || setB.size === 0) return 0.0;

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);

    return intersection.size / union.size;
}

// GET /api/articles/duplicates - Detect duplicate content within a domain
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');
    const rawThreshold = Number(searchParams.get('threshold'));
    const threshold = (!Number.isNaN(rawThreshold) && rawThreshold >= 0.1 && rawThreshold <= 1.0)
        ? rawThreshold
        : 0.7;

    if (!domainId) {
        return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
    }

    try {
        // Fetch all articles with content for the domain
        const allArticles = await db
            .select({
                id: articles.id,
                title: articles.title,
                contentMarkdown: articles.contentMarkdown,
            })
            .from(articles)
            .where(and(eq(articles.domainId, domainId), isNotNull(articles.contentMarkdown)));

        if (allArticles.length < 2) {
            return NextResponse.json({ duplicates: [] });
        }

        // Precompute shingles for all articles
        const processedArticles = allArticles.map(article => ({
            id: article.id,
            title: article.title,
            shingles: getShingles(article.contentMarkdown || ''),
            wordCount: (article.contentMarkdown || '').split(/\s+/).length,
        })).filter(a => a.shingles.size > 0);

        const duplicates = [];
        const checkedPairs = new Set<string>();

        // Compare all pairs (O(N^2) but acceptable for typical domain size < 1000)
        for (let i = 0; i < processedArticles.length; i++) {
            for (let j = i + 1; j < processedArticles.length; j++) {
                const a = processedArticles[i];
                const b = processedArticles[j];

                const pairKey = [a.id, b.id].sort().join('-');
                if (checkedPairs.has(pairKey)) continue;
                checkedPairs.add(pairKey);

                const similarity = jaccardSimilarity(a.shingles, b.shingles);

                if (similarity >= threshold) {
                    duplicates.push({
                        articleA: { id: a.id, title: a.title, wordCount: a.wordCount },
                        articleB: { id: b.id, title: b.title, wordCount: b.wordCount },
                        similarity: Math.round(similarity * 100) / 100,
                    });
                }
            }
        }

        // Sort by highest similarity
        duplicates.sort((a, b) => b.similarity - a.similarity);

        return NextResponse.json({
            domainId,
            totalChecked: processedArticles.length,
            duplicateCount: duplicates.length,
            duplicates,
        });

    } catch (error) {
        console.error('Duplicate detection failed:', error);
        return NextResponse.json({ error: 'Failed to detect duplicates' }, { status: 500 });
    }
}
