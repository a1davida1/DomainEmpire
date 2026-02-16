import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { runDomainLifecycleMonitorSweep } from '@/lib/domain/lifecycle-monitor';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const lifecycleSweepLimiter = createRateLimiter('domain_lifecycle_monitor_sweep', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const sourceThresholdSchema = z.object({
    acquisition_pipeline: z.number().min(0).max(1).optional(),
    deploy_processor: z.number().min(0).max(1).optional(),
    growth_campaign_launch: z.number().min(0).max(1).optional(),
    finance_ledger: z.number().min(0).max(1).optional(),
}).optional();

const requestSchema = z.object({
    force: z.boolean().optional().default(true),
    notify: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
    windowHours: z.number().int().min(1).max(24 * 180).optional(),
    maxEvents: z.number().int().min(1).max(50_000).optional(),
    maxAlertsPerSweep: z.number().int().min(1).max(1000).optional(),
    oscillationWindowHours: z.number().int().min(1).max(24 * 30).optional(),
    sloMinSamples: z.number().int().min(1).max(1000).optional(),
    sourceThresholds: sourceThresholdSchema,
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

    const rate = lifecycleSweepLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many lifecycle monitor sweep requests. Please retry shortly.' },
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
        const summary = await runDomainLifecycleMonitorSweep(parsed.data);
        return NextResponse.json(
            {
                success: true,
                summary,
                runAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to run domain lifecycle monitor sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run domain lifecycle monitor sweep' },
            { status: 500, headers: rate.headers },
        );
    }
}
