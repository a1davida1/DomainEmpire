/**
 * Domain Purchase Automation
 *
 * Automates domain registration via GoDaddy's purchase API.
 * Includes safety checks: price limits, confirmation step, DB transaction.
 */

import { db } from '@/lib/db';
import { domains, domainResearch, expenses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';

const GD_API = 'https://api.godaddy.com/v1';

interface PurchaseResult {
    success: boolean;
    domain: string;
    price?: number;
    currency?: string;
    orderId?: string;
    error?: string;
}

export interface AvailabilityResult {
    available: boolean;
    domain: string;
    price: number;
    currency: string;
}

interface GoDaddyContact {
    nameFirst: string;
    nameLast: string;
    email: string;
    phone: string;
    addressMailing: {
        address1: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
    };
}

function getConfig() {
    const apiKey = process.env.GODADDY_API_KEY;
    const apiSecret = process.env.GODADDY_API_SECRET;
    if (!apiKey || !apiSecret) return null;
    return { apiKey, apiSecret };
}

function getRegistrantContact(): GoDaddyContact | null {
    const contact = process.env.GODADDY_REGISTRANT_CONTACT;
    if (!contact) return null;
    try {
        const parsed = JSON.parse(contact) as GoDaddyContact;
        if (!parsed.nameFirst || !parsed.nameLast || !parsed.email || !parsed.phone || !parsed.addressMailing) {
            console.error('GODADDY_REGISTRANT_CONTACT missing required fields');
            return null;
        }
        return parsed;
    } catch {
        console.error('GODADDY_REGISTRANT_CONTACT is not valid JSON');
        return null;
    }
}

/**
 * Check domain availability and price WITHOUT purchasing.
 * Use this as a confirmation step before calling purchaseDomain.
 */
export async function checkAvailability(domain: string): Promise<AvailabilityResult> {
    const config = getConfig();
    if (!config) throw new Error('GoDaddy API credentials not configured');

    const availResp = await fetch(
        `${GD_API}/domains/available?domain=${encodeURIComponent(domain)}&checkType=FULL`,
        {
            headers: { 'Authorization': `sso-key ${config.apiKey}:${config.apiSecret}` },
            signal: AbortSignal.timeout(15000),
        }
    );

    if (!availResp.ok) {
        throw new Error(`Availability check failed: HTTP ${availResp.status}`);
    }

    const avail = await availResp.json() as { available: boolean; price?: number; currency?: string };

    return {
        available: avail.available,
        domain,
        price: avail.price ? avail.price / 1_000_000 : 0,
        currency: avail.currency || 'USD',
    };
}

/**
 * Purchase a domain via GoDaddy API.
 * Requires confirmed=true to prevent accidental purchases.
 * Wraps all DB operations in a transaction for atomicity.
 */
export async function purchaseDomain(
    domain: string,
    options: { maxPrice?: number; period?: number; privacy?: boolean; confirmed?: boolean } = {}
): Promise<PurchaseResult> {
    const config = getConfig();
    if (!config) {
        return { success: false, domain, error: 'GoDaddy API credentials not configured' };
    }

    const contact = getRegistrantContact();
    if (!contact) {
        return { success: false, domain, error: 'GODADDY_REGISTRANT_CONTACT not configured or invalid' };
    }

    const { maxPrice = 50, period = 1, privacy = true, confirmed = false } = options;

    if (!confirmed) {
        return { success: false, domain, error: 'Purchase not confirmed. Set confirmed=true after reviewing the price.' };
    }

    try {
        const avail = await checkAvailability(domain);

        if (!avail.available) {
            return { success: false, domain, error: 'Domain is not available for registration' };
        }

        if (avail.price > maxPrice) {
            return {
                success: false, domain, price: avail.price, currency: avail.currency,
                error: `Price $${avail.price.toFixed(2)} exceeds max limit of $${maxPrice}`,
            };
        }

        const purchaseResp = await fetch(`${GD_API}/domains/purchase`, {
            method: 'POST',
            headers: {
                'Authorization': `sso-key ${config.apiKey}:${config.apiSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                domain, period, privacy, renewAuto: true,
                consent: {
                    agreementKeys: ['DNRA'],
                    agreedBy: contact.email,
                    agreedAt: new Date().toISOString(),
                },
                contactAdmin: contact, contactBilling: contact,
                contactRegistrant: contact, contactTech: contact,
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!purchaseResp.ok) {
            const errorText = await purchaseResp.text();
            return { success: false, domain, error: `Purchase failed: ${errorText}` };
        }

        const result = await purchaseResp.json() as { orderId?: number };

        // All DB writes in a single transaction for atomicity
        const tld = domain.split('.').slice(1).join('.');
        const newDomainId = await db.transaction(async (tx) => {
            const [newDomain] = await tx.insert(domains).values({
                domain, tld, registrar: 'godaddy',
                purchaseDate: new Date(), purchasePrice: avail.price,
                status: 'parked', bucket: 'build',
            }).returning({ id: domains.id });

            if (!newDomain?.id) {
                throw new Error('Failed to create domain record during purchase');
            }

            await tx.update(domainResearch)
                .set({ decision: 'bought', domainId: newDomain.id })
                .where(eq(domainResearch.domain, domain));

            await advanceDomainLifecycleForAcquisition({
                domainId: newDomain.id,
                targetState: 'acquired',
                actorId: null,
                actorRole: 'admin',
                reason: 'Auto-transition after successful domain purchase',
                metadata: {
                    source: 'purchase_domain',
                    registrar: 'godaddy',
                    purchasedDomain: domain,
                },
            }, tx);

            await tx.insert(expenses).values({
                domainId: newDomain.id,
                category: 'domain_registration',
                description: `Registration: ${domain} (${period}yr)`,
                amount: avail.price.toString(),
                expenseDate: new Date(),
            });

            return newDomain.id;
        });

        return {
            success: true, domain, price: avail.price,
            currency: avail.currency,
            orderId: String(result.orderId || newDomainId),
        };
    } catch (error) {
        return { success: false, domain, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
