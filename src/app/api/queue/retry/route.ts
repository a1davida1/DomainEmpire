import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { retryFailedJobs } from '@/lib/ai/worker';
import { getContentQueueBackendHealth } from '@/lib/queue/content-queue';

// POST /api/queue/retry - Retry failed jobs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const limit = Math.min(body.limit || 10, 50); // Cap at 50 to prevent overload
        const mode = body.mode === 'transient' ? 'transient' : 'all';

        if (limit <= 0) {
            return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
        }

        const retriedCount = await retryFailedJobs(limit, { mode });

        const backend = await getContentQueueBackendHealth();
        return NextResponse.json({
            retriedCount,
            mode,
            message: retriedCount > 0
                ? `Queued ${retriedCount} ${mode} failed jobs for retry`
                : `No ${mode} failed jobs to retry`,
            backend,
        });
    } catch (error) {
        console.error('Failed to retry jobs:', error);
        return NextResponse.json(
            { error: 'Failed to retry jobs' },
            { status: 500 }
        );
    }
}
