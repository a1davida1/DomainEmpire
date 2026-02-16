/**
 * Namecheap API integration for registrar operations.
 *
 * API docs:
 * - https://www.namecheap.com/support/api/methods/domains-dns/set-custom/
 * - https://www.namecheap.com/support/api/methods/domains/get-info/
 *
 * Required env vars:
 * - NAMECHEAP_API_USER
 * - NAMECHEAP_API_KEY
 * - NAMECHEAP_CLIENT_IP
 * Optional:
 * - NAMECHEAP_USERNAME
 * - NAMECHEAP_SANDBOX=true (or NAMECHEAP_API_BASE_URL override)
 */

import type { GoDaddyRegistrarSignals } from '@/lib/deploy/godaddy';

type NamecheapConfig = {
    apiUser: string;
    apiKey: string;
    username: string;
    clientIp: string;
    baseUrl: string;
};

const NAMECHEAP_PROD_API = 'https://api.namecheap.com/xml.response';
const NAMECHEAP_SANDBOX_API = 'https://api.sandbox.namecheap.com/xml.response';

function parseBool(raw: string | undefined, fallback = false): boolean {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
        return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
        return false;
    }
    return fallback;
}

function splitDomainParts(domain: string): { sld: string; tld: string } {
    const normalized = domain.trim().toLowerCase();
    const labels = normalized.split('.').filter(Boolean);
    if (labels.length < 2) {
        throw new Error(`Invalid domain for Namecheap API: ${domain}`);
    }
    const sld = labels.shift();
    const tld = labels.join('.');
    if (!sld || !tld) {
        throw new Error(`Invalid domain for Namecheap API: ${domain}`);
    }
    return { sld, tld };
}

function decodeXmlEntities(value: string): string {
    return value
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");
}

function parseXmlAttributes(input: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const regex = /([A-Za-z0-9:_-]+)="([^"]*)"/g;
    let match: RegExpExecArray | null = regex.exec(input);
    while (match) {
        attrs[match[1]] = decodeXmlEntities(match[2]);
        match = regex.exec(input);
    }
    return attrs;
}

function parseNamecheapApiError(xml: string): string {
    const errors: string[] = [];
    const regex = /<Error\b[^>]*>([\s\S]*?)<\/Error>/gi;
    let match: RegExpExecArray | null = regex.exec(xml);
    while (match) {
        const message = decodeXmlEntities(match[1].trim());
        if (message.length > 0) {
            errors.push(message);
        }
        match = regex.exec(xml);
    }
    return errors.join('; ') || 'Unknown Namecheap API error';
}

function parseNamecheapDate(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usDate) {
        const month = Number.parseInt(usDate[1], 10);
        const day = Number.parseInt(usDate[2], 10);
        const year = Number.parseInt(usDate[3], 10);
        if (
            Number.isFinite(month) && Number.isFinite(day) && Number.isFinite(year)
            && month >= 1 && month <= 12 && day >= 1 && day <= 31
        ) {
            return new Date(Date.UTC(year, month - 1, day));
        }
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getConfig(): NamecheapConfig {
    const apiUser = process.env.NAMECHEAP_API_USER?.trim();
    const apiKey = process.env.NAMECHEAP_API_KEY?.trim();
    const username = process.env.NAMECHEAP_USERNAME?.trim() || apiUser;
    const clientIp = process.env.NAMECHEAP_CLIENT_IP?.trim();
    const sandbox = parseBool(process.env.NAMECHEAP_SANDBOX, false);
    const baseUrl = process.env.NAMECHEAP_API_BASE_URL?.trim()
        || (sandbox ? NAMECHEAP_SANDBOX_API : NAMECHEAP_PROD_API);

    if (!apiUser || !apiKey || !username || !clientIp) {
        throw new Error(
            'NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME (or API_USER), and NAMECHEAP_CLIENT_IP must be set',
        );
    }

    return {
        apiUser,
        apiKey,
        username,
        clientIp,
        baseUrl,
    };
}

async function namecheapRequest(command: string, params: Record<string, string>): Promise<string> {
    const config = getConfig();
    const url = new URL(config.baseUrl);
    url.searchParams.set('ApiUser', config.apiUser);
    url.searchParams.set('ApiKey', config.apiKey);
    url.searchParams.set('UserName', config.username);
    url.searchParams.set('ClientIp', config.clientIp);
    url.searchParams.set('Command', command);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
    });

    const xml = await response.text();
    if (!response.ok) {
        throw new Error(`Namecheap API request failed [HTTP ${response.status}]`);
    }

    const statusMatch = xml.match(/<ApiResponse\b[^>]*Status="([^"]+)"/i);
    const status = statusMatch?.[1]?.toLowerCase() || '';
    if (status !== 'ok') {
        const reason = parseNamecheapApiError(xml);
        throw new Error(`Namecheap API request failed: ${reason}`);
    }

    return xml;
}

