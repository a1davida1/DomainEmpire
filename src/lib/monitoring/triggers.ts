/**
 * Automated monitoring triggers.
 * Checks for traffic drops, revenue anomalies, site-down, and backlink losses.
 * Designed to be called from the worker's hourly loop.
 */

import { db, domains, revenueSnapshots, backlinkSnapshots, articles } from '@/lib/db';
import { eq, and, gte, desc, isNull, sql } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';
import { safeFetch } from '@/lib/tpilot/core/ssrf';

const THIN_CONTENT_WORD_THRESHOLD = 500;
const THIN_CONTENT_SHARE_THRESHOLD = 0.35;
const INDEXING_LOW_IMPRESSIONS_THRESHOLD = 20;
const INDEXING_MIN_DOMAIN_AGE_DAYS = 21;
const MANUAL_ACTION_SUSPECT_DROP_RATIO = 0.1;

function isLongFormContentType(contentType: string | null | undefined): boolean {
    return ![
        'calculator',
        'wizard',
        'configurator',
        'quiz',
        'survey',
        'assessment',
        'interactive_infographic',
        'interactive_map',
    ].includes(contentType || 'article');
}

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
        const sevenDaysAgoIso = sevenDaysAgo.toISOString();

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
                        sql`${revenueSnapshots.snapshotDate} < ${sevenDaysAgoIso}::timestamp`,
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
                const response = await safeFetch(`https://${domain.domain}/`, {
                    method: 'HEAD',
                    timeoutMs: 10000,
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
 * Search quality guardrail checks:
 * - Indexing weakness / suspected de-indexing
 * - Thin long-form content ratio
 * - Intra-domain duplicate fingerprints
 */
export async function checkSearchQualityHealth() {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

        const activeDomains = await db
            .select({ id: domains.id, domain: domains.domain, createdAt: domains.createdAt })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)));

        for (const domain of activeDomains) {
            const [publishedRows, recentTraffic, previousTraffic] = await Promise.all([
                db
                    .select({
                        id: articles.id,
                        contentType: articles.contentType,
                        wordCount: articles.wordCount,
                        contentFingerprint: articles.contentFingerprint,
                    })
                    .from(articles)
                    .where(and(
                        eq(articles.domainId, domain.id),
                        eq(articles.status, 'published'),
                        isNull(articles.deletedAt),
                    )),
                db
                    .select({
                        impressions: sql<number>`COALESCE(SUM(${revenueSnapshots.impressions}), 0)::int`,
                        clicks: sql<number>`COALESCE(SUM(${revenueSnapshots.clicks}), 0)::int`,
                        pageviews: sql<number>`COALESCE(SUM(${revenueSnapshots.pageviews}), 0)::int`,
                    })
                    .from(revenueSnapshots)
                    .where(and(
                        eq(revenueSnapshots.domainId, domain.id),
                        gte(revenueSnapshots.snapshotDate, thirtyDaysAgo),
                    )),
                db
                    .select({
                        impressions: sql<number>`COALESCE(SUM(${revenueSnapshots.impressions}), 0)::int`,
                        clicks: sql<number>`COALESCE(SUM(${revenueSnapshots.clicks}), 0)::int`,
                        pageviews: sql<number>`COALESCE(SUM(${revenueSnapshots.pageviews}), 0)::int`,
                    })
                    .from(revenueSnapshots)
                    .where(and(
                        eq(revenueSnapshots.domainId, domain.id),
                        gte(revenueSnapshots.snapshotDate, sixtyDaysAgo),
                        sql`${revenueSnapshots.snapshotDate} < ${thirtyDaysAgoIso}::timestamp`,
                    )),
            ]);

            if (publishedRows.length === 0) {
                continue;
            }

            const longFormRows = publishedRows.filter((row) => isLongFormContentType(row.contentType));
            const thinLongFormCount = longFormRows.filter((row) => {
                const words = row.wordCount ?? 0;
                return words > 0 && words < THIN_CONTENT_WORD_THRESHOLD;
            }).length;
            const thinShare = longFormRows.length > 0 ? thinLongFormCount / longFormRows.length : 0;

            if (longFormRows.length >= 4 && thinShare >= THIN_CONTENT_SHARE_THRESHOLD) {
                await createNotification({
                    type: 'search_quality',
                    severity: 'warning',
                    domainId: domain.id,
                    title: `Thin content risk on ${domain.domain}`,
                    message: `${thinLongFormCount}/${longFormRows.length} long-form pages are under ${THIN_CONTENT_WORD_THRESHOLD} words.`,
                    actionUrl: `/dashboard/content/duplicates`,
                    metadata: {
                        signal: 'thin_content',
                        thinCount: thinLongFormCount,
                        totalLongForm: longFormRows.length,
                        threshold: THIN_CONTENT_WORD_THRESHOLD,
                    },
                });
            }

            const fingerprintCounts = new Map<string, number>();
            for (const row of publishedRows) {
                const fingerprint = row.contentFingerprint?.trim();
                if (!fingerprint) continue;
                fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) || 0) + 1);
            }
            const duplicateArticles = [...fingerprintCounts.values()]
                .filter((count) => count > 1)
                .reduce((sum, count) => sum + count, 0);
            const duplicateGroups = [...fingerprintCounts.values()].filter((count) => count > 1).length;

            if (duplicateArticles >= 2) {
                await createNotification({
                    type: 'search_quality',
                    severity: 'warning',
                    domainId: domain.id,
                    title: `Duplicate content signal on ${domain.domain}`,
                    message: `${duplicateArticles} published pages share duplicate content fingerprints across ${duplicateGroups} groups.`,
                    actionUrl: `/dashboard/content/duplicates`,
                    metadata: {
                        signal: 'duplicate_fingerprint',
                        duplicateArticles,
                        duplicateGroups,
                    },
                });
            }

            const domainAgeDays = domain.createdAt
                ? (now.getTime() - new Date(domain.createdAt).getTime()) / (24 * 60 * 60 * 1000)
                : 0;
            const recentImpressions = recentTraffic[0]?.impressions ?? 0;
            const previousImpressions = previousTraffic[0]?.impressions ?? 0;
            const recentClicks = recentTraffic[0]?.clicks ?? 0;

            if (
                domainAgeDays >= INDEXING_MIN_DOMAIN_AGE_DAYS
                && publishedRows.length >= 3
                && recentImpressions <= INDEXING_LOW_IMPRESSIONS_THRESHOLD
            ) {
                await createNotification({
                    type: 'search_quality',
                    severity: 'warning',
                    domainId: domain.id,
                    title: `Indexing weakness on ${domain.domain}`,
                    message: `Last 30d impressions (${recentImpressions}) are below expected baseline for ${publishedRows.length} published pages.`,
                    actionUrl: `/dashboard/monitoring`,
                    metadata: {
                        signal: 'indexing_low',
                        impressions30d: recentImpressions,
                        clicks30d: recentClicks,
                        publishedPages: publishedRows.length,
                    },
                });
            }

            if (
                previousImpressions >= 1000
                && recentImpressions <= Math.floor(previousImpressions * MANUAL_ACTION_SUSPECT_DROP_RATIO)
            ) {
                await createNotification({
                    type: 'search_quality',
                    severity: 'critical',
                    domainId: domain.id,
                    title: `Search visibility collapse on ${domain.domain}`,
                    message: `Impressions dropped from ${previousImpressions} to ${recentImpressions} vs prior 30-day window; investigate indexing/manual-action status.`,
                    actionUrl: `/dashboard/monitoring`,
                    metadata: {
                        signal: 'visibility_collapse',
                        impressionsPrev30d: previousImpressions,
                        impressions30d: recentImpressions,
                        dropRatio: previousImpressions > 0 ? recentImpressions / previousImpressions : 0,
                    },
                });
            }
        }
    } catch (error) {
        console.error('Search quality check failed:', error);
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
        checkSearchQualityHealth(),
    ]);
    console.log('[Monitoring] All checks complete.');
}
