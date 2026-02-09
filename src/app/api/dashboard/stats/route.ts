import { NextRequest, NextResponse } from 'next/server';
import { db, domains, articles, contentQueue, keywords } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sql, count } from 'drizzle-orm';

// GET /api/dashboard/stats - Dashboard summary statistics
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        // Domain counts by status
        const domainStats = await db
            .select({
                status: domains.status,
                count: count(),
            })
            .from(domains)
            .groupBy(domains.status);

        // Domain counts by tier
        const tierStats = await db
            .select({
                tier: domains.tier,
                count: count(),
            })
            .from(domains)
            .groupBy(domains.tier);

        // Article counts by status
        const articleStats = await db
            .select({
                status: articles.status,
                count: count(),
            })
            .from(articles)
            .groupBy(articles.status);

        // Queue stats
        const queueStats = await db
            .select({
                status: contentQueue.status,
                count: count(),
            })
            .from(contentQueue)
            .groupBy(contentQueue.status);

        // Keyword stats
        const keywordCount = await db
            .select({ count: count() })
            .from(keywords);

        // Total domains and deployed count
        const totals = await db
            .select({
                total: count(),
                deployed: sql<number>`sum(case when ${domains.isDeployed} = true then 1 else 0 end)::int`,
            })
            .from(domains);

        // Calculate total estimated value
        const valueStats = await db
            .select({
                totalLow: sql<number>`sum(${domains.estimatedFlipValueLow})::float`,
                totalHigh: sql<number>`sum(${domains.estimatedFlipValueHigh})::float`,
            })
            .from(domains);

        const response = NextResponse.json({
            domains: {
                total: totals[0]?.total || 0,
                deployed: totals[0]?.deployed || 0,
                byStatus: Object.fromEntries(domainStats.map(s => [s.status, s.count])),
                byTier: Object.fromEntries(tierStats.map(t => [t.tier || 0, t.count])),
            },
            articles: {
                total: articleStats.reduce((sum, s) => sum + (s.count || 0), 0),
                byStatus: Object.fromEntries(articleStats.map(s => [s.status, s.count])),
            },
            queue: {
                total: queueStats.reduce((sum, s) => sum + (s.count || 0), 0),
                byStatus: Object.fromEntries(queueStats.map(s => [s.status, s.count])),
            },
            keywords: {
                total: keywordCount[0]?.count || 0,
            },
            value: {
                estimatedLow: Math.round((valueStats[0]?.totalLow || 0) * 100) / 100,
                estimatedHigh: Math.round((valueStats[0]?.totalHigh || 0) * 100) / 100,
            },
        });

        // Cache privately for 60 seconds (authenticated route), allow stale for 5 minutes
        response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');

        return response;
    } catch (error) {
        console.error('Dashboard stats failed:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
