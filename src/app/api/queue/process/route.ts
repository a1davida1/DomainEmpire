import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { runWorkerOnce, getQueueStats, getQueueHealth } from '@/lib/ai/worker';
import { getContentQueueBackendHealth } from '@/lib/queue/content-queue';
import { restartWorkerIfDead } from '@/lib/ai/worker-bootstrap';

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

function parseConcurrency(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.max(1, Math.min(parsed, 32));
}

function parsePerJobTypeConcurrency(value: unknown): Record<string, number> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const parsed: Record<string, number> = {};
    for (const [jobType, rawLimit] of Object.entries(value as Record<string, unknown>)) {
        if (!/^[a-z0-9_]+$/i.test(jobType)) continue;
        const limit = Number.parseInt(String(rawLimit), 10);
        if (!Number.isFinite(limit) || limit <= 0) continue;
        parsed[jobType] = Math.max(1, Math.min(limit, 32));
    }
    return Object.keys(parsed).length > 0 ? parsed : undefined;
}

// POST /api/queue/process - Process pending jobs
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        // Watchdog: restart the continuous worker if it died
        await restartWorkerIfDead();

        const body = await request.json().catch(() => ({}));
        const payload = body as Record<string, unknown>;
        const maxJobs = parseMaxJobs(payload.maxJobs);
        const jobTypes = parseJobTypes(payload.jobTypes);
        const concurrency = parseConcurrency(payload.concurrency);
        const perJobTypeConcurrency = parsePerJobTypeConcurrency(payload.perJobTypeConcurrency);

        const result = await runWorkerOnce({ maxJobs, jobTypes, concurrency, perJobTypeConcurrency });

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
    const authError = await requireRole(request, 'admin');
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
