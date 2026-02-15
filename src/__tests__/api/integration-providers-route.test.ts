import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

const { GET } = await import('@/app/api/integrations/providers/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

describe('integration providers route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
    });

    it('returns provider catalog', async () => {
        const response = await GET(makeGetRequest('http://localhost/api/integrations/providers'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(Array.isArray(body.providers)).toBe(true);
        expect(body.providers.length).toBeGreaterThan(0);
        expect(body.providers[0]).toHaveProperty('supportsScheduledSync');
        expect(body.providers[0]).toHaveProperty('defaultSyncIntervalMinutes');
    });
});
