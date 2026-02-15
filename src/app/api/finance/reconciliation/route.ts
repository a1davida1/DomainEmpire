import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import {
    assessRevenueVariance,
    summarizePartnerMargins,
    type ReconciliationStatus,
} from '@/lib/finance/reconciliation';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const reconciliationLimiter = createRateLimiter('finance_reconciliation', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function normalizeDate(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseDateParam(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return normalizeDate(parsed);
}

function parseWindowDays(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(1, Math.min(parsed, 365));
}

function parsePositiveNumber(
    value: string | null,
    fallback: number,
    min: number,
    max: number,
): number {
    const parsed = Number.parseFloat(value || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseLimit(value: string | null, fallback: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(parsed, max));
}

function isTruthyFlag(value: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function statusCounts(rows: Array<{ status: ReconciliationStatus }>): Record<ReconciliationStatus, number> {
    return rows.reduce<Record<ReconciliationStatus, number>>((acc, row) => {
        acc[row.status] += 1;
        return acc;
    }, {
        matched: 0,
        warning: 0,
        critical: 0,
    });
}

type DailyRollupRow = {
    domainId: string;
    date: Date;
    ledgerTotal: number;
    snapshotTotal: number;
    variance: number;
    variancePct: number | null;
    toleranceAmount: number;
    status: ReconciliationStatus;
};

// GET /api/finance/reconciliation
// Compares attributed ledger revenue to revenue snapshots and reports partner-level margins.
export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = reconciliationLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many reconciliation requests. Please retry shortly.' },
            {
                status: 429,
                headers: rate.headers,
            },
        );
    }

    const { searchParams } = request.nextUrl;
    const domainId = searchParams.get('domainId');
    if (domainId && !z.string().uuid().safeParse(domainId).success) {
        return NextResponse.json({ error: 'Invalid domainId' }, { status: 400, headers: rate.headers });
    }

    const includeDaily = isTruthyFlag(searchParams.get('includeDaily'));
    const windowDays = parseWindowDays(searchParams.get('windowDays'));
    const partnerLimit = parseLimit(searchParams.get('partnerLimit'), 20, 100);
    const dailyLimit = parseLimit(searchParams.get('dailyLimit'), 1000, 5000);
    const toleranceFloor = parsePositiveNumber(searchParams.get('toleranceFloor'), 5, 0, 100000);
    const tolerancePct = parsePositiveNumber(searchParams.get('tolerancePct'), 0.05, 0, 1);

    const endDateParam = parseDateParam(searchParams.get('endDate'));
    if (searchParams.get('endDate') && !endDateParam) {
        return NextResponse.json({ error: 'Invalid endDate' }, { status: 400, headers: rate.headers });
    }
    const startDateParam = parseDateParam(searchParams.get('startDate'));
    if (searchParams.get('startDate') && !startDateParam) {
        return NextResponse.json({ error: 'Invalid startDate' }, { status: 400, headers: rate.headers });
    }

    const normalizedEnd = endDateParam ?? normalizeDate(new Date());
    const normalizedStart = startDateParam ?? normalizeDate(
        new Date(normalizedEnd.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000),
    );

    if (normalizedStart.getTime() > normalizedEnd.getTime()) {
        return NextResponse.json(
            { error: 'startDate must be <= endDate' },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        if (domainId) {
            const [domain] = await db.select({ id: domains.id })
                .from(domains)
                .where(and(eq(domains.id, domainId), notDeleted(domains)))
                .limit(1);
            if (!domain) {
                return NextResponse.json({ error: 'Domain not found' }, { status: 404, headers: rate.headers });
            }
        }

        const ledgerRevenueConditions: SQL[] = [
            eq(domainFinanceLedgerEntries.impact, 'revenue'),
            gte(domainFinanceLedgerEntries.entryDate, normalizedStart),
            lte(domainFinanceLedgerEntries.entryDate, normalizedEnd),
        ];
        const snapshotRevenueConditions: SQL[] = [
            gte(revenueSnapshots.snapshotDate, normalizedStart),
            lte(revenueSnapshots.snapshotDate, normalizedEnd),
        ];
        const partnerConditions: SQL[] = [
            inArray(domainFinanceLedgerEntries.entryType, ['revenue', 'channel_spend']),
            gte(domainFinanceLedgerEntries.entryDate, normalizedStart),
            lte(domainFinanceLedgerEntries.entryDate, normalizedEnd),
        ];
        if (domainId) {
            ledgerRevenueConditions.push(eq(domainFinanceLedgerEntries.domainId, domainId));
            snapshotRevenueConditions.push(eq(revenueSnapshots.domainId, domainId));
            partnerConditions.push(eq(domainFinanceLedgerEntries.domainId, domainId));
        }

        const partnerExpr = sql<string>`
            lower(
                coalesce(
                    nullif(${domainFinanceLedgerEntries.metadata}->>'provider', ''),
                    nullif(split_part(coalesce(${domainFinanceLedgerEntries.source}, ''), ':', 1), ''),
                    'unknown'
                )
            )
        `;
        const channelExpr = sql<string | null>`
            nullif(
                lower(
                    coalesce(
                        ${domainFinanceLedgerEntries.metadata}->>'sourceType',
                        nullif(split_part(coalesce(${domainFinanceLedgerEntries.source}, ''), ':', 2), '')
                    )
                ),
                ''
            )
        `;

        const [
            ledgerDomainRows,
            snapshotDomainRows,
            partnerRows,
            ledgerDailyRows,
            snapshotDailyRows,
        ] = await Promise.all([
            db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                total: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(...ledgerRevenueConditions))
                .groupBy(domainFinanceLedgerEntries.domainId),
            db.select({
                domainId: revenueSnapshots.domainId,
                total: sql<number>`sum(coalesce(${revenueSnapshots.totalRevenue}, 0))::float`,
            })
                .from(revenueSnapshots)
                .where(and(...snapshotRevenueConditions))
                .groupBy(revenueSnapshots.domainId),
            db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                partner: partnerExpr,
                channel: channelExpr,
                impact: domainFinanceLedgerEntries.impact,
                total: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(...partnerConditions))
                .groupBy(
                    domainFinanceLedgerEntries.domainId,
                    partnerExpr,
                    channelExpr,
                    domainFinanceLedgerEntries.impact,
                ),
            includeDaily
                ? db.select({
                    domainId: domainFinanceLedgerEntries.domainId,
                    date: domainFinanceLedgerEntries.entryDate,
                    total: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
                })
                    .from(domainFinanceLedgerEntries)
                    .where(and(...ledgerRevenueConditions))
                    .groupBy(domainFinanceLedgerEntries.domainId, domainFinanceLedgerEntries.entryDate)
                    .limit(dailyLimit)
                : Promise.resolve([]),
            includeDaily
                ? db.select({
                    domainId: revenueSnapshots.domainId,
                    date: revenueSnapshots.snapshotDate,
                    total: sql<number>`sum(coalesce(${revenueSnapshots.totalRevenue}, 0))::float`,
                })
                    .from(revenueSnapshots)
                    .where(and(...snapshotRevenueConditions))
                    .groupBy(revenueSnapshots.domainId, revenueSnapshots.snapshotDate)
                    .limit(dailyLimit)
                : Promise.resolve([]),
        ]);

        const domainIds = new Set<string>();
        for (const row of ledgerDomainRows) domainIds.add(row.domainId);
        for (const row of snapshotDomainRows) domainIds.add(row.domainId);
        if (domainId) domainIds.add(domainId);

        const domainLookupRows = domainIds.size > 0
            ? await db.select({
                id: domains.id,
                domain: domains.domain,
            })
                .from(domains)
                .where(and(inArray(domains.id, [...domainIds]), notDeleted(domains)))
            : [];
        const domainNameById = new Map(domainLookupRows.map((row) => [row.id, row.domain]));

        const ledgerByDomain = new Map(
            ledgerDomainRows.map((row) => [row.domainId, Number(row.total) || 0]),
        );
        const snapshotByDomain = new Map(
            snapshotDomainRows.map((row) => [row.domainId, Number(row.total) || 0]),
        );

        const partnerInputsByDomain = new Map<string, Array<{
            partner: string | null;
            channel: string | null;
            impact: 'revenue' | 'cost';
            amount: number;
        }>>();
        const partnerInputsAll: Array<{
            partner: string | null;
            channel: string | null;
            impact: 'revenue' | 'cost';
            amount: number;
        }> = [];

        for (const row of partnerRows) {
            const input = {
                partner: typeof row.partner === 'string' ? row.partner : null,
                channel: typeof row.channel === 'string' ? row.channel : null,
                impact: row.impact,
                amount: Number(row.total) || 0,
            };
            if (!partnerInputsByDomain.has(row.domainId)) {
                partnerInputsByDomain.set(row.domainId, []);
            }
            partnerInputsByDomain.get(row.domainId)!.push(input);
            partnerInputsAll.push(input);
        }

        const domainResults = [...domainIds]
            .map((id) => {
                const ledgerTotal = Number((ledgerByDomain.get(id) ?? 0).toFixed(2));
                const snapshotTotal = Number((snapshotByDomain.get(id) ?? 0).toFixed(2));
                const assessment = assessRevenueVariance({
                    ledgerTotal,
                    snapshotTotal,
                    toleranceFloor,
                    tolerancePct,
                });
                const partnerMargins = summarizePartnerMargins(partnerInputsByDomain.get(id) ?? [])
                    .slice(0, partnerLimit);

                return {
                    domainId: id,
                    domain: domainNameById.get(id) ?? '(unknown)',
                    ...assessment,
                    partnerMargins,
                };
            })
            .sort((left, right) => {
                if (right.status !== left.status) {
                    const weight: Record<ReconciliationStatus, number> = {
                        critical: 3,
                        warning: 2,
                        matched: 1,
                    };
                    return weight[right.status] - weight[left.status];
                }
                const rightVariance = Math.abs(right.variance);
                const leftVariance = Math.abs(left.variance);
                if (rightVariance !== leftVariance) {
                    return rightVariance - leftVariance;
                }
                if (left.domain < right.domain) return -1;
                if (left.domain > right.domain) return 1;
                return 0;
            });

        const overallLedger = domainResults.reduce((sum, row) => sum + row.ledgerTotal, 0);
        const overallSnapshot = domainResults.reduce((sum, row) => sum + row.snapshotTotal, 0);
        const overallAssessment = assessRevenueVariance({
            ledgerTotal: overallLedger,
            snapshotTotal: overallSnapshot,
            toleranceFloor,
            tolerancePct,
        });

        let daily: DailyRollupRow[] | null = null;
        if (includeDaily) {
            const dailyMap = new Map<string, { domainId: string; date: string; ledger: number; snapshot: number }>();
            for (const row of ledgerDailyRows) {
                const dateKey = normalizeDate(new Date(row.date)).toISOString().slice(0, 10);
                const key = `${row.domainId}|${dateKey}`;
                if (!dailyMap.has(key)) {
                    dailyMap.set(key, {
                        domainId: row.domainId,
                        date: dateKey,
                        ledger: 0,
                        snapshot: 0,
                    });
                }
                dailyMap.get(key)!.ledger = Number(row.total) || 0;
            }
            for (const row of snapshotDailyRows) {
                const dateKey = normalizeDate(new Date(row.date)).toISOString().slice(0, 10);
                const key = `${row.domainId}|${dateKey}`;
                if (!dailyMap.has(key)) {
                    dailyMap.set(key, {
                        domainId: row.domainId,
                        date: dateKey,
                        ledger: 0,
                        snapshot: 0,
                    });
                }
                dailyMap.get(key)!.snapshot = Number(row.total) || 0;
            }

            daily = [...dailyMap.values()]
                .map((row) => {
                    const assessment = assessRevenueVariance({
                        ledgerTotal: row.ledger,
                        snapshotTotal: row.snapshot,
                        toleranceFloor,
                        tolerancePct,
                    });
                    return {
                        domainId: row.domainId,
                        date: new Date(`${row.date}T00:00:00.000Z`),
                        ledgerTotal: assessment.ledgerTotal,
                        snapshotTotal: assessment.snapshotTotal,
                        variance: assessment.variance,
                        variancePct: assessment.variancePct,
                        toleranceAmount: assessment.toleranceAmount,
                        status: assessment.status,
                    };
                })
                .sort((left, right) => {
                    const dateDiff = right.date.getTime() - left.date.getTime();
                    if (dateDiff !== 0) return dateDiff;
                    if (left.domainId < right.domainId) return -1;
                    if (left.domainId > right.domainId) return 1;
                    return 0;
                });
        }

        return NextResponse.json({
            window: {
                startDate: normalizedStart.toISOString(),
                endDate: normalizedEnd.toISOString(),
                windowDays,
                includeDaily,
                toleranceFloor,
                tolerancePct,
            },
            summary: {
                domainsCompared: domainResults.length,
                statusCounts: statusCounts(domainResults),
                ...overallAssessment,
            },
            domains: domainResults,
            partnerMargins: summarizePartnerMargins(partnerInputsAll).slice(0, partnerLimit),
            daily,
            generatedAt: new Date().toISOString(),
        }, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to generate finance reconciliation summary:', error);
        return NextResponse.json(
            { error: 'Failed to generate finance reconciliation summary' },
            { status: 500, headers: rate.headers },
        );
    }
}
