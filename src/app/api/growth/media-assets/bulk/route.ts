import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { computeGrowthMediaPurgeAfter } from '@/lib/growth/media-retention';

const operationEnum = z.enum(['move_folder', 'set_moderation', 'add_tags', 'remove_tags', 'delete']);
const moderationStatusEnum = z.enum(['pending', 'approved', 'rejected', 'needs_changes']);

const bulkSchema = z.object({
    operation: operationEnum,
    assetIds: z.array(z.string().uuid()).min(1).max(200),
    folder: z.string().trim().min(1).max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
    moderationStatus: moderationStatusEnum.optional(),
    moderationReason: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
    if (value.operation === 'move_folder' && !value.folder) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['folder'],
            message: 'folder is required for move_folder operation',
        });
    }
    if ((value.operation === 'add_tags' || value.operation === 'remove_tags') && (!value.tags || value.tags.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tags'],
            message: 'tags are required for tag operations',
        });
    }
    if (value.operation === 'set_moderation' && !value.moderationStatus) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['moderationStatus'],
            message: 'moderationStatus is required for set_moderation operation',
        });
    }
});

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

function sanitizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0))];
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
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
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = bulkSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const assetIds = [...new Set(payload.assetIds)];
        const rows = await db.select({
            id: mediaAssets.id,
            tags: mediaAssets.tags,
            metadata: mediaAssets.metadata,
        }).from(mediaAssets)
            .where(and(
                eq(mediaAssets.userId, user.id),
                inArray(mediaAssets.id, assetIds),
                isNull(mediaAssets.deletedAt),
            ));

        if (rows.length === 0) {
            return NextResponse.json({ error: 'No matching assets found' }, { status: 404 });
        }

        const matchedIds = rows.map((row) => row.id);
        const unmatchedIds = assetIds.filter((id) => !matchedIds.includes(id));
        let affectedCount = 0;

        await db.transaction(async (tx) => {
            if (payload.operation === 'delete') {
                const deletedAt = new Date();
                const purgeAfterAt = computeGrowthMediaPurgeAfter(deletedAt);
                const deletedRows = await tx.update(mediaAssets)
                    .set({
                        deletedAt,
                        purgeAfterAt,
                    })
                    .where(and(
                        eq(mediaAssets.userId, user.id),
                        inArray(mediaAssets.id, matchedIds),
                        isNull(mediaAssets.deletedAt),
                    ))
                    .returning({ id: mediaAssets.id });
                affectedCount = deletedRows.length;
                return;
            }

            if (payload.operation === 'move_folder') {
                const updatedRows = await tx.update(mediaAssets)
                    .set({ folder: payload.folder! })
                    .where(and(
                        eq(mediaAssets.userId, user.id),
                        inArray(mediaAssets.id, matchedIds),
                        isNull(mediaAssets.deletedAt),
                    ))
                    .returning({ id: mediaAssets.id });
                affectedCount = updatedRows.length;
                return;
            }

            const inputTags = sanitizeTags(payload.tags);
            const removeTagSet = new Set(inputTags);
            const nowIso = new Date().toISOString();
            for (const row of rows) {
                let nextTags = sanitizeTags(row.tags);
                let nextMetadata = asMetadata(row.metadata);
                let shouldUpdate = false;

                if (payload.operation === 'add_tags') {
                    const merged = [...new Set([...nextTags, ...inputTags])];
                    if (merged.length !== nextTags.length || merged.some((tag, i) => tag !== nextTags[i])) {
                        nextTags = merged;
                        shouldUpdate = true;
                    }
                }

                if (payload.operation === 'remove_tags') {
                    const filtered = nextTags.filter((tag) => !removeTagSet.has(tag));
                    if (filtered.length !== nextTags.length) {
                        nextTags = filtered;
                        shouldUpdate = true;
                    }
                }

                if (payload.operation === 'set_moderation') {
                    nextMetadata = {
                        ...nextMetadata,
                        moderationStatus: payload.moderationStatus!,
                        moderationReason: payload.moderationReason ?? null,
                        moderationUpdatedAt: nowIso,
                        moderationUpdatedBy: user.id,
                    };
                    const existingHistory = Array.isArray(nextMetadata.moderationHistory)
                        ? nextMetadata.moderationHistory
                        : [];
                    nextMetadata.moderationHistory = [
                        ...existingHistory,
                        {
                            status: payload.moderationStatus!,
                            reason: payload.moderationReason ?? null,
                            updatedAt: nowIso,
                            updatedBy: user.id,
                        },
                    ].slice(-50);
                    shouldUpdate = true;
                }

                if (!shouldUpdate) continue;
                await tx.update(mediaAssets)
                    .set({
                        tags: nextTags,
                        metadata: nextMetadata,
                    })
                    .where(and(
                        eq(mediaAssets.id, row.id),
                        eq(mediaAssets.userId, user.id),
                        isNull(mediaAssets.deletedAt),
                    ));
                affectedCount += 1;
            }
        });

        return NextResponse.json({
            success: true,
            operation: payload.operation,
            requestedCount: assetIds.length,
            matchedCount: matchedIds.length,
            affectedCount,
            unmatchedIds,
        });
    } catch (error) {
        console.error('Failed to apply bulk media asset action:', error);
        return NextResponse.json(
            { error: 'Failed to apply bulk media asset action' },
            { status: 500 },
        );
    }
}
