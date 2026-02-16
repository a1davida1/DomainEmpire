import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockUpdateNameservers = vi.fn();
const mockGetZoneNameserverMap = vi.fn();
const mockSelectWhere = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockResolveCloudflareHostShardPlan = vi.fn();
const mockRecordCloudflareHostShardOutcome = vi.fn();

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

vi.mock('@/lib/deploy/godaddy', () => ({
    updateNameservers: mockUpdateNameservers,
}));

vi.mock('@/lib/deploy/cloudflare', () => ({
    getZoneNameserverMap: mockGetZoneNameserverMap,
}));

vi.mock('@/lib/deploy/host-sharding', () => ({
    resolveCloudflareHostShardPlan: mockResolveCloudflareHostShardPlan,
    recordCloudflareHostShardOutcome: mockRecordCloudflareHostShardOutcome,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                leftJoin: () => ({
                    where: mockSelectWhere,
                }),
            }),
        }),
    },
    domains: {
        id: 'id',
        domain: 'domain',
        registrar: 'registrar',
    },
    domainRegistrarProfiles: {
        id: 'id',
        domainId: 'domain_id',
        metadata: 'metadata',
    },
    domainOwnershipEvents: {
        id: 'id',
    },
}));

const { POST } = await import('@/app/api/domains/bulk-nameservers/route');

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('bulk nameserver route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'expert' });
        mockResolveCloudflareHostShardPlan.mockResolvedValue({
            primary: {
                shardKey: 'default',
                strategy: 'default',
                source: 'environment',
                cloudflare: {},
                warnings: [],
            },
            fallbacks: [],
            all: [{
                shardKey: 'default',
                strategy: 'default',
                source: 'environment',
                cloudflare: {},
                warnings: [],
            }],
        });
        mockSelectWhere.mockResolvedValue([
            {
                id: '00000000-0000-4000-8000-000000000001',
                domain: 'example.com',
                registrar: 'godaddy',
                cloudflareAccount: null,
                profileId: 'profile-1',
                profileMetadata: {},
            },
        ]);
        mockGetZoneNameserverMap.mockResolvedValue(new Map([
            ['example.com', {
                zoneId: 'zone-1',
                zoneName: 'example.com',
                nameservers: ['art.ns.cloudflare.com', 'zelda.ns.cloudflare.com'],
            }],
        ]));
        mockUpdateNameservers.mockResolvedValue(undefined);
    });

    it('returns preflight-ready domains without mutating registrar when dryRun=true', async () => {
        const response = await POST(makeJsonRequest('http://localhost/api/domains/bulk-nameservers', {
            domainIds: ['00000000-0000-4000-8000-000000000001'],
            dryRun: true,
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.dryRun).toBe(true);
        expect(body.readyCount).toBe(1);
        expect(body.failedCount).toBe(0);
        expect(body.skippedCount).toBe(0);
        expect(mockUpdateNameservers).not.toHaveBeenCalled();
    });

    it('uses per-domain nameserver overrides without Cloudflare zone lookup', async () => {
        const response = await POST(makeJsonRequest('http://localhost/api/domains/bulk-nameservers', {
            domainIds: ['00000000-0000-4000-8000-000000000001'],
            dryRun: true,
            perDomainNameservers: {
                '00000000-0000-4000-8000-000000000001': [
                    'vera.ns.cloudflare.com',
                    'walt.ns.cloudflare.com',
                ],
            },
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.dryRun).toBe(true);
        expect(body.readyCount).toBe(1);
        expect(body.failedCount).toBe(0);
        expect(body.resolutionMode).toBe('request_domain_map');
        expect(mockGetZoneNameserverMap).not.toHaveBeenCalled();
    });

    it('returns 503 when Cloudflare zone lookup fails', async () => {
        mockGetZoneNameserverMap.mockRejectedValueOnce(new Error('Please wait and consider throttling your request speed'));

        const response = await POST(makeJsonRequest('http://localhost/api/domains/bulk-nameservers', {
            domainIds: ['00000000-0000-4000-8000-000000000001'],
            dryRun: true,
        }));

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.error).toContain('Cloudflare zone lookup failed');
    });
});
