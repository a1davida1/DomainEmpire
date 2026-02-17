/**
 * Subscriber management library.
 * Handles email capture, subscriber queries, CSV export, and unsubscribe.
 */

import { db, subscribers, monetizationProfiles, domains } from '@/lib/db';
import { eq, and, count, sql, desc, gte, lte, or, ne } from 'drizzle-orm';
import type { NewSubscriber } from '@/lib/db/schema';
import {
    hashEmail,
    hashPhone,
    hashIpAddress,
    hashUserAgent,
    fingerprintUserAgent,
    fingerprintReferrer,
} from '@/lib/subscribers/privacy';

const DEFAULT_SUBSCRIBER_RETENTION_DAYS = 180;
const SUBSCRIBER_RETENTION_POLICY_VERSION = 'subscriber-v1';

function computeRetentionExpiresAt(retentionDays: number): Date {
    return new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
}

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
    sourceCampaignId?: string;
    sourceClickId?: string;
    originalUtm?: Record<string, string>;
}

/**
 * Capture a subscriber with upsert on (domainId, email).
 * On conflict, updates formData and updatedAt but preserves original createdAt.
 */
export async function captureSubscriber(input: CaptureInput) {
    const email = input.email.toLowerCase().trim();
    const emailHash = hashEmail(email);
    const phoneHash = hashPhone(input.phone);
    const ipHash = hashIpAddress(input.ipAddress);
    const userAgentHash = hashUserAgent(input.userAgent);
    const userAgentFingerprint = fingerprintUserAgent(input.userAgent);
    const referrerFingerprint = fingerprintReferrer(input.referrer);
    const retentionExpiresAt = computeRetentionExpiresAt(DEFAULT_SUBSCRIBER_RETENTION_DAYS);

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
        emailHash,
        name: input.name || null,
        // Plaintext phone is intentionally not persisted.
        phone: null,
        phoneHash,
        source: input.source || 'lead_form',
        sourceCampaignId: input.sourceCampaignId || null,
        sourceClickId: input.sourceClickId || null,
        originalUtm: input.originalUtm || {},
        formData: input.formData || {},
        articleId: input.articleId || null,
        estimatedValue,
        // Pseudonymized metadata only (no raw IP/user-agent storage).
        ipHash,
        userAgentHash,
        userAgentFingerprint,
        referrer: null,
        referrerFingerprint,
        retentionExpiresAt,
        retentionPolicyVersion: SUBSCRIBER_RETENTION_POLICY_VERSION,
    };

    // Upsert: insert or update on conflict
    const result = await db
        .insert(subscribers)
        .values(record)
        .onConflictDoUpdate({
            target: [subscribers.domainId, subscribers.email],
            set: {
                emailHash: record.emailHash,
                name: sql`COALESCE(${record.name}, ${subscribers.name})`,
                phone: null,
                phoneHash: sql`COALESCE(${record.phoneHash}, ${subscribers.phoneHash})`,
                formData: sql`${subscribers.formData} || ${JSON.stringify(record.formData)}::jsonb`,
                sourceCampaignId: sql`COALESCE(${record.sourceCampaignId}, ${subscribers.sourceCampaignId})`,
                sourceClickId: sql`COALESCE(${record.sourceClickId}, ${subscribers.sourceClickId})`,
                originalUtm: sql`${subscribers.originalUtm} || ${JSON.stringify(record.originalUtm)}::jsonb`,
                ipHash: sql`COALESCE(${record.ipHash}, ${subscribers.ipHash})`,
                userAgentHash: sql`COALESCE(${record.userAgentHash}, ${subscribers.userAgentHash})`,
                userAgentFingerprint: sql`COALESCE(${record.userAgentFingerprint}, ${subscribers.userAgentFingerprint})`,
                referrer: null,
                referrerFingerprint: sql`COALESCE(${record.referrerFingerprint}, ${subscribers.referrerFingerprint})`,
                retentionExpiresAt: record.retentionExpiresAt,
                retentionPolicyVersion: SUBSCRIBER_RETENTION_POLICY_VERSION,
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
                phoneHash: subscribers.phoneHash,
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
            emailHash: subscribers.emailHash,
            name: subscribers.name,
            phoneHash: subscribers.phoneHash,
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

    const header = 'email,email_hash,name,phone_hash,source,status,estimated_value,domain,created_at';
    const csvRows = rows.map(r => {
        const fields = [
            r.email,
            r.emailHash,
            r.name || '',
            r.phoneHash || '',
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

type ArchiveStaleSubscriberOptions = {
    retentionDays?: number;
};

/**
 * Archive + anonymize stale subscribers beyond retention threshold.
 */
export async function archiveStaleSubscribers(options: ArchiveStaleSubscriberOptions = {}) {
    const retentionDays = Math.max(1, Math.floor(options.retentionDays ?? DEFAULT_SUBSCRIBER_RETENTION_DAYS));
    const now = new Date();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const archived = await db
        .update(subscribers)
        .set({
            status: 'archived',
            email: sql`'archived+' || ${subscribers.id}::text || '@redacted.local'`,
            name: null,
            phone: null,
            phoneHash: null,
            ipHash: null,
            userAgentHash: null,
            userAgentFingerprint: null,
            referrer: null,
            referrerFingerprint: null,
            retentionExpiresAt: now,
            updatedAt: new Date(),
        })
        .where(and(
            ne(subscribers.status, 'archived'),
            or(
                and(
                    sql`${subscribers.retentionExpiresAt} IS NOT NULL`,
                    lte(subscribers.retentionExpiresAt, now),
                ),
                and(
                    sql`${subscribers.retentionExpiresAt} IS NULL`,
                    lte(subscribers.createdAt, cutoff),
                ),
            ),
            or(
                sql`${subscribers.convertedAt} IS NULL`,
                lte(subscribers.convertedAt, cutoff),
            ),
        ))
        .returning({ id: subscribers.id });

    return {
        retentionDays,
        archivedCount: archived.length,
    };
}
