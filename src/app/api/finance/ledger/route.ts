import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, domainFinanceLedgerEntries, domains } from '@/lib/db';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';

const ENTRY_TYPES = [
    'acquisition_cost',
    'build_cost',
    'operating_cost',
    'channel_spend',
    'revenue',
    'adjustment',
] as const;

const IMPACTS = ['revenue', 'cost'] as const;

const createLedgerEntrySchema = z.object({
    domainId: z.string().uuid(),
    entryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    entryType: z.enum(ENTRY_TYPES),
    impact: z.enum(IMPACTS).optional(),
    amount: z.number().positive(),
    currency: z.string().trim().min(3).max(3).optional().default('USD'),
    source: z.string().trim().max(200).optional().nullable(),
    sourceRef: z.string().trim().max(500).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

function parseDateParam(value: string | null, field: string): Date | NextResponse | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
    }
    return date;
}

function deriveImpact(
    entryType: typeof ENTRY_TYPES[number],
    requestedImpact?: typeof IMPACTS[number],
): typeof IMPACTS[number] {
    if (entryType === 'revenue') return 'revenue';
    return requestedImpact ?? 'cost';
}

// GET /api/finance/ledger
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const domainId = searchParams.get('domainId');
        const entryType = searchParams.get('entryType');
        const impact = searchParams.get('impact');
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');
        const rawLimit = Number.parseInt(searchParams.get('limit') || '100', 10);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 500)) : 100;

        const startDate = parseDateParam(startDateParam, 'startDate');
        if (startDate instanceof NextResponse) return startDate;
        const endDate = parseDateParam(endDateParam, 'endDate');
        if (endDate instanceof NextResponse) return endDate;

        const conditions: SQL[] = [];
        if (domainId) {
            if (!z.string().uuid().safeParse(domainId).success) {
                return NextResponse.json({ error: 'Invalid domainId' }, { status: 400 });
            }
            conditions.push(eq(domainFinanceLedgerEntries.domainId, domainId));
        }
        if (entryType) {
            if (!ENTRY_TYPES.includes(entryType as typeof ENTRY_TYPES[number])) {
                return NextResponse.json({ error: 'Invalid entryType' }, { status: 400 });
            }
            conditions.push(eq(domainFinanceLedgerEntries.entryType, entryType as typeof ENTRY_TYPES[number]));
        }
        if (impact) {
            if (!IMPACTS.includes(impact as typeof IMPACTS[number])) {
                return NextResponse.json({ error: 'Invalid impact' }, { status: 400 });
            }
            conditions.push(eq(domainFinanceLedgerEntries.impact, impact as typeof IMPACTS[number]));
        }
        if (startDate) {
            conditions.push(gte(domainFinanceLedgerEntries.entryDate, startDate));
        }
        if (endDate) {
            conditions.push(lte(domainFinanceLedgerEntries.entryDate, endDate));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const entries = await db.select({
            id: domainFinanceLedgerEntries.id,
            domainId: domainFinanceLedgerEntries.domainId,
            domain: domains.domain,
            entryDate: domainFinanceLedgerEntries.entryDate,
            entryType: domainFinanceLedgerEntries.entryType,
            impact: domainFinanceLedgerEntries.impact,
            amount: domainFinanceLedgerEntries.amount,
            currency: domainFinanceLedgerEntries.currency,
            source: domainFinanceLedgerEntries.source,
            sourceRef: domainFinanceLedgerEntries.sourceRef,
            notes: domainFinanceLedgerEntries.notes,
            metadata: domainFinanceLedgerEntries.metadata,
            createdBy: domainFinanceLedgerEntries.createdBy,
            createdAt: domainFinanceLedgerEntries.createdAt,
            updatedAt: domainFinanceLedgerEntries.updatedAt,
        })
            .from(domainFinanceLedgerEntries)
            .innerJoin(domains, eq(domainFinanceLedgerEntries.domainId, domains.id))
            .where(whereClause)
            .orderBy(desc(domainFinanceLedgerEntries.entryDate), desc(domainFinanceLedgerEntries.createdAt))
            .limit(limit);

        const summaryRows = await db.select({
            impact: domainFinanceLedgerEntries.impact,
            total: sql<number>`sum(${domainFinanceLedgerEntries.amount})::float`,
        })
            .from(domainFinanceLedgerEntries)
            .where(whereClause)
            .groupBy(domainFinanceLedgerEntries.impact);

        const summary = {
            revenueTotal: 0,
            costTotal: 0,
            netTotal: 0,
            marginPct: null as number | null,
            entryCount: entries.length,
        };
        for (const row of summaryRows) {
            const amount = Number(row.total) || 0;
            if (row.impact === 'revenue') {
                summary.revenueTotal += amount;
            } else {
                summary.costTotal += amount;
            }
        }
        summary.netTotal = summary.revenueTotal - summary.costTotal;
        summary.marginPct = summary.revenueTotal > 0
            ? Number(((summary.netTotal / summary.revenueTotal) * 100).toFixed(2))
            : null;

        return NextResponse.json({
            entries,
            summary,
        });
    } catch (error) {
        console.error('Failed to list domain finance ledger entries:', error);
        return NextResponse.json(
            { error: 'Failed to list domain finance ledger entries' },
            { status: 500 },
        );
    }
}

// POST /api/finance/ledger
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = createLedgerEntrySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const payload = parsed.data;
        const [domain] = await db.select({ id: domains.id })
            .from(domains)
            .where(eq(domains.id, payload.domainId))
            .limit(1);
        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const impact = deriveImpact(payload.entryType, payload.impact);
        const entryRows = await db.insert(domainFinanceLedgerEntries)
            .values({
                domainId: payload.domainId,
                entryDate: new Date(payload.entryDate),
                entryType: payload.entryType,
                impact,
                amount: payload.amount.toFixed(2),
                currency: payload.currency.toUpperCase(),
                source: payload.source ?? null,
                sourceRef: payload.sourceRef ?? null,
                notes: payload.notes ?? null,
                metadata: payload.metadata ?? {},
                createdBy: user.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();
        const entry = entryRows[0];

        if (!entry) {
            return NextResponse.json({ error: 'Insert returned no row' }, { status: 500 });
        }

        if (payload.entryType === 'revenue' && payload.amount > 0) {
            try {
                await advanceDomainLifecycleForAcquisition({
                    domainId: payload.domainId,
                    targetState: 'monetized',
                    actorId: user.id,
                    actorRole: user.role,
                    reason: 'Revenue ledger entry recorded',
                    metadata: {
                        source: 'finance_ledger',
                        ledgerEntryId: entry.id,
                        entryType: payload.entryType,
                        amount: payload.amount,
                        currency: payload.currency.toUpperCase(),
                    },
                });
            } catch (lifecycleError) {
                console.error('Failed to auto-advance lifecycle to monetized on revenue entry:', {
                    domainId: payload.domainId,
                    entryId: entry.id,
                    error: lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError),
                });
            }
        }

        return NextResponse.json({ entry }, { status: 201 });
    } catch (error) {
        console.error('Failed to create domain finance ledger entry:', error);
        return NextResponse.json(
            { error: 'Failed to create domain finance ledger entry' },
            { status: 500 },
        );
    }
}
