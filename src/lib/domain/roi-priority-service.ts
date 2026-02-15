import { gte, sql } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import {
    scoreDomainRoiPriority,
    type DomainRoiAction,
} from '@/lib/domain/roi-prioritization';

export type DomainRoiPriorityItem = {
    domainId: string;
    domain: string;
    lifecycleState: string | null;
    status: string;
    updatedAt: Date | null;
    score: number;
    action: DomainRoiAction;
    reasons: string[];
    revenue30d: number;
    cost30d: number;
    net30d: number;
    roiPct: number | null;
    pageviews30d: number;
    clicks30d: number;
    ctrPct: number | null;
};

export type DomainRoiPrioritySnapshot = {
    windowDays: number;
    count: number;
    actionCounts: Record<string, number>;
    priorities: DomainRoiPriorityItem[];
    generatedAt: string;
};

type DomainRoiPriorityOptions = {
    limit?: number;
    windowDays?: number;
};

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value ?? Number.NaN)) return fallback;
    const normalized = Math.floor(value ?? fallback);
    if (normalized < min) return min;
    if (normalized > max) return max;
    return normalized;
}

function isMissingLifecycleStateColumn(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error ? String(error.code) : '';
    const message = 'message' in error ? String(error.message).toLowerCase() : '';
    return code === '42703' && message.includes('lifecycle_state');
}

export async function getDomainRoiPriorities(
    options?: DomainRoiPriorityOptions,
): Promise<DomainRoiPrioritySnapshot> {
    const limit = clampInteger(options?.limit, 1, 200, 50);
    const windowDays = clampInteger(options?.windowDays, 7, 120, 30);
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const domainRows = await (async () => {
        try {
            return await db.select({
                id: domains.id,
                domain: domains.domain,
                lifecycleState: domains.lifecycleState,
                status: domains.status,
                updatedAt: domains.updatedAt,
            })
                .from(domains)
                .where(notDeleted(domains))
                .limit(5000);
        } catch (queryError) {
            if (!isMissingLifecycleStateColumn(queryError)) throw queryError;
            const rows = await db.select({
                id: domains.id,
                domain: domains.domain,
                status: domains.status,
                updatedAt: domains.updatedAt,
            })
                .from(domains)
                .where(notDeleted(domains))
                .limit(5000);
            return rows.map((row) => ({ ...row, lifecycleState: 'sourced' as const }));
        }
    })();

    const ledgerRollups = await db.select({
        domainId: domainFinanceLedgerEntries.domainId,
        revenue30d: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
        cost30d: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'cost' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
    })
        .from(domainFinanceLedgerEntries)
        .where(gte(domainFinanceLedgerEntries.entryDate, windowStart))
        .groupBy(domainFinanceLedgerEntries.domainId);

    const trafficRollups = await db.select({
        domainId: revenueSnapshots.domainId,
        pageviews30d: sql<number>`sum(coalesce(${revenueSnapshots.pageviews}, 0))::int`,
        clicks30d: sql<number>`sum(coalesce(${revenueSnapshots.clicks}, 0))::int`,
    })
        .from(revenueSnapshots)
        .where(gte(revenueSnapshots.snapshotDate, windowStart))
        .groupBy(revenueSnapshots.domainId);

    const ledgerByDomain = new Map(ledgerRollups.map((row) => [row.domainId, row]));
    const trafficByDomain = new Map(trafficRollups.map((row) => [row.domainId, row]));

    const priorities = domainRows.map((domainRow) => {
        const ledger = ledgerByDomain.get(domainRow.id);
        const traffic = trafficByDomain.get(domainRow.id);

        const score = scoreDomainRoiPriority({
            lifecycleState: domainRow.lifecycleState,
            revenue30d: Number(ledger?.revenue30d ?? 0),
            cost30d: Number(ledger?.cost30d ?? 0),
            pageviews30d: Number(traffic?.pageviews30d ?? 0),
            clicks30d: Number(traffic?.clicks30d ?? 0),
        });

        return {
            domainId: domainRow.id,
            domain: domainRow.domain,
            lifecycleState: domainRow.lifecycleState,
            status: domainRow.status,
            updatedAt: domainRow.updatedAt,
            score: score.score,
            action: score.action,
            reasons: score.reasons,
            revenue30d: Number(ledger?.revenue30d ?? 0),
            cost30d: Number(ledger?.cost30d ?? 0),
            net30d: score.net30d,
            roiPct: score.roiPct,
            pageviews30d: Number(traffic?.pageviews30d ?? 0),
            clicks30d: Number(traffic?.clicks30d ?? 0),
            ctrPct: score.ctrPct,
        };
    })
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);

    const actionCounts = priorities.reduce<Record<string, number>>((acc, row) => {
        acc[row.action] = (acc[row.action] || 0) + 1;
        return acc;
    }, {});

    return {
        windowDays,
        count: priorities.length,
        actionCounts,
        priorities,
        generatedAt: new Date().toISOString(),
    };
}
