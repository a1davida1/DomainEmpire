import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockWhere = vi.fn();
const mockWhereDelete = vi.fn();

const mockMediaAssetsTable = {
    id: 'id',
};

let updatedRows: Array<Record<string, unknown>> = [];
let deletedRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        update: (...args: unknown[]) => {
            mockUpdate(...args);
            return { set: mockSet };
        },
        delete: (...args: unknown[]) => {
            mockDelete(...args);
            return { where: mockWhereDelete };
        },
    },
    mediaAssets: mockMediaAssetsTable,
}));

const { PATCH, DELETE } = await import('@/app/api/growth/media-assets/[id]/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth media-asset by id route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);

        updatedRows = [];
        deletedRows = [];

        mockWhere.mockImplementation(() => ({
            returning: async () => updatedRows,
        }));
        mockSet.mockImplementation(() => ({
            where: mockWhere,
        }));
        mockWhereDelete.mockImplementation(() => ({
            returning: async () => deletedRows,
        }));
    });

    it('updates media asset fields', async () => {
        updatedRows = [{
            id: 'asset-1',
            folder: 'pinterest',
            tags: ['pin'],
        }];

        const response = await PATCH(
            makeRequest({ folder: 'pinterest', tags: ['pin'] }),
            { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.asset.id).toBe('asset-1');
        expect(mockUpdate).toHaveBeenCalled();
    });

    it('returns 404 when patch target does not exist', async () => {
        updatedRows = [];

        const response = await PATCH(
            makeRequest({ folder: 'x' }),
            { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) },
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('not found');
    });

    it('deletes media asset', async () => {
        deletedRows = [{ id: 'asset-1' }];

        const response = await DELETE(
            makeRequest({}),
            { params: Promise.resolve({ id: '55555555-5555-4555-8555-555555555555' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.id).toBe('asset-1');
        expect(mockDelete).toHaveBeenCalled();
    });
});
