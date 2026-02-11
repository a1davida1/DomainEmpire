import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';

// GET /api/analytics/gsc?domain=example.com — Get GSC data for a domain
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const days = Number.parseInt(searchParams.get('days') || '28', 10);

    if (Number.isNaN(days) || days <= 0) {
        return NextResponse.json({ error: 'Invalid days parameter' }, { status: 400 });
    }

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
        console.error(`GSC API error for ${domain}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to fetch GSC data' },
            { status: 500 }
        );
    }
}
