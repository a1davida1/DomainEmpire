/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks request counts per key (IP, user ID, etc.) within a configurable
 * time window. Suitable for single-process deployments. For multi-process,
 * replace the Map with Redis or a shared store.
 */

interface RateLimitEntry {
    timestamps: number[];
}

interface RateLimiterConfig {
    /** Maximum number of requests allowed within the window. */
    maxRequests: number;
    /** Window duration in milliseconds. */
    windowMs: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

function getStore(name: string): Map<string, RateLimitEntry> {
    let store = stores.get(name);
    if (!store) {
        store = new Map();
        stores.set(name, store);
    }
    return store;
}

/**
 * Create a rate limiter with a given name, max requests, and window.
 *
 * Returns a function that checks whether a key has exceeded the limit.
 * The result includes whether the request is allowed and headers for
 * `Retry-After`, `X-RateLimit-Limit`, and `X-RateLimit-Remaining`.
 */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
    const store = getStore(name);

    // Periodic cleanup to prevent memory leak (every 60s)
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store) {
            entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);
            if (entry.timestamps.length === 0) {
                store.delete(key);
            }
        }
    }, 60_000);

    // Allow garbage collection of the interval if the module is unloaded
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return function checkRateLimit(key: string): {
        allowed: boolean;
        remaining: number;
        retryAfterMs: number;
        headers: Record<string, string>;
    } {
        const now = Date.now();
        let entry = store.get(key);

        if (!entry) {
            entry = { timestamps: [] };
            store.set(key, entry);
        }

        // Remove timestamps outside the window
        entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

        if (entry.timestamps.length >= config.maxRequests) {
            const oldest = entry.timestamps[0];
            const retryAfterMs = config.windowMs - (now - oldest);
            const retryAfterSec = Math.ceil(retryAfterMs / 1000);

            return {
                allowed: false,
                remaining: 0,
                retryAfterMs,
                headers: {
                    'X-RateLimit-Limit': String(config.maxRequests),
                    'X-RateLimit-Remaining': '0',
                    'Retry-After': String(retryAfterSec),
                },
            };
        }

        entry.timestamps.push(now);
        const remaining = config.maxRequests - entry.timestamps.length;

        return {
            allowed: true,
            remaining,
            retryAfterMs: 0,
            headers: {
                'X-RateLimit-Limit': String(config.maxRequests),
                'X-RateLimit-Remaining': String(remaining),
            },
        };
    };
}

/**
 * Extract a rate-limit key from a request.
 * Uses X-Forwarded-For header (behind proxy) or falls back to a default.
 */
export function getClientIp(request: Request): string {
    const trustProxy = process.env.TRUST_PROXY !== 'false';

    if (trustProxy) {
        const forwarded = request.headers.get('x-forwarded-for');
        if (forwarded) {
            const ip = forwarded.split(',')[0]?.trim();
            if (ip) return ip;
        }
        const realIp = request.headers.get('x-real-ip');
        if (realIp) {
            return realIp.trim();
        }
    }

    return 'unknown';
}

/** Pre-configured limiters for common use cases */
export const loginLimiter = createRateLimiter('login', {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 5 attempts per 15 minutes
});

export const aiLimiter = createRateLimiter('ai', {
    maxRequests: 20,
    windowMs: 60 * 1000, // 20 AI calls per minute
});

export const generalLimiter = createRateLimiter('general', {
    maxRequests: 100,
    windowMs: 60 * 1000, // 100 requests per minute
});
