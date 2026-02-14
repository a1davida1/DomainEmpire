import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runWorkerOnce, getQueueStats, getQueueHealth } from '@/lib/ai/worker';
import { getContentQueueBackendHealth } from '@/lib/queue/content-queue';

// POST /api/queue/process - Process pending jobs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const maxJobs = body.maxJobs || 5;
        const jobTypes = body.jobTypes;

        const result = await runWorkerOnce({ maxJobs, jobTypes });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Queue processing failed:', error);
        return NextResponse.json(
            { error: 'Failed to process queue' },
            { status: 500 }
        );
    }
}

// GET /api/queue/process - Get queue stats and health
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const url = new URL(request.url);
        const detailed = url.searchParams.get('detailed') === 'true';

        if (detailed) {
            const [health, backend] = await Promise.all([
                getQueueHealth(),
                getContentQueueBackendHealth(),
            ]);
            return NextResponse.json({
                ...health,
                backend,
            });
        }

        const [stats, backend] = await Promise.all([
            getQueueStats(),
            getContentQueueBackendHealth(),
        ]);
        return NextResponse.json({ stats, backend });
    } catch (error) {
        console.error('Failed to get queue stats:', error);
        return NextResponse.json(
            { error: 'Failed to get queue stats' },
            { status: 500 }
        );
    }
}
