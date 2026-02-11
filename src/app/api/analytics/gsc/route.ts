import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';

// GET /api/analytics/gsc?domain=example.com — Get GSC data for a domain
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const days = parseInt(searchParams.get('days') || '28', 10);

    if (!domain) {
        return NextResponse.json({ error: 'domain parameter is required' }, { status: 400 });
    }

    try {
        const summary = await getDomainGSCSummary(domain, days);
        if (!summary) {
            return NextResponse.json({ error: 'GSC not configured or no data available' }, { status: 404 });
        }
        return NextResponse.json(summary);
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to fetch GSC data', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
