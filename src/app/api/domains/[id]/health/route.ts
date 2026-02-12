/**
 * Domain health API - Composite health scoring.
 * Returns a 0-100 health score with breakdown and recommendations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { calculateCompositeHealth } from '@/lib/health/scoring';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const health = await calculateCompositeHealth(id);

        if (!health) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        return NextResponse.json(health);
    } catch (error) {
        console.error('Health scoring error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
