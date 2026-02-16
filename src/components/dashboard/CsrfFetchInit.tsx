'use client';

import { useEffect } from 'react';

const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'XMLHttpRequest';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Installs a global fetch interceptor that adds X-Requested-With header
 * to all same-origin mutating requests (POST/PUT/PATCH/DELETE).
 *
 * This provides CSRF protection: browsers block cross-origin custom headers
 * (triggers CORS preflight), so malicious sites cannot forge these requests.
 *
 * Mount once in the dashboard layout.
 */
export function CsrfFetchInit() {
    useEffect(() => {
        const originalFetch = window.fetch;

        window.fetch = function csrfFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            const method = (init?.method || 'GET').toUpperCase();

            // Only add header for mutating same-origin requests
            if (MUTATION_METHODS.has(method)) {
                const url = typeof input === 'string' ? input
                    : input instanceof URL ? input.href
                    : input instanceof Request ? input.url
                    : '';

                // Only same-origin requests (relative URLs or same host)
                const isSameOrigin = url.startsWith('/') ||
                    url.startsWith(window.location.origin);

                if (isSameOrigin) {
                    const headers = new Headers(init?.headers);
                    if (!headers.has(CSRF_HEADER)) {
                        headers.set(CSRF_HEADER, CSRF_VALUE);
                    }
                    return originalFetch.call(this, input, { ...init, headers });
                }
            }

            return originalFetch.call(this, input, init);
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    return null;
}
