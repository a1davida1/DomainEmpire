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
            const method = (input instanceof Request ? input.method : init?.method || 'GET').toUpperCase();

            // Only add header for mutating same-origin requests
            if (MUTATION_METHODS.has(method)) {
                const url = typeof input === 'string' ? input
                    : input instanceof URL ? input.href
                    : input instanceof Request ? input.url
                    : '';

                // Only same-origin requests.
                // This intentionally excludes protocol-relative URLs like //evil.example.
                let isSameOrigin = false;
                try {
                    const resolved = new URL(url, window.location.origin);
                    isSameOrigin = resolved.origin === window.location.origin && !url.startsWith('//');
                } catch {
                    isSameOrigin = false;
                }

                if (isSameOrigin) {
                    const headers = input instanceof Request
                        ? new Headers(input.headers)
                        : new Headers(init?.headers);

                    if (init?.headers) {
                        new Headers(init.headers).forEach((value, key) => {
                            headers.set(key, value);
                        });
                    }

                    if (!headers.has(CSRF_HEADER)) {
                        headers.set(CSRF_HEADER, CSRF_VALUE);
                    }

                    if (input instanceof Request) {
                        const requestWithHeaders = new Request(input, {
                            ...init,
                            headers,
                        });
                        return originalFetch.call(this, requestWithHeaders);
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
