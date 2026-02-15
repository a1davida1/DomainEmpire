import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { getIntegrationHealthSummary } from '@/lib/integrations/health-monitor';

const summaryLimiter = createRateLimiter('integration_health_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = getRequestUser(request).id.trim();
    if (!userId) {
        return NextResponse.json(
            { error: 'Missing authenticated user identity' },
            { status: 401 },
        );
    }

    const rate = summaryLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many integration health requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const topIssueLimit = parseIntParam(request.nextUrl.searchParams.get('topIssueLimit'), 50, 1, 500);
        const maxConnections = parseIntParam(request.nextUrl.searchParams.get('maxConnections'), 1000, 1, 10000);

        const summary = await getIntegrationHealthSummary({
            topIssueLimit,
            maxConnections,
        });

        return NextResponse.json(
            {
                ...summary,
                generatedAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to generate integration health summary:', error);
        return NextResponse.json(
            { error: 'Failed to generate integration health summary' },
            { status: 500, headers: rate.headers },
        );
    }
}
