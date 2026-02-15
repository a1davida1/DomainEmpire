import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domainFinanceLedgerEntries, domainFinanceMonthlyCloses, domains } from '@/lib/db';

const closeRequestSchema = z.object({
    domainId: z.string().uuid(),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    notes: z.string().trim().max(2000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

function monthRange(month: string): { monthStart: Date; monthEnd: Date } {
    const [yearRaw, monthRaw] = month.split('-');
    const year = Number.parseInt(yearRaw, 10);
    const monthIndex = Number.parseInt(monthRaw, 10) - 1;
    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));
    return { monthStart, monthEnd };
}

// GET /api/finance/monthly-close
export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    try {
        const { searchParams } = new URL(request.url);
        const domainId = searchParams.get('domainId');
        const rawLimit = Number.parseInt(searchParams.get('limit') || '24', 10);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 240)) : 24;
        const monthFrom = searchParams.get('monthFrom');
        const monthTo = searchParams.get('monthTo');

        const conditions: SQL[] = [];
        if (domainId) {
            if (!z.string().uuid().safeParse(domainId).success) {
                return NextResponse.json({ error: 'Invalid domainId' }, { status: 400 });
            }
            conditions.push(eq(domainFinanceMonthlyCloses.domainId, domainId));
        }
        if (monthFrom) {
            const parsed = monthRange(monthFrom);
            conditions.push(gte(domainFinanceMonthlyCloses.monthStart, parsed.monthStart));
        }
        if (monthTo) {
            const parsed = monthRange(monthTo);
            conditions.push(lte(domainFinanceMonthlyCloses.monthStart, parsed.monthStart));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const closes = await db.select({
            id: domainFinanceMonthlyCloses.id,
            domainId: domainFinanceMonthlyCloses.domainId,
            domain: domains.domain,
            monthStart: domainFinanceMonthlyCloses.monthStart,
            monthEnd: domainFinanceMonthlyCloses.monthEnd,
            revenueTotal: domainFinanceMonthlyCloses.revenueTotal,
            costTotal: domainFinanceMonthlyCloses.costTotal,
            netTotal: domainFinanceMonthlyCloses.netTotal,
            marginPct: domainFinanceMonthlyCloses.marginPct,
            entryCount: domainFinanceMonthlyCloses.entryCount,
            closedBy: domainFinanceMonthlyCloses.closedBy,
            closedAt: domainFinanceMonthlyCloses.closedAt,
            notes: domainFinanceMonthlyCloses.notes,
            metadata: domainFinanceMonthlyCloses.metadata,
            updatedAt: domainFinanceMonthlyCloses.updatedAt,
        })
            .from(domainFinanceMonthlyCloses)
            .innerJoin(domains, eq(domainFinanceMonthlyCloses.domainId, domains.id))
            .where(whereClause)
            .orderBy(desc(domainFinanceMonthlyCloses.monthStart), desc(domainFinanceMonthlyCloses.closedAt))
            .limit(limit);

        return NextResponse.json({ closes });
    } catch (error) {
        console.error('Failed to list domain finance monthly closes:', error);
        return NextResponse.json(
            { error: 'Failed to list domain finance monthly closes' },
            { status: 500 },
        );
    }
}

// POST /api/finance/monthly-close
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
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

    const parsed = closeRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const payload = parsed.data;
        const [domain] = await db.select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .where(eq(domains.id, payload.domainId))
            .limit(1);
        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const { monthStart, monthEnd } = monthRange(payload.month);

        const [rollup] = await db.select({
            revenueTotal: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            costTotal: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'cost' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            entryCount: sql<number>`count(*)::int`,
        })
            .from(domainFinanceLedgerEntries)
            .where(and(
                eq(domainFinanceLedgerEntries.domainId, payload.domainId),
                gte(domainFinanceLedgerEntries.entryDate, monthStart),
                lte(domainFinanceLedgerEntries.entryDate, monthEnd),
            ));

        const revenueTotal = Number(rollup?.revenueTotal) || 0;
        const costTotal = Number(rollup?.costTotal) || 0;
        const netTotal = revenueTotal - costTotal;
        const marginPct = revenueTotal > 0
            ? Number((netTotal / revenueTotal).toFixed(4))
            : null;
        const entryCount = Number(rollup?.entryCount) || 0;
        const now = new Date();

        const [close] = await db.insert(domainFinanceMonthlyCloses)
            .values({
                domainId: payload.domainId,
                monthStart,
                monthEnd,
                revenueTotal: revenueTotal.toFixed(2),
                costTotal: costTotal.toFixed(2),
                netTotal: netTotal.toFixed(2),
                marginPct: marginPct !== null ? marginPct.toFixed(4) : null,
                entryCount,
                closedBy: user.id,
                closedAt: now,
                notes: payload.notes ?? null,
                metadata: payload.metadata ?? {},
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                target: [domainFinanceMonthlyCloses.domainId, domainFinanceMonthlyCloses.monthStart],
                set: {
                    monthEnd,
                    revenueTotal: revenueTotal.toFixed(2),
                    costTotal: costTotal.toFixed(2),
                    netTotal: netTotal.toFixed(2),
                    marginPct: marginPct !== null ? marginPct.toFixed(4) : null,
                    entryCount,
                    closedBy: user.id,
                    closedAt: now,
                    notes: payload.notes ?? null,
                    metadata: payload.metadata ?? {},
                    updatedAt: now,
                },
            })
            .returning();

        return NextResponse.json({
            close,
            summary: {
                domainId: payload.domainId,
                month: payload.month,
                revenueTotal,
                costTotal,
                netTotal,
                marginPct: marginPct !== null ? Number((marginPct * 100).toFixed(2)) : null,
                entryCount,
            },
        });
    } catch (error) {
        console.error('Failed to run domain finance monthly close:', error);
        return NextResponse.json(
            { error: 'Failed to run domain finance monthly close' },
            { status: 500 },
        );
    }
}
