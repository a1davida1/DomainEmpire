import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { calculateComplianceMetrics } from '@/lib/compliance/metrics';

// GET /api/compliance/metrics — get current compliance metrics
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { searchParams } = request.nextUrl;
        const domainId = searchParams.get('domainId') || undefined;

        if (domainId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
            return NextResponse.json({ error: 'Invalid domainId format' }, { status: 400 });
        }

        const metrics = await calculateComplianceMetrics(domainId);
        return NextResponse.json(metrics);
    } catch (error) {
        console.error('Compliance metrics error:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to calculate compliance metrics' }, { status: 500 });
    }
}
