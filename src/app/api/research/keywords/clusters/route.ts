import { NextRequest, NextResponse } from 'next/server';
import { db, keywords, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/research/keywords/clusters - Get keyword clusters by topic
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');
    const minClusterSize = Number(searchParams.get('minSize')) || 3;

    try {
        // Get all keywords
        let query = db
            .select({
                id: keywords.id,
                keyword: keywords.keyword,
                monthlyVolume: keywords.monthlyVolume,
                difficulty: keywords.difficulty,
                intent: keywords.intent,
                domainId: keywords.domainId,
                domain: domains.domain,
            })
            .from(keywords)
            .leftJoin(domains, eq(keywords.domainId, domains.id));

        if (domainId) {
            query = query.where(eq(keywords.domainId, domainId)) as typeof query;
        }

        const allKeywords = await query;

        // Simple clustering by first word
        const clusters: Record<string, {
            topic: string;
            keywords: typeof allKeywords;
            totalVolume: number;
            avgDifficulty: number;
        }> = {};

        for (const kw of allKeywords) {
            if (!kw.keyword) continue;
            const firstWord = kw.keyword.toLowerCase().split(/\s+/)[0];

            if (!clusters[firstWord]) {
                clusters[firstWord] = {
                    topic: firstWord,
                    keywords: [],
                    totalVolume: 0,
                    avgDifficulty: 0,
                };
            }
            clusters[firstWord].keywords.push(kw);
            clusters[firstWord].totalVolume += kw.monthlyVolume || 0;
        }

        // Calculate averages and filter by cluster size
        const clusterList = Object.values(clusters)
            .filter(c => c.keywords.length >= minClusterSize)
            .map(c => ({
                topic: c.topic,
                keywordCount: c.keywords.length,
                totalVolume: c.totalVolume,
                avgVolume: Math.round(c.totalVolume / c.keywords.length),
                avgDifficulty: Math.round(
                    c.keywords.reduce((sum, k) => sum + (k.difficulty || 0), 0) / c.keywords.length
                ),
                topKeywords: c.keywords
                    .sort((a, b) => (b.monthlyVolume || 0) - (a.monthlyVolume || 0))
                    .slice(0, 5)
                    .map(k => ({ keyword: k.keyword, volume: k.monthlyVolume })),
            }))
            .sort((a, b) => b.totalVolume - a.totalVolume);

        return NextResponse.json({
            clusterCount: clusterList.length,
            totalKeywords: allKeywords.length,
            clusters: clusterList.slice(0, 20), // Top 20 clusters
        });
    } catch (error) {
        console.error('Keyword clustering failed:', error);
        return NextResponse.json({ error: 'Failed to cluster keywords' }, { status: 500 });
    }
}
