import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { detectLostBacklinks } from '@/lib/analytics/backlinks';
import { db } from '@/lib/db';
import { backlinkSnapshots, contentQueue } from '@/lib/db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';

// GET /api/analytics/backlinks?domainId=xxx — Get latest backlink snapshot
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');

    if (!domainId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
        return NextResponse.json({ error: 'Valid domainId is required' }, { status: 400 });
    }

    try {
        const latest = await db.select()
            .from(backlinkSnapshots)
            .where(eq(backlinkSnapshots.domainId, domainId))
            .orderBy(desc(backlinkSnapshots.snapshotDate))
            .limit(1);

        if (!latest.length) {
            return NextResponse.json({ error: 'No backlink data. Run a check first.' }, { status: 404 });
        }

        const lost = await detectLostBacklinks(domainId);

        return NextResponse.json({ snapshot: latest[0], lostBacklinks: lost });
    } catch (error) {
        console.error(`Failed to fetch backlinks for ${domainId}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to fetch backlinks' },
            { status: 500 }
        );
    }
}

// POST /api/analytics/backlinks — Queue a backlink check (non-blocking)
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    let domainId: string | undefined;
    try {
        const body = await request.json();
        domainId = body?.domainId;
        if (!domainId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
            return NextResponse.json({ error: 'Valid domainId is required' }, { status: 400 });
        }

        // Check for already-pending backlink check to avoid duplicate work
        const existing = await db.select({ id: contentQueue.id })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.domainId, domainId),
                eq(contentQueue.jobType, 'check_backlinks'),
                inArray(contentQueue.status, ['pending', 'processing']),
            ))
            .limit(1);

        if (existing.length > 0) {
            return NextResponse.json({ queued: true, jobId: existing[0].id, message: 'Backlink check already in progress' });
        }

        // Queue as a background job instead of blocking the request
        const [job] = await db.insert(contentQueue).values({
            jobType: 'check_backlinks',
            domainId,
            priority: 3,
            status: 'pending',
        }).returning({ id: contentQueue.id });

        return NextResponse.json({ queued: true, jobId: job.id, message: 'Backlink check queued' }, { status: 202 });
    } catch (error) {
        console.error(`Backlink check failed for ${domainId || 'unknown'}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to queue backlink check' },
            { status: 500 }
        );
    }
}
