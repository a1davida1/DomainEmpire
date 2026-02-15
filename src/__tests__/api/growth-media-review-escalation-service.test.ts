import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockTransaction = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhereUpdate = vi.fn();

const mockAppendMediaModerationEvent = vi.fn();

const mockMediaModerationTasks = {
    id: 'id',
    userId: 'user_id',
    assetId: 'asset_id',
    status: 'status',
    reviewerId: 'reviewer_id',
    createdAt: 'created_at',
    escalateAfterHours: 'escalate_after_hours',
    metadata: 'metadata',
    updatedAt: 'updated_at',
};

let pendingTasks: Array<Record<string, unknown>> = [];

vi.mock('@/lib/growth/media-review-audit', () => ({
    appendMediaModerationEvent: mockAppendMediaModerationEvent,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    asc: vi.fn((arg: unknown) => ({ type: 'asc', arg })),
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
    mediaModerationTasks: mockMediaModerationTasks,
}));

const { runMediaReviewEscalationSweep } = await import('@/lib/growth/media-review-escalation');

describe('media-review escalation service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        pendingTasks = [];

        mockLimit.mockImplementation(async () => pendingTasks);
        mockOrderBy.mockImplementation(() => ({ limit: mockLimit }));
        mockWhere.mockImplementation(() => ({ orderBy: mockOrderBy }));
        mockFrom.mockImplementation(() => ({ where: mockWhere }));

        mockWhereUpdate.mockImplementation(() => ({ returning: async () => [{ id: 'task-1' }] }));
        mockSet.mockImplementation(() => ({ where: mockWhereUpdate }));
        mockUpdate.mockImplementation(() => ({ set: mockSet }));
        mockAppendMediaModerationEvent.mockResolvedValue({ id: 'event-1' });

        mockTransaction.mockImplementation(async (callback: (tx: {
            update: (...args: unknown[]) => { set: (...args: unknown[]) => { where: (...args: unknown[]) => Promise<Array<Record<string, unknown>>> } };
            select: (...args: unknown[]) => { from: (...args: unknown[]) => { where: (...args: unknown[]) => { orderBy: (...args: unknown[]) => { limit: (...args: unknown[]) => Promise<Array<Record<string, unknown>>> } } } };
        }) => Promise<void>) => callback({
            update: mockUpdate,
            select: () => ({
                from: () => ({
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => [],
                        }),
                    }),
                }),
            }),
        }));
    });

    it('reassigns reviewer when escalation threshold is exceeded', async () => {
        pendingTasks = [{
            id: 'task-1',
            userId: 'user-1',
            assetId: 'asset-1',
            status: 'pending',
            reviewerId: 'reviewer-a',
            backupReviewerId: 'reviewer-b',
            createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
            escalateAfterHours: 24,
            metadata: {},
        }];

        const result = await runMediaReviewEscalationSweep({
            userId: 'user-1',
            actorId: 'actor-1',
            dryRun: false,
            limit: 10,
        });

        expect(result.scanned).toBe(1);
        expect(result.eligible).toBe(1);
        expect(result.escalated).toBe(1);
        expect(result.results[0]?.action).toBe('escalated');
        expect(mockAppendMediaModerationEvent).toHaveBeenCalled();
    });
});
