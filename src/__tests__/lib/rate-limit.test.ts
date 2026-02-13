import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

describe('createRateLimiter', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    it('allows requests within the limit', () => {
        const limiter = createRateLimiter('test-allow', {
            maxRequests: 3,
            windowMs: 60_000,
        });

        const r1 = limiter('user-1');
        expect(r1.allowed).toBe(true);
        expect(r1.remaining).toBe(2);

        const r2 = limiter('user-1');
        expect(r2.allowed).toBe(true);
        expect(r2.remaining).toBe(1);

        const r3 = limiter('user-1');
        expect(r3.allowed).toBe(true);
        expect(r3.remaining).toBe(0);
    });

    it('blocks requests exceeding the limit', () => {
        const limiter = createRateLimiter('test-block', {
            maxRequests: 2,
            windowMs: 60_000,
        });

        limiter('user-1');
        limiter('user-1');
        const r3 = limiter('user-1');

        expect(r3.allowed).toBe(false);
        expect(r3.remaining).toBe(0);
        expect(r3.retryAfterMs).toBeGreaterThan(0);
    });

    it('tracks keys independently', () => {
        const limiter = createRateLimiter('test-keys', {
            maxRequests: 1,
            windowMs: 60_000,
        });

        const r1 = limiter('user-a');
        expect(r1.allowed).toBe(true);

        const r2 = limiter('user-b');
        expect(r2.allowed).toBe(true);

        const r3 = limiter('user-a');
        expect(r3.allowed).toBe(false);
    });

    it('resets after the time window expires', () => {
        const limiter = createRateLimiter('test-reset', {
            maxRequests: 1,
            windowMs: 10_000,
        });

        const r1 = limiter('user-1');
        expect(r1.allowed).toBe(true);

        const r2 = limiter('user-1');
        expect(r2.allowed).toBe(false);

        // Advance time past the window
        vi.advanceTimersByTime(11_000);

        const r3 = limiter('user-1');
        expect(r3.allowed).toBe(true);
    });

    it('returns correct rate limit headers', () => {
        const limiter = createRateLimiter('test-headers', {
            maxRequests: 5,
            windowMs: 60_000,
        });

        const result = limiter('user-1');
        expect(result.headers['X-RateLimit-Limit']).toBe('5');
        expect(result.headers['X-RateLimit-Remaining']).toBe('4');
    });

    it('returns Retry-After header when blocked', () => {
        const limiter = createRateLimiter('test-retry', {
            maxRequests: 1,
            windowMs: 60_000,
        });

        limiter('user-1');
        const blocked = limiter('user-1');

        expect(blocked.headers['Retry-After']).toBeDefined();
        expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
    });

    it('uses sliding window — old timestamps expire individually', () => {
        const limiter = createRateLimiter('test-sliding', {
            maxRequests: 2,
            windowMs: 10_000,
        });

        limiter('user-1'); // t=0
        vi.advanceTimersByTime(5_000);
        limiter('user-1'); // t=5000

        // At t=5000, both timestamps are within window — should be blocked
        const blocked = limiter('user-1');
        expect(blocked.allowed).toBe(false);

        // Advance to t=11000 — first timestamp at t=0 expires
        vi.advanceTimersByTime(6_000);
        const allowed = limiter('user-1');
        expect(allowed.allowed).toBe(true);
    });
});

describe('getClientIp', () => {
    it('extracts IP from X-Forwarded-For header', () => {
        const request = {
            headers: {
                get: (name: string) => {
                    if (name === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
                    return null;
                },
            },
        } as unknown as Request;

        expect(getClientIp(request)).toBe('1.2.3.4');
    });

    it('falls back to X-Real-IP', () => {
        const request = {
            headers: {
                get: (name: string) => {
                    if (name === 'x-real-ip') return '10.0.0.1';
                    return null;
                },
            },
        } as unknown as Request;

        expect(getClientIp(request)).toBe('10.0.0.1');
    });

    it('returns "unknown" when no IP headers present', () => {
        const request = {
            headers: { get: () => null },
        } as unknown as Request;

        expect(getClientIp(request)).toBe('unknown');
    });

    it('trims whitespace from forwarded IP', () => {
        const request = {
            headers: {
                get: (name: string) => {
                    if (name === 'x-forwarded-for') return '  1.2.3.4 , 5.6.7.8';
                    return null;
                },
            },
        } as unknown as Request;

        expect(getClientIp(request)).toBe('1.2.3.4');
    });
});
