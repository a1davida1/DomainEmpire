/**
 * Dataset freshness monitoring.
 * Detects stale datasets and creates notifications.
 * Deduplicates so the same dataset doesn't generate repeat alerts.
 */

import { db, notifications, datasets } from '@/lib/db';
import { lte, eq, and, gte, like } from 'drizzle-orm';

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

    // Find existing unread stale-dataset notifications from the last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentNotifs = await db.select({ title: notifications.title })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'content_stale'),
            gte(notifications.createdAt, oneDayAgo),
        ));

    const recentTitles = new Set(recentNotifs.map(n => n.title));

    // Only create notifications for datasets not already alerted
    const newNotifications = stale
        .filter(d => !recentTitles.has(`Dataset expired: ${d.name}`))
        .map(d => ({
            domainId: d.domainId,
            type: 'content_stale' as const,
            severity: 'warning' as const,
            title: `Dataset expired: ${d.name}`,
            message: `The dataset "${d.name}" expired on ${d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : 'unknown date'}. Articles using this data may contain outdated information.`,
            actionUrl: `/dashboard/datasets?id=${d.id}`,
        }));

    if (newNotifications.length > 0) {
        await db.insert(notifications).values(newNotifications);
    }

    return newNotifications.length;
}
