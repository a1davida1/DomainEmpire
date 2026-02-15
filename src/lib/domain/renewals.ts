/**
 * Domain Renewal Tracking
 *
 * Monitors domain expiration dates and sends warnings.
 * Pulls expiry data from GoDaddy API and RDAP as fallback.
 */

import { db } from '@/lib/db';
import { domainRegistrarProfiles, domains } from '@/lib/db/schema';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';
import {
    computeRegistrarExpirationRisk,
    isRegistrarTransferStatus,
} from '@/lib/domain/registrar-operations';

interface DomainExpiry {
    domain: string;
    domainId: string;
    renewalDate: Date;
    daysUntilExpiry: number;
    renewalPrice: number | null;
}

/**
 * Fetch domain expiry info from GoDaddy API.
 */
async function getGoDaddyExpiry(domain: string): Promise<{ expires: string } | null> {
    const apiKey = process.env.GODADDY_API_KEY;
    const apiSecret = process.env.GODADDY_API_SECRET;
    if (!apiKey || !apiSecret) return null;

    try {
        const response = await fetch(`https://api.godaddy.com/v1/domains/${domain}`, {
            headers: { 'Authorization': `sso-key ${apiKey}:${apiSecret}` },
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;

        const data = await response.json() as { expires: string };
        return { expires: data.expires };
    } catch {
        return null;
    }
}

/**
 * Fetch expiry from RDAP as fallback.
 */
async function getRdapExpiry(domain: string): Promise<string | null> {
    try {
        const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return null;

        const data = await response.json() as {
            events?: Array<{ eventAction: string; eventDate: string }>;
        };
        return data.events?.find(e => e.eventAction === 'expiration')?.eventDate || null;
    } catch {
        return null;
    }
}

/**
 * Update renewal dates for all domains from registrar APIs.
 */
export async function syncRenewalDates(domainId?: string): Promise<number> {
    const query = db.select({
        id: domains.id, domain: domains.domain, renewalDate: domains.renewalDate,
    }).from(domains);

    if (domainId) {
        query.where(eq(domains.id, domainId));
    }

    const allDomains = await query;
    let updated = 0;

    // Process in batches of 5 for concurrency without overwhelming APIs
    const BATCH_SIZE = 5;
    for (let i = 0; i < allDomains.length; i += BATCH_SIZE) {
        const batch = allDomains.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(async (d) => {
                const gdExpiry = await getGoDaddyExpiry(d.domain);
                const expiryStr = gdExpiry?.expires || await getRdapExpiry(d.domain);

                if (expiryStr) {
                    const renewalDate = new Date(expiryStr);
                    if (!Number.isNaN(renewalDate.getTime())) {
                        await db.update(domains).set({ renewalDate }).where(eq(domains.id, d.id));
                        return true;
                    }
                }
                return false;
            })
        );
        updated += results.filter(r => r.status === 'fulfilled' && r.value).length;
    }

    return updated;
}

/**
 * Get domains expiring within N days.
 */
export async function getExpiringDomains(withinDays = 30): Promise<DomainExpiry[]> {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);

    const expiring = await db.select({
        id: domains.id, domain: domains.domain,
        renewalDate: domains.renewalDate, renewalPrice: domains.renewalPrice,
    })
        .from(domains)
        .where(and(isNotNull(domains.renewalDate), lte(domains.renewalDate, cutoff)));

    const now = Date.now();
    return expiring
        .filter(d => d.renewalDate !== null)
        .map(d => ({
            domain: d.domain,
            domainId: d.id,
            renewalDate: d.renewalDate!,
            daysUntilExpiry: Math.ceil((d.renewalDate!.getTime() - now) / (24 * 60 * 60 * 1000)),
            renewalPrice: d.renewalPrice ? Number(d.renewalPrice) : null,
        }))
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

/**
 * Check for expiring domains and create notifications.
 */
export async function checkRenewals(): Promise<void> {
    const expiring = await getExpiringDomains(30);
    const now = new Date();

    for (const d of expiring) {
        const [profile] = await db.select({
            id: domainRegistrarProfiles.id,
            autoRenewEnabled: domainRegistrarProfiles.autoRenewEnabled,
            transferStatus: domainRegistrarProfiles.transferStatus,
            expirationRisk: domainRegistrarProfiles.expirationRisk,
            expirationRiskScore: domainRegistrarProfiles.expirationRiskScore,
            metadata: domainRegistrarProfiles.metadata,
        })
            .from(domainRegistrarProfiles)
            .where(eq(domainRegistrarProfiles.domainId, d.domainId))
            .limit(1);

        const transferStatus = isRegistrarTransferStatus(profile?.transferStatus)
            ? profile.transferStatus
            : 'none';
        const risk = computeRegistrarExpirationRisk({
            renewalDate: d.renewalDate,
            autoRenewEnabled: profile?.autoRenewEnabled !== false,
            transferStatus,
            now,
        });

        await db.insert(domainRegistrarProfiles).values({
            domainId: d.domainId,
            autoRenewEnabled: profile?.autoRenewEnabled !== false,
            transferStatus,
            expirationRisk: risk.risk,
            expirationRiskScore: risk.riskScore,
            expirationRiskUpdatedAt: now,
            lastSyncedAt: now,
            metadata: profile?.metadata ?? {},
            createdAt: now,
            updatedAt: now,
        }).onConflictDoUpdate({
            target: domainRegistrarProfiles.domainId,
            set: {
                autoRenewEnabled: profile?.autoRenewEnabled !== false,
                transferStatus,
                expirationRisk: risk.risk,
                expirationRiskScore: risk.riskScore,
                expirationRiskUpdatedAt: now,
                lastSyncedAt: now,
                updatedAt: now,
            },
        });

        const priceNote = d.renewalPrice ? ` Renewal: $${d.renewalPrice}` : '';
        const dateStr = d.renewalDate.toISOString().split('T')[0];

        if (d.daysUntilExpiry <= 0) {
            await createNotification({
                type: 'domain_expiring', severity: 'critical',
                title: `${d.domain} has EXPIRED`,
                message: `Domain expired on ${dateStr}. Renew immediately to avoid losing it.`,
                domainId: d.domainId, actionUrl: `/dashboard/domains/${d.domainId}`,
                sendEmail: true,
            });
        } else if (d.daysUntilExpiry <= 7) {
            await createNotification({
                type: 'renewal_warning', severity: 'critical',
                title: `${d.domain} expires in ${d.daysUntilExpiry} days`,
                message: `Domain expires on ${dateStr}.${priceNote}`,
                domainId: d.domainId, actionUrl: `/dashboard/domains/${d.domainId}`,
                sendEmail: true,
            });
        } else if (d.daysUntilExpiry <= 30) {
            await createNotification({
                type: 'renewal_warning', severity: 'warning',
                title: `${d.domain} expires in ${d.daysUntilExpiry} days`,
                message: `Domain expires on ${dateStr}.${priceNote}`,
                domainId: d.domainId, actionUrl: `/dashboard/domains/${d.domainId}`,
            });
        }

        const riskEscalated = risk.risk === 'high' || risk.risk === 'critical' || risk.risk === 'expired';
        if (
            riskEscalated
            && (profile?.expirationRisk !== risk.risk || Number(profile?.expirationRiskScore ?? 0) !== risk.riskScore)
        ) {
            await createNotification({
                type: 'renewal_warning',
                severity: risk.risk === 'high' ? 'warning' : 'critical',
                title: `${d.domain} renewal risk escalated (${risk.risk})`,
                message: `${risk.recommendation} Renewal date: ${dateStr}.${priceNote}`,
                domainId: d.domainId,
                actionUrl: `/dashboard/domains/${d.domainId}`,
            });
        }
    }
}
