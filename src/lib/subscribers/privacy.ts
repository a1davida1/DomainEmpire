import { createHash, createHmac, randomBytes } from 'node:crypto';

const USER_AGENT_MAX_LEN = 256;
const REFERRER_MAX_LEN = 256;
let devHashSecret: string | null = null;

function getHashSecret(): string {
    const explicit = process.env.SUBSCRIBER_HASH_SECRET?.trim();
    if (explicit) return explicit;

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required environment variable: SUBSCRIBER_HASH_SECRET');
    }

    if (!devHashSecret) {
        devHashSecret = randomBytes(32).toString('hex');
        console.warn('[subscribers/privacy] SUBSCRIBER_HASH_SECRET is not set; using ephemeral dev-only hash secret.');
    }

    return devHashSecret;
}

function normalize(value?: string | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function hashValue(value: string): string {
    const secret = getHashSecret();
    return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function hashEmail(email: string): string {
    const normalized = normalize(email)?.toLowerCase();
    if (!normalized) {
        throw new Error('Cannot hash an empty email');
    }
    return hashValue(normalized);
}

export function hashPhone(phone?: string | null): string | null {
    const normalized = normalize(phone);
    if (!normalized) return null;

    const canonical = normalized.replace(/[^\d+]/g, '');
    return canonical.length > 0 ? hashValue(canonical) : null;
}

export function hashIpAddress(ipAddress?: string | null): string | null {
    const normalized = normalize(ipAddress);
    return normalized ? hashValue(normalized) : null;
}

export function hashUserAgent(userAgent?: string | null): string | null {
    const normalized = normalize(userAgent);
    if (!normalized) return null;

    const truncated = normalized.slice(0, USER_AGENT_MAX_LEN);
    return hashValue(truncated);
}

export function fingerprintUserAgent(userAgent?: string | null): string | null {
    const normalized = normalize(userAgent);
    if (!normalized) return null;

    const truncated = normalized.slice(0, USER_AGENT_MAX_LEN);
    return createHash('sha256').update(truncated, 'utf8').digest('hex');
}

export function fingerprintReferrer(referrer?: string | null): string | null {
    const normalized = normalize(referrer);
    if (!normalized) return null;

    const truncated = normalized.slice(0, REFERRER_MAX_LEN);
    return createHash('sha256').update(truncated, 'utf8').digest('hex');
}

export { USER_AGENT_MAX_LEN, REFERRER_MAX_LEN };
