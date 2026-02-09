import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getQueueHealth, purgeOldJobs } from '@/lib/ai/worker';

// GET /api/queue/health - Get detailed queue health metrics
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const health = await getQueueHealth();

        const response = NextResponse.json(health);
        // Cache for 30s since this is a health check
        response.headers.set('Cache-Control', 'private, max-age=30');
        return response;
    } catch (error) {
        console.error('Queue health check failed:', error);
        return NextResponse.json(
            { error: 'Failed to get queue health' },
            { status: 500 }
        );
    }
}

// POST /api/queue/health - Purge old completed jobs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const olderThanDays = Math.max(body.olderThanDays || 30, 7); // Minimum 7 days

        const purged = await purgeOldJobs(olderThanDays);

        return NextResponse.json({
            purged,
            message: `Purged ${purged} completed/cancelled jobs older than ${olderThanDays} days`,
        });
    } catch (error) {
        console.error('Queue purge failed:', error);
        return NextResponse.json(
            { error: 'Failed to purge old jobs' },
            { status: 500 }
        );
    }
}
