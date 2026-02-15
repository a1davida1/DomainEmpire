import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockWhereDelete = vi.fn();
const mockWhereUpdate = vi.fn();
const mockTransaction = vi.fn();

const mockMediaAssetsTable = {
    id: 'id',
    userId: 'user_id',
    folder: 'folder',
    tags: 'tags',
    metadata: 'metadata',
};

let selectedRows: Array<Record<string, unknown>> = [];
let deletedRows: Array<Record<string, unknown>> = [];
let updatedRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
    isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
        transaction: (...args: unknown[]) => mockTransaction(...args),
    },
    mediaAssets: mockMediaAssetsTable,
}));

const { POST } = await import('@/app/api/growth/media-assets/bulk/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth media-assets bulk route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);

        selectedRows = [];
        deletedRows = [];
        updatedRows = [];

        mockFrom.mockImplementation(() => ({
            where: async () => selectedRows,
        }));

        mockWhereDelete.mockImplementation(() => ({
            returning: async () => deletedRows,
        }));

        mockWhereUpdate.mockImplementation(() => ({
            returning: async () => updatedRows,
        }));

        mockSet.mockImplementation(() => ({
            where: mockWhereUpdate,
        }));

        mockTransaction.mockImplementation(async (callback: (tx: {
            update: (...args: unknown[]) => { set: (...args: unknown[]) => { where: (...args: unknown[]) => { returning: () => Promise<Array<Record<string, unknown>>> } } };
            delete: (...args: unknown[]) => { where: (...args: unknown[]) => { returning: () => Promise<Array<Record<string, unknown>>> } };
        }) => Promise<void>) => callback({
            update: (...args: unknown[]) => {
                mockUpdate(...args);
                return { set: mockSet };
            },
            delete: (...args: unknown[]) => {
                mockDelete(...args);
                return { where: mockWhereDelete };
            },
        }));
    });

    it('moves selected assets to target folder', async () => {
        selectedRows = [
            { id: '11111111-1111-4111-8111-111111111111', tags: [], metadata: {} },
            { id: '22222222-2222-4222-8222-222222222222', tags: [], metadata: {} },
        ];
        updatedRows = [{ id: selectedRows[0].id }, { id: selectedRows[1].id }];

        const response = await POST(makeRequest({
            operation: 'move_folder',
            folder: 'reviewed',
            assetIds: selectedRows.map((row) => row.id),
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.operation).toBe('move_folder');
        expect(body.affectedCount).toBe(2);
        expect(mockUpdate).toHaveBeenCalled();
    });

    it('sets moderation status for selected assets', async () => {
        selectedRows = [
            { id: '11111111-1111-4111-8111-111111111111', tags: ['a'], metadata: {} },
            { id: '22222222-2222-4222-8222-222222222222', tags: ['b'], metadata: {} },
        ];
        updatedRows = [
            { id: '11111111-1111-4111-8111-111111111111' },
            { id: '22222222-2222-4222-8222-222222222222' },
        ];

        const response = await POST(makeRequest({
            operation: 'set_moderation',
            moderationStatus: 'approved',
            moderationReason: 'Reviewed by editor',
            assetIds: selectedRows.map((row) => row.id),
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.operation).toBe('set_moderation');
        expect(body.affectedCount).toBe(2);
        expect(mockUpdate).toHaveBeenCalled();
    });
});
