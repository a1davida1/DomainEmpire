import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { runCapitalAllocationSweep } from '@/lib/growth/capital-allocation-monitor';

const sweepLimiter = createRateLimiter('growth_capital_allocation_sweep', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const statusEnum = z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']);
const policySchema = z.object({
    applyHardLimitedPauses: z.boolean().optional(),
    applyPauseWhenNetLossBelow: z.number().optional(),
    applyScaleWhenLeadsAtLeast: z.number().int().min(0).optional(),
    applyScaleMaxCacLtvRatio: z.number().min(0).max(10).optional(),
}).optional();

const requestSchema = z.object({
    force: z.boolean().optional().default(true),
    notify: z.boolean().optional().default(true),
    autoTunePolicy: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    statuses: z.array(statusEnum).min(1).max(5).optional(),
    windowDays: z.number().int().min(7).max(120).optional(),
    dailyLossLimit: z.number().min(0).max(1_000_000).optional(),
    weeklyLossLimit: z.number().min(0).max(1_000_000).optional(),
    recommendationLimit: z.number().int().min(1).max(1000).optional(),
    maxAutoApplyUpdates: z.number().int().min(1).max(500).optional(),
    policy: policySchema,
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
            { error: 'Too many capital allocation sweep requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown = {};
    try {
        const parsedBody = await request.json();
        body = parsedBody ?? {};
    } catch {
        body = {};
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const summary = await runCapitalAllocationSweep({
            ...parsed.data,
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
        console.error('Failed to run capital allocation sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run capital allocation sweep' },
            { status: 500, headers: rate.headers },
        );
    }
}
