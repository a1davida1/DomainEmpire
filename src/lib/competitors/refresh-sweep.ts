import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';
import { db, competitors, domains } from '@/lib/db';
import { findKeywordGaps, refreshCompetitor } from '@/lib/competitors/monitor';

export type CompetitorRefreshSweepConfig = {
    enabled: boolean;
    staleHours: number;
    limit: number;
    emitGapAlerts: boolean;
    gapMinVolume: number;
    gapTopN: number;
};

export type CompetitorRefreshSweepSummary = {
    enabled: boolean;
    scanned: number;
    refreshed: number;
    failed: number;
    gapAlerts: number;
    staleBefore: string;
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
    return fallback;
}

function parseIntBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

export function resolveCompetitorRefreshSweepConfig(
    env: Record<string, string | undefined> = process.env,
): CompetitorRefreshSweepConfig {
    return {
        enabled: parseBool(env.GROWTH_COMPETITOR_SWEEP_ENABLED, false),
        staleHours: parseIntBounded(env.GROWTH_COMPETITOR_SWEEP_STALE_HOURS, 48, 1, 24 * 30),
        limit: parseIntBounded(env.GROWTH_COMPETITOR_SWEEP_LIMIT, 20, 1, 500),
        emitGapAlerts: parseBool(env.GROWTH_COMPETITOR_SWEEP_GAP_ALERTS_ENABLED, true),
        gapMinVolume: parseIntBounded(env.GROWTH_COMPETITOR_SWEEP_GAP_MIN_VOLUME, 500, 0, 1_000_000),
        gapTopN: parseIntBounded(env.GROWTH_COMPETITOR_SWEEP_GAP_TOP_N, 5, 1, 25),
    };
}

function mergeConfig(
    base: CompetitorRefreshSweepConfig,
    override: Partial<CompetitorRefreshSweepConfig>,
): CompetitorRefreshSweepConfig {
    return {
        ...base,
        ...override,
    };
}

export async function runCompetitorRefreshSweep(input: {
    force?: boolean;
} & Partial<CompetitorRefreshSweepConfig> = {}): Promise<CompetitorRefreshSweepSummary> {
    const config = mergeConfig(resolveCompetitorRefreshSweepConfig(), input);
    const staleBefore = new Date(Date.now() - config.staleHours * 60 * 60 * 1000);

    if (!config.enabled && !input.force) {
        return {
            enabled: false,
            scanned: 0,
            refreshed: 0,
            failed: 0,
            gapAlerts: 0,
            staleBefore: staleBefore.toISOString(),
        };
    }

    const rows = await db.select({
        competitorId: competitors.id,
        domainId: competitors.domainId,
        competitorDomain: competitors.competitorDomain,
        domain: domains.domain,
    })
        .from(competitors)
        .innerJoin(domains, eq(competitors.domainId, domains.id))
        .where(and(
            isNull(domains.deletedAt),
            or(
                isNull(competitors.lastCheckedAt),
                lte(competitors.lastCheckedAt, staleBefore),
            ),
        ))
        .orderBy(asc(sql`${competitors.lastCheckedAt} nulls first`), asc(competitors.createdAt))
        .limit(config.limit);

    let refreshed = 0;
    let failed = 0;
    let gapAlerts = 0;
    const domainGapChecks = new Set<string>();

    for (const row of rows) {
        try {
            await refreshCompetitor(row.competitorId);
            refreshed += 1;

            if (!config.emitGapAlerts || domainGapChecks.has(row.domainId)) {
                continue;
            }
            domainGapChecks.add(row.domainId);

            const gapRows = await findKeywordGaps(row.domainId);
            const notableGaps = gapRows
                .filter((gap) => gap.volume >= config.gapMinVolume)
                .slice(0, config.gapTopN);

            if (notableGaps.length > 0) {
                try {
                    await createNotification({
                        type: 'info',
                        severity: 'info',
                        domainId: row.domainId,
                        title: `Competitor keyword gaps: ${row.domain}`,
                        message: notableGaps.map((gap) => `${gap.keyword} (${gap.volume})`).join(', '),
                        actionUrl: '/dashboard/competitors',
                        metadata: {
                            source: 'competitor_refresh_sweep',
                            competitorDomain: row.competitorDomain,
                            gapCount: notableGaps.length,
                            gapMinVolume: config.gapMinVolume,
                        },
                    });
                    gapAlerts += 1;
                } catch (notificationError) {
                    console.error('Failed to create competitor gap notification:', notificationError, {
                        source: 'competitor_refresh_sweep',
                        domainId: row.domainId,
                        competitorDomain: row.competitorDomain,
                    });
                }
            }
        } catch (error) {
            failed += 1;
            try {
                await createNotification({
                    type: 'info',
                    severity: 'warning',
                    domainId: row.domainId,
                    title: `Competitor refresh failed: ${row.domain}`,
                    message: `Unable to refresh ${row.competitorDomain}. See logs for details.`,
                    actionUrl: '/dashboard/competitors',
                    metadata: {
                        source: 'competitor_refresh_sweep',
                        competitorDomain: row.competitorDomain,
                        error: error instanceof Error ? error.message : String(error),
                    },
                });
            } catch (notificationError) {
                console.error('Failed to create competitor refresh failure notification:', notificationError, {
                    source: 'competitor_refresh_sweep',
                    domainId: row.domainId,
                    competitorDomain: row.competitorDomain,
                });
            }
        }
    }

    return {
        enabled: true,
        scanned: rows.length,
        refreshed,
        failed,
        gapAlerts,
        staleBefore: staleBefore.toISOString(),
    };
}
