import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

const mockPromotionCampaignsTable = {
    id: 'id',
    domainResearchId: 'domain_research_id',
    channels: 'channels',
    budget: 'budget',
    status: 'status',
    dailyCap: 'daily_cap',
    metrics: 'metrics',
    createdAt: 'created_at',
};

const mockDomainResearchTable = {
    id: 'id',
    domain: 'domain',
    decision: 'decision',
    decisionReason: 'decision_reason',
};

let campaignRows: Array<Record<string, unknown>> = [];
let researchRows: Array<Record<string, unknown>> = [];
let createdCampaign: Record<string, unknown> | null = null;

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
        insert: (...args: unknown[]) => {
            mockInsert(...args);
            return { values: mockValues };
        },
    },
    domainResearch: mockDomainResearchTable,
    promotionCampaigns: mockPromotionCampaignsTable,
}));

const { GET, POST } = await import('@/app/api/growth/campaigns/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
        url: 'http://localhost/api/growth/campaigns',
    } as unknown as NextRequest;
}

describe('growth/campaigns route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);

        campaignRows = [];
        researchRows = [];
        createdCampaign = null;

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockPromotionCampaignsTable) {
                return {
                    where: () => ({
                        orderBy: () => ({
                            limit: () => ({
                                offset: async () => campaignRows,
                            }),
                        }),
                    }),
                    orderBy: () => ({
                        limit: () => ({
                            offset: async () => campaignRows,
                        }),
                    }),
                };
            }

            if (table === mockDomainResearchTable) {
                return {
                    where: () => ({
                        limit: async () => researchRows,
                    }),
                };
            }

            return {
                where: () => ({
                    limit: () => ({
                        offset: async () => [],
                    }),
                }),
                orderBy: () => ({
                    limit: () => ({
                        offset: async () => [],
                    }),
                }),
            };
        });

        mockValues.mockImplementation(() => ({
            returning: async () => (createdCampaign ? [createdCampaign] : []),
        }));
    });

    it('returns 403 when growth flag is disabled', async () => {
        mockIsFeatureEnabled.mockReturnValueOnce(false);

        const response = await GET(makeGetRequest('http://localhost/api/growth/campaigns'));
        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('disabled');
    });

    it('returns campaigns list', async () => {
        campaignRows = [
            {
                id: 'campaign-1',
                domainResearchId: 'research-1',
                channels: ['pinterest'],
                budget: 25,
                status: 'draft',
                dailyCap: 2,
            },
        ];

        const response = await GET(makeGetRequest('http://localhost/api/growth/campaigns?limit=5'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.count).toBe(1);
        expect(body.campaigns[0].id).toBe('campaign-1');
    });

    it('creates a campaign for a valid domainResearchId', async () => {
        researchRows = [
            { id: 'research-1', domain: 'alpha.com' },
        ];
        createdCampaign = {
            id: 'campaign-1',
            domainResearchId: 'research-1',
            channels: ['pinterest', 'youtube_shorts'],
            budget: 40,
            status: 'draft',
            dailyCap: 3,
            metrics: {},
        };

        const response = await POST(makePostRequest({
            domainResearchId: '11111111-1111-4111-8111-111111111111',
            channels: ['pinterest', 'youtube_shorts'],
            budget: 40,
            dailyCap: 3,
        }));

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.campaign.id).toBe('campaign-1');
        expect(mockInsert).toHaveBeenCalled();
    });

    it('returns 404 when domain research does not exist', async () => {
        researchRows = [];

        const response = await POST(makePostRequest({
            domainResearchId: '11111111-1111-4111-8111-111111111111',
            channels: ['pinterest'],
        }));

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('not found');
    });
});
