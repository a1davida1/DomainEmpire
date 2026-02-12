/**
 * Dataset provenance system.
 * CRUD operations for external datasets with SHA-256 hashing,
 * version tracking, and article linkage.
 */

import { db, datasets, articleDatasets } from '@/lib/db';
import { eq, lte, and } from 'drizzle-orm';
import { createHash } from 'node:crypto';

/**
 * Recursively sort object keys at every nesting level for deterministic stringification.
 */
function deepSortObject(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deepSortObject);
    if (value instanceof Date) return value.toISOString();

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
        sorted[key] = deepSortObject((value as Record<string, unknown>)[key]);
    }
    return sorted;
}

/**
 * Compute SHA-256 hash of dataset data for change detection.
 * Uses recursive key sorting so nested objects hash identically
 * regardless of key insertion order.
 */
function hashData(data: unknown): string {
    const stableString = JSON.stringify(deepSortObject(data));
    return createHash('sha256').update(stableString).digest('hex');
}

/**
 * Create a new dataset
 */
export async function createDataset(input: {
    name: string;
    sourceUrl?: string;
    sourceTitle?: string;
    publisher?: string;
    effectiveDate?: Date;
    expiresAt?: Date;
    freshnessClass?: 'realtime' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
    data?: Record<string, unknown>;
    domainId?: string;
}): Promise<typeof datasets.$inferSelect> {
    const storedData = input.data ?? null;
    const dataHash = (storedData === null) ? null : hashData(storedData);

    const [created] = await db.insert(datasets).values({
        name: input.name,
        sourceUrl: input.sourceUrl,
        sourceTitle: input.sourceTitle,
        publisher: input.publisher,
        effectiveDate: input.effectiveDate,
        expiresAt: input.expiresAt,
        freshnessClass: input.freshnessClass || 'monthly',
        data: storedData || {},
        dataHash: dataHash || null,
        version: 1,
        domainId: input.domainId,
        retrievedAt: new Date(),
    }).returning();

    return created;
}

/**
 * Refresh a dataset with new data.
 * Only updates if the data has actually changed (hash comparison).
 * Increments version on change.
 */
export async function refreshDataset(
    id: string,
    newData: Record<string, unknown>,
): Promise<{ changed: boolean; version: number }> {
    const [existing] = await db.select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

    if (!existing) throw new Error(`Dataset not found: ${id}`);

    const newHash = hashData(newData);

    if (newHash === existing.dataHash) {
        // Data unchanged — just update retrievedAt
        await db.update(datasets).set({
            retrievedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(datasets.id, id));

        return { changed: false, version: existing.version || 1 };
    }

    // Data changed — update everything and bump version
    const newVersion = (existing.version || 1) + 1;
    await db.update(datasets).set({
        data: newData,
        dataHash: newHash,
        version: newVersion,
        retrievedAt: new Date(),
        updatedAt: new Date(),
    }).where(eq(datasets.id, id));

    return { changed: true, version: newVersion };
}

/**
 * Get all datasets past their expiration date
 */
export async function getStaleDatasets() {
    return db.select()
        .from(datasets)
        .where(lte(datasets.expiresAt, new Date()));
}

/**
 * Link a dataset to an article (idempotent)
 */
export async function linkDatasetToArticle(
    articleId: string,
    datasetId: string,
    usage?: string,
): Promise<void> {
    await db.insert(articleDatasets).values({
        articleId,
        datasetId,
        usage: usage || null,
    }).onConflictDoNothing();
}

/**
 * Get all datasets linked to an article
 */
export async function getArticleDatasets(articleId: string) {
    return db.select({
        dataset: datasets,
        usage: articleDatasets.usage,
    })
        .from(articleDatasets)
        .innerJoin(datasets, eq(datasets.id, articleDatasets.datasetId))
        .where(eq(articleDatasets.articleId, articleId));
}

/**
 * Get a single dataset by ID
 */
export async function getDatasetById(id: string) {
    const [dataset] = await db.select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);
    return dataset || null;
}

/**
 * List datasets with optional filters
 */
export async function listDatasets(filters?: {
    domainId?: string;
    staleOnly?: boolean;
}) {
    const conditions = [];
    if (filters?.domainId) {
        conditions.push(eq(datasets.domainId, filters.domainId));
    }
    if (filters?.staleOnly) {
        conditions.push(lte(datasets.expiresAt, new Date()));
    }

    const where = conditions.length > 0
        ? conditions.length === 1 ? conditions[0] : and(...conditions)
        : undefined;

    return db.select().from(datasets).where(where).orderBy(datasets.name);
}

/**
 * Delete a dataset (cascades to articleDatasets via FK)
 */
export async function deleteDataset(id: string): Promise<void> {
    await db.delete(datasets).where(eq(datasets.id, id));
}
