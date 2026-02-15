import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { storeGrowthMedia, deleteGrowthMedia } from '@/lib/growth/media-storage';

export const runtime = 'nodejs';

const assetTypeEnum = z.enum(['image', 'video', 'script', 'voiceover']);
const provenanceSourceEnum = z.enum(['manual_upload', 'external_url', 'ai_generated', 'worker', 'imported', 'migrated']);
const moderationStatusEnum = z.enum(['pending', 'approved', 'rejected', 'needs_changes']);

const MAX_UPLOAD_BYTES = Number.isFinite(Number.parseInt(process.env.GROWTH_MEDIA_UPLOAD_MAX_BYTES || '', 10))
    ? Math.max(1_000_000, Number.parseInt(process.env.GROWTH_MEDIA_UPLOAD_MAX_BYTES || '', 10))
    : 100 * 1024 * 1024;

function parseBoolean(value: FormDataEntryValue | null): boolean {
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseTags(value: FormDataEntryValue | null): string[] {
    if (typeof value !== 'string') return [];
    return [...new Set(value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0))]
        .slice(0, 50);
}

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

function inferAssetType(contentType: string, filename: string): z.infer<typeof assetTypeEnum> {
    const normalizedType = contentType.split(';')[0].toLowerCase();
    if (normalizedType.startsWith('image/')) return 'image';
    if (normalizedType.startsWith('video/')) return 'video';
    if (normalizedType.startsWith('audio/')) return 'voiceover';

    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.mp3') || lowerName.endsWith('.wav') || lowerName.endsWith('.m4a')) {
        return 'voiceover';
    }
    if (lowerName.endsWith('.md') || lowerName.endsWith('.txt') || lowerName.endsWith('.json')) {
        return 'script';
    }
    return 'image';
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
        const formData = await request.formData();
        const fileEntry = formData.get('file');
        if (!(fileEntry instanceof File)) {
            return NextResponse.json({ error: 'file is required' }, { status: 400 });
        }

        if (fileEntry.size <= 0) {
            return NextResponse.json({ error: 'Uploaded file is empty' }, { status: 400 });
        }

        if (fileEntry.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: `File too large. Max ${MAX_UPLOAD_BYTES} bytes` },
                { status: 400 },
            );
        }

        const typeRaw = formData.get('type');
        const folderRaw = formData.get('folder');
        const tagsRaw = formData.get('tags');
        const provenanceSourceRaw = formData.get('provenanceSource');
        const provenanceRefRaw = formData.get('provenanceRef');
        const moderationStatusRaw = formData.get('moderationStatus');
        const moderationReasonRaw = formData.get('moderationReason');
        const dedupeByUrlRaw = formData.get('dedupeByUrl');
        const metadataRaw = formData.get('metadata');

        const parsedType = typeof typeRaw === 'string'
            ? assetTypeEnum.safeParse(typeRaw.trim())
            : null;
        if (parsedType && !parsedType.success) {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }
        const type = parsedType?.success
            ? parsedType.data
            : inferAssetType(fileEntry.type || 'application/octet-stream', fileEntry.name || 'upload');

        const folder = typeof folderRaw === 'string' && folderRaw.trim().length > 0
            ? folderRaw.trim().slice(0, 100)
            : 'inbox';

        const parsedProvenanceSource = typeof provenanceSourceRaw === 'string'
            ? provenanceSourceEnum.safeParse(provenanceSourceRaw.trim())
            : null;
        if (parsedProvenanceSource && !parsedProvenanceSource.success) {
            return NextResponse.json({ error: 'Invalid provenanceSource' }, { status: 400 });
        }
        const provenanceSource = parsedProvenanceSource?.success
            ? parsedProvenanceSource.data
            : 'manual_upload';
        const provenanceRef = typeof provenanceRefRaw === 'string' && provenanceRefRaw.trim().length > 0
            ? provenanceRefRaw.trim().slice(0, 500)
            : null;

        const parsedModerationStatus = typeof moderationStatusRaw === 'string'
            ? moderationStatusEnum.safeParse(moderationStatusRaw.trim())
            : null;
        if (parsedModerationStatus && !parsedModerationStatus.success) {
            return NextResponse.json({ error: 'Invalid moderationStatus' }, { status: 400 });
        }
        const moderationStatus = parsedModerationStatus?.success ? parsedModerationStatus.data : 'pending';
        const moderationReason = typeof moderationReasonRaw === 'string' && moderationReasonRaw.trim().length > 0
            ? moderationReasonRaw.trim().slice(0, 500)
            : null;

        let metadataInput: Record<string, unknown> = {};
        if (typeof metadataRaw === 'string' && metadataRaw.trim().length > 0) {
            try {
                metadataInput = asMetadata(JSON.parse(metadataRaw));
            } catch {
                return NextResponse.json({ error: 'metadata must be valid JSON object' }, { status: 400 });
            }
        }

        const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
        const contentType = fileEntry.type || 'application/octet-stream';
        const storageResult = await storeGrowthMedia({
            userId: user.id,
            assetType: type,
            filename: fileEntry.name || 'upload',
            contentType,
            buffer: fileBuffer,
        });

        const dedupeByUrl = parseBoolean(dedupeByUrlRaw) || dedupeByUrlRaw === null;
        const nowIso = new Date().toISOString();

        const insertValues = {
            userId: user.id,
            type,
            url: storageResult.url,
            folder,
            tags: parseTags(tagsRaw),
            metadata: {
                ...metadataInput,
                createdBy: user.id,
                createdAt: nowIso,
                provenanceSource,
                provenanceRef,
                moderationStatus,
                moderationReason,
                moderationUpdatedAt: nowIso,
                moderationUpdatedBy: user.id,
                originalFilename: fileEntry.name || null,
                originalContentType: contentType,
                byteSize: fileEntry.size,
                storageProvider: storageResult.provider,
                storageKey: storageResult.key,
                storageEtag: storageResult.etag ?? null,
                uploadedVia: 'file_upload',
            },
        };

        // Note: storeGrowthMedia generates unique object keys per upload (UUID-based),
        // so URLs are not content-hash-based and deduplication relies on the DB unique constraint.
        if (dedupeByUrl) {
            const result = await db.transaction(async (tx) => {
                const [inserted] = await tx.insert(mediaAssets)
                    .values(insertValues)
                    .onConflictDoNothing({
                        target: mediaAssets.url,
                        where: sql`${mediaAssets.deletedAt} IS NULL`,
                    })
                    .returning();

                if (inserted) {
                    return { created: true, asset: inserted };
                }

                // URL unique constraint is global (not per-user), so lookup must match
                const [existing] = await tx.select()
                    .from(mediaAssets)
                    .where(and(eq(mediaAssets.url, storageResult.url), isNull(mediaAssets.deletedAt)))
                    .limit(1);

                if (!existing) {
                    // Conflict on a URL we cannot find — clean up orphaned upload
                    try {
                        await deleteGrowthMedia({ key: storageResult.key, provider: storageResult.provider });
                    } catch (cleanupErr) {
                        console.error('[media-upload] Failed to clean up orphaned file:', storageResult.key, cleanupErr);
                    }
                    return { created: false, asset: null as typeof existing | null, orphaned: true };
                }

                return { created: false, asset: existing };
            });

            if (result.asset === null) {
                return NextResponse.json(
                    { error: 'Media asset conflict: URL already exists but could not be retrieved' },
                    { status: 409 },
                );
            }

            return NextResponse.json({
                created: result.created,
                asset: result.asset,
                storage: storageResult,
            }, { status: result.created ? 201 : 200 });
        }

        const [asset] = await db.insert(mediaAssets)
            .values(insertValues)
            .returning();

        return NextResponse.json({
            created: true,
            asset,
            storage: storageResult,
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to upload media asset:', error);
        return NextResponse.json(
            { error: 'Failed to upload media asset' },
            { status: 500 },
        );
    }
}
