import { NextRequest, NextResponse } from 'next/server';
import { db, domains, articles, keywords } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { inArray, sql, count } from 'drizzle-orm';
import { z } from 'zod';

const compareSchema = z.object({
    domainIds: z.array(z.string().uuid()).min(2).max(5),
});

// POST /api/research/domains/compare - Compare multiple domains
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { domainIds } = compareSchema.parse(body);

        // Get domains
        const domainList = await db
            .select()
            .from(domains)
            .where(inArray(domains.id, domainIds));

        if (domainList.length !== domainIds.length) {
            return NextResponse.json({ error: 'Some domains not found' }, { status: 404 });
        }

        // Get article counts per domain
        const articleCounts = await db
            .select({
                domainId: articles.domainId,
                total: count(),
                published: sql<number>`sum(case when ${articles.status} = 'published' then 1 else 0 end)::int`,
            })
            .from(articles)
            .where(inArray(articles.domainId, domainIds))
            .groupBy(articles.domainId);

        // Get keyword counts per domain
        const keywordCounts = await db
            .select({
                domainId: keywords.domainId,
                total: count(),
                totalVolume: sql<number>`sum(${keywords.monthlyVolume})::int`,
            })
            .from(keywords)
            .where(inArray(keywords.domainId, domainIds))
            .groupBy(keywords.domainId);

        // Get revenue totals per domain (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Build comparison data
        const comparison = domainList.map(d => {
            const artStats = articleCounts.find(a => a.domainId === d.id) || { total: 0, published: 0 };
            const kwStats = keywordCounts.find(k => k.domainId === d.id) || { total: 0, totalVolume: 0 };

            return {
                id: d.id,
                domain: d.domain,
                tier: d.tier,
                status: d.status,
                niche: d.niche,
                isDeployed: d.isDeployed,
                articles: { total: artStats.total, published: artStats.published || 0 },
                keywords: { total: kwStats.total, totalVolume: kwStats.totalVolume || 0 },
                valuation: {
                    low: d.estimatedFlipValueLow,
                    high: d.estimatedFlipValueHigh,
                },
                purchasePrice: d.purchasePrice,
                roi: d.purchasePrice && d.estimatedFlipValueLow
                    ? Math.round(((d.estimatedFlipValueLow - d.purchasePrice) / d.purchasePrice) * 100)
                    : null,
            };
        });

        // Sort by estimated value
        comparison.sort((a, b) => (b.valuation.high || 0) - (a.valuation.high || 0));

        return NextResponse.json({
            domains: comparison,
            bestPerformers: {
                highestValue: comparison[0]?.domain,
                mostContent: [...comparison].sort((a, b) => b.articles.total - a.articles.total)[0]?.domain,
                mostKeywords: [...comparison].sort((a, b) => (b.keywords.totalVolume || 0) - (a.keywords.totalVolume || 0))[0]?.domain,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        console.error('Domain comparison failed:', error);
        return NextResponse.json({ error: 'Failed to compare domains' }, { status: 500 });
    }
}
