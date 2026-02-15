import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import {
    evaluateRevenueRollupContract,
    evaluateRevenueSnapshotRowContract,
} from '@/lib/data/contracts';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const revenueContractLimiter = createRateLimiter('data_contract_revenue', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

const SNAPSHOT_QUERY_LIMIT = 200000;

function parseWindowDays(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(7, Math.min(parsed, 180));
}

function parseFloatParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseFloat(value || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseLimit(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(1, Math.min(parsed, 1000));
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

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = revenueContractLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many contract-check requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const windowDays = parseWindowDays(request.nextUrl.searchParams.get('windowDays'));
        const rowTolerance = parseFloatParam(request.nextUrl.searchParams.get('rowTolerance'), 0.02, 0, 1000);
        const toleranceFloor = parseFloatParam(request.nextUrl.searchParams.get('toleranceFloor'), 5, 0, 1_000_000);
        const tolerancePct = parseFloatParam(request.nextUrl.searchParams.get('tolerancePct'), 0.05, 0, 1);
        const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
        const domainId = request.nextUrl.searchParams.get('domainId');
        if (domainId && !z.string().uuid().safeParse(domainId).success) {
            return NextResponse.json({ error: 'Invalid domainId' }, { status: 400, headers: rate.headers });
        }

        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);

        const domainConditions = domainId
            ? [eq(domains.id, domainId)]
            : [];

        const domainRows = await db.select({
            id: domains.id,
            domain: domains.domain,
        })
            .from(domains)
            .where(domainConditions.length > 0 ? and(...domainConditions) : undefined)
            .limit(limit);

        if (domainRows.length === 0) {
            return NextResponse.json({
                contractVersion: 'revenue.v1',
                windowDays,
                tolerance: {
                    rowTolerance,
                    rollupToleranceFloor: toleranceFloor,
                    rollupTolerancePct: tolerancePct,
                },
                count: 0,
                domains: [],
                truncated: false,
                warnings: [],
                summary: {
                    passCount: 0,
                    warningCount: 0,
                    criticalCount: 0,
                    totalRowViolations: 0,
                },
                generatedAt: new Date().toISOString(),
            }, { headers: rate.headers });
        }

        const domainIds = domainRows.map((row) => row.id);
        const [snapshotRowsRaw, snapshotRollups, ledgerRollups] = await Promise.all([
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
                    inArray(revenueSnapshots.domainId, domainIds),
                    gte(revenueSnapshots.snapshotDate, startDate),
                    lte(revenueSnapshots.snapshotDate, endDate),
                ))
                .limit(SNAPSHOT_QUERY_LIMIT + 1),
            db.select({
                domainId: revenueSnapshots.domainId,
                snapshotTotal: sql<number>`sum(coalesce(${revenueSnapshots.totalRevenue}, 0))::float`,
            })
                .from(revenueSnapshots)
                .where(and(
                    inArray(revenueSnapshots.domainId, domainIds),
                    gte(revenueSnapshots.snapshotDate, startDate),
                    lte(revenueSnapshots.snapshotDate, endDate),
                ))
                .groupBy(revenueSnapshots.domainId),
            db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                ledgerTotal: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(
                    inArray(domainFinanceLedgerEntries.domainId, domainIds),
                    eq(domainFinanceLedgerEntries.impact, 'revenue'),
                    gte(domainFinanceLedgerEntries.entryDate, startDate),
                    lte(domainFinanceLedgerEntries.entryDate, endDate),
                ))
                .groupBy(domainFinanceLedgerEntries.domainId),
        ]);

        const truncated = snapshotRowsRaw.length > SNAPSHOT_QUERY_LIMIT;
        const snapshotRows = truncated
            ? snapshotRowsRaw.slice(0, SNAPSHOT_QUERY_LIMIT)
            : snapshotRowsRaw;

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

        const domainResults = domainRows.map((domainRow) => {
            const rows = rowsByDomain.get(domainRow.id) ?? [];
            const violationCodeCounts = new Map<string, number>();
            let rowViolationCount = 0;

            for (const row of rows) {
                const rowResult = evaluateRevenueSnapshotRowContract({
                    adRevenue: parseNumeric(row.adRevenue),
                    affiliateRevenue: parseNumeric(row.affiliateRevenue),
                    leadGenRevenue: parseNumeric(row.leadGenRevenue),
                    totalRevenue: parseNumeric(row.totalRevenue),
                    clicks: Number(row.clicks || 0),
                    impressions: Number(row.impressions || 0),
                }, rowTolerance);

                if (!rowResult.valid) {
                    rowViolationCount += 1;
                    for (const code of rowResult.violations) {
                        violationCodeCounts.set(code, (violationCodeCounts.get(code) || 0) + 1);
                    }
                }
            }

            const rollupContract = evaluateRevenueRollupContract({
                ledgerTotal: ledgerTotalByDomain.get(domainRow.id) ?? 0,
                snapshotTotal: snapshotTotalByDomain.get(domainRow.id) ?? 0,
                toleranceFloor,
                tolerancePct,
            });

            const status = rowViolationCount > 0
                ? (rollupContract.status === 'critical' ? 'critical' : 'warning')
                : rollupContract.status;

            return {
                domainId: domainRow.id,
                domain: domainRow.domain,
                status,
                rowCount: rows.length,
                rowViolationCount,
                violationCodeCounts: Object.fromEntries(violationCodeCounts.entries()),
                rollupContract: {
                    status: rollupContract.status,
                    ledgerTotal: round(ledgerTotalByDomain.get(domainRow.id) ?? 0),
                    snapshotTotal: round(snapshotTotalByDomain.get(domainRow.id) ?? 0),
                    variance: rollupContract.variance,
                    variancePct: rollupContract.variancePct,
                    toleranceAmount: rollupContract.toleranceAmount,
                },
            };
        })
            .sort((left, right) => {
                const rank = (value: string) => (value === 'critical' ? 3 : value === 'warning' ? 2 : 1);
                if (rank(right.status) !== rank(left.status)) {
                    return rank(right.status) - rank(left.status);
                }
                return right.rowViolationCount - left.rowViolationCount;
            })
            .slice(0, limit);

        const summary = domainResults.reduce((acc, domain) => {
            if (domain.status === 'critical') acc.criticalCount += 1;
            else if (domain.status === 'warning') acc.warningCount += 1;
            else acc.passCount += 1;
            acc.totalRowViolations += domain.rowViolationCount;
            return acc;
        }, {
            passCount: 0,
            warningCount: 0,
            criticalCount: 0,
            totalRowViolations: 0,
        });

        return NextResponse.json({
            contractVersion: 'revenue.v1',
            windowDays,
            tolerance: {
                rowTolerance,
                rollupToleranceFloor: toleranceFloor,
                rollupTolerancePct: tolerancePct,
            },
            count: domainResults.length,
            domains: domainResults,
            truncated,
            warnings: truncated
                ? [`Snapshot results truncated at ${SNAPSHOT_QUERY_LIMIT} rows; narrow filters or reduce window to inspect full dataset.`]
                : [],
            summary,
            generatedAt: new Date().toISOString(),
        }, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to evaluate revenue data contracts:', error);
        return NextResponse.json(
            { error: 'Failed to evaluate revenue data contracts' },
            { status: 500, headers: rate.headers },
        );
    }
}
