import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockGetAuthUser = vi.fn();
const mockSelectWhere = vi.fn();
const mockUpdateSet = vi.fn();
const mockTxUpdateSet = vi.fn();
const mockTxInsertValues = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/auth', () => ({
    getAuthUser: mockGetAuthUser,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: (...args: unknown[]) => ({
                    limit: () => mockSelectWhere(...args),
                }),
            }),
        }),
        update: () => ({
            set: (updates: unknown) => ({
                where: (...args: unknown[]) => mockUpdateSet(updates, ...args),
            }),
        }),
        transaction: mockTransaction,
    },
    pageDefinitions: {
        id: 'id',
        status: 'status',
        isPublished: 'is_published',
        updatedAt: 'updated_at',
        reviewRequestedAt: 'review_requested_at',
        lastReviewedAt: 'last_reviewed_at',
        lastReviewedBy: 'last_reviewed_by',
    },
}));

vi.mock('@/lib/db/schema', () => ({
    reviewEvents: {
        $inferInsert: { eventType: 'string' },
    },
}));

const { POST } = await import('@/app/api/pages/[id]/status/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

describe('POST /api/pages/[id]/status', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
            const tx = {
                update: () => ({
                    set: (updates: unknown) => ({
                        where: (...args: unknown[]) => mockTxUpdateSet(updates, ...args),
                    }),
                }),
                insert: () => ({
                    values: (vals: unknown) => mockTxInsertValues(vals),
                }),
            };
            return fn(tx);
        });
    });

    it('returns 401 when unauthenticated', async () => {
        mockGetAuthUser.mockResolvedValue(null);
        const res = await POST(makeRequest({ status: 'review' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(401);
    });

    it('returns 400 for invalid UUID', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
        const res = await POST(makeRequest({ status: 'review' }), {
            params: Promise.resolve({ id: 'not-a-uuid' }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Invalid');
    });

    it('returns 400 when status is missing', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
        const res = await POST(makeRequest({}), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('status is required');
    });

    it('returns 404 when page not found', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
        mockSelectWhere.mockResolvedValue([]);
        const res = await POST(makeRequest({ status: 'review' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(404);
    });

    it('returns 400 for invalid transition (draft → published)', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
        mockSelectWhere.mockResolvedValue([{ id: VALID_UUID, status: 'draft' }]);
        const res = await POST(makeRequest({ status: 'published' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('Cannot transition');
    });

    it('allows draft → review for editor', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
        mockSelectWhere
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'draft' }])
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'review' }]);
        mockTxUpdateSet.mockResolvedValue(undefined);
        mockTxInsertValues.mockResolvedValue(undefined);

        const res = await POST(makeRequest({ status: 'review' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(200);
        expect(mockTxUpdateSet).toHaveBeenCalledTimes(1);
        const updates = mockTxUpdateSet.mock.calls[0][0];
        expect(updates.status).toBe('review');
        expect(updates.reviewRequestedAt).toBeInstanceOf(Date);
    });

    it('returns 403 when editor tries to approve', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
        mockSelectWhere.mockResolvedValue([{ id: VALID_UUID, status: 'review' }]);
        const res = await POST(makeRequest({ status: 'approved' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(403);
    });

    it('allows review → approved for reviewer', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'reviewer' });
        mockSelectWhere
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'review' }])
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'approved' }]);
        mockTxUpdateSet.mockResolvedValue(undefined);
        mockTxInsertValues.mockResolvedValue(undefined);

        const res = await POST(makeRequest({ status: 'approved' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(200);
        const updates = mockTxUpdateSet.mock.calls[0][0];
        expect(updates.status).toBe('approved');
        expect(updates.lastReviewedAt).toBeInstanceOf(Date);
        expect(updates.lastReviewedBy).toBe('u1');
    });

    it('sets isPublished=true on publish', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
        mockSelectWhere
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'approved' }])
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'published', isPublished: true }]);
        mockTxUpdateSet.mockResolvedValue(undefined);
        mockTxInsertValues.mockResolvedValue(undefined);

        const res = await POST(makeRequest({ status: 'published' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(200);
        const updates = mockTxUpdateSet.mock.calls[0][0];
        expect(updates.isPublished).toBe(true);
    });

    it('sets isPublished=false when reverting to draft', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
        mockSelectWhere
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'published' }])
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'draft', isPublished: false }]);
        mockTxUpdateSet.mockResolvedValue(undefined);
        mockTxInsertValues.mockResolvedValue(undefined);

        const res = await POST(makeRequest({ status: 'draft' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });
        expect(res.status).toBe(200);
        const updates = mockTxUpdateSet.mock.calls[0][0];
        expect(updates.isPublished).toBe(false);
    });

    it('inserts review event in transaction', async () => {
        mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'reviewer' });
        mockSelectWhere
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'review' }])
            .mockResolvedValueOnce([{ id: VALID_UUID, status: 'approved' }]);
        mockTxUpdateSet.mockResolvedValue(undefined);
        mockTxInsertValues.mockResolvedValue(undefined);

        await POST(makeRequest({ status: 'approved', rationale: 'Looks good' }), {
            params: Promise.resolve({ id: VALID_UUID }),
        });

        expect(mockTxInsertValues).toHaveBeenCalledTimes(1);
        const eventValues = mockTxInsertValues.mock.calls[0][0];
        expect(eventValues.actorId).toBe('u1');
        expect(eventValues.eventType).toBe('approved');
        expect(eventValues.rationale).toBe('Looks good');
        expect(eventValues.pageDefinitionId).toBe(VALID_UUID);
        expect(eventValues.articleId).toBeUndefined();
    });
});
