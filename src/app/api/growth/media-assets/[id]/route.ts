import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

const updateAssetSchema = z.object({
    url: z.string().url().max(4096).optional(),
    folder: z.string().trim().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((value, ctx) => {
    if (
        typeof value.url === 'undefined'
        && typeof value.folder === 'undefined'
        && typeof value.tags === 'undefined'
        && typeof value.metadata === 'undefined'
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide at least one field to update',
        });
    }
});

async function requireGrowthFeature(request: NextRequest): Promise<Response | null> {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }
    return null;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const featureError = await requireGrowthFeature(request);
    if (featureError) return featureError;

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = updateAssetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const [asset] = await db.update(mediaAssets).set({
            ...(typeof payload.url === 'string' ? { url: payload.url } : {}),
            ...(typeof payload.folder === 'string' ? { folder: payload.folder } : {}),
            ...(Array.isArray(payload.tags) ? { tags: payload.tags } : {}),
            ...(typeof payload.metadata === 'object' ? { metadata: payload.metadata } : {}),
        }).where(eq(mediaAssets.id, id)).returning();

        if (!asset) {
            return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, asset });
    } catch (error) {
        console.error('Failed to update media asset:', error);
        return NextResponse.json(
            { error: 'Failed to update media asset' },
            { status: 500 },
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const featureError = await requireGrowthFeature(request);
    if (featureError) return featureError;

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }

    try {
        const [asset] = await db.delete(mediaAssets)
            .where(eq(mediaAssets.id, id))
            .returning({ id: mediaAssets.id });

        if (!asset) {
            return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, id: asset.id });
    } catch (error) {
        console.error('Failed to delete media asset:', error);
        return NextResponse.json(
            { error: 'Failed to delete media asset' },
            { status: 500 },
        );
    }
}
