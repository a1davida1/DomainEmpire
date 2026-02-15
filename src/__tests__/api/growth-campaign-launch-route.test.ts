import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockEnqueueContentJob = vi.fn();
const mockEvaluateGrowthLaunchFreeze = vi.fn();
const mockEmitGrowthLaunchFreezeIncident = vi.fn();
const mockShouldBlockGrowthLaunchForScope = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();

const mockPromotionCampaignsTable = {
    id: 'id',
    status: 'status',
};

const mockContentQueueTable = {
    id: 'id',
    jobType: 'job_type',
    status: 'status',
    payload: 'payload',
};

const mockPromotionJobsTable = {
    id: 'id',
    campaignId: 'campaign_id',
    jobType: 'job_type',
    status: 'status',
    payload: 'payload',
};

const mockReviewTasksTable = {
    id: 'id',
    taskType: 'task_type',
    entityId: 'entity_id',
    domainResearchId: 'domain_research_id',
    status: 'status',
    reviewedAt: 'reviewed_at',
    createdAt: 'created_at',
    reviewNotes: 'review_notes',
    checklistJson: 'checklist_json',
    createdBy: 'created_by',
};

let campaignRows: Array<Record<string, unknown>> = [];
let queueRows: Array<Record<string, unknown>> = [];
let promotionJobRows: Array<Record<string, unknown>> = [];
let reviewTaskLimitResponses: Array<Array<Record<string, unknown>>> = [];
let createdReviewTaskRows: Array<Record<string, unknown>> = [];
let lastInsertTable: unknown = null;

const sqlMock = ((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: [...strings],
    values,
})) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => unknown) & {
    join: ReturnType<typeof vi.fn>;
};
sqlMock.join = vi.fn((values: unknown[]) => ({ type: 'join', values }));

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/queue/content-queue', () => ({
    enqueueContentJob: mockEnqueueContentJob,
}));

vi.mock('@/lib/growth/launch-freeze', () => ({
    evaluateGrowthLaunchFreeze: mockEvaluateGrowthLaunchFreeze,
    emitGrowthLaunchFreezeIncident: mockEmitGrowthLaunchFreezeIncident,
    shouldBlockGrowthLaunchForScope: mockShouldBlockGrowthLaunchForScope,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
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
            lastInsertTable = args[0];
            return { values: mockValues };
        },
        update: (...args: unknown[]) => {
            mockUpdate(...args);
            return { set: mockSet };
        },
        transaction: async (callback: (tx: {
            execute: (query: unknown) => Promise<unknown>;
            select: (...args: unknown[]) => { from: (table: unknown) => unknown };
            insert: (...args: unknown[]) => { values: typeof mockValues };
            update: (...args: unknown[]) => { set: typeof mockSet };
        }) => Promise<unknown>) => callback({
            execute: async () => undefined,
            select: (...args: unknown[]) => {
                mockSelect(...args);
                return {
                    from: (table: unknown) => {
                        if (table === mockContentQueueTable) {
                            return {
                                where: () => ({
                                    limit: async () => queueRows,
                                }),
                            };
                        }
                        return {
                            where: () => ({
                                limit: async () => [],
                            }),
                        };
                    },
                };
            },
            insert: (...args: unknown[]) => {
                mockInsert(...args);
                lastInsertTable = args[0];
                return { values: mockValues };
            },
            update: (...args: unknown[]) => {
                mockUpdate(...args);
                return { set: mockSet };
            },
        }),
    },
    promotionCampaigns: mockPromotionCampaignsTable,
    contentQueue: mockContentQueueTable,
    promotionJobs: mockPromotionJobsTable,
    reviewTasks: mockReviewTasksTable,
}));

