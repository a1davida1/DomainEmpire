import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api-fetch';

describe('apiFetch', () => {
    const originalFetch = global.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.resetAllMocks();
        fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('serializes plain object bodies to JSON and sets content-type', async () => {
        await apiFetch('/api/test', {
            method: 'POST',
            body: { hello: 'world' },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(init.headers);

        expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(init.body).toBe(JSON.stringify({ hello: 'world' }));
    });

    it('does not force JSON serialization for FormData bodies', async () => {
        const formData = new FormData();
        formData.set('file', 'blob');

        await apiFetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const headers = new Headers(init.headers);

        expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
        expect(headers.has('Content-Type')).toBe(false);
        expect(init.body).toBe(formData);
    });
});
