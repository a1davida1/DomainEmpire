import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { inArray } from 'drizzle-orm';

const VALID_STATUSES = ['parked', 'active', 'redirect', 'forsale', 'defensive'] as const;
type DomainStatus = typeof VALID_STATUSES[number];

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: { domainIds?: string[]; status?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { domainIds, status } = body as { domainIds?: string[]; status?: string };

    if (!Array.isArray(domainIds) || domainIds.length === 0) {
        return NextResponse.json({ error: 'domainIds array required' }, { status: 400 });
    }
    if (!status || !VALID_STATUSES.includes(status as DomainStatus)) {
        return NextResponse.json(
            { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
            { status: 400 },
        );
    }

    if (domainIds.length > 200) {
        return NextResponse.json({ error: 'Maximum 200 domains per batch' }, { status: 400 });
    }

    try {
        const updated = await db
            .update(domains)
            .set({ status: status as DomainStatus })
            .where(inArray(domains.id, domainIds))
            .returning({ id: domains.id });

        return NextResponse.json({
            success: true,
            updated: updated.length,
            status,
        });
    } catch (err) {
        console.error('[BulkStatus] Error:', err);
        return NextResponse.json({ error: 'Failed to update statuses' }, { status: 500 });
    }
}
