import { and, asc, eq, isNotNull, lte } from 'drizzle-orm';
import { db, mediaAssets } from '@/lib/db';
import { deleteGrowthMedia, type GrowthMediaStorageProvider } from '@/lib/growth/media-storage';

const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 30;
const DEFAULT_PURGE_BATCH_SIZE = 100;
const DEFAULT_PURGE_RETRY_HOURS = 6;

function parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

function toStorageProvider(value: unknown): GrowthMediaStorageProvider | undefined {
    if (value === 'local' || value === 's3_compatible') {
        return value;
    }
    return undefined;
}

function toStorageKey(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function resolveGrowthMediaSoftDeleteRetentionDays(): number {
    return parsePositiveInt(process.env.GROWTH_MEDIA_SOFT_DELETE_RETENTION_DAYS, DEFAULT_SOFT_DELETE_RETENTION_DAYS);
}

export function resolveGrowthMediaPurgeBatchSize(): number {
    return parsePositiveInt(process.env.GROWTH_MEDIA_PURGE_BATCH_SIZE, DEFAULT_PURGE_BATCH_SIZE);
}

export function resolveGrowthMediaPurgeRetryHours(): number {
    return parsePositiveInt(process.env.GROWTH_MEDIA_PURGE_RETRY_HOURS, DEFAULT_PURGE_RETRY_HOURS);
}

export function computeGrowthMediaPurgeAfter(
    deletedAt = new Date(),
    retentionDays = resolveGrowthMediaSoftDeleteRetentionDays(),
): Date {
    return new Date(deletedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export interface GrowthMediaStoragePurgeSummary {
    scanned: number;
    purged: number;
    noStorageKey: number;
    failures: number;
}

export async function purgeDeletedGrowthMediaStorage(now = new Date()): Promise<GrowthMediaStoragePurgeSummary> {
    const limit = resolveGrowthMediaPurgeBatchSize();
    const retryHours = resolveGrowthMediaPurgeRetryHours();
    const rows = await db.select({
        id: mediaAssets.id,
        metadata: mediaAssets.metadata,
    })
        .from(mediaAssets)
        .where(and(
            isNotNull(mediaAssets.deletedAt),
            isNotNull(mediaAssets.purgeAfterAt),
            lte(mediaAssets.purgeAfterAt, now),
        ))
        .orderBy(asc(mediaAssets.purgeAfterAt), asc(mediaAssets.createdAt))
        .limit(limit);

    if (rows.length === 0) {
        return { scanned: 0, purged: 0, noStorageKey: 0, failures: 0 };
    }

    const nowIso = now.toISOString();
    const retryAt = new Date(now.getTime() + retryHours * 60 * 60 * 1000);
    let purged = 0;
    let noStorageKey = 0;
    let failures = 0;

    for (const row of rows) {
        const metadata = asMetadata(row.metadata);
        const nextMetadata: Record<string, unknown> = {
            ...metadata,
            storagePurgeLastAttemptAt: nowIso,
            storagePurgeAttempts: Math.max(0, Number(metadata.storagePurgeAttempts) || 0) + 1,
        };

        const storageKey = toStorageKey(metadata.storageKey);
        const storageProvider = toStorageProvider(metadata.storageProvider);

        if (!storageKey) {
            nextMetadata.storagePurgeStatus = 'no_storage_key';
            nextMetadata.storagePurgedAt = nowIso;
            nextMetadata.storagePurgeError = null;

            await db.update(mediaAssets)
                .set({
                    metadata: nextMetadata,
                    purgeAfterAt: null,
                })
                .where(eq(mediaAssets.id, row.id));
            noStorageKey += 1;
            continue;
        }

        try {
            await deleteGrowthMedia({
                key: storageKey,
                provider: storageProvider,
            });

            nextMetadata.storagePurgeStatus = 'purged';
            nextMetadata.storagePurgedAt = nowIso;
            nextMetadata.storagePurgeError = null;

            await db.update(mediaAssets)
                .set({
                    metadata: nextMetadata,
                    purgeAfterAt: null,
                })
                .where(eq(mediaAssets.id, row.id));
            purged += 1;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown purge error';
            nextMetadata.storagePurgeStatus = 'failed';
            nextMetadata.storagePurgeError = errorMessage;

            await db.update(mediaAssets)
                .set({
                    metadata: nextMetadata,
                    purgeAfterAt: retryAt,
                })
                .where(eq(mediaAssets.id, row.id));
            failures += 1;
            console.error(`[GrowthMediaPurge] Failed for asset ${row.id}: ${errorMessage}`);
        }
    }

    return {
        scanned: rows.length,
        purged,
        noStorageKey,
        failures,
    };
}
