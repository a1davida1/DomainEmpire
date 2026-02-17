import { NextRequest, NextResponse } from 'next/server';

const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'xmlhttprequest';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Public API routes that don't require CSRF (e.g. webhooks, external callbacks)
const CSRF_EXEMPT_PREFIXES = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/capture',          // public lead capture endpoint
    '/api/ab-tests/track',   // public tracking pixel
];

function isCsrfExempt(pathname: string): boolean {
    return CSRF_EXEMPT_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
    const { pathname, method } = { pathname: request.nextUrl.pathname, method: request.method };

    // ── CSRF protection for mutating API requests ──
    if (
        pathname.startsWith('/api/') &&
        MUTATION_METHODS.has(method) &&
        !isCsrfExempt(pathname)
    ) {
        const csrfHeader = request.headers.get(CSRF_HEADER);
        if (csrfHeader?.toLowerCase() !== CSRF_VALUE) {
            return NextResponse.json(
                { error: 'CSRF validation failed. Use apiFetch() or add X-Requested-With header.' },
                { status: 403 },
            );
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match all API routes
        '/api/:path*',
    ],
};
