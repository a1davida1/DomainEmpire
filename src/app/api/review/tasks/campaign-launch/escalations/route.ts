import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { runCampaignLaunchReviewEscalationSweep } from '@/lib/review/campaign-launch-sla';

const sweepSchema = z.object({
    dryRun: z.boolean().optional(),
    force: z.boolean().optional(),
    notify: z.boolean().optional(),
    limit: z.number().int().min(10).max(2000).optional(),
    maxAlertsPerSweep: z.number().int().min(1).max(500).optional(),
    alertCooldownHours: z.number().int().min(1).max(24 * 30).optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
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

        if (parsed.data.force && user.role !== 'admin') {
            return NextResponse.json(
                { error: 'Only admins can force campaign launch escalation sweeps' },
                { status: 403 },
            );
        }

        const summary = await runCampaignLaunchReviewEscalationSweep({
            dryRun: parsed.data.dryRun ?? false,
            force: parsed.data.force ?? false,
            notify: parsed.data.notify ?? true,
            limit: parsed.data.limit,
            maxAlertsPerSweep: parsed.data.maxAlertsPerSweep,
            alertCooldownHours: parsed.data.alertCooldownHours,
        });

        return NextResponse.json({
            success: true,
            ...summary,
        });
    } catch (error) {
        console.error('Failed to run campaign launch review escalation sweep:', error);
        return NextResponse.json(
            { error: 'Failed to run campaign launch review escalation sweep' },
            { status: 500 },
        );
    }
}
