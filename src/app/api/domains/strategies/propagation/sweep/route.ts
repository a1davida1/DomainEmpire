import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
    runStrategyPropagationSweep,
    type StrategyPropagationSweepConfig,
} from '@/lib/domain/strategy-propagation-monitor';
import { STRATEGY_PROPAGATION_MODULES } from '@/lib/domain/strategy-propagation';

const sweepLimiter = createRateLimiter('domain_strategy_propagation_sweep', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const moduleEnum = z.enum(STRATEGY_PROPAGATION_MODULES);

const bodySchema = z.object({
    force: z.boolean().optional().default(true),
    notify: z.boolean().optional().default(true),
    enabled: z.boolean().optional(),
    autoTunePolicy: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    forceCrossNiche: z.boolean().optional(),
    windowDays: z.number().int().min(7).max(120).optional(),
    sourceLimit: z.number().int().min(1).max(100).optional(),
    targetLimitPerSource: z.number().int().min(1).max(20).optional(),
    minSourceScore: z.number().int().min(0).max(100).optional(),
    maxTargetScore: z.number().int().min(0).max(100).optional(),
    maxRecommendationApplies: z.number().int().min(1).max(200).optional(),
    maxTargetUpdates: z.number().int().min(1).max(2000).optional(),
    allowedModules: z.array(moduleEnum).min(1).max(STRATEGY_PROPAGATION_MODULES.length).optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const userId = getRequestUser(request).id.trim();
    if (!userId) {
        return NextResponse.json(
            { error: 'Missing authenticated user identity' },
            { status: 401 },
        );
    }

    const rate = sweepLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many strategy propagation sweep requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown = {};
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
    const shouldParseBody = (Number.isFinite(contentLength) && contentLength > 0)
        || contentType.includes('application/json');

    if (shouldParseBody) {
        const rawText = await request.text();
        if (rawText.trim().length > 0) {
            try {
                body = JSON.parse(rawText) as unknown;
            } catch {
                return NextResponse.json(
                    { error: 'Invalid JSON in request body' },
                    { status: 400, headers: rate.headers },
                );
            }
        }
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const summary = await runStrategyPropagationSweep({
            ...(parsed.data as Partial<StrategyPropagationSweepConfig>),
            force: parsed.data.force,
            notify: parsed.data.notify,
            appliedBy: userId,
        });

        return NextResponse.json(
            {
                success: true,
                summary,
                runAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to run strategy propagation sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run strategy propagation sweep' },
            { status: 500, headers: rate.headers },
        );
    }
}
