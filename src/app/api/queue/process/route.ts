import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runWorkerOnce, getQueueStats, getQueueHealth } from '@/lib/ai/worker';
import { getContentQueueBackendHealth } from '@/lib/queue/content-queue';

function parseMaxJobs(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return 5;
    return Math.max(1, Math.min(parsed, 200));
}

function parseJobTypes(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const normalized = [...new Set(
        value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.length <= 80 && /^[a-z0-9_]+$/i.test(item)),
    )];
    return normalized.length > 0 ? normalized : undefined;
}

// POST /api/queue/process - Process pending jobs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const maxJobs = parseMaxJobs(body.maxJobs);
        const jobTypes = parseJobTypes(body.jobTypes);

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
