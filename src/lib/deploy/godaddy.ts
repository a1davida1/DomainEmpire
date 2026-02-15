/**
 * GoDaddy API Integration
 * 
 * Manages DNS records and nameservers via the GoDaddy REST API.
 * Used by the deployment processor to automate DNS configuration
 * after deploying sites to Cloudflare Pages.
 * 
 * API Reference: https://developer.godaddy.com/doc/endpoint/domains
 * 
 * Required env vars:
 * - GODADDY_API_KEY
 * - GODADDY_API_SECRET
 */

const GD_API = 'https://api.godaddy.com/v1';

interface GoDaddyConfig {
    apiKey: string;
    apiSecret: string;
}

interface GoDaddyErrorResponse {
    code: string;
    message: string;
    fields?: Array<{ path: string; code: string; message: string }>;
}

export type GoDaddyRegistrarSignals = {
    renewalDate: Date | null;
    autoRenewEnabled: boolean | null;
    lockStatus: 'locked' | 'unlocked' | null;
    dnssecStatus: 'enabled' | 'disabled' | null;
    transferStatus: 'none' | 'pending' | 'failed' | null;
    ownershipStatus: 'pending_transfer' | 'verified' | null;
    ownerHandle: string | null;
    statusTokens: string[];
};

function getConfig(): GoDaddyConfig {
    const apiKey = process.env.GODADDY_API_KEY;
    const apiSecret = process.env.GODADDY_API_SECRET;

    if (!apiKey || !apiSecret) {
        throw new Error('GODADDY_API_KEY and GODADDY_API_SECRET must be set');
    }

    return { apiKey, apiSecret };
}

async function gdFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const config = getConfig();

    return fetch(`${GD_API}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `sso-key ${config.apiKey}:${config.apiSecret}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
}

/**
 * Parse a GoDaddy error response into a readable message
 */
async function parseError(response: Response, operation: string): Promise<string> {
    const text = await response.text();
    try {
        const data = JSON.parse(text) as GoDaddyErrorResponse;
        const fieldErrors = data.fields?.map(f => `${f.path}: ${f.message}`).join('; ');
        return `${operation}: ${data.message || data.code}${fieldErrors ? ' (' + fieldErrors + ')' : ''} [HTTP ${response.status}]`;
    } catch {
        return `${operation}: ${text || 'Unknown error'} [HTTP ${response.status}]`;
    }
}

function normalizeStatusTokens(status: unknown): string[] {
    if (Array.isArray(status)) {
        return [...new Set(
            status
                .filter((value): value is string => typeof value === 'string')
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean),
        )];
    }

    if (typeof status === 'string') {
        return [...new Set(
            status
                .split(/[,\s]+/)
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean),
        )];
    }

    return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

