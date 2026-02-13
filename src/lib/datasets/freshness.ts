/**
 * Dataset freshness monitoring.
 * Detects stale datasets and creates notifications.
 * Deduplicates so the same dataset doesn't generate repeat alerts.
 */

import { db, notifications, datasets } from '@/lib/db';
import { lte } from 'drizzle-orm';

/**
 * Check for expired datasets and create notification alerts.
 * Only creates a notification if one doesn't already exist for
 * that dataset within the last 24 hours.
 * Returns the count of new notifications created.
 */
export async function checkStaleDatasets(): Promise<number> {
    const stale = await db.select({
        id: datasets.id,
        name: datasets.name,
        expiresAt: datasets.expiresAt,
        domainId: datasets.domainId,
    })
        .from(datasets)
        .where(lte(datasets.expiresAt, new Date()));

    if (stale.length === 0) return 0;

    // Create notifications for datasets not already alerted
    const newNotifications = stale.map(d => ({
        domainId: d.domainId,
        type: 'content_stale' as const,
        severity: 'warning' as const,
        title: `Dataset expired: ${d.name}`,
        message: `The dataset "${d.name}" expired on ${d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : 'unknown date'}. Articles using this data may contain outdated information.`,
        actionUrl: `/dashboard/datasets?id=${d.id}`,
        metadata: { datasetId: d.id },
        fingerprint: `content_stale:${d.id}:${new Date().toISOString().split('T')[0]}`, // Daily fingerprint
    }));

    if (newNotifications.length > 0) {
        const result = await db.insert(notifications)
            .values(newNotifications as typeof notifications.$inferInsert[])
            .onConflictDoNothing()
            .returning({ id: notifications.id });
        return result.length;
    }

    return 0;
}
