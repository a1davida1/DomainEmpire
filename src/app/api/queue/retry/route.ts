import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { retryFailedJobs } from '@/lib/ai/worker';

// POST /api/queue/retry - Retry failed jobs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const limit = Math.min(body.limit || 10, 50); // Cap at 50 to prevent overload

        if (limit <= 0) {
            return NextResponse.json({ error: 'Invalid limit' }, { status: 400 });
        }

        const retriedCount = await retryFailedJobs(limit);

        return NextResponse.json({
            retriedCount,
            message: retriedCount > 0
                ? `Queued ${retriedCount} failed jobs for retry`
                : 'No failed jobs to retry',
        });
    } catch (error) {
        console.error('Failed to retry jobs:', error);
        return NextResponse.json(
            { error: 'Failed to retry jobs' },
            { status: 500 }
        );
    }
}
