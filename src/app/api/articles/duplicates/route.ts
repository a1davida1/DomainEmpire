import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, isNotNull, isNull } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Helper: Tokenize content into 3-word shingles (simple n-grams)
function getShingles(text: string, n: number = 3): Set<string> {
    const words = text.toLowerCase().replaceAll(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
    const shingles = new Set<string>();
    if (words.length < n) return shingles;

    for (let i = 0; i <= words.length - n; i++) {
        shingles.add(words.slice(i, i + n).join(' '));
    }
    return shingles;
}

// Helper: Calculate Jaccard Similarity between two sets of shingles
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

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
    const threshold = (!Number.isNaN(rawThreshold) && rawThreshold >= 0.1 && rawThreshold <= 1)
        ? rawThreshold
        : 0.7;

    if (!domainId) {
        return NextResponse.json({ error: 'Domain ID is required' }, { status: 400 });
    }

    if (!UUID_RE.test(domainId)) {
        return NextResponse.json({ error: 'Invalid domain ID format' }, { status: 400 });
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
            .where(and(eq(articles.domainId, domainId), isNotNull(articles.contentMarkdown), isNull(articles.deletedAt)));

        if (allArticles.length < 2) {
            return NextResponse.json({ duplicates: [], domainId, totalChecked: allArticles.length, duplicateCount: 0 });
        }

        // Precompute shingles for all articles
        const processedArticles = allArticles.map(article => ({
            id: article.id,
            title: article.title,
            shingles: getShingles(article.contentMarkdown || ''),
            wordCount: (article.contentMarkdown || '').split(/\s+/).length,
        })).filter(a => a.shingles.size > 0);

        // For large datasets, use MinHash signatures to avoid O(N²) full comparisons.
        // Each article gets a fixed-size signature; only articles with matching signature
        // bands are compared with full Jaccard similarity.
        const NUM_HASHES = 100;
        const BAND_SIZE = 5;
        const NUM_BANDS = NUM_HASHES / BAND_SIZE;

        // Generate MinHash signatures
        function minHashSignature(shingles: Set<string>): number[] {
            const sig = new Array<number>(NUM_HASHES).fill(Infinity);
            for (const shingle of shingles) {
                for (let i = 0; i < NUM_HASHES; i++) {
                    // Simple hash: use different seeds per hash function
                    let h = i * 0x9e3779b9;
                    for (let c = 0; c < shingle.length; c++) {
                        h = Math.trunc((h << 5) - h + (shingle.codePointAt(c) || 0));
                    }
                    h = h >>> 0; // unsigned
                    if (h < sig[i]) sig[i] = h;
                }
            }
            return sig;
        }

        const articlesWithSigs = processedArticles.map(a => ({
            ...a,
            signature: minHashSignature(a.shingles),
        }));

        // LSH: group articles into buckets by band
        const candidatePairs = new Set<string>();
        for (let band = 0; band < NUM_BANDS; band++) {
            const buckets = new Map<string, string[]>();
            const start = band * BAND_SIZE;

            for (const article of articlesWithSigs) {
                const bandKey = article.signature.slice(start, start + BAND_SIZE).join(',');
                const bucket = buckets.get(bandKey) ?? [];
                // Add pairs with all existing articles in this bucket
                for (const existingId of bucket) {
                    const pairKey = [existingId, article.id].sort((a, b) => a.localeCompare(b)).join('|||');
                    candidatePairs.add(pairKey);
                }
                bucket.push(article.id);
                buckets.set(bandKey, bucket);
            }
        }

        // Only compute full Jaccard similarity for candidate pairs
        const articleMap = new Map(articlesWithSigs.map(a => [a.id, a]));
        const duplicates = [];

        for (const pairKey of candidatePairs) {
            const [idA, idB] = pairKey.split('|||');
            const a = articleMap.get(idA);
            const b = articleMap.get(idB);
            if (!a || !b) continue;

            const similarity = jaccardSimilarity(a.shingles, b.shingles);
            if (similarity >= threshold) {
                duplicates.push({
                    articleA: { id: a.id, title: a.title, wordCount: a.wordCount },
                    articleB: { id: b.id, title: b.title, wordCount: b.wordCount },
                    similarity: Math.round(similarity * 100) / 100,
                });
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
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to detect duplicates' }, { status: 500 });
    }
}
