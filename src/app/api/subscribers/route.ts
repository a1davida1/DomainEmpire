/**
 * Authenticated subscriber management API.
 * GET: Paginated list with filters and stats.
 * DELETE: Bulk delete subscribers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSubscribers, getSubscriberStats } from '@/lib/subscribers';
import { db, subscribers } from '@/lib/db';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const { searchParams } = request.nextUrl;
        const domainId = searchParams.get('domainId') || undefined;
        const source = searchParams.get('source') || undefined;
        const status = searchParams.get('status') || undefined;
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

        const [result, stats] = await Promise.all([
            getSubscribers({ domainId, source, status, page, limit }),
            getSubscriberStats(domainId),
        ]);

        return NextResponse.json({ ...result, stats });
    } catch (error) {
        console.error('Subscribers GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

const deleteSchema = z.object({
    subscriberIds: z.array(z.string().uuid()).min(1).max(100),
});

export async function DELETE(request: NextRequest) {
    // Deleting subscribers requires admin privileges
    const roleError = await requireRole(request, 'admin');
    if (roleError) return roleError;

    try {
        const body = await request.json();
        const parsed = deleteSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const deleted = await db
            .delete(subscribers)
            .where(inArray(subscribers.id, parsed.data.subscriberIds))
            .returning({ id: subscribers.id });

        return NextResponse.json({ deleted: deleted.length });
    } catch (error) {
        console.error('Subscribers DELETE error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
