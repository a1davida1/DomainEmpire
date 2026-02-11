import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getExpiringDomains, syncRenewalDates } from '@/lib/domain/renewals';

// GET /api/domains/[id]/renewals — Get expiring domains
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const days = Number.parseInt(searchParams.get('days') || '90', 10);

    if (Number.isNaN(days) || days < 0) {
        return NextResponse.json({ error: 'Invalid days parameter' }, { status: 400 });
    }

    try {
        let expiring = await getExpiringDomains(days);

        if (id !== 'all') {
            expiring = expiring.filter(d => d.domainId === id);
            if (expiring.length === 0) {
                // Not necessarily an error, just might not be expiring soon
                // but if ID is totally invalid/missing, we might want 404
            }
        }

        return NextResponse.json({ expiring, count: expiring.length });
    } catch (error) {
        console.error(`Failed to fetch renewals for ${id}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to check renewals' },
            { status: 500 }
        );
    }
}

// POST /api/domains/[id]/renewals — Sync renewal dates from registrar
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const domainId = id === 'all' ? undefined : id;
        const updated = await syncRenewalDates(domainId);
        return NextResponse.json({ updated, message: `Updated ${updated} domain renewal dates` });
    } catch (error) {
        console.error(`Failed to sync renewals for ${id}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to sync renewals' },
            { status: 500 }
        );
    }
}
