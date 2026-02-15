import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockAppendMediaModerationEvent = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockTransaction = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhereUpdate = vi.fn();

const mockMediaModerationTasksTable = {
    id: 'id',
    userId: 'user_id',
    assetId: 'asset_id',
    status: 'status',
};

const mockMediaAssetsTable = {
    id: 'id',
    userId: 'user_id',
    metadata: 'metadata',
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_REVIEWER_ID = '33333333-3333-4333-8333-333333333333';

let selectedTaskRows: Array<Record<string, unknown>> = [];
let selectedAssetRows: Array<Record<string, unknown>> = [];
let updatedTaskRows: Array<Record<string, unknown>> = [];
let updatedAssetRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/media-review-audit', () => ({
    appendMediaModerationEvent: mockAppendMediaModerationEvent,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
        transaction: (...args: unknown[]) => mockTransaction(...args),
    },
    mediaModerationTasks: mockMediaModerationTasksTable,
    mediaAssets: mockMediaAssetsTable,
}));

const { POST } = await import('@/app/api/growth/media-review/tasks/[id]/decision/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth media-review/tasks/[id]/decision route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: USER_ID, role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockAppendMediaModerationEvent.mockResolvedValue({ id: 'event-1' });

        selectedTaskRows = [];
        selectedAssetRows = [];
        updatedTaskRows = [];
        updatedAssetRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockMediaModerationTasksTable) {
                return {
                    where: () => ({
                        limit: async () => selectedTaskRows,
                    }),
                };
            }
            if (table === mockMediaAssetsTable) {
                return {
                    where: () => ({
                        limit: async () => selectedAssetRows,
                    }),
                };
            }
            return {
                where: () => ({
                    limit: async () => [],
                }),
            };
        });

        let updateCallCount = 0;
        mockWhereUpdate.mockImplementation((condition: unknown) => {
            void condition;
            updateCallCount += 1;
            const rows = updateCallCount === 1 ? updatedTaskRows : updatedAssetRows;
            return {
                returning: async () => rows,
            };
        });

        mockSet.mockImplementation(() => ({
            where: mockWhereUpdate,
        }));

        mockUpdate.mockImplementation(() => ({
            set: mockSet,
        }));

        mockTransaction.mockImplementation(async (callback: (tx: {
            update: (...args: unknown[]) => { set: (...args: unknown[]) => { where: (...args: unknown[]) => { returning: () => Promise<Array<Record<string, unknown>>> } } };
            select: (...args: unknown[]) => { from: (...args: unknown[]) => { where: (...args: unknown[]) => { limit: () => Promise<Array<Record<string, unknown>>> } } };
        }) => Promise<{ task: Record<string, unknown>; asset: Record<string, unknown> | null }>) => callback({
            update: mockUpdate,
            select: (...args: unknown[]) => {
                mockSelect(...args);
                return { from: mockFrom };
            },
        }));
    });

    it('approves a pending moderation task and updates asset metadata', async () => {
        selectedTaskRows = [{
            id: 'aaaaaaaa-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '22222222-2222-4222-8222-222222222222',
            status: 'pending',
            reviewerId: null,
        }];
        selectedAssetRows = [{
            id: '22222222-2222-4222-8222-222222222222',
            metadata: {},
        }];
        updatedTaskRows = [{
            id: 'aaaaaaaa-1111-4111-8111-111111111111',
            assetId: '22222222-2222-4222-8222-222222222222',
            status: 'approved',
        }];
        updatedAssetRows = [{
            id: '22222222-2222-4222-8222-222222222222',
            metadata: { moderationStatus: 'approved' },
        }];

        const response = await POST(
            makeRequest({
                status: 'approved',
                reviewNotes: 'Looks good',
                moderationReason: 'Approved in queue',
            }),
            {
                params: Promise.resolve({ id: 'aaaaaaaa-1111-4111-8111-111111111111' }),
            },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.task.status).toBe('approved');
        expect(body.awaitingApprovals).toBe(false);
        expect(mockAppendMediaModerationEvent).toHaveBeenCalled();
    });

    it('keeps task pending when multi-step approval threshold is not met', async () => {
        selectedTaskRows = [{
            id: 'bbbbbbbb-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '22222222-2222-4222-8222-222222222222',
            status: 'pending',
            reviewerId: USER_ID,
            metadata: {
                approvalWorkflow: {
                    mode: 'ordered',
                    approverIds: [USER_ID, SECOND_REVIEWER_ID],
                    minApprovals: 2,
                },
                approvals: [],
            },
        }];
        selectedAssetRows = [];
        updatedTaskRows = [{
            id: 'bbbbbbbb-1111-4111-8111-111111111111',
            assetId: '22222222-2222-4222-8222-222222222222',
            status: 'pending',
        }];

        const response = await POST(
            makeRequest({
                status: 'approved',
                reviewNotes: 'First board approval',
                moderationReason: 'Phase 1 approved',
            }),
            {
                params: Promise.resolve({ id: 'bbbbbbbb-1111-4111-8111-111111111111' }),
            },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.task.status).toBe('pending');
        expect(body.awaitingApprovals).toBe(true);
        expect(body.partialApproval.requiredApprovals).toBe(2);
        expect(body.partialApproval.approvedCount).toBe(1);
    });
});
