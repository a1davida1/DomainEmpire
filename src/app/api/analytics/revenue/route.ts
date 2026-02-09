import { NextRequest, NextResponse } from 'next/server';
import { db, revenueSnapshots, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

// GET /api/analytics/revenue - Get revenue summary
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const rawDays = searchParams.get('days');
    const parsedDays = parseInt(rawDays || '30', 10);

    if (Number.isNaN(parsedDays) || parsedDays < 1) {
        return NextResponse.json({ error: 'Invalid days parameter' }, { status: 400 });
    }

    const days = Math.min(parsedDays, 365);
    const domainId = searchParams.get('domainId');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
        const conditions = [gte(revenueSnapshots.snapshotDate, startDate)];
        if (domainId) {
            conditions.push(eq(revenueSnapshots.domainId, domainId));
        }

        // Revenue by source (calculating from separate columns)
        const totals = await db
            .select({
                totalAdRevenue: sql<number>`sum(${revenueSnapshots.adRevenue})::float`,
                totalAffiliateRevenue: sql<number>`sum(${revenueSnapshots.affiliateRevenue})::float`,
                totalLeadGenRevenue: sql<number>`sum(${revenueSnapshots.leadGenRevenue})::float`,
                totalRevenue: sql<number>`sum(${revenueSnapshots.totalRevenue})::float`,
                totalClicks: sql<number>`sum(${revenueSnapshots.clicks})::int`,
                totalImpressions: sql<number>`sum(${revenueSnapshots.impressions})::int`,
                totalPageviews: sql<number>`sum(${revenueSnapshots.pageviews})::int`,
            })
            .from(revenueSnapshots)
            .where(and(...conditions));

        // Revenue by domain
        const byDomain = await db
            .select({
                domainId: revenueSnapshots.domainId,
                domain: domains.domain,
                totalRevenue: sql<number>`sum(${revenueSnapshots.totalRevenue})::float`,
                totalClicks: sql<number>`sum(${revenueSnapshots.clicks})::int`,
            })
            .from(revenueSnapshots)
            .innerJoin(domains, eq(revenueSnapshots.domainId, domains.id))
            .where(and(...conditions))
            .groupBy(revenueSnapshots.domainId, domains.domain)
            .orderBy(sql`sum(${revenueSnapshots.totalRevenue}) desc`)
            .limit(10);

        // Daily trend
        const dailyTrend = await db
            .select({
                date: sql<string>`date(${revenueSnapshots.snapshotDate})`,
                totalRevenue: sql<number>`sum(${revenueSnapshots.totalRevenue})::float`,
                adRevenue: sql<number>`sum(${revenueSnapshots.adRevenue})::float`,
                affiliateRevenue: sql<number>`sum(${revenueSnapshots.affiliateRevenue})::float`,
            })
            .from(revenueSnapshots)
            .where(and(...conditions))
            .groupBy(sql`date(${revenueSnapshots.snapshotDate})`)
            .orderBy(sql`date(${revenueSnapshots.snapshotDate})`);

        const t = totals[0] || {};
        const totalRev = (t.totalRevenue || 0);
        const impressions = (t.totalImpressions || 0);
        const clicks = (t.totalClicks || 0);

        const bySource = [
            { source: 'ads', totalRevenue: Math.round((t.totalAdRevenue || 0) * 100) / 100 },
            { source: 'affiliate', totalRevenue: Math.round((t.totalAffiliateRevenue || 0) * 100) / 100 },
            { source: 'leadgen', totalRevenue: Math.round((t.totalLeadGenRevenue || 0) * 100) / 100 },
        ].filter(s => s.totalRevenue > 0);

        return NextResponse.json({
            period: { days, startDate: startDate.toISOString(), endDate: new Date().toISOString() },
            summary: {
                totalRevenue: Math.round(totalRev * 100) / 100,
                totalClicks: clicks,
                totalImpressions: impressions,
                avgRpm: impressions > 0 ? Math.round((totalRev / impressions) * 1000 * 100) / 100 : 0,
                ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
            },
            bySource,
            topDomains: byDomain.map(d => ({
                ...d,
                totalRevenue: Math.round((d.totalRevenue || 0) * 100) / 100,
            })),
            dailyTrend: dailyTrend.map(d => ({
                ...d,
                totalRevenue: Math.round((d.totalRevenue || 0) * 100) / 100,
                adRevenue: Math.round((d.adRevenue || 0) * 100) / 100,
                affiliateRevenue: Math.round((d.affiliateRevenue || 0) * 100) / 100,
            })),
        });
    } catch (error) {
        console.error('Get revenue analytics failed:', error);
        return NextResponse.json({ error: 'Failed to get revenue analytics' }, { status: 500 });
    }
}
