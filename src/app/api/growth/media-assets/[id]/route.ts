import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

const moderationStatusEnum = z.enum(['pending', 'approved', 'rejected', 'needs_changes']);
const provenanceSourceEnum = z.enum(['manual_upload', 'external_url', 'ai_generated', 'worker', 'imported', 'migrated']);

const updateAssetSchema = z.object({
    url: z.string().url().max(4096).optional(),
    folder: z.string().trim().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    moderationStatus: moderationStatusEnum.optional(),
    moderationReason: z.string().trim().max(500).nullable().optional(),
    provenanceSource: provenanceSourceEnum.optional(),
    provenanceRef: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
    if (
        typeof value.url === 'undefined'
        && typeof value.folder === 'undefined'
        && typeof value.tags === 'undefined'
        && typeof value.metadata === 'undefined'
        && typeof value.moderationStatus === 'undefined'
        && typeof value.moderationReason === 'undefined'
        && typeof value.provenanceSource === 'undefined'
        && typeof value.provenanceRef === 'undefined'
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide at least one field to update',
        });
    }
});

async function requireGrowthFeature(request: NextRequest): Promise<{ error: Response } | { user: { id: string; role: string; name: string } }> {
    const authError = await requireAuth(request);
    if (authError) return { error: authError };
    const user = getRequestUser(request);
    if (!user) {
        return { error: NextResponse.json({ error: 'Unable to identify user' }, { status: 401 }) };
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return { error: NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 }) };
    }
    return { user };
}

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const result = await requireGrowthFeature(request);
    if ('error' in result) return result.error;
    const { user } = result;

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
        const [currentAsset] = await db.select({
            id: mediaAssets.id,
            metadata: mediaAssets.metadata,
        }).from(mediaAssets)
            .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, user.id)))
            .limit(1);

        if (!currentAsset) {
            return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
        }

        const nowIso = new Date().toISOString();
        const nextMetadata = asMetadata(currentAsset.metadata);
        if (typeof payload.metadata === 'object' && payload.metadata !== null) {
            Object.assign(nextMetadata, payload.metadata);
        }
        if (typeof payload.moderationStatus === 'string') {
            nextMetadata.moderationStatus = payload.moderationStatus;
            nextMetadata.moderationReason = payload.moderationReason ?? null;
            nextMetadata.moderationUpdatedAt = nowIso;
            nextMetadata.moderationUpdatedBy = user.id;
        } else if (typeof payload.moderationReason !== 'undefined') {
            nextMetadata.moderationReason = payload.moderationReason ?? null;
            nextMetadata.moderationUpdatedAt = nowIso;
            nextMetadata.moderationUpdatedBy = user.id;
        }
        if (typeof payload.provenanceSource === 'string') {
            nextMetadata.provenanceSource = payload.provenanceSource;
        }
        if (typeof payload.provenanceRef !== 'undefined') {
            nextMetadata.provenanceRef = payload.provenanceRef ?? null;
        }

        const [asset] = await db.update(mediaAssets).set({
            ...(typeof payload.url === 'string' ? { url: payload.url } : {}),
            ...(typeof payload.folder === 'string' ? { folder: payload.folder } : {}),
            ...(Array.isArray(payload.tags) ? { tags: payload.tags } : {}),
            metadata: nextMetadata,
        }).where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, user.id))).returning();

        if (!asset) return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });

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
    const result = await requireGrowthFeature(request);
    if ('error' in result) return result.error;
    const { user } = result;

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }

    try {
        const [asset] = await db.delete(mediaAssets)
            .where(and(eq(mediaAssets.id, id), eq(mediaAssets.userId, user.id)))
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
