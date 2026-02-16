import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockSelectResult = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDeleteReturning = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => args),
    and: vi.fn((...args: unknown[]) => args),
}));

vi.mock('@/lib/db', () => {
    // Every select chain supports .where().limit() and plain .where() (thenable)
    function makeSelectChain() {
        return {
            from: () => ({
                where: () => {
                    const limitObj = {
                        limit: () => mockSelectResult(),
                        then: (resolve: (v: unknown) => void) => mockSelectResult().then(resolve),
                    };
                    return limitObj;
                },
            }),
        };
    }

    return {
        db: {
            select: makeSelectChain,
            insert: () => ({
                values: (vals: unknown) => ({
                    returning: () => mockInsertReturning(vals),
                }),
            }),
            update: () => ({
                set: (updates: unknown) => ({
                    where: (...args: unknown[]) => mockUpdateWhere(updates, ...args),
                }),
            }),
            delete: () => ({
                where: () => ({
                    returning: () => mockDeleteReturning(),
                }),
            }),
        },
        pageDefinitions: { id: 'id' },
        pageVariants: {
            id: 'id',
            pageId: 'page_id',
            variantKey: 'variant_key',
        },
    };
});

vi.mock('@/lib/db/schema', () => ({
    pageDefinitions: { id: 'id' },
    pageVariants: {
        id: 'id',
        pageId: 'page_id',
        variantKey: 'variant_key',
    },
}));

const { GET, POST, PATCH, DELETE } = await import('@/app/api/pages/[id]/variants/route');

function makeRequest(body?: unknown): NextRequest {
    return {
        headers: new Headers(),
        url: 'http://localhost/api/pages/test/variants',
        json: async () => body,
    } as unknown as NextRequest;
}

const PAGE_ID = '00000000-0000-4000-8000-000000000001';
const VARIANT_ID = '00000000-0000-4000-8000-000000000002';

describe('page variants API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
    });

    describe('GET', () => {
        it('returns 400 for invalid page ID', async () => {
            const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'bad' }) });
            expect(res.status).toBe(400);
        });

        it('returns 404 when page not found', async () => {
            mockSelectResult.mockResolvedValue([]);
            const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(404);
        });

        it('returns variants list', async () => {
            const mockVariants = [{ id: VARIANT_ID, variantKey: 'control', weight: 50 }];
            mockSelectResult
                .mockResolvedValueOnce([{ id: PAGE_ID }])  // page lookup
                .mockResolvedValueOnce(mockVariants);        // variants query

            const res = await GET(makeRequest(), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.variants).toEqual(mockVariants);
        });
    });

    describe('POST', () => {
        it('returns 400 when variantKey missing', async () => {
            mockSelectResult.mockResolvedValue([{ id: PAGE_ID, blocks: [] }]);
            const res = await POST(makeRequest({ variantKey: '' }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(400);
        });

        it('returns 409 for duplicate variant key', async () => {
            mockSelectResult
                .mockResolvedValueOnce([{ id: PAGE_ID, blocks: [] }])  // page lookup
                .mockResolvedValueOnce([{ id: VARIANT_ID }]);           // existing variant
            const res = await POST(makeRequest({ variantKey: 'control' }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(409);
        });

        it('creates variant with default weight', async () => {
            mockSelectResult
                .mockResolvedValueOnce([{ id: PAGE_ID, blocks: [{ id: 'b1', type: 'Hero' }] }])
                .mockResolvedValueOnce([]);
            const created = { id: VARIANT_ID, variantKey: 'test-b', weight: 50 };
            mockInsertReturning.mockResolvedValue([created]);

            const res = await POST(makeRequest({ variantKey: 'test-b' }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.variantKey).toBe('test-b');
        });
    });

    describe('PATCH', () => {
        it('returns 400 when variantId missing', async () => {
            const res = await PATCH(makeRequest({}), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(400);
        });

        it('returns 404 when variant not found', async () => {
            mockSelectResult.mockResolvedValue([]);
            const res = await PATCH(makeRequest({ variantId: VARIANT_ID }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(404);
        });

        it('updates weight and returns updated variant', async () => {
            mockSelectResult
                .mockResolvedValueOnce([{ id: VARIANT_ID, pageId: PAGE_ID, weight: 50 }])
                .mockResolvedValueOnce([{ id: VARIANT_ID, pageId: PAGE_ID, weight: 70 }]);
            mockUpdateWhere.mockResolvedValue(undefined);

            const res = await PATCH(makeRequest({ variantId: VARIANT_ID, weight: 70 }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(200);
            expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
            const updates = mockUpdateWhere.mock.calls[0][0];
            expect(updates.weight).toBe(70);
        });

        it('clamps weight to 0-100', async () => {
            mockSelectResult
                .mockResolvedValueOnce([{ id: VARIANT_ID, pageId: PAGE_ID, weight: 50 }])
                .mockResolvedValueOnce([{ id: VARIANT_ID, pageId: PAGE_ID, weight: 100 }]);
            mockUpdateWhere.mockResolvedValue(undefined);

            await PATCH(makeRequest({ variantId: VARIANT_ID, weight: 999 }), { params: Promise.resolve({ id: PAGE_ID }) });
            const updates = mockUpdateWhere.mock.calls[0][0];
            expect(updates.weight).toBe(100);
        });
    });

    describe('DELETE', () => {
        it('returns 400 when variantId missing', async () => {
            const res = await DELETE(makeRequest({}), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(400);
        });

        it('returns 404 when variant not found', async () => {
            mockDeleteReturning.mockResolvedValue([]);
            const res = await DELETE(makeRequest({ variantId: VARIANT_ID }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(404);
        });

        it('deletes variant successfully', async () => {
            mockDeleteReturning.mockResolvedValue([{ id: VARIANT_ID }]);
            const res = await DELETE(makeRequest({ variantId: VARIANT_ID }), { params: Promise.resolve({ id: PAGE_ID }) });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
            expect(body.deleted).toBe(VARIANT_ID);
        });
    });
});
