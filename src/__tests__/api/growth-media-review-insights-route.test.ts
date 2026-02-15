import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();

const mockSelect = vi.fn();
const mockFrom = vi.fn();

const mockMediaModerationTasksTable = {
    reviewerId: 'reviewer_id',
    userId: 'user_id',
    status: 'status',
};

const mockMediaModerationEventsTable = {
    payload: 'payload',
    createdAt: 'created_at',
    userId: 'user_id',
    eventType: 'event_type',
};

const mockMediaReviewPolicyDailySnapshotsTable = {
    snapshotDate: 'snapshot_date',
    userId: 'user_id',
    assignments: 'assignments',
    overrides: 'overrides',
    alertEvents: 'alert_events',
};

const mockMediaReviewPolicyAlertCodeDailySnapshotsTable = {
    snapshotDate: 'snapshot_date',
    userId: 'user_id',
    alertCode: 'alert_code',
    count: 'count',
};

const mockMediaReviewPolicyPlaybookDailySnapshotsTable = {
    snapshotDate: 'snapshot_date',
    userId: 'user_id',
    playbookId: 'playbook_id',
    count: 'count',
};

let pendingRows: Array<Record<string, unknown>> = [];
let assignmentRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
    lte: vi.fn((...args: unknown[]) => ({ type: 'lte', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: (...args: unknown[]) => {
            mockSelect(...args);
            return { from: mockFrom };
        },
    },
    mediaModerationTasks: mockMediaModerationTasksTable,
    mediaModerationEvents: mockMediaModerationEventsTable,
    mediaReviewPolicyDailySnapshots: mockMediaReviewPolicyDailySnapshotsTable,
    mediaReviewPolicyAlertCodeDailySnapshots: mockMediaReviewPolicyAlertCodeDailySnapshotsTable,
    mediaReviewPolicyPlaybookDailySnapshots: mockMediaReviewPolicyPlaybookDailySnapshotsTable,
}));

const { GET } = await import('@/app/api/growth/media-review/insights/route');

function makeRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

describe('growth media-review/insights route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({
            id: '11111111-1111-4111-8111-111111111111',
            role: 'reviewer',
            name: 'Reviewer One',
        });
        mockIsFeatureEnabled.mockReturnValue(true);

        pendingRows = [];
        assignmentRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockMediaModerationTasksTable) {
                return {
                    where: () => ({
                        limit: async () => pendingRows,
                    }),
                };
            }
            if (table === mockMediaModerationEventsTable) {
                return {
                    where: () => ({
                        limit: async () => assignmentRows,
                    }),
                };
            }
            // Snapshot tables don't chain .limit(); .where() must be thenable
            const emptyThenable = Object.assign(Promise.resolve([]), {
                limit: async () => [],
            });
            return {
                where: () => emptyThenable,
            };
        });
    });

    it('returns aggregated moderation policy insights', async () => {
        const nowIso = new Date().toISOString();
        pendingRows = [
            { reviewerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            { reviewerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            { reviewerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        ];

        assignmentRows = [
            {
                payload: {
                    action: 'set',
                    nextReviewerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    policyOverrideApplied: true,
                    policyAlerts: [{ code: 'reassignment_concentration' }],
                    playbookBindings: [{ playbookId: 'FAIRNESS-004' }],
                },
                createdAt: nowIso,
            },
            {
                payload: {
                    action: 'set',
                    nextReviewerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                },
                createdAt: nowIso,
            },
            {
                payload: {
                    action: 'set',
                    nextReviewerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    policyAlerts: [{ code: 'round_robin_skew' }],
                    playbookBindings: [{ playbookId: 'FAIRNESS-002' }],
                },
                createdAt: nowIso,
            },
            {
                payload: {
                    action: 'release',
                    nextReviewerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                },
                createdAt: nowIso,
            },
        ];

        const response = await GET(makeRequest('http://localhost/api/growth/media-review/insights?windowHours=72&trendDays=7'));
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.windowHours).toBe(72);
        expect(body.trendDays).toBe(7);
        expect(body.pending.total).toBe(3);
        expect(body.pending.pendingSkew).toBe(1);
        expect(body.assignments.total).toBe(3);
        expect(body.assignments.overrideCount).toBe(1);
        expect(body.assignments.alertEventCount).toBe(2);
        expect(body.assignments.topReviewerId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
        expect(body.assignments.topReviewerShare).toBeCloseTo(2 / 3);
        expect(body.assignments.alertCodeCounts.reassignment_concentration).toBe(1);
        expect(body.assignments.alertCodeCounts.round_robin_skew).toBe(1);
        expect(body.assignments.playbookCounts['FAIRNESS-004']).toBe(1);
        expect(body.assignments.playbookCounts['FAIRNESS-002']).toBe(1);
        expect(body.trends).toHaveLength(7);
        expect(body.trends.some((row: { assignments: number }) => row.assignments === 3)).toBe(true);
        expect(body.trends.some((row: { topPlaybookId: string | null }) => row.topPlaybookId === 'FAIRNESS-004')).toBe(true);
    });

    it('exports insights trends as csv when requested', async () => {
        const nowIso = new Date().toISOString();
        pendingRows = [];
        assignmentRows = [
            {
                payload: {
                    action: 'set',
                    nextReviewerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    policyOverrideApplied: false,
                },
                createdAt: nowIso,
            },
        ];

        const response = await GET(makeRequest('http://localhost/api/growth/media-review/insights?windowHours=72&trendDays=5&format=csv'));
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/csv');

        const csv = await response.text();
        expect(csv).toContain('date,assignments,overrides,alert_events,top_alert_code,top_playbook_id');
        expect(csv).toContain(',1,0,0,,');
    });
});
