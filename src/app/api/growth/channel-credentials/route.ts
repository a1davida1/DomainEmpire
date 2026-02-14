import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
    getGrowthChannelCredentialStatus,
    listGrowthChannelCredentialStatus,
    refreshGrowthChannelCredential,
    revokeGrowthChannelCredential,
    upsertGrowthChannelCredential,
} from '@/lib/growth/channel-credentials';

const channelEnum = z.enum(['pinterest', 'youtube_shorts']);

const upsertBodySchema = z.object({
    channel: channelEnum,
    accessToken: z.string().min(1).max(10_000),
    refreshToken: z.string().min(1).max(10_000).optional().nullable(),
    accessTokenExpiresAt: z.string().datetime().optional().nullable(),
    refreshTokenExpiresAt: z.string().datetime().optional().nullable(),
    scopes: z.array(z.string().min(1).max(200)).max(200).optional(),
    providerAccountId: z.string().min(1).max(500).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const refreshBodySchema = z.object({
    channel: channelEnum,
    force: z.boolean().optional(),
});

function parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const url = new URL(request.url);
    const channelRaw = url.searchParams.get('channel');

    if (channelRaw) {
        const channelParsed = channelEnum.safeParse(channelRaw);
        if (!channelParsed.success) {
            return NextResponse.json({ error: 'Invalid channel filter' }, { status: 400 });
        }

        const credential = await getGrowthChannelCredentialStatus(user.id, channelParsed.data);
        return NextResponse.json({
            credentials: credential ? [credential] : [],
        });
    }

    const credentials = await listGrowthChannelCredentialStatus(user.id);
    return NextResponse.json({ credentials });
}

export async function PUT(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = upsertBodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const payload = parsed.data;
        const credential = await upsertGrowthChannelCredential({
            userId: user.id,
            channel: payload.channel,
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken ?? null,
            accessTokenExpiresAt: parseDate(payload.accessTokenExpiresAt),
            refreshTokenExpiresAt: parseDate(payload.refreshTokenExpiresAt),
            scopes: payload.scopes ?? [],
            providerAccountId: payload.providerAccountId ?? null,
            metadata: payload.metadata ?? {},
        });

        return NextResponse.json({
            success: true,
            credential,
        });
    } catch (error) {
        console.error('Failed to upsert growth channel credential:', error);
        return NextResponse.json(
            { error: 'Failed to save credential' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const url = new URL(request.url);
    const channelRaw = url.searchParams.get('channel');
    const channelParsed = channelEnum.safeParse(channelRaw);
    if (!channelParsed.success) {
        return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }

    try {
        const deleted = await revokeGrowthChannelCredential(user.id, channelParsed.data);
        if (!deleted) {
            return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to revoke growth channel credential:', error);
        return NextResponse.json(
            { error: 'Failed to revoke credential' },
            { status: 500 },
        );
    }
}

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

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = refreshBodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const result = await refreshGrowthChannelCredential(
            user.id,
            parsed.data.channel,
            { force: parsed.data.force ?? true },
        );
        if (!result) {
            return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            refreshed: result.refreshed,
            credential: result.credential,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Failed to refresh credential', message },
            { status: 400 },
        );
    }
}
