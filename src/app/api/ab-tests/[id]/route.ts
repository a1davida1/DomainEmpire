/**
 * A/B Test detail API - get details, cancel, or evaluate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abTests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { evaluateTest } from '@/lib/ab-testing';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const test = await db.select().from(abTests).where(eq(abTests.id, id)).limit(1);
        if (test.length === 0) {
            return NextResponse.json({ error: 'Test not found' }, { status: 404 });
        }

        // Auto-evaluate if active
        let evaluation = null;
        if (test[0].status === 'active') {
            evaluation = await evaluateTest(id);
        }

        return NextResponse.json({ test: test[0], evaluation });
    } catch (error) {
        console.error('A/B test detail error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const result = await db.update(abTests)
            .set({ status: 'cancelled' })
            .where(eq(abTests.id, id))
            .returning();

        if (result.length === 0) {
            return NextResponse.json({ error: 'Test not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('A/B test cancel error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
