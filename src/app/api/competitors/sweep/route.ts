import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { runCompetitorRefreshSweep } from '@/lib/competitors/refresh-sweep';

const competitorSweepLimiter = createRateLimiter('competitor_refresh_sweep', {
    maxRequests: 20,
    windowMs: 60 * 1000,
});

const bodySchema = z.object({
    force: z.boolean().optional().default(true),
    enabled: z.boolean().optional(),
    staleHours: z.number().int().min(1).max(24 * 30).optional(),
    limit: z.number().int().min(1).max(500).optional(),
    emitGapAlerts: z.boolean().optional(),
    gapMinVolume: z.number().int().min(0).max(1_000_000).optional(),
    gapTopN: z.number().int().min(1).max(25).optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = competitorSweepLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many competitor sweep requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown = {};
    try {
        body = (await request.json()) ?? {};
    } catch {
        body = {};
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const summary = await runCompetitorRefreshSweep(parsed.data);
        return NextResponse.json(
            {
                success: true,
                summary,
                runAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to run competitor refresh sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run competitor refresh sweep' },
            { status: 500, headers: rate.headers },
        );
    }
}
