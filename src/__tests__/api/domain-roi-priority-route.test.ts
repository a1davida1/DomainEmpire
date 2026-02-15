import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockGetDomainRoiPriorities = vi.fn();

mockCreateRateLimiter.mockReturnValue(() => ({
    allowed: true,
    headers: {},
}));

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
}));

vi.mock('@/lib/rate-limit', () => ({
    createRateLimiter: mockCreateRateLimiter,
    getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/domain/roi-priority-service', () => ({
    getDomainRoiPriorities: mockGetDomainRoiPriorities,
}));

const { GET } = await import('@/app/api/domains/priorities/roi/route');

function makeRequest(url: string): NextRequest {
    return {
        headers: new Headers({ 'x-user-id': 'user-1' }),
        url,
        nextUrl: new URL(url),
    } as unknown as NextRequest;
}

describe('domain roi priorities route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetDomainRoiPriorities.mockResolvedValue({
            windowDays: 14,
            count: 1,
            actionCounts: { scale: 1 },
            priorities: [
                {
                    domainId: 'domain-1',
                    domain: 'example.com',
                    lifecycleState: 'growth',
                    status: 'active',
                    updatedAt: new Date('2026-02-15T00:00:00.000Z'),
                    score: 82,
                    action: 'scale',
                    reasons: ['Positive net in last 30 days'],
                    revenue30d: 350,
                    cost30d: 120,
                    net30d: 230,
                    roiPct: 191.67,
                    pageviews30d: 4200,
                    clicks30d: 180,
                    ctrPct: 4.29,
                },
            ],
            generatedAt: '2026-02-15T12:00:00.000Z',
        });
    });

    it('returns ROI priorities using parsed limit/windowDays', async () => {
        const response = await GET(
            makeRequest('http://localhost/api/domains/priorities/roi?limit=25&windowDays=14'),
        );

        expect(response.status).toBe(200);
        expect(mockGetDomainRoiPriorities).toHaveBeenCalledWith({
            limit: 25,
            windowDays: 14,
        });

        const body = await response.json();
        expect(body.count).toBe(1);
        expect(body.actionCounts).toEqual({ scale: 1 });
        expect(body.priorities[0].domain).toBe('example.com');
    });
});
