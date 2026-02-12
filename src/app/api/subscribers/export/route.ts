/**
 * CSV export endpoint for subscribers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { exportSubscribers } from '@/lib/subscribers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const domainId = request.nextUrl.searchParams.get('domainId') || undefined;
        const csv = await exportSubscribers(domainId);
        const filename = domainId ? `subscribers-${domainId}.csv` : 'subscribers-all.csv';

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error('Subscriber export error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
