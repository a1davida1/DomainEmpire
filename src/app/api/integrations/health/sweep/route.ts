import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { runIntegrationHealthSweep } from '@/lib/integrations/health-monitor';

const sweepLimiter = createRateLimiter('integration_health_sweep', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const bodySchema = z.object({
    force: z.boolean().optional().default(true),
    notify: z.boolean().optional().default(true),
    enabled: z.boolean().optional(),
    staleWarningHours: z.number().int().min(1).max(24 * 30).optional(),
    staleCriticalHours: z.number().int().min(1).max(24 * 90).optional(),
    neverSyncedGraceHours: z.number().int().min(1).max(24 * 30).optional(),
    maxConnections: z.number().int().min(1).max(10000).optional(),
    topIssueLimit: z.number().int().min(1).max(500).optional(),
    maxAlertsPerSweep: z.number().int().min(1).max(500).optional(),
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
            { error: 'Too many integration health sweep requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown;
    try {
        body = (await request.json()) ?? {};
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON in request body' },
            { status: 400, headers: rate.headers },
        );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const summary = await runIntegrationHealthSweep(parsed.data);
        return NextResponse.json(
            {
                success: true,
                summary,
                runAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to run integration health sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run integration health sweep' },
            { status: 500, headers: rate.headers },
        );
    }
}
