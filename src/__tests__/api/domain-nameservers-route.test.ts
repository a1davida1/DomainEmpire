import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockSelectLimit = vi.fn();
const mockUpdateRegistrarNameservers = vi.fn();
const mockGetZoneNameservers = vi.fn();
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

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                leftJoin: () => ({
                    where: () => ({
                        limit: mockSelectLimit,
                    }),
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

vi.mock('@/lib/deploy/registrar', () => ({
    AUTOMATED_NAMESERVER_REGISTRARS: ['godaddy', 'namecheap'],
    isAutomatedNameserverRegistrar: vi.fn(() => true),
    updateRegistrarNameservers: mockUpdateRegistrarNameservers,
}));

vi.mock('@/lib/deploy/cloudflare', () => ({
    getZoneNameservers: mockGetZoneNameservers,
}));

vi.mock('@/lib/deploy/host-sharding', () => ({
    resolveCloudflareHostShardPlan: mockResolveCloudflareHostShardPlan,
    recordCloudflareHostShardOutcome: mockRecordCloudflareHostShardOutcome,
}));

const { POST } = await import('@/app/api/domains/[id]/nameservers/route');

function makeInvalidJsonRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => {
            throw new Error('invalid json');
        },
    } as unknown as NextRequest;
}

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('domain nameservers route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'expert' });
        mockCreateRateLimiter.mockReturnValue(() => ({
            allowed: true,
            headers: {},
        }));
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
        mockSelectLimit.mockResolvedValue([
            {
                id: '00000000-0000-4000-8000-000000000001',
                domain: 'example.com',
                registrar: 'godaddy',
                cloudflareAccount: null,
                profileId: 'profile-1',
                profileMetadata: {},
            },
        ]);
        mockGetZoneNameservers.mockResolvedValue({
            zoneId: 'zone-1',
            zoneName: 'example.com',
            nameservers: ['art.ns.cloudflare.com', 'zelda.ns.cloudflare.com'],
        });
        mockUpdateRegistrarNameservers.mockResolvedValue(undefined);
    });

    it('returns 400 when JSON body is malformed', async () => {
        const response = await POST(
            makeInvalidJsonRequest('http://localhost/api/domains/00000000-0000-4000-8000-000000000001/nameservers'),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Bad Request');
        expect(body.message).toContain('Invalid JSON');
    });

    it('returns a dry-run plan without mutating registrar', async () => {
        const response = await POST(
            makeJsonRequest(
                'http://localhost/api/domains/00000000-0000-4000-8000-000000000001/nameservers',
                { dryRun: true },
            ),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.dryRun).toBe(true);
        expect(body.nameservers).toEqual(['art.ns.cloudflare.com', 'zelda.ns.cloudflare.com']);
        expect(mockUpdateRegistrarNameservers).not.toHaveBeenCalled();
    });

    it('allows namecheap domains for automated cutover flow', async () => {
        mockSelectLimit.mockResolvedValueOnce([
            {
                id: '00000000-0000-4000-8000-000000000001',
                domain: 'example.com',
                registrar: 'namecheap',
                cloudflareAccount: null,
                profileId: 'profile-1',
                profileMetadata: {},
            },
        ]);

        const response = await POST(
            makeJsonRequest(
                'http://localhost/api/domains/00000000-0000-4000-8000-000000000001/nameservers',
                { dryRun: true },
            ),
            { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.dryRun).toBe(true);
        expect(body.nameservers).toEqual(['art.ns.cloudflare.com', 'zelda.ns.cloudflare.com']);
    });
});
