import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { getCapitalAllocationPolicyFeedback } from '@/lib/growth/capital-allocation-feedback';

const feedbackLimiter = createRateLimiter('growth_capital_allocation_policy_feedback', {
    maxRequests: 60,
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

    const clientIp = getClientIp(request);
    const userId = request.headers.get('x-user-id')?.trim();
    if (!userId || userId === 'unknown') {
        console.warn('Missing x-user-id for capital allocation policy feedback request', {
            url: request.url,
            clientIp,
        });
        return NextResponse.json(
            { error: 'Missing authenticated user identity (x-user-id)' },
            { status: 400 },
        );
    }

    const rate = feedbackLimiter(`${userId}:${clientIp}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many capital allocation feedback requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const lookbackDays = parseIntParam(request.nextUrl.searchParams.get('lookbackDays'), 45, 7, 180);
        const preWindowDays = parseIntParam(request.nextUrl.searchParams.get('preWindowDays'), 7, 1, 30);
        const postWindowDays = parseIntParam(request.nextUrl.searchParams.get('postWindowDays'), 7, 1, 30);
        const maxApplyEvents = parseIntParam(request.nextUrl.searchParams.get('maxApplyEvents'), 200, 10, 1000);

        const feedback = await getCapitalAllocationPolicyFeedback({
            lookbackDays,
            preWindowDays,
            postWindowDays,
            maxApplyEvents,
        });

        return NextResponse.json(
            {
                ...feedback,
                generatedAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to generate capital allocation policy feedback:', error);
        return NextResponse.json(
            { error: 'Failed to generate capital allocation policy feedback' },
            { status: 500, headers: rate.headers },
        );
    }
}
