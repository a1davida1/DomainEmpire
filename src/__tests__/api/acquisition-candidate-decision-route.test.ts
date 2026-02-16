import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockRequeueContentJobIds = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/queue/content-queue', () => ({
    requeueContentJobIds: mockRequeueContentJobIds,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
    sql: Object.assign(
        (...args: unknown[]) => ({ type: 'sql', args }),
        { join: vi.fn((values: unknown[]) => ({ type: 'join', values })) },
    ),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
        update: (...args: unknown[]) => {
            mockUpdate(...args);
            return { set: mockSet };
        },
        insert: (...args: unknown[]) => {
            mockInsert(...args);
            return { values: mockValues };
        },
        transaction: async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
            const tx = {
                select: (...args: unknown[]) => {
                    mockSelect(...args);
                    return { from: mockFrom };
                },
                update: (...args: unknown[]) => {
                    mockUpdate(...args);
                    return { set: mockSet };
                },
                insert: (...args: unknown[]) => {
                    mockInsert(...args);
                    return { values: mockValues };
                },
                execute: vi.fn().mockResolvedValue([]),
            };
            await fn(tx);
        },
    },
    domainResearch: {
        id: 'id',
        domain: 'domain',
        decision: 'decision',
        hardFailReason: 'hard_fail_reason',
        recommendedMaxBid: 'recommended_max_bid',
        decisionReason: 'decision_reason',
    },
    acquisitionEvents: {
        id: 'id',
        domainResearchId: 'domain_research_id',
        eventType: 'event_type',
        createdBy: 'created_by',
        payload: 'payload',
    },
    contentQueue: {
        id: 'id',
        jobType: 'job_type',
        status: 'status',
        payload: 'payload',
    },
    reviewTasks: {
        id: 'id',
        taskType: 'task_type',
        entityId: 'entity_id',
        domainId: 'domain_id',
        domainResearchId: 'domain_research_id',
        status: 'status',
        checklistJson: 'checklist_json',
        reviewerId: 'reviewer_id',
        reviewedAt: 'reviewed_at',
        reviewNotes: 'review_notes',
        createdBy: 'created_by',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
}));

const { POST } = await import('@/app/api/acquisition/candidates/[id]/decision/route');

function makeRequest(body: unknown): NextRequest {
    return {
        json: async () => body,
        headers: new Headers(),
    } as unknown as NextRequest;
}

describe('acquisition candidate decision route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'reviewer-1', role: 'reviewer', name: 'Reviewer' });

        mockLimit.mockResolvedValue([]);
        mockWhere.mockReturnValue({
            limit: mockLimit,
            orderBy: () => ({ limit: mockLimit }),
        });
        mockFrom.mockReturnValue({ where: mockWhere });

        mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
        mockValues.mockResolvedValue([]);
        mockRequeueContentJobIds.mockResolvedValue(undefined);
    });

    it('returns auth error from requireRole', async () => {
        mockRequireRole.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));

        const response = await POST(makeRequest({
            decision: 'watchlist',
            decisionReason: 'Needs more data before approval',
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(403);
    });

    it('returns 404 when candidate does not exist', async () => {
        mockLimit.mockResolvedValueOnce([]);

        const response = await POST(makeRequest({
            decision: 'watchlist',
            decisionReason: 'Needs more data before approval',
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('not found');
    });

    it('blocks non-admin hard-fail clearing', async () => {
        mockLimit.mockResolvedValueOnce([{
            id: 'research-1',
            domain: 'alpha.com',
            decision: 'pass',
            hardFailReason: 'Hard fail: trademark risk exceeds threshold',
            recommendedMaxBid: 0,
        }]);

        const response = await POST(makeRequest({
            decision: 'pass',
            decisionReason: 'Still not viable',
            clearHardFail: true,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('Only admins');
    });

    it('blocks buy decision when hard fail is active', async () => {
        mockLimit.mockResolvedValueOnce([{
            id: 'research-1',
            domain: 'alpha.com',
            decision: 'pass',
            hardFailReason: 'Hard fail: backlink toxicity exceeds threshold',
            recommendedMaxBid: 25,
        }]);

        const response = await POST(makeRequest({
            decision: 'buy',
            decisionReason: 'Proceeding anyway',
            recommendedMaxBid: 25,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('hard-fail');
    });

    it('accepts buy decision, logs event, and queues bid plan', async () => {
        mockLimit
            .mockResolvedValueOnce([{
                id: 'research-1',
                domain: 'alpha.com',
                domainId: null,
                decision: 'watchlist',
                hardFailReason: null,
                recommendedMaxBid: 40,
            }])
            .mockResolvedValueOnce([]) // no existing review task
            .mockResolvedValueOnce([]); // no existing create_bid_plan pending

        const response = await POST(makeRequest({
            decision: 'buy',
            decisionReason: 'Manual reviewer approval after recheck',
            recommendedMaxBid: 45,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.bidPlanQueued).toBe(true);
        expect(body.reviewTaskStatus).toBe('approved');
        expect(mockRequeueContentJobIds).toHaveBeenCalledTimes(1);
        expect(mockRequeueContentJobIds).toHaveBeenCalledWith([expect.any(String)]);
        expect(mockInsert).toHaveBeenCalled();
    });
});
