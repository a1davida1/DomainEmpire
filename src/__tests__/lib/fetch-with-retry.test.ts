import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test fetchWithRetry by mocking the global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { fetchWithRetry } = await import('@/lib/fetch-with-retry');

describe('fetchWithRetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns response on first successful call', async () => {
        mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const result = await fetchWithRetry('https://example.com');
        expect(result.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 4xx client errors', async () => {
        mockFetch.mockResolvedValueOnce(new Response('not found', { status: 404 }));

        const result = await fetchWithRetry('https://example.com', undefined, {
            maxRetries: 2,
            baseDelayMs: 1,
        });
        expect(result.status).toBe(404);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on 5xx server errors', async () => {
        mockFetch
            .mockResolvedValueOnce(new Response('error', { status: 500 }))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const result = await fetchWithRetry('https://example.com', undefined, {
            maxRetries: 2,
            baseDelayMs: 1,
        });
        expect(result.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on network errors', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const result = await fetchWithRetry('https://example.com', undefined, {
            maxRetries: 2,
            baseDelayMs: 1,
        });
        expect(result.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retries on network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        await expect(
            fetchWithRetry('https://example.com', undefined, {
                maxRetries: 2,
                baseDelayMs: 1,
            })
        ).rejects.toThrow('Network error');
        expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('returns 5xx response after exhausting retries', async () => {
        mockFetch.mockResolvedValue(new Response('error', { status: 503 }));

        const result = await fetchWithRetry('https://example.com', undefined, {
            maxRetries: 1,
            baseDelayMs: 1,
        });
        expect(result.status).toBe(503);
        expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('uses default maxRetries of 2', async () => {
        mockFetch.mockRejectedValue(new Error('fail'));

        await expect(
            fetchWithRetry('https://example.com', undefined, { baseDelayMs: 1 })
        ).rejects.toThrow();
        expect(mockFetch).toHaveBeenCalledTimes(3); // 1 + 2 default retries
    });

    it('passes init options through to fetch', async () => {
        mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

        const init = { method: 'POST', body: 'data', headers: { 'X-Test': '1' } };
        await fetchWithRetry('https://example.com', init);

        expect(mockFetch).toHaveBeenCalledWith('https://example.com', init);
    });

    it('handles non-Error thrown values', async () => {
        mockFetch.mockRejectedValue('string error');

        await expect(
            fetchWithRetry('https://example.com', undefined, {
                maxRetries: 0,
                baseDelayMs: 1,
            })
        ).rejects.toThrow('string error');
    });
});
