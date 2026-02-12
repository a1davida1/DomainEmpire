import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getComplianceTrend } from '@/lib/compliance/metrics';

// GET /api/compliance/trend?days=30&domainId=xxx
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { searchParams } = request.nextUrl;
        const daysStr = searchParams.get('days') || '30';
        const days = parseInt(daysStr, 10);

        if (isNaN(days) || days <= 0 || days > 365) {
            return NextResponse.json({ error: 'Invalid days parameter (1-365)' }, { status: 400 });
        }

        const domainId = searchParams.get('domainId') || undefined;
        if (domainId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
            return NextResponse.json({ error: 'Invalid domainId format' }, { status: 400 });
        }

        const snapshots = await getComplianceTrend(domainId, days);

        const trend = snapshots.map(s => ({
            id: s.id,
            date: s.snapshotDate,
            ...(s.metrics as Record<string, unknown>),
        }));

        return NextResponse.json(trend);
    } catch (error) {
        console.error('Compliance trend error:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to retrieve compliance trend' }, { status: 500 });
    }
}
