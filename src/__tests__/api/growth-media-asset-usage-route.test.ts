import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhereUpdate = vi.fn();

const mockMediaAssetsTable = { id: 'id', usageCount: 'usage_count' };
const mockMediaAssetUsageTable = { id: 'id' };
const mockPromotionCampaignsTable = { id: 'id' };
const mockPromotionJobsTable = { id: 'id', campaignId: 'campaign_id' };

let assetRows: Array<Record<string, unknown>> = [];
let campaignRows: Array<Record<string, unknown>> = [];
let promotionJobRows: Array<Record<string, unknown>> = [];
let usageRows: Array<Record<string, unknown>> = [];
let usageCountRows: Array<Record<string, unknown>> = [];

const sqlMock = ((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: [...strings],
    values,
})) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => unknown);

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    sql: sqlMock,
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
        update: (...args: unknown[]) => {
            mockUpdate(...args);
            return { set: mockSet };
        },
    },
    mediaAssets: mockMediaAssetsTable,
    mediaAssetUsage: mockMediaAssetUsageTable,
    promotionCampaigns: mockPromotionCampaignsTable,
    promotionJobs: mockPromotionJobsTable,
}));

const { POST } = await import('@/app/api/growth/media-assets/[id]/usage/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth media-asset usage route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);

        assetRows = [];
        campaignRows = [];
        promotionJobRows = [];
        usageRows = [];
        usageCountRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockMediaAssetsTable) {
                return {
                    where: () => ({
                        limit: async () => assetRows,
                    }),
                };
            }
            if (table === mockPromotionCampaignsTable) {
                return {
                    where: () => ({
                        limit: async () => campaignRows,
                    }),
                };
            }
            if (table === mockPromotionJobsTable) {
                return {
                    where: () => ({
                        limit: async () => promotionJobRows,
                    }),
                };
            }
            return {
                where: () => ({
                    limit: async () => [],
                }),
            };
        });

        mockValues.mockImplementation(() => ({
            returning: async () => usageRows,
        }));
        mockWhereUpdate.mockImplementation(() => ({
            returning: async () => usageCountRows,
        }));
        mockSet.mockImplementation(() => ({
            where: mockWhereUpdate,
        }));
    });

    it('tracks usage and increments usage_count', async () => {
        assetRows = [{ id: 'asset-1' }];
        campaignRows = [{ id: 'campaign-1' }];
        usageRows = [{ id: 'usage-1' }];
        usageCountRows = [{ usageCount: 7 }];

        const response = await POST(
            makeRequest({ campaignId: '66666666-6666-4666-8666-666666666666' }),
            { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) },
        );

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.usageId).toBe('usage-1');
        expect(body.usageCount).toBe(7);
    });

    it('returns 404 when campaign is missing', async () => {
        assetRows = [{ id: 'asset-1' }];
        campaignRows = [];

        const response = await POST(
            makeRequest({ campaignId: '66666666-6666-4666-8666-666666666666' }),
            { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) },
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('Campaign not found');
    });

    it('returns 404 when job does not belong to campaign', async () => {
        assetRows = [{ id: 'asset-1' }];
        campaignRows = [{ id: 'campaign-1' }];
        promotionJobRows = [];

        const response = await POST(
            makeRequest({
                campaignId: '66666666-6666-4666-8666-666666666666',
                jobId: '77777777-7777-4777-8777-777777777777',
            }),
            { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) },
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('Promotion job');
    });
});
