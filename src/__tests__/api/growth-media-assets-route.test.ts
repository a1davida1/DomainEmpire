import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

const mockMediaAssetsTable = {
    id: 'id',
    url: 'url',
};

let existingRows: Array<Record<string, unknown>> = [];
let insertedRows: Array<Record<string, unknown>> = [];

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
    asc: vi.fn((arg: unknown) => ({ type: 'asc', arg })),
    count: vi.fn(() => ({ type: 'count' })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
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
    },
    mediaAssets: mockMediaAssetsTable,
}));

const { GET, POST } = await import('@/app/api/growth/media-assets/route');

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
        url: 'http://localhost/api/growth/media-assets',
    } as unknown as NextRequest;
}

describe('growth media-assets route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        existingRows = [];
        insertedRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockMediaAssetsTable) {
                return {
                    where: () => ({
                        limit: async () => existingRows,
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
            returning: async () => insertedRows,
        }));
    });

    it('returns 403 when growth feature is disabled', async () => {
        mockIsFeatureEnabled.mockReturnValueOnce(false);
        const response = await GET(makeGetRequest('http://localhost/api/growth/media-assets'));
        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('disabled');
    });

    it('deduplicates by URL on create', async () => {
        existingRows = [{
            id: 'asset-1',
            url: 'https://cdn.example.com/a.jpg',
            type: 'image',
        }];

        const response = await POST(makePostRequest({
            type: 'image',
            url: 'https://cdn.example.com/a.jpg',
            dedupeByUrl: true,
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.created).toBe(false);
        expect(body.asset.id).toBe('asset-1');
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('creates asset when URL is new', async () => {
        existingRows = [];
        insertedRows = [{
            id: 'asset-2',
            type: 'video',
            url: 'https://cdn.example.com/a.mp4',
            folder: 'inbox',
        }];

        const response = await POST(makePostRequest({
            type: 'video',
            url: 'https://cdn.example.com/a.mp4',
            tags: ['promo'],
        }));

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.created).toBe(true);
        expect(body.asset.id).toBe('asset-2');
        expect(mockInsert).toHaveBeenCalled();
    });
});
