import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { calculateComplianceMetrics } from '@/lib/compliance/metrics';

// GET /api/compliance/metrics — get current compliance metrics
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const domainId = searchParams.get('domainId') || undefined;

    const metrics = await calculateComplianceMetrics(domainId);
    return NextResponse.json(metrics);
}
