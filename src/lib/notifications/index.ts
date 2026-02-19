/**
 * Notification System
 *
 * Manages in-app notifications and optional email alerts.
 */

import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { sendNotificationEmail } from './email';

type NotificationType = 'renewal_warning' | 'job_failed' | 'deploy_failed' | 'traffic_drop' |
    'revenue_milestone' | 'content_stale' | 'domain_expiring' | 'backlink_lost' | 'search_quality' |
    'ssl_expiring' | 'dns_failure' | 'info';
type Severity = 'info' | 'warning' | 'critical';

interface CreateNotificationOptions {
    type: NotificationType;
    severity?: Severity;
    title: string;
    message: string;
    userId?: string;
    domainId?: string;
    actionUrl?: string;
    sendEmail?: boolean;
    metadata?: Record<string, unknown>;
}

export function sanitizeNotificationActionUrl(actionUrl?: string): string | null {
    if (typeof actionUrl !== 'string') return null;
    const trimmed = actionUrl.trim();
    if (!trimmed.startsWith('/')) return null;
    if (trimmed.startsWith('//')) return null;
    return trimmed;
}

/**
 * Create a new notification.
 */
export async function createNotification(options: CreateNotificationOptions): Promise<string> {
    const {
        type, title, message,
        severity = 'info',
        userId,
        domainId,
        actionUrl,
        sendEmail = false,
        metadata = {},
    } = options;
    const safeActionUrl = sanitizeNotificationActionUrl(actionUrl);

    // Deduplicate: skip if same type+title+domainId exists unread in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneDayAgoIso = oneDayAgo.toISOString();
    const conditions = [
        eq(notifications.type, type),
        eq(notifications.title, title),
        eq(notifications.isRead, false),
        sql`${notifications.createdAt} > ${oneDayAgoIso}::timestamp`,
    ];
    if (domainId) conditions.push(eq(notifications.domainId, domainId));

    const existing = await db.select({ id: notifications.id })
        .from(notifications)
        .where(and(...conditions))
        .limit(1);

    if (existing.length > 0) {
        return existing[0].id;
    }

    const [notification] = await db.insert(notifications).values({
        type,
        severity,
        title,
        message,
        domainId: domainId ?? null,
        actionUrl: safeActionUrl,
        emailSent: false,
        metadata: {
            ...metadata,
            ...(userId ? { userId } : {}),
        },
    }).returning({ id: notifications.id });

    if (sendEmail && (severity === 'critical' || severity === 'warning')) {
        try {
            await sendNotificationEmail({ type, severity, title, message });
            await db.update(notifications)
                .set({ emailSent: true })
                .where(eq(notifications.id, notification.id));
        } catch (error) {
            console.error('Failed to send notification email:', error);
        }
    }

    return notification.id;
}

/**
 * Get unread notifications.
 */
export async function getUnreadNotifications(limit = 50) {
    return db.select()
        .from(notifications)
        .where(eq(notifications.isRead, false))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
}

/**
 * Get all notifications with pagination.
 */
export async function getNotifications(page = 1, perPage = 25) {
    const offset = (page - 1) * perPage;

    const [items, countResult] = await Promise.all([
        db.select()
            .from(notifications)
            .orderBy(desc(notifications.createdAt))
            .limit(perPage)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(notifications),
    ]);

    return {
        notifications: items,
        total: countResult[0]?.count || 0,
        page,
        perPage,
    };
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
    const result = await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, notificationId))
        .returning({ id: notifications.id });
    return result.length > 0;
}

/**
 * Mark all notifications as read.
 */
export async function markAllAsRead(): Promise<number> {
    const result = await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.isRead, false))
        .returning({ id: notifications.id });
    return result.length;
}

/**
 * Get unread count.
 */
export async function getUnreadCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(eq(notifications.isRead, false));
    return result[0]?.count || 0;
}

/**
 * Delete old read notifications.
 */
export async function purgeOldNotifications(olderThanDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const cutoffIso = cutoff.toISOString();

    const deleted = await db.delete(notifications)
        .where(
            and(
                eq(notifications.isRead, true),
                sql`${notifications.createdAt} < ${cutoffIso}::timestamp`
            )
        )
        .returning({ id: notifications.id });

    return deleted.length;
}
