import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockGetAuthUser = vi.fn();
const mockSelectResult = vi.fn();
const mockInsertReturning = vi.fn();
const mockDeleteReturning = vi.fn();

vi.mock('@/lib/auth', () => ({
    getAuthUser: mockGetAuthUser,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => args),
    or: vi.fn((...args: unknown[]) => args),
    ilike: vi.fn((...args: unknown[]) => args),
    sql: Object.assign(vi.fn((...args: unknown[]) => args), {
        join: vi.fn(),
    }),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
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
            where: () => ({
                returning: () => mockDeleteReturning(),
            }),
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
            mockDeleteReturning.mockResolvedValue([]);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(404);
        });

        it('deletes template successfully', async () => {
            mockGetAuthUser.mockResolvedValue({ id: 'u1', role: 'admin' });
            mockDeleteReturning.mockResolvedValue([{ id: TEMPLATE_ID }]);
            const res = await DELETE(makeRequest('http://localhost/api/block-templates', { templateId: TEMPLATE_ID }));
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
        });
    });
});
