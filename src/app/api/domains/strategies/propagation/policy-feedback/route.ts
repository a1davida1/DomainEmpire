import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { getStrategyPropagationPolicyFeedback } from '@/lib/domain/strategy-propagation-feedback';

const feedbackLimiter = createRateLimiter('domain_strategy_propagation_policy_feedback', {
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

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = feedbackLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many strategy propagation feedback requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const lookbackDays = parseIntParam(request.nextUrl.searchParams.get('lookbackDays'), 60, 14, 365);
        const preWindowDays = parseIntParam(request.nextUrl.searchParams.get('preWindowDays'), 14, 1, 60);
        const postWindowDays = parseIntParam(request.nextUrl.searchParams.get('postWindowDays'), 14, 1, 60);
        const maxEvents = parseIntParam(request.nextUrl.searchParams.get('maxEvents'), 500, 10, 5000);
        const minImprovementScore = parseIntParam(request.nextUrl.searchParams.get('minImprovementScore'), 5, 1, 50);

        const feedback = await getStrategyPropagationPolicyFeedback({
            lookbackDays,
            preWindowDays,
            postWindowDays,
            maxEvents,
            minImprovementScore,
        });

        return NextResponse.json(
            {
                ...feedback,
                generatedAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to generate strategy propagation policy feedback:', error);
        return NextResponse.json(
            { error: 'Failed to generate strategy propagation policy feedback' },
            { status: 500, headers: rate.headers },
        );
    }
}
