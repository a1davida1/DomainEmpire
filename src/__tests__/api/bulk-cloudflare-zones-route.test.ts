import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockSelectWhere = vi.fn();
const mockGetZoneNameservers = vi.fn();
const mockCreateZone = vi.fn();

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

vi.mock('@/lib/deploy/cloudflare', () => ({
    getZoneNameservers: mockGetZoneNameservers,
    createZone: mockCreateZone,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: mockSelectWhere,
            }),
        }),
    },
    domains: {
        id: 'id',
        domain: 'domain',
    },
}));

const { POST } = await import('@/app/api/domains/bulk-cloudflare-zones/route');

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('bulk cloudflare zones route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'expert' });
        mockSelectWhere.mockResolvedValue([
            {
                id: '00000000-0000-4000-8000-000000000001',
                domain: 'example.com',
            },
        ]);
    });

    it('creates missing zones and returns created metadata', async () => {
        mockGetZoneNameservers.mockResolvedValue(null);
        mockCreateZone.mockResolvedValue({
            success: true,
            zoneId: 'zone-1',
            zoneName: 'example.com',
            nameservers: ['art.ns.cloudflare.com', 'zelda.ns.cloudflare.com'],
            status: 'pending',
        });

        const response = await POST(makeJsonRequest('http://localhost/api/domains/bulk-cloudflare-zones', {
            domainIds: ['00000000-0000-4000-8000-000000000001'],
            jumpStart: false,
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.createdCount).toBe(1);
        expect(body.existingCount).toBe(0);
        expect(body.failedCount).toBe(0);
        expect(mockCreateZone).toHaveBeenCalledWith('example.com', { jumpStart: false });
    });

    it('returns existing when zone lookup resolves before create', async () => {
        mockGetZoneNameservers.mockResolvedValue({
            zoneId: 'zone-existing',
            zoneName: 'example.com',
            nameservers: ['art.ns.cloudflare.com', 'zelda.ns.cloudflare.com'],
        });

        const response = await POST(makeJsonRequest('http://localhost/api/domains/bulk-cloudflare-zones', {
            domainIds: ['00000000-0000-4000-8000-000000000001'],
            jumpStart: false,
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.createdCount).toBe(0);
        expect(body.existingCount).toBe(1);
        expect(body.failedCount).toBe(0);
        expect(mockCreateZone).not.toHaveBeenCalled();
    });
});
