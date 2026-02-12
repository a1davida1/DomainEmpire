/**
 * Automated monitoring triggers.
 * Checks for traffic drops, revenue anomalies, site-down, and backlink losses.
 * Designed to be called from the worker's hourly loop.
 */

import { db, domains, revenueSnapshots, backlinkSnapshots } from '@/lib/db';
import { eq, and, gte, desc, isNull, sql } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';

/**
 * Check for traffic drops across all active domains.
 * Compares last 7d pageviews to previous 7d.
 * 30% drop = warning, 50% drop = critical.
 */
export async function checkTrafficDrops() {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const activeDomains = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)));

        for (const domain of activeDomains) {
            const [recent, previous] = await Promise.all([
                db.select({ total: sql<number>`COALESCE(SUM(${revenueSnapshots.pageviews}), 0)::int` })
                    .from(revenueSnapshots)
                    .where(and(eq(revenueSnapshots.domainId, domain.id), gte(revenueSnapshots.snapshotDate, sevenDaysAgo))),
                db.select({ total: sql<number>`COALESCE(SUM(${revenueSnapshots.pageviews}), 0)::int` })
                    .from(revenueSnapshots)
                    .where(and(
                        eq(revenueSnapshots.domainId, domain.id),
                        gte(revenueSnapshots.snapshotDate, fourteenDaysAgo),
                        sql`${revenueSnapshots.snapshotDate} < ${sevenDaysAgo}`,
                    )),
            ]);

            const recentTotal = recent[0]?.total ?? 0;
            const previousTotal = previous[0]?.total ?? 0;

            if (previousTotal > 10) { // Only alert if there was meaningful traffic
                const dropPercent = ((previousTotal - recentTotal) / previousTotal) * 100;

                if (dropPercent >= 50) {
                    await createNotification({
                        domainId: domain.id,
                        type: 'traffic_drop',
                        severity: 'critical',
                        title: `Traffic dropped ${Math.round(dropPercent)}% on ${domain.domain}`,
                        message: `Pageviews fell from ${previousTotal} to ${recentTotal} over the past 7 days.`,
                        actionUrl: `/dashboard/domains/${domain.id}`,
                    });
                } else if (dropPercent >= 30) {
                    await createNotification({
                        domainId: domain.id,
                        type: 'traffic_drop',
                        severity: 'warning',
                        title: `Traffic down ${Math.round(dropPercent)}% on ${domain.domain}`,
                        message: `Pageviews fell from ${previousTotal} to ${recentTotal} over the past 7 days.`,
                        actionUrl: `/dashboard/domains/${domain.id}`,
                    });
                }
            }
        }
    } catch (error) {
        console.error('Traffic drop check failed:', error);
    }
}

/**
 * Check for revenue anomalies.
 * Compares last 7d revenue to rolling 30d average.
 * 40% drop = warning.
 */
export async function checkRevenueAnomalies() {
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const activeDomains = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)));

        for (const domain of activeDomains) {
            const [recent, avg30d] = await Promise.all([
                db.select({ total: sql<number>`COALESCE(SUM(${revenueSnapshots.totalRevenue}::numeric), 0)::real` })
                    .from(revenueSnapshots)
                    .where(and(eq(revenueSnapshots.domainId, domain.id), gte(revenueSnapshots.snapshotDate, sevenDaysAgo))),
                db.select({ avg: sql<number>`COALESCE(AVG(${revenueSnapshots.totalRevenue}::numeric) * 7, 0)::real` })
                    .from(revenueSnapshots)
                    .where(and(eq(revenueSnapshots.domainId, domain.id), gte(revenueSnapshots.snapshotDate, thirtyDaysAgo))),
            ]);

            const recentRevenue = recent[0]?.total ?? 0;
            const expectedWeekly = avg30d[0]?.avg ?? 0;

            if (expectedWeekly > 1) { // Only if meaningful revenue
                const dropPercent = ((expectedWeekly - recentRevenue) / expectedWeekly) * 100;
                if (dropPercent >= 40) {
                    await createNotification({
                        domainId: domain.id,
                        type: 'revenue_milestone',
                        severity: 'warning',
                        title: `Revenue drop on ${domain.domain}`,
                        message: `7-day revenue ($${recentRevenue.toFixed(2)}) is ${Math.round(dropPercent)}% below the 30-day average.`,
                        actionUrl: `/dashboard/domains/${domain.id}`,
                    });
                }
            }
        }
    } catch (error) {
        console.error('Revenue anomaly check failed:', error);
    }
}

/**
 * Check if deployed sites are accessible.
 * HEAD request to each deployed domain.
 */
export async function checkSiteHealth() {
    try {
        const deployedDomains = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)));

        for (const domain of deployedDomains) {
            try {
                const response = await fetch(`https://${domain.domain}/`, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(10000),
                });

                if (!response.ok) {
                    await createNotification({
                        domainId: domain.id,
                        type: 'deploy_failed',
                        severity: 'critical',
                        title: `${domain.domain} returned HTTP ${response.status}`,
                        message: `Site health check failed with status ${response.status}.`,
                        actionUrl: `/dashboard/domains/${domain.id}`,
                    });
                }
            } catch {
                await createNotification({
                    domainId: domain.id,
                    type: 'deploy_failed',
                    severity: 'critical',
                    title: `${domain.domain} is unreachable`,
                    message: `Could not connect to https://${domain.domain}/. The site may be down.`,
                    actionUrl: `/dashboard/domains/${domain.id}`,
                });
            }
        }
    } catch (error) {
        console.error('Site health check failed:', error);
    }
}

/**
 * Check for significant backlink losses.
 * Compares latest snapshot to previous. 10% referringDomains drop triggers alert.
 */
export async function checkBacklinkLosses() {
    try {
        const activeDomains = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)));

        for (const domain of activeDomains) {
            const snapshots = await db
                .select()
                .from(backlinkSnapshots)
                .where(eq(backlinkSnapshots.domainId, domain.id))
                .orderBy(desc(backlinkSnapshots.snapshotDate))
                .limit(2);

            if (snapshots.length < 2) continue;

            const [latest, previous] = snapshots;
            const prevDomains = previous.referringDomains ?? 0;
            const currDomains = latest.referringDomains ?? 0;

            if (prevDomains > 5) {
                const dropPercent = ((prevDomains - currDomains) / prevDomains) * 100;
                if (dropPercent >= 10) {
                    await createNotification({
                        domainId: domain.id,
                        type: 'backlink_lost',
                        severity: 'warning',
                        title: `Backlink loss on ${domain.domain}`,
                        message: `Referring domains dropped from ${prevDomains} to ${currDomains} (${Math.round(dropPercent)}% decrease).`,
                        actionUrl: `/dashboard/domains/${domain.id}`,
                    });
                }
            }
        }
    } catch (error) {
        console.error('Backlink loss check failed:', error);
    }
}

/**
 * Run all monitoring checks. Call from the worker's hourly loop.
 */
export async function runAllMonitoringChecks() {
    console.log('[Monitoring] Running all checks...');
    await Promise.allSettled([
        checkTrafficDrops(),
        checkRevenueAnomalies(),
        checkSiteHealth(),
        checkBacklinkLosses(),
    ]);
    console.log('[Monitoring] All checks complete.');
}
