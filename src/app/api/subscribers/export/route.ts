/**
 * CSV export endpoint for subscribers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { exportSubscribers } from '@/lib/subscribers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Exporting PII requires admin privileges
    const roleError = await requireRole(request, 'admin');
    if (roleError) return roleError;

    // Optional domainId filter
    const domainId = request.nextUrl.searchParams.get('domainId') || undefined;
    if (domainId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
        return NextResponse.json({ error: 'Invalid domain ID' }, { status: 400 });
    }

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
