/**
 * Competitor SERP history API.
 * Returns historical snapshots for a competitor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { competitorSnapshots } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '30', 10)));

        const snapshots = await db.select()
            .from(competitorSnapshots)
            .where(eq(competitorSnapshots.competitorId, id))
            .orderBy(desc(competitorSnapshots.snapshotDate))
            .limit(limit);

        return NextResponse.json({ snapshots });
    } catch (error) {
        console.error('Competitor history error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
