import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockRunIntegrationConnectionSync = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/integrations/executor', () => ({
    runIntegrationConnectionSync: mockRunIntegrationConnectionSync,
}));

const { POST } = await import('@/app/api/integrations/connections/[id]/sync/route');

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('integration connection sync route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'editor', name: 'User One' });
    });

    it('rejects invalid id', async () => {
        const response = await POST(
            makeJsonRequest('http://localhost/api/integrations/connections/bad/sync', {}),
            { params: Promise.resolve({ id: 'bad' }) },
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid connection id');
    });

    it('returns 404 when connection not found', async () => {
        mockRunIntegrationConnectionSync.mockResolvedValue({ error: 'not_found' });

        const response = await POST(
            makeJsonRequest('http://localhost/api/integrations/connections/00000000-0000-4000-8000-000000000001/sync', {}),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('Connection not found');
    });

    it('returns run payload on success', async () => {
        mockRunIntegrationConnectionSync.mockResolvedValue({
            run: {
                id: 'run-1',
                status: 'success',
            },
            connection: {
                provider: 'godaddy',
                domainId: null,
                domainName: null,
            },
        });

        const response = await POST(
            makeJsonRequest('http://localhost/api/integrations/connections/00000000-0000-4000-8000-000000000002/sync', { days: 14 }),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000002' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.run.id).toBe('run-1');
        expect(mockRunIntegrationConnectionSync).toHaveBeenCalledWith(
            '00000000-0000-4000-8000-000000000002',
            { userId: 'user-1', role: 'editor' },
            { days: 14 },
        );
    });
});
