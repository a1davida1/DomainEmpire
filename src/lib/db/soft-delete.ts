/**
 * Soft delete utilities.
 *
 * Instead of permanently removing rows, soft delete sets a `deletedAt` timestamp.
 * Rows with a non-null `deletedAt` are considered deleted and should be excluded
 * from user-facing queries via the `notDeleted()` helper.
 */

import { isNull, eq, and, type SQL, type Column } from 'drizzle-orm';
import { db, domains, articles } from '@/lib/db';

/**
 * Returns a SQL condition that excludes soft-deleted rows.
 * Usage: `.where(and(eq(domains.id, id), notDeleted(domains)))`
 */
export function notDeleted(table: { deletedAt: Column }): SQL {
    return isNull(table.deletedAt);
}

/**
 * Soft-delete a domain and cascade to its articles.
 * Sets `deletedAt` on the domain and all its articles.
 */
export async function softDeleteDomain(domainId: string): Promise<{ domain: string | null }> {
    const now = new Date();

    return await db.transaction(async (tx) => {
        const [deleted] = await tx
            .update(domains)
            .set({ deletedAt: now })
            .where(eq(domains.id, domainId))
            .returning({ domain: domains.domain });

        if (!deleted) return { domain: null };

        // Cascade soft delete to all articles under this domain
        await tx
            .update(articles)
            .set({ deletedAt: now })
            .where(eq(articles.domainId, domainId));

        return { domain: deleted.domain };
    });
}

/**
 * Soft-delete a single article.
 */
export async function softDeleteArticle(articleId: string): Promise<boolean> {
    const result = await db
        .update(articles)
        .set({ deletedAt: new Date() })
        .where(eq(articles.id, articleId))
        .returning({ id: articles.id });

    return result.length > 0;
}

/**
 * Restore a soft-deleted domain and its articles.
 */
export async function restoreDomain(domainId: string): Promise<{ domain: string | null }> {
    return await db.transaction(async (tx) => {
        // Find the domain and its deletedAt timestamp first
        const domainRecord = await tx.select({ deletedAt: domains.deletedAt, domain: domains.domain })
            .from(domains).where(eq(domains.id, domainId)).limit(1);

        if (!domainRecord.length || !domainRecord[0].deletedAt) return { domain: null };
        const originalDeletedAt = domainRecord[0].deletedAt;

        const [restored] = await tx
            .update(domains)
            .set({ deletedAt: null })
            .where(eq(domains.id, domainId))
            .returning({ domain: domains.domain });

        if (!restored) return { domain: null };

        // Only restore articles that were deleted at the same time as the domain
        // to prevent restoring articles that were manually deleted earlier.
        await tx
            .update(articles)
            .set({ deletedAt: null })
            .where(and(
                eq(articles.domainId, domainId),
                eq(articles.deletedAt, originalDeletedAt)
            ));

        return { domain: restored.domain };
    });
}

/**
 * Restore a soft-deleted article.
 */
export async function restoreArticle(articleId: string): Promise<boolean> {
    const result = await db
        .update(articles)
        .set({ deletedAt: null })
        .where(eq(articles.id, articleId))
        .returning({ id: articles.id });

    return result.length > 0;
}
