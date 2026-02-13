/**
 * Subscriber management library.
 * Handles email capture, subscriber queries, CSV export, and unsubscribe.
 */

import { db, subscribers, monetizationProfiles, domains } from '@/lib/db';
import { eq, and, count, sql, desc, gte } from 'drizzle-orm';
import type { NewSubscriber } from '@/lib/db/schema';

interface CaptureInput {
    domainId: string;
    email: string;
    name?: string;
    phone?: string;
    source?: 'lead_form' | 'newsletter' | 'wizard' | 'popup' | 'scroll_cta';
    formData?: Record<string, string>;
    articleId?: string;
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
}

/**
 * Capture a subscriber with upsert on (domainId, email).
 * On conflict, updates formData and updatedAt but preserves original createdAt.
 */
export async function captureSubscriber(input: CaptureInput) {
    const email = input.email.toLowerCase().trim();

    // Look up estimated value from monetization profile
    let estimatedValue: number | null = null;
    try {
        const profile = await db
            .select({ leadGenValue: monetizationProfiles.leadGenValue })
            .from(monetizationProfiles)
            .where(eq(monetizationProfiles.domainId, input.domainId))
            .limit(1);
        if (profile[0]?.leadGenValue) {
            estimatedValue = profile[0].leadGenValue;
        }
    } catch {
        // Non-critical, continue without value
    }

    const record: NewSubscriber = {
        domainId: input.domainId,
        email,
        name: input.name || null,
        phone: input.phone || null,
        source: input.source || 'lead_form',
        formData: input.formData || {},
        articleId: input.articleId || null,
        estimatedValue,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        referrer: input.referrer || null,
    };

    // Upsert: insert or update on conflict
    const result = await db
        .insert(subscribers)
        .values(record)
        .onConflictDoUpdate({
            target: [subscribers.domainId, subscribers.email],
            set: {
                name: sql`COALESCE(${record.name}, ${subscribers.name})`,
                phone: sql`COALESCE(${record.phone}, ${subscribers.phone})`,
                formData: sql`${subscribers.formData} || ${JSON.stringify(record.formData)}::jsonb`,
                updatedAt: new Date(),
            },
        })
        .returning();

    return result[0];
}

interface SubscriberFilters {
    domainId?: string;
    source?: string;
    status?: string;
    page?: number;
    limit?: number;
}

/**
 * Get paginated subscriber list with optional filters.
 */
export async function getSubscribers(filters: SubscriberFilters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters.domainId) conditions.push(eq(subscribers.domainId, filters.domainId));
    if (filters.source) conditions.push(eq(subscribers.source, filters.source as typeof subscribers.source.enumValues[number]));
    if (filters.status) conditions.push(eq(subscribers.status, filters.status as typeof subscribers.status.enumValues[number]));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
        db
            .select({
                id: subscribers.id,
                email: subscribers.email,
                name: subscribers.name,
                phone: subscribers.phone,
                source: subscribers.source,
                status: subscribers.status,
                estimatedValue: subscribers.estimatedValue,
                domainId: subscribers.domainId,
                domain: domains.domain,
                createdAt: subscribers.createdAt,
            })
            .from(subscribers)
            .leftJoin(domains, eq(subscribers.domainId, domains.id))
            .where(where)
            .orderBy(desc(subscribers.createdAt))
            .limit(limit)
            .offset(offset),
        db.select({ count: count() }).from(subscribers).where(where),
    ]);

    return {
        subscribers: rows,
        total: totalResult[0]?.count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((totalResult[0]?.count ?? 0) / limit),
    };
}

/**
 * Aggregate subscriber stats for a domain or portfolio.
 */
export async function getSubscriberStats(domainId?: string) {
    const where = domainId ? eq(subscribers.domainId, domainId) : undefined;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalResult, last30dResult, bySourceResult, valueResult] = await Promise.all([
        db.select({ count: count() }).from(subscribers).where(where),
        db.select({ count: count() }).from(subscribers).where(
            where
                ? and(where, gte(subscribers.createdAt, thirtyDaysAgo))
                : gte(subscribers.createdAt, thirtyDaysAgo)
        ),
        db.select({
            source: subscribers.source,
            count: count(),
        }).from(subscribers).where(where).groupBy(subscribers.source),
        db.select({
            total: sql<number>`COALESCE(SUM(${subscribers.estimatedValue}), 0)::real`,
        }).from(subscribers).where(where),
    ]);

    return {
        total: totalResult[0]?.count ?? 0,
        last30d: last30dResult[0]?.count ?? 0,
        bySource: Object.fromEntries(bySourceResult.map(r => [r.source, r.count])),
        estimatedTotalValue: valueResult[0]?.total ?? 0,
    };
}

/**
 * Export subscribers as CSV string.
 */
export async function exportSubscribers(domainId?: string): Promise<string> {
    const where = domainId ? eq(subscribers.domainId, domainId) : undefined;

    const rows = await db
        .select({
            email: subscribers.email,
            name: subscribers.name,
            phone: subscribers.phone,
            source: subscribers.source,
            status: subscribers.status,
            estimatedValue: subscribers.estimatedValue,
            domain: domains.domain,
            createdAt: subscribers.createdAt,
        })
        .from(subscribers)
        .leftJoin(domains, eq(subscribers.domainId, domains.id))
        .where(where)
        .orderBy(desc(subscribers.createdAt));

    const header = 'email,name,phone,source,status,estimated_value,domain,created_at';
    const csvRows = rows.map(r => {
        const fields = [
            r.email,
            r.name || '',
            r.phone || '',
            r.source,
            r.status,
            r.estimatedValue?.toString() || '',
            r.domain || '',
            r.createdAt?.toISOString() || '',
        ];
        return fields.map(f => `"${f.replace(/"/g, '""')}"`).join(',');
    });

    return [header, ...csvRows].join('\n');
}

/**
 * Unsubscribe an email from a domain.
 */
export async function unsubscribe(email: string, domainId: string) {
    return db
        .update(subscribers)
        .set({ status: 'unsubscribed', updatedAt: new Date() })
        .where(and(
            eq(subscribers.email, email.toLowerCase().trim()),
            eq(subscribers.domainId, domainId),
        ))
        .returning();
}
