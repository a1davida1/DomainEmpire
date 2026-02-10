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
    try {
        const data = await response.json() as GoDaddyErrorResponse;
        const fieldErrors = data.fields?.map(f => `${f.path}: ${f.message}`).join('; ');
        return `${operation}: ${data.message || data.code}${fieldErrors ? ` (${fieldErrors})` : ''} [HTTP ${response.status}]`;
    } catch {
        const text = await response.text().catch(() => 'Unknown error');
        return `${operation}: ${text} [HTTP ${response.status}]`;
    }
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
    const response = await gdFetch(`/domains/${domain}/records/CNAME/${name}`, {
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

    const response = await gdFetch(`/domains/${domain}`, {
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
    const response = await gdFetch(`/domains/${domain}/records/TXT/${name}`, {
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
        const response = await gdFetch(`/domains/${domain}`);
        return response.ok;
    } catch {
        return false;
    }
}
