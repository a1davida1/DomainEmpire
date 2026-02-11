import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { expenses } from '@/lib/db/schema';
import { eq, desc, sql, and, gte, lte } from 'drizzle-orm';
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
        if (startDate) conditions.push(gte(expenses.expenseDate, new Date(startDate)));
        if (endDate) conditions.push(lte(expenses.expenseDate, new Date(endDate)));

        const query = conditions.length > 0
            ? db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.expenseDate))
            : db.select().from(expenses).orderBy(desc(expenses.expenseDate));

        const data = await query;

        const totalAmount = data.reduce((sum, e) => sum + e.amount, 0);
        const byCategory: Record<string, number> = {};
        for (const e of data) {
            byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
        }

        return NextResponse.json({ expenses: data, totalAmount, byCategory });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch expenses', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// POST /api/expenses — Create a new expense
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = expenseSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        const [expense] = await db.insert(expenses).values({
            ...parsed.data,
            domainId: parsed.data.domainId || null,
            recurringInterval: parsed.data.recurringInterval || null,
            expenseDate: new Date(parsed.data.expenseDate),
        }).returning();

        return NextResponse.json(expense, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to create expense', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
