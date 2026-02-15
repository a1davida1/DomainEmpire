import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mockUsersTable = {
    id: 'id',
    name: 'name',
    role: 'role',
    isActive: 'is_active',
};

const mockMediaModerationTasksTable = {
    id: 'id',
    reviewerId: 'reviewer_id',
    userId: 'user_id',
    status: 'status',
};

const mockMediaModerationEventsTable = {
    payload: 'payload',
    userId: 'user_id',
    eventType: 'event_type',
    createdAt: 'created_at',
};

let reviewerRows: Array<Record<string, unknown>> = [];
let pendingTaskRows: Array<Record<string, unknown>> = [];
let assignmentEventRows: Array<Record<string, unknown>> = [];

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    asc: vi.fn((arg: unknown) => ({ type: 'asc', arg })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
    },
    users: mockUsersTable,
    mediaModerationTasks: mockMediaModerationTasksTable,
    mediaModerationEvents: mockMediaModerationEventsTable,
}));

const { evaluateMediaReviewAssignmentPolicy } = await import('@/lib/growth/media-review-assignment-policy');

describe('media review assignment policy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reviewerRows = [];
        pendingTaskRows = [];
        assignmentEventRows = [];

        delete process.env.GROWTH_REVIEW_MAX_PENDING_PER_REVIEWER;
        delete process.env.GROWTH_REVIEW_MAX_ASSIGNMENT_SKEW;
        delete process.env.GROWTH_REVIEW_CONCENTRATION_WINDOW_HOURS;
        delete process.env.GROWTH_REVIEW_CONCENTRATION_MIN_SAMPLES;
        delete process.env.GROWTH_REVIEW_CONCENTRATION_THRESHOLD;

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockUsersTable) {
                return {
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => reviewerRows,
                        }),
                    }),
                };
            }
            if (table === mockMediaModerationTasksTable) {
                return {
                    where: () => ({
                        limit: async () => pendingTaskRows,
                    }),
                };
            }
            if (table === mockMediaModerationEventsTable) {
                return {
                    where: () => ({
                        limit: async () => assignmentEventRows,
                    }),
                };
            }
            return {
                where: () => ({
                    limit: async () => [],
                }),
            };
        });
    });

    it('returns no violations for balanced workload', async () => {
        reviewerRows = [
            { id: '11111111-1111-4111-8111-111111111111' },
            { id: '22222222-2222-4222-8222-222222222222' },
        ];
        pendingTaskRows = [
            { id: 'task-a', reviewerId: '11111111-1111-4111-8111-111111111111' },
            { id: 'task-b', reviewerId: '22222222-2222-4222-8222-222222222222' },
        ];

        const result = await evaluateMediaReviewAssignmentPolicy({
            userId: 'user-1',
            taskId: 'task-current',
            targetReviewerId: '11111111-1111-4111-8111-111111111111',
            previousReviewerId: '11111111-1111-4111-8111-111111111111',
            now: new Date('2026-02-15T00:00:00Z'),
        });

        expect(result.violations).toEqual([]);
        expect(result.alerts).toEqual([]);
    });

    it('flags cap and skew violations for overloaded target reviewer', async () => {
        process.env.GROWTH_REVIEW_MAX_PENDING_PER_REVIEWER = '2';
        process.env.GROWTH_REVIEW_MAX_ASSIGNMENT_SKEW = '1';

        reviewerRows = [
            { id: '11111111-1111-4111-8111-111111111111' },
            { id: '22222222-2222-4222-8222-222222222222' },
        ];
        pendingTaskRows = [
            { id: 'task-a', reviewerId: '11111111-1111-4111-8111-111111111111' },
            { id: 'task-b', reviewerId: '11111111-1111-4111-8111-111111111111' },
            { id: 'task-c', reviewerId: '11111111-1111-4111-8111-111111111111' },
            { id: 'task-d', reviewerId: '22222222-2222-4222-8222-222222222222' },
        ];

        const result = await evaluateMediaReviewAssignmentPolicy({
            userId: 'user-1',
            taskId: 'task-current',
            targetReviewerId: '11111111-1111-4111-8111-111111111111',
            previousReviewerId: null,
            now: new Date('2026-02-15T00:00:00Z'),
        });

        expect(result.violations.map((violation) => violation.code)).toContain('reviewer_pending_cap');
        expect(result.violations.map((violation) => violation.code)).toContain('round_robin_skew');
    });

    it('emits concentration alert when assignments are heavily skewed', async () => {
        process.env.GROWTH_REVIEW_CONCENTRATION_MIN_SAMPLES = '5';
        process.env.GROWTH_REVIEW_CONCENTRATION_THRESHOLD = '0.6';

        reviewerRows = [
            { id: '11111111-1111-4111-8111-111111111111' },
            { id: '22222222-2222-4222-8222-222222222222' },
        ];
        pendingTaskRows = [];
        assignmentEventRows = [
            { payload: { action: 'set', nextReviewerId: '11111111-1111-4111-8111-111111111111' } },
            { payload: { action: 'set', nextReviewerId: '11111111-1111-4111-8111-111111111111' } },
            { payload: { action: 'claim', nextReviewerId: '11111111-1111-4111-8111-111111111111' } },
            { payload: { action: 'set', nextReviewerId: '11111111-1111-4111-8111-111111111111' } },
            { payload: { action: 'set', nextReviewerId: '22222222-2222-4222-8222-222222222222' } },
        ];

        const result = await evaluateMediaReviewAssignmentPolicy({
            userId: 'user-1',
            taskId: 'task-current',
            targetReviewerId: '22222222-2222-4222-8222-222222222222',
            previousReviewerId: null,
            now: new Date('2026-02-15T00:00:00Z'),
        });

        expect(result.alerts.map((alert) => alert.code)).toContain('reassignment_concentration');
    });
});
