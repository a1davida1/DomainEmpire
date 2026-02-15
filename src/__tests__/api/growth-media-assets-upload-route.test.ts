import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockStoreGrowthMedia = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockTransaction = vi.fn();

const mockMediaAssetsTable = {
    id: 'id',
    url: 'url',
    userId: 'user_id',
};

let insertedRows: Array<Record<string, unknown>> = [];
let existingRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/media-storage', () => ({
    storeGrowthMedia: mockStoreGrowthMedia,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        insert: (...args: unknown[]) => {
            mockInsert(...args);
            return { values: mockValues };
        },
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
        transaction: (...args: unknown[]) => mockTransaction(...args),
    },
    mediaAssets: mockMediaAssetsTable,
}));

const { POST } = await import('@/app/api/growth/media-assets/upload/route');

function makeRequest(formData: FormData): NextRequest {
    return {
        headers: new Headers(),
        formData: async () => formData,
    } as unknown as NextRequest;
}

function makeBaseFormData(): FormData {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array([1, 2, 3])], 'asset.png', { type: 'image/png' }));
    formData.append('type', 'image');
    formData.append('folder', 'inbox');
    formData.append('tags', 'promo, pin');
    return formData;
}

describe('growth media-asset upload route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockStoreGrowthMedia.mockResolvedValue({
            provider: 'local',
            key: 'user-1/image/2026/02/14/abc.png',
            url: '/uploads/growth/user-1/image/2026/02/14/abc.png',
            bytes: 3,
            contentType: 'image/png',
            etag: 'deadbeef',
        });

        insertedRows = [];
        existingRows = [];

        mockValues.mockImplementation(() => ({
            onConflictDoNothing: () => ({
                returning: async () => insertedRows,
            }),
            returning: async () => insertedRows,
        }));

        mockFrom.mockImplementation(() => ({
            where: () => ({
                limit: async () => existingRows,
            }),
        }));

        mockTransaction.mockImplementation(async (callback: (tx: {
            insert: (...args: unknown[]) => { values: (...args: unknown[]) => { onConflictDoNothing: () => { returning: () => Promise<Array<Record<string, unknown>>> } } };
            select: (...args: unknown[]) => { from: (...args: unknown[]) => { where: () => { limit: () => Promise<Array<Record<string, unknown>>> } } };
        }) => Promise<{ created: boolean; asset: Record<string, unknown> | null }>) => callback({
            insert: (...args: unknown[]) => {
                mockInsert(...args);
                return { values: mockValues };
            },
            select: (...args: unknown[]) => {
                mockSelect(...args);
                return { from: mockFrom };
            },
        }));
    });

    it('returns 400 when file is missing', async () => {
        const response = await POST(makeRequest(new FormData()));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('file');
    });

    it('uploads file and creates asset', async () => {
        insertedRows = [{
            id: 'asset-1',
            url: '/uploads/growth/user-1/image/2026/02/14/abc.png',
            type: 'image',
            folder: 'inbox',
        }];

        const response = await POST(makeRequest(makeBaseFormData()));
        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.created).toBe(true);
        expect(body.asset.id).toBe('asset-1');
        expect(body.storage.provider).toBe('local');
        expect(mockStoreGrowthMedia).toHaveBeenCalled();
    });

    it('deduplicates existing asset by URL', async () => {
        insertedRows = [];
        existingRows = [{
            id: 'asset-existing',
            url: '/uploads/growth/user-1/image/2026/02/14/abc.png',
            type: 'image',
        }];

        const response = await POST(makeRequest(makeBaseFormData()));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.created).toBe(false);
        expect(body.asset.id).toBe('asset-existing');
    });
});
