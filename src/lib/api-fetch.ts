/**
 * Centralized fetch wrapper for client-side API calls.
 * Automatically adds CSRF protection header and Content-Type.
 */

const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'XMLHttpRequest';

type ApiFetchInit = Omit<RequestInit, 'body'> & {
    body?: unknown;
};

/**
 * Fetch wrapper that adds CSRF header and JSON content-type.
 * Use this for all client-side API mutations (POST/PUT/PATCH/DELETE).
 *
 * @example
 *   const res = await apiFetch('/api/domains/123', {
 *     method: 'PATCH',
 *     body: { status: 'active' },
 *   });
 */
export async function apiFetch(url: string, init?: ApiFetchInit): Promise<Response> {
    const headers = new Headers(init?.headers);

    // Always add CSRF header
    if (!headers.has(CSRF_HEADER)) {
        headers.set(CSRF_HEADER, CSRF_VALUE);
    }

    // Auto-set Content-Type for object bodies
    if (init?.body && typeof init.body === 'object' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return fetch(url, {
        ...init,
        headers,
        body: init?.body && typeof init.body === 'object'
            ? JSON.stringify(init.body)
            : init?.body as BodyInit | undefined,
    });
}
