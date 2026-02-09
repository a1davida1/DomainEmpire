import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter
// Note: In a distributed environment (Vercel/AWS), this should be replaced with Redis (e.g., Upstash)
const rateLimit = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requests per minute

export function middleware(request: NextRequest) {
    // Extract client IP - prefer platform-provided real IP when available
    // Note: x-forwarded-for is untrusted in production unless behind configured trusted proxies
    const ip =
        (request as any).ip ||                                            // Vercel/platform-provided
        request.headers.get('cf-connecting-ip') ||                        // Cloudflare
        request.headers.get('x-real-ip') ||                               // nginx
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||  // First IP in chain
        'unknown';

    // Only rate limit API routes
    if (request.nextUrl.pathname.startsWith('/api')) {
        const now = Date.now();
        const record = rateLimit.get(ip);

        if (record && now < record.resetTime) {
            if (record.count >= MAX_REQUESTS) {
                return new NextResponse('Too Many Requests', { status: 429 });
            }
            record.count++;
        } else {
            rateLimit.set(ip, {
                count: 1,
                resetTime: now + RATE_LIMIT_WINDOW,
            });
        }

        // Cleanup old entries periodically (simple optimization)
        if (rateLimit.size > 10000) {
            for (const [key, val] of rateLimit.entries()) {
                if (Date.now() > val.resetTime) {
                    rateLimit.delete(key);
                }
            }
        }
    }

    const response = NextResponse.next();

    // Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');

    return response;
}

export const config = {
    matcher: '/api/:path*',
};
