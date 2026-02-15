import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    integrationConnections,
    revenueSnapshots,
} from '@/lib/db';
import { assessRevenueVariance } from '@/lib/finance/reconciliation';
import { createNotification } from '@/lib/notifications';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const revenueIngestLimiter = createRateLimiter('integration_revenue_ingest', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const sourceTypeSchema = z.enum(['affiliate', 'parking', 'lead_gen', 'ad']);

const ingestSchema = z.object({
    connectionId: z.string().uuid(),
    records: z.array(z.object({
        domainId: z.string().uuid().optional(),
        snapshotDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
        sourceType: sourceTypeSchema,
        amount: z.number(),
        currency: z.string().trim().min(3).max(3).optional().default('USD'),
        clicks: z.number().int().min(0).optional(),
        impressions: z.number().int().min(0).optional(),
        sourceRef: z.string().trim().max(500).optional().nullable(),
        metadata: z.record(z.string(), z.unknown()).optional(),
    })).min(1).max(500),
});

type RevenueSourceType = z.infer<typeof sourceTypeSchema>;

type AggregatedSnapshotInput = {
    domainId: string;
    snapshotDate: Date;
    adRevenue: number;
    affiliateRevenue: number;
    leadGenRevenue: number;
    totalRevenue: number;
    clicks: number;
    impressions: number;
};

type DomainWindow = {
    domainId: string;
    minDate: Date;
    maxDate: Date;
};

function normalizeSnapshotDate(value: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00.000Z`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid snapshotDate');
    }
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function addRevenueBySource(aggregate: AggregatedSnapshotInput, sourceType: RevenueSourceType, amount: number): void {
    if (sourceType === 'affiliate') {
        aggregate.affiliateRevenue += amount;
    } else if (sourceType === 'lead_gen') {
        aggregate.leadGenRevenue += amount;
    } else if (sourceType === 'parking') {
        // Parking is intentionally folded into adRevenue until revenueSnapshots has a dedicated parking column.
        aggregate.adRevenue += amount;
    } else {
        aggregate.adRevenue += amount;
    }
    aggregate.totalRevenue += amount;
}

function aggregateSnapshotKey(domainId: string, snapshotDate: Date): string {
    return `${domainId}:${snapshotDate.toISOString().slice(0, 10)}`;
}

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const rate = revenueIngestLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many revenue ingest requests. Please retry shortly.' },
            {
                status: 429,
                headers: rate.headers,
            },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const payload = parsed.data;
        const [connection] = await db.select({
            id: integrationConnections.id,
            userId: integrationConnections.userId,
            provider: integrationConnections.provider,
            category: integrationConnections.category,
            domainId: integrationConnections.domainId,
        })
            .from(integrationConnections)
            .where(eq(integrationConnections.id, payload.connectionId))
            .limit(1);

        if (!connection) {
            return NextResponse.json({ error: 'Integration connection not found' }, { status: 404 });
        }
        if (user.role !== 'admin' && connection.userId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (!['parking', 'affiliate_network'].includes(connection.category)) {
            return NextResponse.json(
                { error: `Connection category ${connection.category} is not eligible for revenue ingest` },
                { status: 400 },
            );
        }

        const domainIds = new Set<string>();
        const normalizedRecords = payload.records.map((record) => {
            const domainId = record.domainId ?? connection.domainId;
            if (!domainId) {
                throw new Error('Record is missing domainId and connection is not domain-scoped');
            }
            const snapshotDate = normalizeSnapshotDate(record.snapshotDate);
            domainIds.add(domainId);
            return {
                domainId,
                snapshotDate,
                sourceType: record.sourceType,
                amount: record.amount,
                currency: record.currency.toUpperCase(),
                clicks: record.clicks ?? 0,
                impressions: record.impressions ?? 0,
                sourceRef: record.sourceRef ?? null,
                metadata: record.metadata ?? {},
            };
        });

        const existingDomains = await db.select({ id: domains.id })
            .from(domains)
            .where(inArray(domains.id, [...domainIds]));
        const existingDomainSet = new Set(existingDomains.map((row) => row.id));
        const missingDomains = [...domainIds].filter((id) => !existingDomainSet.has(id));
        if (missingDomains.length > 0) {
            return NextResponse.json({
                error: 'Some domainIds do not exist',
                missingDomains,
            }, { status: 404 });
        }

        const snapshotAggregates = new Map<string, AggregatedSnapshotInput>();
        const domainWindows = new Map<string, DomainWindow>();
        for (const record of normalizedRecords) {
            const key = aggregateSnapshotKey(record.domainId, record.snapshotDate);
            if (!snapshotAggregates.has(key)) {
                snapshotAggregates.set(key, {
                    domainId: record.domainId,
                    snapshotDate: record.snapshotDate,
                    adRevenue: 0,
                    affiliateRevenue: 0,
                    leadGenRevenue: 0,
                    totalRevenue: 0,
                    clicks: 0,
                    impressions: 0,
                });
            }
            const aggregate = snapshotAggregates.get(key)!;
            addRevenueBySource(aggregate, record.sourceType, record.amount);
            aggregate.clicks += record.clicks;
            aggregate.impressions += record.impressions;

            const existingWindow = domainWindows.get(record.domainId);
            if (!existingWindow) {
                domainWindows.set(record.domainId, {
                    domainId: record.domainId,
                    minDate: record.snapshotDate,
                    maxDate: record.snapshotDate,
                });
            } else {
                if (record.snapshotDate.getTime() < existingWindow.minDate.getTime()) {
                    existingWindow.minDate = record.snapshotDate;
                }
                if (record.snapshotDate.getTime() > existingWindow.maxDate.getTime()) {
                    existingWindow.maxDate = record.snapshotDate;
                }
            }
        }

        const now = new Date();
        await db.transaction(async (tx) => {
            for (const record of normalizedRecords) {
                await tx.insert(domainFinanceLedgerEntries).values({
                    domainId: record.domainId,
                    entryDate: record.snapshotDate,
                    entryType: 'revenue',
                    impact: 'revenue',
                    amount: record.amount.toFixed(2),
                    currency: record.currency,
                    source: `${connection.provider}:${record.sourceType}`,
                    sourceRef: record.sourceRef,
                    notes: null,
                    metadata: {
                        connectionId: connection.id,
                        provider: connection.provider,
                        category: connection.category,
                        sourceType: record.sourceType,
                        clicks: record.clicks,
                        impressions: record.impressions,
                        ...record.metadata,
                    },
                    createdBy: user.id,
                    createdAt: now,
                    updatedAt: now,
                });
            }

            for (const aggregate of snapshotAggregates.values()) {
                await tx.insert(revenueSnapshots).values({
                    domainId: aggregate.domainId,
                    snapshotDate: aggregate.snapshotDate,
                    adRevenue: aggregate.adRevenue.toFixed(2),
                    affiliateRevenue: aggregate.affiliateRevenue.toFixed(2),
                    leadGenRevenue: aggregate.leadGenRevenue.toFixed(2),
                    totalRevenue: aggregate.totalRevenue.toFixed(2),
                    clicks: aggregate.clicks,
                    impressions: aggregate.impressions,
                    createdAt: now,
                }).onConflictDoUpdate({
                    target: [revenueSnapshots.domainId, revenueSnapshots.snapshotDate],
                    set: {
                        adRevenue: sql`${revenueSnapshots.adRevenue} + ${aggregate.adRevenue.toFixed(2)}::numeric`,
                        affiliateRevenue: sql`${revenueSnapshots.affiliateRevenue} + ${aggregate.affiliateRevenue.toFixed(2)}::numeric`,
                        leadGenRevenue: sql`${revenueSnapshots.leadGenRevenue} + ${aggregate.leadGenRevenue.toFixed(2)}::numeric`,
                        totalRevenue: sql`${revenueSnapshots.totalRevenue} + ${aggregate.totalRevenue.toFixed(2)}::numeric`,
                        clicks: sql`coalesce(${revenueSnapshots.clicks}, 0) + ${aggregate.clicks}`,
                        impressions: sql`coalesce(${revenueSnapshots.impressions}, 0) + ${aggregate.impressions}`,
                    },
                });
            }
        });

        const totalAmount = normalizedRecords
            .reduce((sum, record) => sum + record.amount, 0);

        try {
            const domainWindowValues = [...domainWindows.values()];
            const domainNameRows = await db.select({
                id: domains.id,
                domain: domains.domain,
            })
                .from(domains)
                .where(inArray(domains.id, [...domainIds]));
            const domainNameById = new Map(domainNameRows.map((row) => [row.id, row.domain]));

            for (const window of domainWindowValues) {
                const [ledgerRollup, snapshotRollup] = await Promise.all([
                    db.select({
                        revenueTotal: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
                    })
                        .from(domainFinanceLedgerEntries)
                        .where(and(
                            eq(domainFinanceLedgerEntries.domainId, window.domainId),
                            eq(domainFinanceLedgerEntries.impact, 'revenue'),
                            gte(domainFinanceLedgerEntries.entryDate, window.minDate),
                            lte(domainFinanceLedgerEntries.entryDate, window.maxDate),
                        ))
                        .limit(1),
                    db.select({
                        totalRevenue: sql<number>`sum(coalesce(${revenueSnapshots.totalRevenue}, 0))::float`,
                    })
                        .from(revenueSnapshots)
                        .where(and(
                            eq(revenueSnapshots.domainId, window.domainId),
                            gte(revenueSnapshots.snapshotDate, window.minDate),
                            lte(revenueSnapshots.snapshotDate, window.maxDate),
                        ))
                        .limit(1),
                ]);

                const ledgerRow = ledgerRollup?.[0];
                const snapshotRow = snapshotRollup?.[0];

                const assessment = assessRevenueVariance({
                    ledgerTotal: Number(ledgerRow?.revenueTotal ?? 0),
                    snapshotTotal: Number(snapshotRow?.totalRevenue ?? 0),
                });
                if (assessment.status === 'matched') {
                    continue;
                }

                const severity = assessment.status === 'critical' ? 'critical' : 'warning';
                const domainName = domainNameById.get(window.domainId) ?? window.domainId;
                await createNotification({
                    type: 'info',
                    severity,
                    domainId: window.domainId,
                    title: `Revenue reconciliation ${assessment.status}: ${domainName}`,
                    message: `Ledger ${assessment.ledgerTotal.toFixed(2)} vs snapshot ${assessment.snapshotTotal.toFixed(2)} (variance ${assessment.variance.toFixed(2)}) for ${window.minDate.toISOString().slice(0, 10)} to ${window.maxDate.toISOString().slice(0, 10)}.`,
                    metadata: {
                        source: 'integration_revenue_ingest',
                        connectionId: connection.id,
                        provider: connection.provider,
                        variance: assessment.variance,
                        variancePct: assessment.variancePct,
                        toleranceAmount: assessment.toleranceAmount,
                        windowStart: window.minDate.toISOString(),
                        windowEnd: window.maxDate.toISOString(),
                    },
                });
            }
        } catch (reconciliationError) {
            console.error('Failed to emit post-ingest reconciliation alerts:', reconciliationError);
        }

        return NextResponse.json({
            success: true,
            connectionId: connection.id,
            provider: connection.provider,
            ingestedRecords: normalizedRecords.length,
            affectedDomains: domainIds.size,
            affectedSnapshotRows: snapshotAggregates.size,
            totalAmount: Number(totalAmount.toFixed(2)),
            currency: normalizedRecords[0]?.currency ?? 'USD',
        }, {
            status: 201,
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to ingest integration revenue records:', error);
        return NextResponse.json(
            {
                error: 'Failed to ingest integration revenue records',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    }
}
