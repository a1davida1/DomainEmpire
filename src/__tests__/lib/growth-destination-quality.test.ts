import { afterEach, describe, expect, it } from 'vitest';
import { evaluateDestinationQuality } from '@/lib/growth/destination-quality';

const originalAllowedHosts = process.env.GROWTH_POLICY_ALLOWED_DESTINATION_HOSTS;
const originalBlockShorteners = process.env.GROWTH_POLICY_BLOCK_SHORTENERS;
const originalBlockedShorteners = process.env.GROWTH_POLICY_BLOCKED_SHORTENER_HOSTS;

afterEach(() => {
    process.env.GROWTH_POLICY_ALLOWED_DESTINATION_HOSTS = originalAllowedHosts;
    process.env.GROWTH_POLICY_BLOCK_SHORTENERS = originalBlockShorteners;
    process.env.GROWTH_POLICY_BLOCKED_SHORTENER_HOSTS = originalBlockedShorteners;
});

describe('growth destination quality', () => {
    it('blocks localhost destinations', () => {
        const result = evaluateDestinationQuality('https://localhost/path');
        expect(result.blockReasons.join(' ')).toContain('localhost');
        expect(result.riskScore).toBeGreaterThanOrEqual(90);
    });

    it('blocks private IPv4 destinations', () => {
        const result = evaluateDestinationQuality('https://192.168.1.5/path');
        expect(result.blockReasons.join(' ')).toContain('private');
    });

    it('warns on shortener destination by default', () => {
        process.env.GROWTH_POLICY_ALLOWED_DESTINATION_HOSTS = '';
        process.env.GROWTH_POLICY_BLOCKED_SHORTENER_HOSTS = 'bit.ly';
        process.env.GROWTH_POLICY_BLOCK_SHORTENERS = 'false';
        const result = evaluateDestinationQuality('https://bit.ly/offer');
        expect(result.blockReasons.length).toBe(0);
        expect(result.warnings.join(' ')).toContain('shortener');
    });

    it('blocks shortener destination when configured', () => {
        process.env.GROWTH_POLICY_ALLOWED_DESTINATION_HOSTS = '';
        process.env.GROWTH_POLICY_BLOCKED_SHORTENER_HOSTS = 'bit.ly';
        process.env.GROWTH_POLICY_BLOCK_SHORTENERS = 'true';
        const result = evaluateDestinationQuality('https://bit.ly/offer');
        expect(result.blockReasons.join(' ')).toContain('shortener');
    });

    it('blocks open redirect style parameters to another host', () => {
        const result = evaluateDestinationQuality('https://example.com/path?redirect=https%3A%2F%2Fevil.example%2Ffoo');
        expect(result.blockReasons.join(' ')).toContain('redirect parameter');
    });

    it('enforces allowlist when configured', () => {
        process.env.GROWTH_POLICY_ALLOWED_DESTINATION_HOSTS = 'allowed.example';
        const result = evaluateDestinationQuality('https://not-allowed.example/path');
        expect(result.blockReasons.join(' ')).toContain('allowed host list');
    });
});