function normalizeStatusTokens(value: string | null | undefined): string[] {
    if (!value) return [];
    return [...new Set(
        value
            .split(/[,\s|;]+/)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean),
    )];
}

function parseNamecheapDomainInfo(xml: string): {
    expires: Date | null;
    isLocked: boolean | null;
    autoRenew: boolean | null;
    ownerHandle: string | null;
    statusTokens: string[];
} {
    const infoTag = xml.match(/<DomainGetInfoResult\b([^>]*)>/i);
    const attrs = infoTag ? parseXmlAttributes(infoTag[1]) : {};

    const expires = parseNamecheapDate(attrs.Expires ?? null);
    const isLocked = attrs.IsLocked === 'true'
        ? true
        : attrs.IsLocked === 'false'
            ? false
            : null;
    const autoRenew = attrs.AutoRenew === 'true'
        ? true
        : attrs.AutoRenew === 'false'
            ? false
            : null;

    const registrantTag = xml.match(/<Registrant\b([^>]*)>/i);
    const registrant = registrantTag ? parseXmlAttributes(registrantTag[1]) : {};
    const org = registrant.OrganizationName?.trim() || '';
    const first = registrant.FirstName?.trim() || '';
    const last = registrant.LastName?.trim() || '';
    const name = [first, last].filter(Boolean).join(' ').trim();
    const ownerHandle = org || name || null;

    const statusTokens = normalizeStatusTokens(attrs.Status ?? null);

    return {
        expires,
        isLocked,
        autoRenew,
        ownerHandle,
        statusTokens,
    };
}

export function hasNamecheapCredentials(): boolean {
    return Boolean(
        process.env.NAMECHEAP_API_USER?.trim()
        && process.env.NAMECHEAP_API_KEY?.trim()
        && (process.env.NAMECHEAP_USERNAME?.trim() || process.env.NAMECHEAP_API_USER?.trim())
        && process.env.NAMECHEAP_CLIENT_IP?.trim(),
    );
}

export async function updateNamecheapNameservers(domain: string, nameservers: string[]): Promise<void> {
    if (nameservers.length < 2) {
        throw new Error(`At least 2 nameservers required, got ${nameservers.length}`);
    }

    const normalized = [...new Set(nameservers
        .map((value) => value.trim().toLowerCase().replace(/\.+$/g, ''))
        .filter(Boolean))];
    if (normalized.length < 2) {
        throw new Error('At least 2 unique nameservers are required.');
    }

    const { sld, tld } = splitDomainParts(domain);
    const xml = await namecheapRequest('namecheap.domains.dns.setCustom', {
        SLD: sld,
        TLD: tld,
        Nameservers: normalized.join(','),
    });

    const resultTag = xml.match(/<DomainDNSSetCustomResult\b([^>]*)>/i);
    const attrs = resultTag ? parseXmlAttributes(resultTag[1]) : {};
    const isSuccess = attrs.IsSuccess?.toLowerCase() === 'true';
    if (!isSuccess) {
        throw new Error('Namecheap DNS update did not report success');
    }
}

export async function getNamecheapRegistrarSignals(domain: string): Promise<GoDaddyRegistrarSignals> {
    const { sld, tld } = splitDomainParts(domain);
    const xml = await namecheapRequest('namecheap.domains.getInfo', {
        SLD: sld,
        TLD: tld,
    });
    const details = parseNamecheapDomainInfo(xml);

    return {
        renewalDate: details.expires,
        autoRenewEnabled: details.autoRenew,
        lockStatus: details.isLocked === null
            ? null
            : details.isLocked
                ? 'locked'
                : 'unlocked',
        dnssecStatus: null,
        transferStatus: details.statusTokens.some((token) => token.includes('pending'))
            ? 'pending'
            : details.statusTokens.some((token) => token.includes('failed'))
                ? 'failed'
                : 'none',
        ownershipStatus: details.ownerHandle ? 'verified' : null,
        ownerHandle: details.ownerHandle,
        statusTokens: details.statusTokens,
    };
}

export async function getNamecheapExpiry(domain: string): Promise<Date | null> {
    const signals = await getNamecheapRegistrarSignals(domain);
    return signals.renewalDate;
}
