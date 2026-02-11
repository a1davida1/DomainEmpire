/**
 * Domain Renewal Tracking
 *
 * Monitors domain expiration dates and sends warnings.
 * Pulls expiry data from GoDaddy API and RDAP as fallback.
 */

import { db } from '@/lib/db';
import { domains } from '@/lib/db/schema';
import { eq, and, lte, isNotNull } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';

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
export async function syncRenewalDates(): Promise<number> {
    const allDomains = await db.select({
        id: domains.id, domain: domains.domain, renewalDate: domains.renewalDate,
    }).from(domains);

    let updated = 0;

    for (const d of allDomains) {
        const gdExpiry = await getGoDaddyExpiry(d.domain);
        const expiryStr = gdExpiry?.expires || await getRdapExpiry(d.domain);

        if (expiryStr) {
            const renewalDate = new Date(expiryStr);
            if (!isNaN(renewalDate.getTime())) {
                await db.update(domains).set({ renewalDate }).where(eq(domains.id, d.id));
                updated++;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
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
            renewalPrice: d.renewalPrice,
        }))
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

/**
 * Check for expiring domains and create notifications.
 */
export async function checkRenewals(): Promise<void> {
    const expiring = await getExpiringDomains(30);

    for (const d of expiring) {
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
    }
}
