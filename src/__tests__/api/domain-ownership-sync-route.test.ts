import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockRunIntegrationConnectionSync = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockSelectLimit = vi.fn();

mockCreateRateLimiter.mockReturnValue(() => ({
    allowed: true,
    headers: {},
}));

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/rate-limit', () => ({
    createRateLimiter: mockCreateRateLimiter,
    getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/integrations/executor', () => ({
    runIntegrationConnectionSync: mockRunIntegrationConnectionSync,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    orderBy: () => ({
                        limit: mockSelectLimit,
                    }),
                    limit: mockSelectLimit,
                }),
            }),
        }),
    },
    domains: {
        id: 'id',
        domain: 'domain',
        registrar: 'registrar',
        deletedAt: 'deleted_at',
    },
    integrationConnections: {
        id: 'id',
        userId: 'user_id',
        domainId: 'domain_id',
        provider: 'provider',
        status: 'status',
        updatedAt: 'updated_at',
    },
}));

const { POST } = await import('@/app/api/domains/[id]/ownership/sync/route');

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('domain ownership sync route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'expert' });
        mockCreateRateLimiter.mockReturnValue(() => ({
            allowed: true,
            headers: {},
        }));
        mockSelectLimit
            .mockResolvedValueOnce([
                {
                    id: '00000000-0000-4000-8000-000000000001',
                    domain: 'example.com',
                    registrar: 'godaddy',
                },
            ])
            .mockResolvedValueOnce([
                {
                    id: 'conn-1',
                },
            ]);
        mockRunIntegrationConnectionSync.mockResolvedValue({
            run: { id: 'run-1', status: 'success', details: {} },
            connection: { id: 'conn-1', provider: 'godaddy', domainId: '00000000-0000-4000-8000-000000000001', domainName: 'example.com' },
        });
    });

    it('runs registrar sync using matching domain connection', async () => {
        const response = await POST(
            makeJsonRequest(
                'http://localhost/api/domains/00000000-0000-4000-8000-000000000001/ownership/sync',
                {},
            ),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.connectionId).toBe('conn-1');
        expect(mockRunIntegrationConnectionSync).toHaveBeenCalledWith(
            'conn-1',
            { userId: 'user-1', role: 'expert' },
            expect.objectContaining({ runType: 'manual', days: 90 }),
        );
    });

    it('returns 409 when registrar sync is already running', async () => {
        mockRunIntegrationConnectionSync.mockResolvedValue({
            error: 'already_running',
            runId: 'run-abc-123',
        });

        const response = await POST(
            makeJsonRequest(
                'http://localhost/api/domains/00000000-0000-4000-8000-000000000001/ownership/sync',
                {},
            ),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.code).toBe('sync_already_running');
        expect(body.runId).toBe('run-abc-123');
    });
});
