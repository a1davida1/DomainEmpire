import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Use Upstash Redis if configured, otherwise fall back to in-memory
let ratelimit: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    ratelimit = new Ratelimit({
        redis: new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        }),
        limiter: Ratelimit.slidingWindow(100, '1 m'),
        analytics: true,
        prefix: 'domain-empire',
    });
}

// Fallback in-memory rate limiter for local dev with periodic cleanup
const memoryRateLimit = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 100;
const CLEANUP_INTERVAL = 30_000;
let lastCleanup = Date.now();

function checkMemoryRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = memoryRateLimit.get(ip);

    if (record && now < record.resetTime) {
        if (record.count >= MAX_REQUESTS) return false;
        record.count++;
    } else {
        memoryRateLimit.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }

    // Periodic cleanup every 30s to prevent memory leak
    if (now - lastCleanup > CLEANUP_INTERVAL) {
        lastCleanup = now;
        for (const [key, val] of memoryRateLimit.entries()) {
            if (now > val.resetTime) memoryRateLimit.delete(key);
        }
    }

    return true;
}

const SESSION_COOKIE = 'de-session';

// Public paths that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

export async function proxy(request: NextRequest) {
    const ip =
        (request as unknown as { ip?: string }).ip ||
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-real-ip') ||
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        'anonymous';

    const { pathname } = request.nextUrl;

    // Rate limit API routes
    if (pathname.startsWith('/api')) {
        if (ratelimit) {
            const { success, remaining } = await ratelimit.limit(ip);
            if (!success) {
                return new NextResponse('Too Many Requests', {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': String(remaining),
                        'Retry-After': '60',
                    },
                });
            }
        } else if (!checkMemoryRateLimit(ip)) {
            return new NextResponse('Too Many Requests', {
                status: 429,
                headers: { 'Retry-After': '60' },
            });
        }
    }

    // Session-based auth check for dashboard and non-public API routes
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    const needsAuth = pathname.startsWith('/dashboard') || (pathname.startsWith('/api') && !isPublic);

    if (needsAuth) {
        const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
        if (!sessionToken) {
            // Redirect browsers to login, return 401 for API calls
            if (pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            return NextResponse.redirect(new URL('/login', request.url));
        }
        // Note: Full session validation (DB lookup) happens in requireAuth() within route handlers.
        // Proxy only checks cookie presence for fast rejection of unauthenticated requests.
    }

    const response = NextResponse.next();

    // Security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
}

export const config = {
    matcher: ['/api/:path*', '/dashboard/:path*'],
};
