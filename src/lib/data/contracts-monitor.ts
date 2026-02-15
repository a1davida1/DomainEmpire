import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { createNotification } from '@/lib/notifications';
import {
    evaluateRevenueRollupContract,
    evaluateRevenueSnapshotRowContract,
} from '@/lib/data/contracts';
import type { ReconciliationStatus } from '@/lib/finance/reconciliation';

export type RevenueContractDomainStatus = 'pass' | 'warning' | 'critical';

export type RevenueContractSweepSummary = {
    domainsChecked: number;
    pass: number;
    warning: number;
    critical: number;
    alertsCreated: number;
    totalRowViolations: number;
    snapshotRowLimitReached: boolean;
    warnings: string[];
    windowStart: string;
    windowEnd: string;
};

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

function parseNumeric(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export function classifyRevenueContractDomain(input: {
    rollupStatus: ReconciliationStatus;
    rowViolationCount: number;
}): RevenueContractDomainStatus {
    const rowViolationCount = Math.max(0, Math.trunc(input.rowViolationCount || 0));
    if (input.rollupStatus === 'critical') {
        return 'critical';
    }
    if (input.rollupStatus === 'warning' || rowViolationCount > 0) {
        return 'warning';
    }
    return 'pass';
}

export async function runRevenueDataContractSweep(input: {
    domainIds?: string[];
    windowDays?: number;
    rowTolerance?: number;
    toleranceFloor?: number;
    tolerancePct?: number;
    maxDomains?: number;
} = {}): Promise<RevenueContractSweepSummary> {
    const enabled = process.env.DATA_CONTRACT_SWEEP_ENABLED !== 'false';
    if (!enabled) {
        const nowIso = new Date().toISOString();
        return {
            domainsChecked: 0,
            pass: 0,
            warning: 0,
            critical: 0,
            alertsCreated: 0,
            totalRowViolations: 0,
            snapshotRowLimitReached: false,
            warnings: [],
            windowStart: nowIso,
            windowEnd: nowIso,
        };
    }

    const windowDays = input.windowDays ?? parseEnvInt('DATA_CONTRACT_SWEEP_WINDOW_DAYS', 30, 7, 180);
    const rowTolerance = input.rowTolerance ?? parseEnvFloat('DATA_CONTRACT_ROW_TOLERANCE', 0.02, 0, 1000);
    const toleranceFloor = input.toleranceFloor ?? parseEnvFloat('DATA_CONTRACT_ROLLUP_TOLERANCE_FLOOR', 5, 0, 1_000_000);
    const tolerancePct = input.tolerancePct ?? parseEnvFloat('DATA_CONTRACT_ROLLUP_TOLERANCE_PCT', 0.05, 0, 1);
    const maxDomains = input.maxDomains ?? parseEnvInt('DATA_CONTRACT_SWEEP_MAX_DOMAINS', 1000, 1, 10000);
    const domainBatchSize = parseEnvInt('DATA_CONTRACT_SWEEP_DOMAIN_BATCH_SIZE', 250, 10, 2000);
    const snapshotQueryLimit = parseEnvInt('DATA_CONTRACT_SWEEP_SNAPSHOT_QUERY_LIMIT', 250000, 1000, 2_000_000);

    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
    const domainFilter = Array.isArray(input.domainIds) && input.domainIds.length > 0 ? [...new Set(input.domainIds)] : null;

    const domainRows = await db.select({
        id: domains.id,
        domain: domains.domain,
    })
        .from(domains)
        .where(and(
            isNull(domains.deletedAt),
            ...(domainFilter ? [inArray(domains.id, domainFilter)] : []),
        ))
        .limit(maxDomains);

    if (domainRows.length === 0) {
        return {
            domainsChecked: 0,
            pass: 0,
            warning: 0,
            critical: 0,
            alertsCreated: 0,
            totalRowViolations: 0,
            snapshotRowLimitReached: false,
            warnings: [],
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
        };
    }

    const domainIds = domainRows.map((row) => row.id);
    const snapshotRows: Array<{
        domainId: string;
        snapshotDate: Date;
        adRevenue: string | number | null;
        affiliateRevenue: string | number | null;
        leadGenRevenue: string | number | null;
        totalRevenue: string | number | null;
        clicks: number | null;
        impressions: number | null;
    }> = [];
    const snapshotRollups: Array<{ domainId: string; snapshotTotal: number }> = [];
    const ledgerRollups: Array<{ domainId: string; ledgerTotal: number }> = [];
    let snapshotRowLimitReached = false;

    for (let start = 0; start < domainIds.length; start += domainBatchSize) {
        const batchIds = domainIds.slice(start, start + domainBatchSize);
        if (batchIds.length === 0) continue;

        const [snapshotRowsRaw, snapshotRollupsBatch, ledgerRollupsBatch] = await Promise.all([
            db.select({
                domainId: revenueSnapshots.domainId,
                snapshotDate: revenueSnapshots.snapshotDate,
                adRevenue: revenueSnapshots.adRevenue,
                affiliateRevenue: revenueSnapshots.affiliateRevenue,
                leadGenRevenue: revenueSnapshots.leadGenRevenue,
                totalRevenue: revenueSnapshots.totalRevenue,
                clicks: revenueSnapshots.clicks,
                impressions: revenueSnapshots.impressions,
            })
                .from(revenueSnapshots)
                .where(and(
                    inArray(revenueSnapshots.domainId, batchIds),
                    gte(revenueSnapshots.snapshotDate, windowStart),
                    lte(revenueSnapshots.snapshotDate, windowEnd),
                ))
                .limit(snapshotQueryLimit + 1),
            db.select({
                domainId: revenueSnapshots.domainId,
                snapshotTotal: sql<number>`sum(coalesce(${revenueSnapshots.totalRevenue}, 0))::float`,
            })
                .from(revenueSnapshots)
                .where(and(
                    inArray(revenueSnapshots.domainId, batchIds),
                    gte(revenueSnapshots.snapshotDate, windowStart),
                    lte(revenueSnapshots.snapshotDate, windowEnd),
                ))
                .groupBy(revenueSnapshots.domainId),
            db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                ledgerTotal: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(
                    inArray(domainFinanceLedgerEntries.domainId, batchIds),
                    eq(domainFinanceLedgerEntries.impact, 'revenue'),
                    gte(domainFinanceLedgerEntries.entryDate, windowStart),
                    lte(domainFinanceLedgerEntries.entryDate, windowEnd),
                ))
                .groupBy(domainFinanceLedgerEntries.domainId),
        ]);

        if (snapshotRowsRaw.length > snapshotQueryLimit) {
            snapshotRowLimitReached = true;
            console.warn('Revenue contract sweep snapshot query truncated at configured limit', {
                batchStart: start,
                batchSize: batchIds.length,
                snapshotQueryLimit,
            });
        }

        snapshotRows.push(...snapshotRowsRaw.slice(0, snapshotQueryLimit));
        snapshotRollups.push(...snapshotRollupsBatch);
        ledgerRollups.push(...ledgerRollupsBatch);
    }

    const rowsByDomain = new Map<string, typeof snapshotRows>();
    for (const row of snapshotRows) {
        if (!rowsByDomain.has(row.domainId)) {
            rowsByDomain.set(row.domainId, []);
        }
        rowsByDomain.get(row.domainId)!.push(row);
    }

    const snapshotTotalByDomain = new Map(
        snapshotRollups.map((row) => [row.domainId, Number(row.snapshotTotal) || 0]),
    );
    const ledgerTotalByDomain = new Map(
        ledgerRollups.map((row) => [row.domainId, Number(row.ledgerTotal) || 0]),
    );

    let pass = 0;
    let warning = 0;
    let critical = 0;
    let alertsCreated = 0;
    let totalRowViolations = 0;
    const warnings: string[] = [];

    if (snapshotRowLimitReached) {
        warnings.push(
            `Snapshot row query reached DATA_CONTRACT_SWEEP_SNAPSHOT_QUERY_LIMIT=${snapshotQueryLimit}; results may be partial.`,
        );
    }

    for (const domainRow of domainRows) {
        const rows = rowsByDomain.get(domainRow.id) ?? [];
        let rowViolationCount = 0;
        for (const row of rows) {
            const rowContract = evaluateRevenueSnapshotRowContract({
                adRevenue: parseNumeric(row.adRevenue),
                affiliateRevenue: parseNumeric(row.affiliateRevenue),
                leadGenRevenue: parseNumeric(row.leadGenRevenue),
                totalRevenue: parseNumeric(row.totalRevenue),
                clicks: Number(row.clicks || 0),
                impressions: Number(row.impressions || 0),
            }, rowTolerance);
            if (!rowContract.valid) {
                rowViolationCount += 1;
            }
        }

        totalRowViolations += rowViolationCount;
        const rollupContract = evaluateRevenueRollupContract({
            ledgerTotal: ledgerTotalByDomain.get(domainRow.id) ?? 0,
            snapshotTotal: snapshotTotalByDomain.get(domainRow.id) ?? 0,
            toleranceFloor,
            tolerancePct,
        });
        const status = classifyRevenueContractDomain({
            rollupStatus: rollupContract.status,
            rowViolationCount,
        });

        if (status === 'critical') {
            critical += 1;
        } else if (status === 'warning') {
            warning += 1;
        } else {
            pass += 1;
        }

        if (status !== 'pass') {
            const severity = status === 'critical' ? 'critical' : 'warning';
            try {
                await createNotification({
                    type: 'info',
                    severity,
                    domainId: domainRow.id,
                    title: `Revenue contract ${status}: ${domainRow.domain}`,
                    message: `Row violations=${rowViolationCount}, variance=${rollupContract.variance}, ledger=${round(ledgerTotalByDomain.get(domainRow.id) ?? 0)}, snapshot=${round(snapshotTotalByDomain.get(domainRow.id) ?? 0)}.`,
                    actionUrl: '/dashboard/integrations',
                    metadata: {
                        source: 'revenue_contract_sweep',
                        status,
                        rowViolationCount,
                        rollupStatus: rollupContract.status,
                        variance: rollupContract.variance,
                        variancePct: rollupContract.variancePct,
                        toleranceAmount: rollupContract.toleranceAmount,
                        windowStart: windowStart.toISOString(),
                        windowEnd: windowEnd.toISOString(),
                    },
                });
                alertsCreated += 1;
            } catch (notificationError) {
                console.error('Failed to create revenue contract sweep notification', {
                    domainId: domainRow.id,
                    domain: domainRow.domain,
                    status,
                    variance: rollupContract.variance,
                    error: notificationError,
                });
            }
        }
    }

    return {
        domainsChecked: domainRows.length,
        pass,
        warning,
        critical,
        alertsCreated,
        totalRowViolations,
        snapshotRowLimitReached,
        warnings,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
    };
}
