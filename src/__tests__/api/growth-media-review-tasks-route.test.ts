import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockAppendMediaModerationEvent = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockTransaction = vi.fn();
const mockInsert = vi.fn();
const mockInsertValues = vi.fn();

const mockMediaAssetsTable = {
    id: 'id',
    userId: 'user_id',
    metadata: 'metadata',
    type: 'type',
    url: 'url',
    folder: 'folder',
};

const mockMediaModerationTasksTable = {
    id: 'id',
    userId: 'user_id',
    assetId: 'asset_id',
    status: 'status',
    createdAt: 'created_at',
    dueAt: 'due_at',
    slaHours: 'sla_hours',
    escalateAfterHours: 'escalate_after_hours',
    reviewerId: 'reviewer_id',
    backupReviewerId: 'backup_reviewer_id',
};

let taskRows: Array<Record<string, unknown>> = [];
let taskCountRows: Array<Record<string, unknown>> = [];
let assetRows: Array<Record<string, unknown>> = [];
let pendingTaskRows: Array<Record<string, unknown>> = [];
let insertedTaskRows: Array<Record<string, unknown>> = [];

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

vi.mock('@/lib/growth/media-review-audit', () => ({
    appendMediaModerationEvent: mockAppendMediaModerationEvent,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    count: vi.fn(() => ({ type: 'count' })),
    desc: vi.fn((arg: unknown) => ({ type: 'desc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
    isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
    sql: sqlMock,
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
    mediaModerationTasks: mockMediaModerationTasksTable,
}));

const { GET, POST } = await import('@/app/api/growth/media-review/tasks/route');

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
    } as unknown as NextRequest;
}

describe('growth media-review/tasks route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockAppendMediaModerationEvent.mockResolvedValue({ id: 'event-1' });

        taskRows = [];
        taskCountRows = [];
        assetRows = [];
        pendingTaskRows = [];
        insertedTaskRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockMediaModerationTasksTable) {
                return {
                    where: () => {
                        const whereResult = [...taskCountRows] as Array<Record<string, unknown>> & {
                            orderBy: () => { limit: () => Promise<Array<Record<string, unknown>>> };
                            limit: () => Promise<Array<Record<string, unknown>>>;
                        };
                        whereResult.orderBy = () => ({
                            limit: async () => taskRows,
                        });
                        whereResult.limit = async () => taskRows;
                        return whereResult;
                    },
                };
            }
            if (table === mockMediaAssetsTable) {
                return {
                    where: () => {
                        const whereResult = [...assetRows] as Array<Record<string, unknown>> & {
                            limit: () => Promise<Array<Record<string, unknown>>>;
                        };
                        whereResult.limit = async () => assetRows;
                        return whereResult;
                    },
                };
            }
            return {
                where: () => ({
                    limit: async () => [],
                }),
            };
        });

        mockInsertValues.mockImplementation(() => ({
            returning: async () => insertedTaskRows,
        }));

        mockInsert.mockImplementation(() => ({
            values: mockInsertValues,
        }));

        mockTransaction.mockImplementation(async (callback: (tx: {
            select: (...args: unknown[]) => { from: (...args: unknown[]) => { where: (...args: unknown[]) => { orderBy: (...args: unknown[]) => { limit: () => Promise<Array<Record<string, unknown>>> } } } };
            insert: (...args: unknown[]) => { values: (...args: unknown[]) => { returning: () => Promise<Array<Record<string, unknown>>> } };
        }) => Promise<{ created: boolean; task: Record<string, unknown> }>) => callback({
            select: () => ({
                from: () => ({
                    where: () => ({
                        orderBy: () => ({
                            limit: () => ({
                                for: async () => pendingTaskRows,
                            }),
                        }),
                    }),
                }),
            }),
            insert: mockInsert,
        }));
    });

    it('lists an empty moderation queue', async () => {
        taskRows = [];
        taskCountRows = [{ total: 0 }];
        const response = await GET(makeGetRequest('http://localhost/api/growth/media-review/tasks?limit=10'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.count).toBe(0);
        expect(body.tasks).toEqual([]);
    });

    it('creates a moderation task for a known asset', async () => {
        assetRows = [{
            id: '11111111-1111-4111-8111-111111111111',
            userId: 'user-1',
            metadata: {},
        }];
        insertedTaskRows = [{
            id: 'task-1',
            assetId: '11111111-1111-4111-8111-111111111111',
            userId: 'user-1',
            status: 'pending',
            slaHours: 24,
            escalateAfterHours: 48,
            dueAt: new Date('2026-02-16T00:00:00Z'),
            reviewerId: null,
            backupReviewerId: null,
        }];
        pendingTaskRows = [];

        const response = await POST(makePostRequest({
            assetId: '11111111-1111-4111-8111-111111111111',
        }));

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.created).toBe(true);
        expect(body.task.id).toBe('task-1');
        expect(mockAppendMediaModerationEvent).toHaveBeenCalled();
    });
});
