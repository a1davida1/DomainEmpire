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
        insert: vi.fn(),
        update: vi.fn(),
    },
    integrationConnections: {
        id: 'id',
        userId: 'user_id',
    },
    integrationSyncRuns: {
        id: 'id',
        connectionId: 'connection_id',
        startedAt: 'started_at',
    },
}));

const { GET, POST } = await import('@/app/api/integrations/sync-runs/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('integrations/sync-runs route validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'editor', name: 'User One' });
    });

    it('rejects invalid connectionId on GET', async () => {
        const response = await GET(makeGetRequest('http://localhost/api/integrations/sync-runs?connectionId=bad'));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('connectionId');
    });

    it('rejects invalid payload on POST', async () => {
        const response = await POST(makeJsonRequest('http://localhost/api/integrations/sync-runs', {
            connectionId: 'bad',
        }));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid request');
    });
});
