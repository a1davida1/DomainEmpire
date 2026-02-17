import { createHash, createHmac } from 'node:crypto';

const USER_AGENT_MAX_LEN = 256;
const REFERRER_MAX_LEN = 256;

function getHashSecret(): string {
    const explicit = process.env.SUBSCRIBER_HASH_SECRET?.trim();
    if (explicit) return explicit;

    // Dev fallback only. In production, DATABASE_URL is always present.
    return process.env.DATABASE_URL?.trim() || 'domainempire-dev-subscriber-hash-secret';
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
    return hashValue(email.toLowerCase().trim());
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
