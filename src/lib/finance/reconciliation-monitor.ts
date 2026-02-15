import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { assessRevenueVariance } from '@/lib/finance/reconciliation';
import { createNotification } from '@/lib/notifications';

export type RevenueReconciliationSweepSummary = {
    domainsCompared: number;
    matched: number;
    warning: number;
    critical: number;
    alertsCreated: number;
    windowStart: string;
    windowEnd: string;
};

function normalizeDate(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

function parseEnvFloat(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseFloat(process.env[name] || '');
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

export async function runRevenueReconciliationSweep(input: {
    windowDays?: number;
    domainIds?: string[];
    toleranceFloor?: number;
    tolerancePct?: number;
    maxDomains?: number;
} = {}): Promise<RevenueReconciliationSweepSummary> {
    const enabled = process.env.FINANCE_RECONCILIATION_SWEEP_ENABLED !== 'false';
    if (!enabled) {
        const nowIso = new Date().toISOString();
        return {
            domainsCompared: 0,
            matched: 0,
            warning: 0,
            critical: 0,
            alertsCreated: 0,
            windowStart: nowIso,
            windowEnd: nowIso,
        };
    }

    const windowDays = input.windowDays
        ?? parseEnvInt('FINANCE_RECONCILIATION_SWEEP_WINDOW_DAYS', 14, 1, 180);
    const toleranceFloor = input.toleranceFloor
        ?? parseEnvFloat('FINANCE_RECONCILIATION_TOLERANCE_FLOOR', 5, 0, 1_000_000);
    const tolerancePct = input.tolerancePct
        ?? parseEnvFloat('FINANCE_RECONCILIATION_TOLERANCE_PCT', 0.05, 0, 1);
    const maxDomains = input.maxDomains
        ?? parseEnvInt('FINANCE_RECONCILIATION_SWEEP_MAX_DOMAINS', 1000, 1, 10000);

    const windowEnd = normalizeDate(new Date());
    const windowStart = normalizeDate(
        new Date(windowEnd.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000),
    );

    const ledgerConditions = [
        eq(domainFinanceLedgerEntries.impact, 'revenue'),
        gte(domainFinanceLedgerEntries.entryDate, windowStart),
        lte(domainFinanceLedgerEntries.entryDate, windowEnd),
    ];
    const snapshotConditions = [
        gte(revenueSnapshots.snapshotDate, windowStart),
        lte(revenueSnapshots.snapshotDate, windowEnd),
    ];
    if (input.domainIds && input.domainIds.length > 0) {
        ledgerConditions.push(inArray(domainFinanceLedgerEntries.domainId, input.domainIds));
        snapshotConditions.push(inArray(revenueSnapshots.domainId, input.domainIds));
    }

    const [ledgerRows, snapshotRows] = await Promise.all([
        db.select({
            domainId: domainFinanceLedgerEntries.domainId,
            total: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
        })
            .from(domainFinanceLedgerEntries)
            .where(and(...ledgerConditions))
            .groupBy(domainFinanceLedgerEntries.domainId)
            .orderBy(asc(domainFinanceLedgerEntries.domainId))
            .limit(maxDomains),
        db.select({
            domainId: revenueSnapshots.domainId,
            total: sql<number>`sum(coalesce(${revenueSnapshots.totalRevenue}, 0))::float`,
        })
            .from(revenueSnapshots)
            .where(and(...snapshotConditions))
            .groupBy(revenueSnapshots.domainId)
            .orderBy(asc(revenueSnapshots.domainId))
            .limit(maxDomains),
    ]);

    const domainIds = new Set<string>();
    for (const row of ledgerRows) domainIds.add(row.domainId);
    for (const row of snapshotRows) domainIds.add(row.domainId);

    if (domainIds.size === 0) {
        return {
            domainsCompared: 0,
            matched: 0,
            warning: 0,
            critical: 0,
            alertsCreated: 0,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
        };
    }

    const domainLookupRows = await db.select({
        id: domains.id,
        domain: domains.domain,
    })
        .from(domains)
        .where(and(inArray(domains.id, [...domainIds]), notDeleted(domains)))
        .limit(maxDomains);
    const domainNameById = new Map(domainLookupRows.map((row) => [row.id, row.domain]));
    const ledgerByDomain = new Map(ledgerRows.map((row) => [row.domainId, Number(row.total) || 0]));
    const snapshotByDomain = new Map(snapshotRows.map((row) => [row.domainId, Number(row.total) || 0]));

    let matched = 0;
    let warning = 0;
    let critical = 0;
    let alertsCreated = 0;

    for (const domainId of domainIds) {
        const assessment = assessRevenueVariance({
            ledgerTotal: ledgerByDomain.get(domainId) ?? 0,
            snapshotTotal: snapshotByDomain.get(domainId) ?? 0,
            toleranceFloor,
            tolerancePct,
        });

        if (assessment.status === 'matched') {
            matched += 1;
            continue;
        }

        if (assessment.status === 'critical') {
            critical += 1;
        } else {
            warning += 1;
        }

        const domainName = domainNameById.get(domainId) ?? domainId;
        const severity = assessment.status === 'critical' ? 'critical' : 'warning';
        await createNotification({
            type: 'info',
            severity,
            domainId,
            title: `Revenue reconciliation ${assessment.status}: ${domainName}`,
            message: `Ledger ${assessment.ledgerTotal.toFixed(2)} vs snapshot ${assessment.snapshotTotal.toFixed(2)} (variance ${assessment.variance.toFixed(2)}) over the last ${windowDays} day(s).`,
            actionUrl: '/dashboard/integrations',
            metadata: {
                source: 'scheduled_reconciliation_sweep',
                windowDays,
                windowStart: windowStart.toISOString(),
                windowEnd: windowEnd.toISOString(),
                variance: assessment.variance,
                variancePct: assessment.variancePct,
                toleranceAmount: assessment.toleranceAmount,
            },
        });
        alertsCreated += 1;
    }

    return {
        domainsCompared: domainIds.size,
        matched,
        warning,
        critical,
        alertsCreated,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
    };
}
