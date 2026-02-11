import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkBacklinks, detectLostBacklinks } from '@/lib/analytics/backlinks';
import { db } from '@/lib/db';
import { backlinkSnapshots } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET /api/analytics/backlinks?domainId=xxx — Get latest backlink snapshot
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');

    if (!domainId) {
        return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
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
        return NextResponse.json(
            { error: 'Failed to fetch backlinks', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// POST /api/analytics/backlinks — Trigger a backlink check
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const domainId = body?.domainId;
        if (!domainId || typeof domainId !== 'string') {
            return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
        }

        await checkBacklinks(domainId);
        return NextResponse.json({ success: true, message: 'Backlink check complete' });
    } catch (error) {
        return NextResponse.json(
            { error: 'Backlink check failed', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
