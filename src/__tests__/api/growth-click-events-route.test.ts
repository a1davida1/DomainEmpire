import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelectFrom = vi.fn();
const mockGetClientIp = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockEvaluateClickIntegrity = vi.fn();
const mockCreateNotification = vi.fn();

const mockClickEventsTable = {
    id: 'id',
    campaignId: 'campaign_id',
    occurredAt: 'occurred_at',
    ipHash: 'ip_hash',
    visitorId: 'visitor_id',
};

const mockDomainResearchTable = { id: 'id', domain: 'domain', domainId: 'domain_id' };
const mockPromotionCampaignsTable = { id: 'id', domainResearchId: 'domain_research_id' };

let insertedRows: Array<Record<string, unknown>> = [];
let limiterResponse: { allowed: boolean; headers: Record<string, string> } = { allowed: true, headers: {} };

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
    sql: vi.fn(() => 'sql'),
}));

vi.mock('@/lib/db', () => ({
    db: {
        insert: (...args: unknown[]) => {
            mockInsert(...args);
            return { values: mockValues };
        },
        select: () => ({
            from: (...args: unknown[]) => {
                mockSelectFrom(...args);
                return {
                    where: async () => [{ count: 0 }],
                    innerJoin: () => ({
                        where: () => ({
                            limit: async () => [],
                        }),
                    }),
                };
            },
        }),
    },
    clickEvents: mockClickEventsTable,
    domainResearch: mockDomainResearchTable,
    promotionCampaigns: mockPromotionCampaignsTable,
}));

vi.mock('@/lib/rate-limit', () => ({
    createRateLimiter: mockCreateRateLimiter,
    getClientIp: mockGetClientIp,
}));

vi.mock('@/lib/growth/click-integrity', () => ({
    evaluateClickIntegrity: mockEvaluateClickIntegrity,
}));

vi.mock('@/lib/notifications', () => ({
    createNotification: mockCreateNotification,
}));

mockCreateRateLimiter.mockImplementation(() => () => limiterResponse);
mockGetClientIp.mockReturnValue('127.0.0.1');
mockEvaluateClickIntegrity.mockReturnValue({ riskScore: 0, severity: 'low', signals: [] });
mockCreateNotification.mockResolvedValue(undefined);

const { POST } = await import('@/app/api/growth/click-events/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth click-events route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        limiterResponse = { allowed: true, headers: {} };
        insertedRows = [];
        mockCreateRateLimiter.mockImplementation(() => () => limiterResponse);
        mockGetClientIp.mockReturnValue('127.0.0.1');
        mockEvaluateClickIntegrity.mockReturnValue({ riskScore: 0, severity: 'low', signals: [] });
        mockCreateNotification.mockResolvedValue(undefined);
        mockValues.mockImplementation(() => ({
            returning: async () => insertedRows,
        }));
    });

    it('captures click event and derives UTM values from fullUrl', async () => {
        insertedRows = [{
            id: 'click-1',
            campaignId: '33333333-3333-4333-8333-333333333333',
        }];

        const response = await POST(makeRequest({
            fullUrl: 'https://example.com/?utm_source=pinterest&utm_medium=pin&utm_campaign=33333333-3333-4333-8333-333333333333&utm_content=v1',
            visitorId: 'visitor-1',
        }));

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.clickId).toBe('click-1');
        expect(body.campaignId).toBe('33333333-3333-4333-8333-333333333333');
        expect(mockInsert).toHaveBeenCalled();
    });

    it('returns 400 on invalid payload', async () => {
        const response = await POST(makeRequest({
            fullUrl: 'not-a-url',
        }));

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Invalid input');
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('returns 429 when rate limiter blocks request', async () => {
        limiterResponse = {
            allowed: false,
            headers: { 'Retry-After': '60' },
        };

        const response = await POST(makeRequest({
            fullUrl: 'https://example.com/?utm_source=youtube',
        }));

        expect(response.status).toBe(429);
        const body = await response.json();
        expect(body.error).toContain('Too many requests');
        expect(mockInsert).not.toHaveBeenCalled();
    });
});
