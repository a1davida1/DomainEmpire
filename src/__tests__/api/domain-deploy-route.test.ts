import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockCheckIdempotencyKey = vi.fn();
const mockStoreIdempotencyResult = vi.fn();
const mockEnqueueContentJob = vi.fn();
const mockRunDeployPreflight = vi.fn();
const mockSelectLimit = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/api/idempotency', () => ({
    checkIdempotencyKey: mockCheckIdempotencyKey,
    storeIdempotencyResult: mockStoreIdempotencyResult,
}));

vi.mock('@/lib/queue/content-queue', () => ({
    enqueueContentJob: mockEnqueueContentJob,
}));

vi.mock('@/lib/deploy/preflight', () => ({
    runDeployPreflight: mockRunDeployPreflight,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
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
        isDeployed: 'is_deployed',
        cloudflareProject: 'cloudflare_project',
        lastDeployedAt: 'last_deployed_at',
    },
}));

const { POST } = await import('@/app/api/domains/[id]/deploy/route');

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('domain deploy route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckIdempotencyKey.mockResolvedValue(null);
        mockRequireAuth.mockResolvedValue(null);
        mockRunDeployPreflight.mockResolvedValue({ ok: true, issues: [] });
        mockSelectLimit.mockResolvedValue([
            {
                id: '00000000-0000-4000-8000-000000000001',
                domain: 'example.com',
                registrar: 'godaddy',
            },
        ]);
        mockEnqueueContentJob.mockResolvedValue(undefined);
        mockStoreIdempotencyResult.mockResolvedValue(undefined);
    });

    it('defaults addCustomDomain to false when omitted', async () => {
        const response = await POST(
            makeJsonRequest('http://localhost/api/domains/00000000-0000-4000-8000-000000000001/deploy', {}),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(200);
        expect(mockRunDeployPreflight).toHaveBeenCalledWith(expect.objectContaining({
            domain: 'example.com',
            registrar: 'godaddy',
            addCustomDomain: false,
        }));
        expect(mockEnqueueContentJob).toHaveBeenCalledWith(expect.objectContaining({
            payload: expect.objectContaining({
                triggerBuild: true,
                addCustomDomain: false,
            }),
        }));
    });
});
