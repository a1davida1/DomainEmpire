import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { getDomainRoiPriorities } from '@/lib/domain/roi-priority-service';

const roiPriorityLimiter = createRateLimiter('domain_roi_priority', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function parseLimit(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.max(1, Math.min(parsed, 200));
}

function parseWindowDays(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(7, Math.min(parsed, 120));
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = roiPriorityLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many ROI priority requests. Please retry shortly.' },
            {
                status: 429,
                headers: rate.headers,
            },
        );
    }

    try {
        const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
        const windowDays = parseWindowDays(request.nextUrl.searchParams.get('windowDays'));
        const prioritized = await getDomainRoiPriorities({
            limit,
            windowDays,
        });

        return NextResponse.json({
            windowDays: prioritized.windowDays,
            count: prioritized.count,
            actionCounts: prioritized.actionCounts,
            priorities: prioritized.priorities,
            generatedAt: prioritized.generatedAt,
        });
    } catch (error) {
        console.error('Failed to load domain ROI priorities:', error);
        return NextResponse.json(
            { error: 'Failed to load domain ROI priorities' },
            { status: 500 },
        );
    }
}
