import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { runMediaReviewEscalationSweep } from '@/lib/growth/media-review-escalation';

const sweepSchema = z.object({
    userId: z.string().uuid().optional(),
    dryRun: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const parsed = sweepSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        if (payload.userId && payload.userId !== user.id && user.role !== 'admin') {
            return NextResponse.json(
                { error: 'Only admins can run escalation sweeps for another user' },
                { status: 403 },
            );
        }

        const targetUserId = payload.userId ?? user.id;
        const result = await runMediaReviewEscalationSweep({
            userId: targetUserId,
            actorId: user.id,
            dryRun: payload.dryRun ?? false,
            limit: payload.limit ?? 100,
        });

        return NextResponse.json({
            success: true,
            userId: targetUserId,
            ...result,
        });
    } catch (error) {
        console.error('Failed to run media review escalation sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run media review escalation sweep' },
            { status: 500 },
        );
    }
}
