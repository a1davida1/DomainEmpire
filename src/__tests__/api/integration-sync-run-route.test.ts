import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: vi.fn(),
        update: vi.fn(),
    },
    integrationConnections: {
        id: 'id',
        userId: 'user_id',
    },
    integrationSyncRuns: {
        id: 'id',
        connectionId: 'connection_id',
    },
}));

const { PATCH } = await import('@/app/api/integrations/sync-runs/[id]/route');

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('integrations/sync-runs/[id] route validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'editor', name: 'User One' });
    });

    it('rejects invalid run id', async () => {
        const response = await PATCH(
            makeJsonRequest('http://localhost/api/integrations/sync-runs/bad', { status: 'success' }),
            { params: Promise.resolve({ id: 'bad' }) },
        );
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid sync run id');
    });
});
