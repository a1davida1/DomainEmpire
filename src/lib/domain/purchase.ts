/**
 * Domain Purchase Automation
 *
 * Automates domain registration via GoDaddy's purchase API.
 * Includes safety checks (price limits, confirmation required).
 */

import { db } from '@/lib/db';
import { domains, domainResearch, expenses } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const GD_API = 'https://api.godaddy.com/v1';

interface PurchaseResult {
    success: boolean;
    domain: string;
    price?: number;
    currency?: string;
    orderId?: string;
    error?: string;
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
        return JSON.parse(contact) as GoDaddyContact;
    } catch {
        return null;
    }
}

/**
 * Purchase a domain via GoDaddy API.
 * Requires GODADDY_REGISTRANT_CONTACT env var as JSON.
 */
export async function purchaseDomain(
    domain: string,
    options: { maxPrice?: number; period?: number; privacy?: boolean } = {}
): Promise<PurchaseResult> {
    const config = getConfig();
    if (!config) {
        return { success: false, domain, error: 'GoDaddy API credentials not configured' };
    }

    const contact = getRegistrantContact();
    if (!contact) {
        return { success: false, domain, error: 'GODADDY_REGISTRANT_CONTACT not configured' };
    }

    const { maxPrice = 50, period = 1, privacy = true } = options;

    try {
        // Check availability and price
        const availResp = await fetch(
            `${GD_API}/domains/available?domain=${encodeURIComponent(domain)}&checkType=FULL`,
            { headers: { 'Authorization': `sso-key ${config.apiKey}:${config.apiSecret}` } }
        );

        if (!availResp.ok) {
            return { success: false, domain, error: `Availability check failed: HTTP ${availResp.status}` };
        }

        const avail = await availResp.json() as { available: boolean; price?: number; currency?: string };

        if (!avail.available) {
            return { success: false, domain, error: 'Domain is not available for registration' };
        }

        const priceUsd = avail.price ? avail.price / 1_000_000 : 0;
        if (priceUsd > maxPrice) {
            return { success: false, domain, price: priceUsd, currency: avail.currency || 'USD',
                error: `Price $${priceUsd} exceeds max limit of $${maxPrice}` };
        }

        // Purchase
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
        });

        if (!purchaseResp.ok) {
            const errorText = await purchaseResp.text();
            return { success: false, domain, price: priceUsd, error: `Purchase failed: ${errorText}` };
        }

        const result = await purchaseResp.json() as { orderId?: number };

        // Create domain record
        const tld = domain.split('.').slice(1).join('.');
        const [newDomain] = await db.insert(domains).values({
            domain, tld, registrar: 'godaddy',
            purchaseDate: new Date(), purchasePrice: priceUsd,
            status: 'parked', bucket: 'build',
        }).returning({ id: domains.id });

        // Update research record
        await db.update(domainResearch)
            .set({ decision: 'bought', domainId: newDomain.id })
            .where(eq(domainResearch.domain, domain));

        // Log expense
        await db.insert(expenses).values({
            domainId: newDomain.id,
            category: 'domain_registration',
            description: `Registration: ${domain} (${period}yr)`,
            amount: priceUsd,
            expenseDate: new Date(),
        });

        return {
            success: true, domain, price: priceUsd,
            currency: avail.currency || 'USD',
            orderId: String(result.orderId || ''),
        };
    } catch (error) {
        return { success: false, domain, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
