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
        delete: vi.fn(),
    },
    domains: { id: 'id', domain: 'domain' },
    integrationConnections: {
        id: 'id',
        userId: 'user_id',
        domainId: 'domain_id',
        provider: 'provider',
        category: 'category',
        status: 'status',
        updatedAt: 'updated_at',
        encryptedCredential: 'encrypted_credential',
    },
}));

const { GET, POST, DELETE } = await import('@/app/api/integrations/connections/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
        nextUrl: new URL(url),
    } as unknown as NextRequest;
}

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('integrations/connections route validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'editor', name: 'User One' });
    });

    it('rejects invalid provider filter', async () => {
        const response = await GET(makeGetRequest('http://localhost/api/integrations/connections?provider=bad_provider'));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid provider');
    });

    it('rejects invalid upsert payload', async () => {
        const response = await POST(makeJsonRequest(
            'http://localhost/api/integrations/connections',
            { provider: 'godaddy' },
        ));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid request');
    });

    it('rejects invalid delete id', async () => {
        const response = await DELETE(makeGetRequest('http://localhost/api/integrations/connections?id=not-a-uuid'));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Valid id is required');
    });
});
