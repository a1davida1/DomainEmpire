import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockGetAuthUser = vi.fn();
const mockSelectResult = vi.fn();
const mockInsertReturning = vi.fn();
const mockDeleteResult = vi.fn();
const mockIlike = vi.fn((...args: unknown[]) => args);

vi.mock('@/lib/auth', () => ({
    getAuthUser: mockGetAuthUser,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => args),
    or: vi.fn((...args: unknown[]) => args),
    ilike: (...args: unknown[]) => mockIlike(...args),
    sql: Object.assign(vi.fn((...args: unknown[]) => args), {
        join: vi.fn(),
    }),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                where: () => ({
                    limit: () => mockSelectResult(),
                }),
                $dynamic: () => ({
                    where: () => ({
                        limit: () => mockSelectResult(),
                    }),
                    limit: () => mockSelectResult(),
                }),
            }),
        }),
        insert: () => ({
            values: (vals: unknown) => ({
                returning: () => mockInsertReturning(vals),
            }),
        }),
        delete: () => ({
            where: () => mockDeleteResult(),
        }),
    },
}));

vi.mock('@/lib/db/schema', () => ({
    blockTemplates: {
        id: 'id',
        name: 'name',
        description: 'description',
        blockType: 'block_type',
        tags: 'tags',
        isGlobal: 'is_global',
    },
}));

const { GET, POST, DELETE } = await import('@/app/api/block-templates/route');

const TEMPLATE_ID = '00000000-0000-4000-8000-000000000010';

function makeRequest(url: string, body?: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('block templates API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET', () => {
        it('returns 401 when unauthenticated', async () => {
            mockGetAuthUser.mockResolvedValue(null);
            const res = await GET(makeRequest('http://localhost/api/block-templates'));
            expect(res.status).toBe(401);
        });

        it('returns templates list', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            const templates = [{ id: TEMPLATE_ID, name: 'Hero CTA', blockType: 'Hero' }];
            mockSelectResult.mockResolvedValue(templates);

            const res = await GET(makeRequest('http://localhost/api/block-templates'));
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.templates).toEqual(templates);
        });
    });

    describe('POST', () => {
        it('returns 401 when unauthenticated', async () => {
            mockGetAuthUser.mockResolvedValue(null);
            const res = await POST(makeRequest('http://localhost/api/block-templates', { name: 'Test', blockType: 'Hero' }));
            expect(res.status).toBe(401);
        });

        it('returns 400 when name missing', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            const res = await POST(makeRequest('http://localhost/api/block-templates', { name: '', blockType: 'Hero' }));
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.error).toContain('name');
        });

        it('returns 400 when blockType missing', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            const res = await POST(makeRequest('http://localhost/api/block-templates', { name: 'Test', blockType: '' }));
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.error).toContain('blockType');
        });

        it('creates template successfully', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            const created = { id: TEMPLATE_ID, name: 'Hero CTA', blockType: 'Hero', tags: ['finance'] };
            mockInsertReturning.mockResolvedValue([created]);

            const res = await POST(makeRequest('http://localhost/api/block-templates', {
                name: 'Hero CTA',
                blockType: 'Hero',
                tags: ['finance'],
                config: { layout: 'centered' },
            }));
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.name).toBe('Hero CTA');
        });

        it('filters non-string tags', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            mockInsertReturning.mockResolvedValue([{ id: TEMPLATE_ID }]);

            await POST(makeRequest('http://localhost/api/block-templates', {
                name: 'Test',
                blockType: 'Hero',
                tags: ['valid', 123, null, 'also-valid'],
            }));

            const insertedValues = mockInsertReturning.mock.calls[0][0];
            expect(insertedValues.tags).toEqual(['valid', 'also-valid']);
        });
    });

    describe('POST authorization', () => {
        it('returns 403 when non-admin tries to create global template', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            const res = await POST(makeRequest('http://localhost/api/block-templates', {
                name: 'Global Hero',
                blockType: 'Hero',
                isGlobal: true,
            }));
            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.error).toContain('admin');
        });

        it('allows admin to create global template', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
            mockInsertReturning.mockResolvedValue([{ id: TEMPLATE_ID, name: 'Global', isGlobal: true }]);
            const res = await POST(makeRequest('http://localhost/api/block-templates', {
                name: 'Global',
                blockType: 'Hero',
                isGlobal: true,
            }));
            expect(res.status).toBe(201);
        });
    });

    describe('GET search escaping', () => {
        it('escapes LIKE wildcards in search parameter', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            mockSelectResult.mockResolvedValue([]);
            await GET(makeRequest('http://localhost/api/block-templates?search=100%25_off'));
            const ilikeArgs = mockIlike.mock.calls;
            expect(ilikeArgs.length).toBeGreaterThan(0);
            const pattern = ilikeArgs[0][1] as string;
            expect(pattern).toContain('\\%');
            expect(pattern).toContain('\\_');
        });
    });

    describe('DELETE', () => {
        it('returns 401 when unauthenticated', async () => {
            mockGetAuthUser.mockResolvedValue(null);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(401);
        });

        it('returns 400 for invalid templateId', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: 'bad' }));
            expect(res.status).toBe(400);
        });

        it('returns 404 when template not found', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
            mockSelectResult.mockResolvedValue([]);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(404);
        });

        it('returns 403 when non-owner non-admin tries to delete', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u2', role: 'editor' });
            mockSelectResult.mockResolvedValue([{ id: TEMPLATE_ID, createdBy: 'u1' }]);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(403);
            const body = await res.json();
            expect(body.error).toContain('creator');
        });

        it('allows owner to delete', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'editor' });
            mockSelectResult.mockResolvedValue([{ id: TEMPLATE_ID, createdBy: 'u1' }]);
            mockDeleteResult.mockResolvedValue(undefined);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
        });

        it('allows admin to delete any template', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u2', role: 'admin' });
            mockSelectResult.mockResolvedValue([{ id: TEMPLATE_ID, createdBy: 'u1' }]);
            mockDeleteResult.mockResolvedValue(undefined);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
        });
    });
});
