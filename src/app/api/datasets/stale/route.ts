import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getStaleDatasets } from '@/lib/datasets';

// GET /api/datasets/stale - Get all expired datasets
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const stale = await getStaleDatasets();
        return NextResponse.json(stale);
    } catch (error) {
        console.error('Failed to get stale datasets:', error);
        return NextResponse.json({ error: 'Failed to get stale datasets' }, { status: 500 });
    }
}
