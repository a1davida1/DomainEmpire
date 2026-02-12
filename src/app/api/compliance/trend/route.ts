import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getComplianceTrend } from '@/lib/compliance/metrics';

// GET /api/compliance/trend?days=30&domainId=xxx
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const days = parseInt(searchParams.get('days') || '30', 10);
    const domainId = searchParams.get('domainId') || undefined;

    const snapshots = await getComplianceTrend(domainId, days);

    const trend = snapshots.map(s => ({
        date: s.snapshotDate,
        ...(s.metrics as Record<string, unknown>),
    }));

    return NextResponse.json(trend);
}
