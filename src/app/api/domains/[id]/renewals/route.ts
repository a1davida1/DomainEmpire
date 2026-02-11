import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getExpiringDomains, syncRenewalDates } from '@/lib/domain/renewals';

// GET /api/domains/[id]/renewals — Get expiring domains
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90', 10);

    try {
        const expiring = await getExpiringDomains(days);
        return NextResponse.json({ expiring, count: expiring.length });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to check renewals', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// POST /api/domains/[id]/renewals — Sync renewal dates from registrar
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const updated = await syncRenewalDates();
        return NextResponse.json({ updated, message: `Updated ${updated} domain renewal dates` });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to sync renewals', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