const { POST } = await import('@/app/api/growth/campaigns/[id]/launch/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth campaign launch route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockImplementation((flag: string) => flag !== 'preview_gate_v1');
        mockEnqueueContentJob.mockResolvedValue('queue-job-1');
        mockEvaluateGrowthLaunchFreeze.mockResolvedValue({
            active: false,
            level: 'healthy',
            reasonCodes: [],
            windowSummaries: [],
        });
        mockEmitGrowthLaunchFreezeIncident.mockResolvedValue({
            notificationId: null,
            opsDelivered: false,
            opsReason: null,
        });
        mockShouldBlockGrowthLaunchForScope.mockImplementation((input: { state?: { active?: boolean } }) => {
            return input?.state?.active === true;
        });

        campaignRows = [];
        queueRows = [];
        promotionJobRows = [];
        reviewTaskLimitResponses = [];
        createdReviewTaskRows = [];
        lastInsertTable = null;

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockPromotionCampaignsTable) {
                return {
                    where: () => ({
                        limit: async () => campaignRows,
                    }),
                };
            }

            if (table === mockContentQueueTable) {
                return {
                    where: () => ({
                        limit: async () => queueRows,
                    }),
                };
            }

            if (table === mockReviewTasksTable) {
                return {
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => reviewTaskLimitResponses.shift() ?? [],
                        }),
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
            returning: async () => {
                if (lastInsertTable === mockPromotionJobsTable) {
                    return promotionJobRows;
                }
                if (lastInsertTable === mockReviewTasksTable) {
                    return createdReviewTaskRows;
                }
                return [];
            },
        }));
        mockSet.mockImplementation(() => ({
            where: vi.fn().mockResolvedValue([]),
        }));
    });

    it('returns deduped response when a launch job already exists', async () => {
        campaignRows = [{ id: 'campaign-1', status: 'draft', domainResearchId: null, channels: ['pinterest'] }];
        queueRows = [{ id: 'queue-existing' }];

        const response = await POST(
            makeRequest({}),
            { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) },
        );

        expect(response.status).toBe(202);
        const body = await response.json();
        expect(body.deduped).toBe(true);
        expect(body.jobId).toBe('queue-existing');
        expect(mockEnqueueContentJob).not.toHaveBeenCalled();
    });

    it('queues create_promotion_plan when no existing launch job is present', async () => {
        campaignRows = [{ id: 'campaign-1', status: 'draft', domainResearchId: null, channels: ['pinterest'] }];
        queueRows = [];
        promotionJobRows = [{ id: 'promotion-job-1' }];

        const response = await POST(
            makeRequest({ priority: 4 }),
            { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) },
        );

        expect(response.status).toBe(202);
        const body = await response.json();
        expect(body.queued).toBe(true);
        expect(body.deduped).toBe(false);
        expect(body.jobId).toBe('queue-job-1');
        expect(body.promotionJobId).toBe('promotion-job-1');
        expect(mockEnqueueContentJob).toHaveBeenCalledWith(expect.objectContaining({
            jobType: 'create_promotion_plan',
            status: 'pending',
            priority: 4,
        }), expect.any(Object));
    });

    it('blocks completed campaigns unless force=true', async () => {
        campaignRows = [{ id: 'campaign-1', status: 'completed', domainResearchId: null, channels: ['pinterest'] }];

        const response = await POST(
            makeRequest({}),
            { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) },
        );

        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.error).toContain('completed');
        expect(mockEnqueueContentJob).not.toHaveBeenCalled();
    });

    it('enforces preview gate and creates pending review task when not approved', async () => {
        mockIsFeatureEnabled.mockImplementation((flag: string) => flag === 'growth_channels_v1' || flag === 'preview_gate_v1');
        campaignRows = [{ id: 'campaign-1', status: 'draft', domainResearchId: null, channels: ['pinterest'] }];
        reviewTaskLimitResponses = [
            [], // approved review task lookup
            [], // pending review task lookup
        ];
        createdReviewTaskRows = [{ id: 'review-task-1' }];

        const response = await POST(
            makeRequest({}),
            { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) },
        );

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('review task');
        expect(body.reviewTaskId).toBe('review-task-1');
        expect(mockEnqueueContentJob).not.toHaveBeenCalled();
    });

    it('blocks launch when launch-freeze is active', async () => {
        campaignRows = [{ id: 'campaign-1', status: 'draft', domainResearchId: null, channels: ['pinterest'] }];
        mockEvaluateGrowthLaunchFreeze.mockResolvedValue({
            active: true,
            level: 'critical',
            reasonCodes: ['publish_burn_critical_24h'],
            windowSummaries: [{ windowHours: 24 }],
        });

        const response = await POST(
            makeRequest({}),
            { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) },
        );

        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.error).toContain('temporarily frozen');
        expect(body.freeze?.level).toBe('critical');
        expect(mockEmitGrowthLaunchFreezeIncident).toHaveBeenCalledTimes(1);
        expect(mockEnqueueContentJob).not.toHaveBeenCalled();
    });

    it('allows launch when freeze is active but scope policy does not block this campaign', async () => {
        campaignRows = [{ id: 'campaign-1', status: 'draft', domainResearchId: null, channels: ['pinterest'] }];
        queueRows = [];
        promotionJobRows = [{ id: 'promotion-job-1' }];
        mockEvaluateGrowthLaunchFreeze.mockResolvedValue({
            active: true,
            rawActive: true,
            recoveryHoldActive: false,
            recoveryHealthyWindows: 0,
            recoveryHealthyWindowsRequired: 2,
            level: 'critical',
            reasonCodes: ['publish_burn_critical_24h'],
            windowSummaries: [{ windowHours: 24 }],
        });
        mockShouldBlockGrowthLaunchForScope.mockReturnValue(false);

        const response = await POST(
            makeRequest({}),
            { params: Promise.resolve({ id: '22222222-2222-4222-8222-222222222222' }) },
        );

        expect(response.status).toBe(202);
        expect(mockEmitGrowthLaunchFreezeIncident).not.toHaveBeenCalled();
        expect(mockEnqueueContentJob).toHaveBeenCalled();
    });
});
