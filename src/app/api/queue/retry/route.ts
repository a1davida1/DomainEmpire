import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { retryFailedJobsDetailed } from '@/lib/ai/worker';
import { getContentQueueBackendHealth } from '@/lib/queue/content-queue';

function parseLimit(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.max(1, Math.min(parsed, 50));
}

function parseMode(value: unknown): 'all' | 'transient' {
    return value === 'transient' ? 'transient' : 'all';
}

function parseJobTypes(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(
        value
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item.length <= 80 && /^[a-z0-9_]+$/i.test(item)),
    )];
}

function parseDomainId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        return undefined;
    }
    return trimmed;
}

function parseMinFailedAgeMs(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.max(0, Math.min(parsed, 24 * 60 * 60 * 1000));
}

// POST /api/queue/retry - Retry failed jobs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const limit = parseLimit((body as Record<string, unknown>).limit);
        const mode = parseMode((body as Record<string, unknown>).mode);
        const dryRun = (body as Record<string, unknown>).dryRun === true;
        const jobTypes = parseJobTypes((body as Record<string, unknown>).jobTypes);
        const domainId = parseDomainId((body as Record<string, unknown>).domainId);
        const minFailedAgeMs = parseMinFailedAgeMs((body as Record<string, unknown>).minFailedAgeMs);

        const summary = await retryFailedJobsDetailed(limit, {
            mode,
            dryRun,
            jobTypes,
            domainId,
            minFailedAgeMs,
        });

        const backend = await getContentQueueBackendHealth();
        return NextResponse.json({
            ...summary,
            message: summary.dryRun
                ? `Dry run found ${summary.selectedCount} ${summary.mode} failed jobs matching filters`
                : summary.retriedCount > 0
                    ? `Queued ${summary.retriedCount} ${summary.mode} failed jobs for retry`
                    : `No ${summary.mode} failed jobs to retry`,
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
