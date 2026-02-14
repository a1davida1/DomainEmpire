import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockPurchaseDomain = vi.fn();
const mockCheckAvailability = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/domain/purchase', () => ({
    purchaseDomain: mockPurchaseDomain,
    checkAvailability: mockCheckAvailability,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn().mockReturnValue({ type: 'and' }),
    desc: vi.fn().mockReturnValue({ type: 'desc' }),
    eq: vi.fn().mockReturnValue({ type: 'eq' }),
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
    domainResearch: {
        id: 'id',
        domain: 'domain',
        decision: 'decision',
        decisionReason: 'decision_reason',
        hardFailReason: 'hard_fail_reason',
        recommendedMaxBid: 'recommended_max_bid',
    },
    acquisitionEvents: {
        domainResearchId: 'domain_research_id',
        eventType: 'event_type',
        createdBy: 'created_by',
        payload: 'payload',
    },
    reviewTasks: {
        id: 'id',
        taskType: 'task_type',
        domainResearchId: 'domain_research_id',
        status: 'status',
        reviewerId: 'reviewer_id',
        reviewedAt: 'reviewed_at',
    },
}));

const { POST } = await import('@/app/api/domains/[id]/purchase/route');

function makeRequest(body: unknown): NextRequest {
    return {
        json: async () => body,
        headers: new Headers(),
    } as unknown as NextRequest;
}

describe('domains/[id]/purchase route', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'reviewer', name: 'Reviewer 1' });

        mockLimit.mockResolvedValue([]);
        mockWhere.mockReturnValue({
            limit: mockLimit,
            orderBy: () => ({ limit: mockLimit }),
        });
        mockFrom.mockReturnValue({ where: mockWhere });

        mockValues.mockResolvedValue([]);

        mockPurchaseDomain.mockResolvedValue({
            success: true,
            domain: 'alpha.com',
            price: 18,
            currency: 'USD',
            orderId: 'gd-order-1',
        });
    });

    it('returns 404 when domain research record is missing', async () => {
        mockLimit.mockResolvedValueOnce([]);

        const response = await POST(makeRequest({
            domain: 'alpha.com',
            confirmed: true,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('not found');
        expect(mockPurchaseDomain).not.toHaveBeenCalled();
    });

    it('blocks purchase when underwriting decision is not buy', async () => {
        mockLimit.mockResolvedValueOnce([{
            id: 'research-1',
            domain: 'alpha.com',
            decision: 'watchlist',
            decisionReason: 'Watchlist pending better comps',
            hardFailReason: null,
            recommendedMaxBid: 25,
        }]);

        const response = await POST(makeRequest({
            domain: 'alpha.com',
            confirmed: true,
            maxPrice: 20,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('underwriting gate');
        expect(body.details[0]).toContain('watchlist');
        expect(mockPurchaseDomain).not.toHaveBeenCalled();
    });

    it('rejects override requests from non-admin users', async () => {
        mockLimit.mockResolvedValueOnce([{
            id: 'research-1',
            domain: 'alpha.com',
            decision: 'pass',
            decisionReason: 'Pass due to low confidence',
            hardFailReason: 'Hard fail: backlink toxicity exceeds threshold',
            recommendedMaxBid: 0,
        }]);

        const response = await POST(makeRequest({
            domain: 'alpha.com',
            confirmed: true,
            overrideUnderwriting: true,
            overrideReason: 'Manual exception requested',
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('Only admins');
        expect(mockPurchaseDomain).not.toHaveBeenCalled();
    });

    it('uses recommendedMaxBid as maxPrice and records bought event', async () => {
        mockLimit
            .mockResolvedValueOnce([{
                id: 'research-1',
                domain: 'alpha.com',
                decision: 'buy',
                decisionReason: 'Approved by underwriting',
                hardFailReason: null,
                recommendedMaxBid: 42,
            }])
            .mockResolvedValueOnce([{
                id: 'task-1',
                reviewerId: 'reviewer-1',
                reviewedAt: new Date('2026-02-14T01:00:00.000Z'),
            }]);

        const response = await POST(makeRequest({
            domain: 'alpha.com',
            confirmed: true,
            period: 1,
            privacy: true,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(201);
        expect(mockPurchaseDomain).toHaveBeenCalledWith('alpha.com', expect.objectContaining({
            maxPrice: 42,
            confirmed: true,
            period: 1,
            privacy: true,
        }));
        expect(mockInsert).toHaveBeenCalled();
        expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
            eventType: 'bought',
            domainResearchId: 'research-1',
        }));
    });

    it('allows admin override with reason', async () => {
        mockGetRequestUser.mockReturnValueOnce({ id: 'admin-1', role: 'admin', name: 'Admin' });
        mockLimit
            .mockResolvedValueOnce([{
                id: 'research-1',
                domain: 'alpha.com',
                decision: 'pass',
                decisionReason: 'Pass due to low comps',
                hardFailReason: 'Hard fail: trademark risk exceeds threshold',
                recommendedMaxBid: 10,
            }])
            .mockResolvedValueOnce([]);

        const response = await POST(makeRequest({
            domain: 'alpha.com',
            confirmed: true,
            maxPrice: 8,
            overrideUnderwriting: true,
            overrideReason: 'Reviewed legal context, proceeding with test buy',
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(201);
        expect(mockPurchaseDomain).toHaveBeenCalled();
        expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({
            payload: expect.objectContaining({
                overrideUnderwriting: true,
                overrideReason: 'Reviewed legal context, proceeding with test buy',
                purchaseByRole: 'admin',
            }),
        }));
    });

    it('blocks purchase when no approved domain_buy review task exists', async () => {
        mockLimit
            .mockResolvedValueOnce([{
                id: 'research-1',
                domain: 'alpha.com',
                decision: 'buy',
                decisionReason: 'Approved by underwriting',
                hardFailReason: null,
                recommendedMaxBid: 40,
            }])
            .mockResolvedValueOnce([]);

        const response = await POST(makeRequest({
            domain: 'alpha.com',
            confirmed: true,
        }), { params: Promise.resolve({ id: 'research-1' }) });

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('review task');
        expect(mockPurchaseDomain).not.toHaveBeenCalled();
    });
});
