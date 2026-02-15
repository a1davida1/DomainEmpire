import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
    countActiveGrowthChannelCredentials,
    revokeGrowthCredentialsForReconnect,
} from '@/lib/growth/channel-credentials';
import { createNotification } from '@/lib/notifications';

const bodySchema = z.object({
    channel: z.enum(['pinterest', 'youtube_shorts']).optional(),
    dryRun: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const channel = parsed.data.channel;
    const dryRun = parsed.data.dryRun ?? false;

    const activeCount = await countActiveGrowthChannelCredentials(user.id, channel);
    if (dryRun) {
        return NextResponse.json({
            success: true,
            dryRun: true,
            activeCount,
            channel: channel ?? 'all',
        });
    }

    if (activeCount === 0) {
        return NextResponse.json(
            { error: 'No active credentials to revoke', channel: channel ?? 'all' },
            { status: 404 },
        );
    }

    const revokedCount = await revokeGrowthCredentialsForReconnect(user.id, channel);

    await createNotification({
        type: 'info',
        severity: 'warning',
        title: 'Growth channel reconnect required',
        message: channel
            ? `Revoked ${revokedCount} active ${channel} credential(s). Reconnect before next publish.`
            : `Revoked ${revokedCount} active growth credential(s). Reconnect channels before next publish.`,
        userId: user.id,
        actionUrl: '/dashboard/monitoring',
    });

    return NextResponse.json({
        success: true,
        dryRun: false,
        revokedCount,
        channel: channel ?? 'all',
    });
}

