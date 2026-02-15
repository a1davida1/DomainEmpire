import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import {
    applyDomainStrategyPropagation,
    generateStrategyPropagationRecommendations,
    STRATEGY_PROPAGATION_MODULES,
} from '@/lib/domain/strategy-propagation';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const propagationLimiter = createRateLimiter('domain_strategy_propagation', {
    maxRequests: 60,
    windowMs: 60 * 1000,
});

const moduleEnum = z.enum(STRATEGY_PROPAGATION_MODULES);

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

const applySchema = z.object({
    sourceDomainId: z.string().uuid(),
    targetDomainIds: z.array(z.string().uuid()).min(1).max(100),
    modules: z.array(moduleEnum).min(1).max(STRATEGY_PROPAGATION_MODULES.length),
    note: z.string().max(1000).optional().nullable(),
    dryRun: z.boolean().optional().default(false),
    forceCrossNiche: z.boolean().optional().default(false),
});

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = propagationLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many strategy recommendation requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const windowDays = parseIntParam(request.nextUrl.searchParams.get('windowDays'), 30, 7, 120);
        const sourceLimit = parseIntParam(request.nextUrl.searchParams.get('sourceLimit'), 20, 1, 100);
        const targetLimitPerSource = parseIntParam(request.nextUrl.searchParams.get('targetLimitPerSource'), 5, 1, 20);
        const minSourceScore = parseIntParam(request.nextUrl.searchParams.get('minSourceScore'), 75, 0, 100);
        const maxTargetScore = parseIntParam(request.nextUrl.searchParams.get('maxTargetScore'), 60, 0, 100);

        const recommendations = await generateStrategyPropagationRecommendations({
            windowDays,
            sourceLimit,
            targetLimitPerSource,
            minSourceScore,
            maxTargetScore,
        });

        return NextResponse.json(
            {
                ...recommendations,
                generatedAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to generate strategy propagation recommendations:', error);
        return NextResponse.json(
            { error: 'Failed to generate strategy propagation recommendations' },
            { status: 500, headers: rate.headers },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id')?.trim();
    if (!userId || userId === 'unknown') {
        return NextResponse.json(
            { error: 'Missing authenticated user identity (x-user-id)' },
            { status: 401 },
        );
    }

    const rate = propagationLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many strategy propagation requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400, headers: rate.headers });
    }

    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const result = await applyDomainStrategyPropagation({
            ...parsed.data,
            appliedBy: userId,
        });

        return NextResponse.json(
            {
                success: true,
                result,
                appliedAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to apply strategy propagation:', error);
        const message = error instanceof Error ? error.message : 'Failed to apply strategy propagation';
        const statusCandidate =
            typeof (error as { statusCode?: unknown }).statusCode === 'number'
                ? (error as { statusCode: number }).statusCode
                : typeof (error as { status?: unknown }).status === 'number'
                    ? (error as { status: number }).status
                    : null;
        const status = statusCandidate && statusCandidate >= 400 && statusCandidate <= 599
            ? statusCandidate
            : (error instanceof Error && error.name === 'NotFoundError')
                ? 404
                : 400;

        return NextResponse.json(
            { error: message },
            { status, headers: rate.headers },
        );
    }
}
