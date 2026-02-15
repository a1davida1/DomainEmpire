import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { runRevenueDataContractSweep } from '@/lib/data/contracts-monitor';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const revenueContractSweepLimiter = createRateLimiter('data_contract_revenue_sweep', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const sweepRequestSchema = z.object({
    domainIds: z.array(z.string().uuid()).max(500).optional(),
    windowDays: z.number().int().min(7).max(180).optional(),
    maxDomains: z.number().int().min(1).max(10000).optional(),
    rowTolerance: z.number().min(0).max(1000).optional(),
    toleranceFloor: z.number().min(0).max(1_000_000).optional(),
    tolerancePct: z.number().min(0).max(1).optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = revenueContractSweepLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many revenue contract sweep requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON in request body' },
            { status: 400, headers: rate.headers },
        );
    }

    const parsed = sweepRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const summary = await runRevenueDataContractSweep(parsed.data);
        return NextResponse.json({
            success: true,
            summary,
            triggeredAt: new Date().toISOString(),
        }, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to run revenue contract sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run revenue contract sweep' },
            { status: 500, headers: rate.headers },
        );
    }
}
