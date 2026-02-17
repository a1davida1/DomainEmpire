import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { expenses } from '@/lib/db/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

const expenseSchema = z.object({
    domainId: z.string().uuid().optional().nullable(),
    category: z.enum(['domain_registration', 'domain_renewal', 'hosting', 'content', 'ai_api', 'tools', 'design', 'other']),
    description: z.string().min(1).max(500),
    amount: z.number().min(0),
    currency: z.string().default('USD'),
    recurring: z.boolean().default(false),
    recurringInterval: z.enum(['monthly', 'quarterly', 'yearly']).optional().nullable(),
    expenseDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

// GET /api/expenses — List expenses with optional filters
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    try {
        const conditions = [];
        if (domainId) conditions.push(eq(expenses.domainId, domainId));

        if (startDate) {
            const date = new Date(startDate);
            if (Number.isNaN(date.getTime())) {
                return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
            }
            conditions.push(gte(expenses.expenseDate, date));
        }

        if (endDate) {
            const date = new Date(endDate);
            if (Number.isNaN(date.getTime())) {
                return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 });
            }
            conditions.push(lte(expenses.expenseDate, date));
        }

        const query = conditions.length > 0
            ? db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.expenseDate))
            : db.select().from(expenses).orderBy(desc(expenses.expenseDate));

        const data = await query;

        const totalAmount = data.reduce((sum, e) => {
            const amt = Number.parseFloat(e.amount);
            return sum + (Number.isFinite(amt) ? amt : 0);
        }, 0);

        const byCategory: Record<string, number> = {};
        for (const e of data) {
            const amt = Number.parseFloat(e.amount);
            const safeAmt = Number.isFinite(amt) ? amt : 0;
            byCategory[e.category] = (byCategory[e.category] || 0) + safeAmt;
        }

        return NextResponse.json({ expenses: data, totalAmount, byCategory });
    } catch (error) {
        console.error('Failed to fetch expenses:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to fetch expenses' },
            { status: 500 }
        );
    }
}

// POST /api/expenses — Create a new expense
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const parsed = expenseSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        if (parsed.data.recurring && !parsed.data.recurringInterval) {
            return NextResponse.json({ error: 'recurringInterval is required when recurring is true' }, { status: 400 });
        }

        const rows = await db.insert(expenses).values({
            ...parsed.data,
            amount: parsed.data.amount.toString(),
            domainId: parsed.data.domainId || null,
            recurringInterval: parsed.data.recurringInterval || null,
            expenseDate: new Date(parsed.data.expenseDate),
        }).returning();
        const expense = rows[0];

        if (!expense) {
            return NextResponse.json({ error: 'Insert returned no row' }, { status: 500 });
        }

        return NextResponse.json(expense, { status: 201 });
    } catch (error) {
        console.error('Failed to create expense:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to create expense' },
            { status: 500 }
        );
    }
}
