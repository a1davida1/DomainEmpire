/**
 * Centralized fetch wrapper for client-side API calls.
 * Automatically adds CSRF protection header and Content-Type.
 */

const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'XMLHttpRequest';

type ApiFetchInit = Omit<RequestInit, 'body'> & {
    body?: unknown;
};

function shouldSerializeAsJson(body: unknown): body is Record<string, unknown> | unknown[] {
    if (body === null || body === undefined) return false;
    if (Array.isArray(body)) return true;
    if (typeof body !== 'object') return false;

    if (
        body instanceof FormData ||
        body instanceof Blob ||
        body instanceof URLSearchParams ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) ||
        body instanceof ReadableStream
    ) {
        return false;
    }

    const prototype = Object.getPrototypeOf(body);
    return prototype === Object.prototype || prototype === null;
}

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
    const serializeAsJson = shouldSerializeAsJson(init?.body);

    // Always add CSRF header
    if (!headers.has(CSRF_HEADER)) {
        headers.set(CSRF_HEADER, CSRF_VALUE);
    }

    // Auto-set Content-Type for object bodies
    if (serializeAsJson && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    return fetch(url, {
        ...init,
        headers,
        body: serializeAsJson
            ? JSON.stringify(init.body)
            : init?.body as BodyInit | undefined,
    });
}
