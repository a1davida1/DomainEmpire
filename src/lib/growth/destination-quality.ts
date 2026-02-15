const DEFAULT_BLOCKED_SHORTENERS = [
    'bit.ly',
    't.co',
    'tinyurl.com',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'cutt.ly',
    'rebrand.ly',
];

const REDIRECT_PARAM_KEYS = [
    'redirect',
    'redirect_uri',
    'url',
    'target',
    'dest',
    'destination',
    'next',
];

function parseListEnv(name: string): string[] {
    const raw = process.env[name];
    if (!raw) return [];
    return raw
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0);
}

function isIpv4(hostname: string): boolean {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateIpv4(hostname: string): boolean {
    if (!isIpv4(hostname)) return false;
    const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return false;
    }

    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
}

function isPrivateIpv6(hostname: string): boolean {
    if (!hostname.includes(':')) return false;
    const normalized = hostname.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80')) return true;
    return false;
}

function isAllowedHost(hostname: string, allowedHosts: string[]): boolean {
    if (allowedHosts.length === 0) return true;
    return allowedHosts.some((allowed) => (
        hostname === allowed || hostname.endsWith(`.${allowed}`)
    ));
}

function tldFromHostname(hostname: string): string | null {
    const parts = hostname.split('.');
    if (parts.length < 2) return null;
    return parts[parts.length - 1] || null;
}

function isDifferentHost(urlValue: string, baseHost: string): boolean {
    try {
        const parsed = new URL(urlValue);
        return parsed.hostname.toLowerCase() !== baseHost;
    } catch {
        return false;
    }
}

export type DestinationQualityResult = {
    host: string | null;
    riskScore: number;
    warnings: string[];
    blockReasons: string[];
    checksApplied: string[];
};

export function evaluateDestinationQuality(destinationUrl: string): DestinationQualityResult {
    const warnings: string[] = [];
    const blockReasons: string[] = [];
    const checksApplied: string[] = [];
    let riskScore = 0;
    let host: string | null = null;

    let parsed: URL | null = null;
    try {
        parsed = new URL(destinationUrl);
    } catch {
        blockReasons.push('Destination URL is invalid');
        checksApplied.push('destination_parse');
        return {
            host,
            riskScore: 100,
            warnings,
            blockReasons,
            checksApplied,
        };
    }
    checksApplied.push('destination_parse');

    host = parsed.hostname.trim().toLowerCase().replace(/\.+$/, '');

    if (parsed.protocol !== 'https:') {
        blockReasons.push('Destination URL must be https');
    }
    checksApplied.push('destination_scheme');

    if (!host || host.length === 0) {
        blockReasons.push('Destination URL host is missing');
    }
    checksApplied.push('destination_host_present');

    if (parsed.username || parsed.password) {
        blockReasons.push('Destination URL must not include user credentials');
    }
    checksApplied.push('destination_auth');

    if (parsed.port && parsed.port !== '443') {
        blockReasons.push('Destination URL must not use a non-standard https port');
    }
    checksApplied.push('destination_port');

    if (host) {
        if (host === 'localhost' || host.endsWith('.localhost')) {
            blockReasons.push('Destination host cannot be localhost');
        }
        if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
            blockReasons.push('Destination host cannot be a private or loopback IP');
        }
    }
    checksApplied.push('destination_private_network');

    const allowedHosts = parseListEnv('GROWTH_POLICY_ALLOWED_DESTINATION_HOSTS');
    if (host && !isAllowedHost(host, allowedHosts)) {
        blockReasons.push('Destination host is not in the allowed host list');
    }
    checksApplied.push('destination_allowlist');

    const blockedShorteners = parseListEnv('GROWTH_POLICY_BLOCKED_SHORTENER_HOSTS');
    const shortenerList = blockedShorteners.length > 0 ? blockedShorteners : DEFAULT_BLOCKED_SHORTENERS;
    if (host && shortenerList.includes(host)) {
        const blockShorteners = process.env.GROWTH_POLICY_BLOCK_SHORTENERS === 'true';
        const message = 'Destination host is a link shortener';
        if (blockShorteners) {
            blockReasons.push(message);
        } else {
            warnings.push(message);
            riskScore += 20;
        }
    }
    checksApplied.push('destination_shortener');

    const highRiskTlds = parseListEnv('GROWTH_POLICY_HIGH_RISK_TLDS');
    const tld = host ? tldFromHostname(host) : null;
    if (tld && highRiskTlds.includes(tld)) {
        warnings.push(`Destination TLD "${tld}" is marked high-risk`);
        riskScore += 15;
    }
    checksApplied.push('destination_tld');

    if (host) {
        for (const key of REDIRECT_PARAM_KEYS) {
            const value = parsed.searchParams.get(key);
            if (!value) continue;
            if (isDifferentHost(value, host)) {
                blockReasons.push(`Destination includes redirect parameter "${key}" to a different host`);
            }
        }
    }
    checksApplied.push('destination_redirect_params');

    if (blockReasons.length > 0) {
        riskScore = Math.max(90, riskScore);
    } else {
        riskScore = Math.min(80, riskScore);
    }

    return {
        host,
        riskScore,
        warnings,
        blockReasons,
        checksApplied,
    };
}
