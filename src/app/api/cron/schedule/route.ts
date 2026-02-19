/**
 * GET /api/cron/schedule — External cron trigger for the content scheduler.
 *
 * Decouples article scheduling from dashboard visits. Call this from:
 * - Vercel cron (vercel.json)
 * - Railway cron
 * - External crontab: curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/schedule
 *
 * Protected by CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkContentSchedule } from '@/lib/ai/scheduler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const auth = request.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

    if (token !== secret) {
        return NextResponse.json({ error: 'Invalid cron secret' }, { status: 401 });
    }

    try {
        const result = await checkContentSchedule();
        return NextResponse.json({
            ok: true,
            scheduled: result,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[cron/schedule]', err);
        return NextResponse.json({
            error: err instanceof Error ? err.message : 'Unknown error',
        }, { status: 500 });
    }
}