function toNullableDate(value: unknown): Date | null {
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
        return null;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function deriveOwnerHandle(payload: Record<string, unknown>): string | null {
    const contactRegistrant = asRecord(payload.contactRegistrant);
    const registrantContact = asRecord(payload.registrantContact);
    const source = contactRegistrant ?? registrantContact;
    if (!source) return null;

    const organization = typeof source.organization === 'string' ? source.organization.trim() : '';
    if (organization.length > 0) return organization;

    const first = typeof source.nameFirst === 'string' ? source.nameFirst.trim() : '';
    const last = typeof source.nameLast === 'string' ? source.nameLast.trim() : '';
    const name = [first, last].filter(Boolean).join(' ').trim();
    if (name.length > 0) return name;

    const email = typeof source.email === 'string' ? source.email.trim() : '';
    return email.length > 0 ? email : null;
}

export function deriveGoDaddyRegistrarSignals(payload: Record<string, unknown>): GoDaddyRegistrarSignals {
    const statusTokens = normalizeStatusTokens(payload.status);

    let lockStatus: GoDaddyRegistrarSignals['lockStatus'] = null;
    if (typeof payload.locked === 'boolean') {
        lockStatus = payload.locked ? 'locked' : 'unlocked';
    } else if (
        statusTokens.includes('clienttransferprohibited')
        || statusTokens.includes('servertransferprohibited')
        || statusTokens.includes('clientupdateprohibited')
        || statusTokens.includes('serverupdateprohibited')
    ) {
        lockStatus = 'locked';
    } else if (statusTokens.length > 0) {
        lockStatus = 'unlocked';
    }

    let transferStatus: GoDaddyRegistrarSignals['transferStatus'] = null;
    if (
        statusTokens.includes('pendingtransfer')
        || statusTokens.includes('transferpending')
        || statusTokens.includes('pending_transfer')
    ) {
        transferStatus = 'pending';
    } else if (
        statusTokens.includes('transferfailed')
        || statusTokens.includes('failedtransfer')
        || statusTokens.includes('transfer_failed')
    ) {
        transferStatus = 'failed';
    } else if (statusTokens.length > 0) {
        transferStatus = 'none';
    }

    let dnssecStatus: GoDaddyRegistrarSignals['dnssecStatus'] = null;
    const secureDns = asRecord(payload.secureDNS) ?? asRecord(payload.secureDns);
    const dnssec = asRecord(payload.dnssec);
    const delegationSignedRaw = secureDns?.delegationSigned;
    const dnssecEnabledRaw = dnssec?.enabled;

    if (typeof delegationSignedRaw === 'boolean') {
        dnssecStatus = delegationSignedRaw ? 'enabled' : 'disabled';
    } else if (typeof dnssecEnabledRaw === 'boolean') {
        dnssecStatus = dnssecEnabledRaw ? 'enabled' : 'disabled';
    } else if (statusTokens.includes('signeddelegation')) {
        dnssecStatus = 'enabled';
    } else if (statusTokens.includes('unsigneddelegation')) {
        dnssecStatus = 'disabled';
    }

    const autoRenewEnabled = typeof payload.renewAuto === 'boolean'
        ? payload.renewAuto
        : null;
    const renewalDate = toNullableDate(payload.expires);
    const ownerHandle = deriveOwnerHandle(payload);
    const ownershipStatus: GoDaddyRegistrarSignals['ownershipStatus'] = transferStatus === 'pending'
        ? 'pending_transfer'
        : ownerHandle
            ? 'verified'
            : null;

    return {
        renewalDate,
        autoRenewEnabled,
        lockStatus,
        dnssecStatus,
        transferStatus,
        ownershipStatus,
        ownerHandle,
        statusTokens,
    };
}

export async function getGoDaddyRegistrarSignals(domain: string): Promise<GoDaddyRegistrarSignals> {
    const response = await gdFetch(`/domains/${encodeURIComponent(domain)}`);

    if (!response.ok) {
        throw new Error(await parseError(response, `Registrar profile read for ${domain}`));
    }

    const payload = await response.json() as Record<string, unknown>;
    return deriveGoDaddyRegistrarSignals(payload);
}

/**
 * Add or update a CNAME record for a subdomain.
 * Useful for pointing `www` to a Cloudflare Pages deployment.
 * 
 * @param domain - The root domain (e.g. "example.com")
 * @param name - The subdomain name (e.g. "www")
 * @param value - The target (e.g. "my-project.pages.dev")
 * @param ttl - Time-to-live in seconds (default: 3600)
 */
export async function updateCnameRecord(
    domain: string,
    name: string,
    value: string,
    ttl = 3600
): Promise<void> {
    const response = await gdFetch(`/domains/${encodeURIComponent(domain)}/records/CNAME/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify([{ data: value, ttl }]),
    });

    if (!response.ok) {
        throw new Error(await parseError(response, `CNAME update for ${name}.${domain}`));
    }
}

/**
 * Update the nameservers for a domain.
 * Used to transfer DNS control to Cloudflare.
 * 
 * @param domain - The root domain (e.g. "example.com")
 * @param nameservers - Array of nameserver hostnames (e.g. ["ns1.cloudflare.com", "ns2.cloudflare.com"])
 */
export async function updateNameservers(
    domain: string,
    nameservers: string[]
): Promise<void> {
    if (nameservers.length < 2) {
        throw new Error(`At least 2 nameservers required, got ${nameservers.length}`);
    }

    const response = await gdFetch(`/domains/${encodeURIComponent(domain)}`, {
        method: 'PATCH',
        body: JSON.stringify({ nameServers: nameservers }),
    });

    if (!response.ok) {
        throw new Error(await parseError(response, `Nameserver update for ${domain}`));
    }
}

/**
 * Add or update a TXT record.
 * Useful for domain verification (e.g. Cloudflare, Google Search Console).
 * 
 * @param domain - The root domain (e.g. "example.com")
 * @param name - The record name (e.g. "@" for root, or "_cf-custom-hostname")
 * @param value - The TXT record value
 * @param ttl - Time-to-live in seconds (default: 3600)
 */
export async function addTxtRecord(
    domain: string,
    name: string,
    value: string,
    ttl = 3600
): Promise<void> {
    const response = await gdFetch(`/domains/${encodeURIComponent(domain)}/records/TXT/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify([{ data: value, ttl }]),
    });

    if (!response.ok) {
        throw new Error(await parseError(response, `TXT update for ${name}.${domain}`));
    }
}

/**
 * Verify that the GoDaddy API credentials are valid by fetching domain info.
 * Returns true if the domain is accessible with the configured credentials.
 */
export async function verifyDomainAccess(domain: string): Promise<boolean> {
    try {
        const response = await gdFetch(`/domains/${encodeURIComponent(domain)}`);
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Check domain availability and registration price via GoDaddy API.
 * Returns null if API credentials aren't configured or request fails.
 *
 * @param domain - Full domain name (e.g. "example.com")
 */
export async function checkDomainAvailability(domain: string): Promise<{
    available: boolean;
    price?: number;
    currency?: string;
} | null> {
    try {
        const response = await gdFetch(
            `/domains/available?domain=${encodeURIComponent(domain)}&checkType=FAST`
        );
        if (!response.ok) return null;

        const data = await response.json() as {
            available: boolean;
            price?: number;
            currency?: string;
        };

        return {
            available: data.available,
            // GoDaddy returns price in micro-units (1 USD = 1,000,000)
            price: data.price != null ? data.price / 1_000_000 : undefined,
            currency: data.currency,
        };
    } catch {
        return null;
    }
}
