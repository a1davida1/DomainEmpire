import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockAppendMediaModerationEvent = vi.fn();
const mockEvaluateMediaReviewAssignmentPolicy = vi.fn();
const mockCreateNotification = vi.fn();
const mockSendOpsChannelAlert = vi.fn();
const mockShouldForwardFairnessWarningsToOps = vi.fn();

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
    reviewerId: 'reviewer_id',
    backupReviewerId: 'backup_reviewer_id',
    metadata: 'metadata',
};

const mockUsersTable = {
    id: 'id',
    role: 'role',
};

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REVIEWER_ID = '22222222-2222-4222-8222-222222222222';
const BACKUP_REVIEWER_ID = '33333333-3333-4333-8333-333333333333';
const TEAM_LEAD_ID = '44444444-4444-4444-8444-444444444444';

let selectedTaskRows: Array<Record<string, unknown>> = [];
let reviewerRows: Array<Record<string, unknown>> = [];
let updatedTaskRows: Array<Record<string, unknown>> = [];

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

vi.mock('@/lib/growth/media-review-assignment-policy', () => ({
    evaluateMediaReviewAssignmentPolicy: mockEvaluateMediaReviewAssignmentPolicy,
}));

vi.mock('@/lib/notifications', () => ({
    createNotification: mockCreateNotification,
}));

vi.mock('@/lib/alerts/ops-channel', () => ({
    sendOpsChannelAlert: mockSendOpsChannelAlert,
    shouldForwardFairnessWarningsToOps: mockShouldForwardFairnessWarningsToOps,
}));

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
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
    users: mockUsersTable,
}));

const { POST } = await import('@/app/api/growth/media-review/tasks/[id]/assignment/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth media-review/tasks/[id]/assignment route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: USER_ID, role: 'reviewer', name: 'Reviewer One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockAppendMediaModerationEvent.mockResolvedValue({ id: 'event-1' });
        mockCreateNotification.mockResolvedValue('notification-1');
        mockSendOpsChannelAlert.mockResolvedValue({ delivered: true, reason: null, statusCode: 200 });
        mockShouldForwardFairnessWarningsToOps.mockReturnValue(true);
        mockEvaluateMediaReviewAssignmentPolicy.mockResolvedValue({
            violations: [],
            alerts: [],
            snapshot: {
                targetReviewerId: USER_ID,
                projectedTargetPending: 1,
                minPendingAcrossReviewers: 0,
                projectedSkew: 1,
                maxPendingPerReviewer: 25,
                maxAssignmentSkew: 6,
                reviewerPendingCounts: { [USER_ID]: 1 },
                concentrationWindowHours: 72,
                concentrationThreshold: 0.6,
                concentrationMinSamples: 15,
                concentrationShare: null,
                concentrationReviewerId: null,
                concentrationAssignments: 0,
            },
        });

        selectedTaskRows = [];
        reviewerRows = [];
        updatedTaskRows = [];

        mockFrom.mockImplementation((table: unknown) => {
            if (table === mockMediaModerationTasksTable) {
                return {
                    where: () => ({
                        limit: async () => selectedTaskRows,
                    }),
                };
            }
            if (table === mockUsersTable) {
                return {
                    where: () => ({
                        limit: async () => reviewerRows,
                    }),
                };
            }
            return {
                where: () => ({
                    limit: async () => [],
                }),
            };
        });

        mockWhereUpdate.mockImplementation(() => ({
            returning: async () => updatedTaskRows,
        }));

        mockSet.mockImplementation(() => ({
            where: mockWhereUpdate,
        }));

        mockUpdate.mockImplementation(() => ({
            set: mockSet,
        }));

        mockTransaction.mockImplementation(async (callback: (tx: {
            update: (...args: unknown[]) => { set: (...args: unknown[]) => { where: (...args: unknown[]) => { returning: () => Promise<Array<Record<string, unknown>>> } } };
        }) => Promise<Array<Record<string, unknown>>>) => callback({
            update: mockUpdate,
        }));
    });

    it('claims an unassigned moderation task', async () => {
        selectedTaskRows = [{
            id: 'aaaaaaaa-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: null,
            backupReviewerId: null,
            metadata: {},
        }];
        updatedTaskRows = [{
            id: 'aaaaaaaa-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: USER_ID,
            backupReviewerId: null,
            metadata: {},
        }];

        const response = await POST(
            makeRequest({ claim: true, reason: 'Taking ownership' }),
            { params: Promise.resolve({ id: 'aaaaaaaa-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.task.reviewerId).toBe(USER_ID);
        expect(body.policy).toEqual(expect.objectContaining({
            overrideApplied: false,
            violations: [],
        }));
        expect(mockAppendMediaModerationEvent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                eventType: 'assigned',
                payload: expect.objectContaining({ action: 'claim' }),
            }),
        );
    });

    it('blocks reviewer from assigning task to another reviewer', async () => {
        selectedTaskRows = [{
            id: 'bbbbbbbb-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: null,
            backupReviewerId: null,
            metadata: {},
        }];
        reviewerRows = [{ id: REVIEWER_ID, role: 'reviewer' }];

        const response = await POST(
            makeRequest({ reviewerId: REVIEWER_ID }),
            { params: Promise.resolve({ id: 'bbbbbbbb-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('self-assign');
    });

    it('allows admin to update reviewer routing controls', async () => {
        mockGetRequestUser.mockReturnValue({ id: USER_ID, role: 'admin', name: 'Admin One' });

        selectedTaskRows = [{
            id: 'cccccccc-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: null,
            backupReviewerId: null,
            metadata: {},
        }];

        reviewerRows = [
            { id: REVIEWER_ID, role: 'reviewer' },
            { id: BACKUP_REVIEWER_ID, role: 'reviewer' },
            { id: TEAM_LEAD_ID, role: 'expert' },
        ];

        updatedTaskRows = [{
            id: 'cccccccc-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: REVIEWER_ID,
            backupReviewerId: BACKUP_REVIEWER_ID,
            metadata: {
                escalationChain: [BACKUP_REVIEWER_ID],
                teamLeadId: TEAM_LEAD_ID,
            },
        }];

        const response = await POST(
            makeRequest({
                reviewerId: REVIEWER_ID,
                backupReviewerId: BACKUP_REVIEWER_ID,
                escalationChain: [BACKUP_REVIEWER_ID],
                teamLeadId: TEAM_LEAD_ID,
                reason: 'Board routing update',
            }),
            { params: Promise.resolve({ id: 'cccccccc-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.task.reviewerId).toBe(REVIEWER_ID);
        expect(body.task.backupReviewerId).toBe(BACKUP_REVIEWER_ID);
        expect(mockAppendMediaModerationEvent).toHaveBeenCalled();
    });

    it('blocks assignment when fairness policy violations exist', async () => {
        mockGetRequestUser.mockReturnValue({ id: USER_ID, role: 'admin', name: 'Admin One' });
        selectedTaskRows = [{
            id: 'dddddddd-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: null,
            backupReviewerId: null,
            metadata: {},
        }];
        reviewerRows = [{ id: REVIEWER_ID, role: 'reviewer' }];
        mockEvaluateMediaReviewAssignmentPolicy.mockResolvedValueOnce({
            violations: [{
                code: 'reviewer_pending_cap',
                severity: 'error',
                message: 'Target reviewer would exceed max pending cap',
                details: { targetReviewerId: REVIEWER_ID },
            }],
            alerts: [],
            snapshot: {
                targetReviewerId: REVIEWER_ID,
                projectedTargetPending: 30,
                minPendingAcrossReviewers: 0,
                projectedSkew: 30,
                maxPendingPerReviewer: 25,
                maxAssignmentSkew: 6,
                reviewerPendingCounts: { [REVIEWER_ID]: 30 },
                concentrationWindowHours: 72,
                concentrationThreshold: 0.6,
                concentrationMinSamples: 15,
                concentrationShare: null,
                concentrationReviewerId: null,
                concentrationAssignments: 0,
            },
        });

        const response = await POST(
            makeRequest({ reviewerId: REVIEWER_ID, reason: 'force routing change' }),
            { params: Promise.resolve({ id: 'dddddddd-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.error).toContain('fairness policy');
        expect(body.violations).toHaveLength(1);
        expect(body.playbookBindings).toEqual(expect.arrayContaining([
            expect.objectContaining({ playbookId: 'FAIRNESS-001' }),
        ]));
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining('blocked by fairness policy'),
        }));
        expect(mockSendOpsChannelAlert).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining('blocked moderation assignment'),
            severity: 'warning',
        }));
    });

    it('allows admin force override when fairness policy violations exist', async () => {
        mockGetRequestUser.mockReturnValue({ id: USER_ID, role: 'admin', name: 'Admin One' });
        selectedTaskRows = [{
            id: 'eeeeeeee-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: null,
            backupReviewerId: null,
            metadata: {},
        }];
        reviewerRows = [{ id: REVIEWER_ID, role: 'reviewer' }];
        updatedTaskRows = [{
            id: 'eeeeeeee-1111-4111-8111-111111111111',
            userId: USER_ID,
            assetId: '99999999-9999-4999-8999-999999999999',
            status: 'pending',
            reviewerId: REVIEWER_ID,
            backupReviewerId: null,
            metadata: {},
        }];
        mockEvaluateMediaReviewAssignmentPolicy.mockResolvedValueOnce({
            violations: [{
                code: 'round_robin_skew',
                severity: 'error',
                message: 'Assignment would exceed round-robin skew',
                details: { targetReviewerId: REVIEWER_ID },
            }],
            alerts: [{
                code: 'reassignment_concentration',
                severity: 'warning',
                message: 'Assignment concentration warning',
                details: { reviewerId: REVIEWER_ID },
            }],
            snapshot: {
                targetReviewerId: REVIEWER_ID,
                projectedTargetPending: 7,
                minPendingAcrossReviewers: 0,
                projectedSkew: 7,
                maxPendingPerReviewer: 25,
                maxAssignmentSkew: 6,
                reviewerPendingCounts: { [REVIEWER_ID]: 7 },
                concentrationWindowHours: 72,
                concentrationThreshold: 0.6,
                concentrationMinSamples: 15,
                concentrationShare: 0.7,
                concentrationReviewerId: REVIEWER_ID,
                concentrationAssignments: 20,
            },
        });

        const response = await POST(
            makeRequest({ reviewerId: REVIEWER_ID, force: true, reason: 'Emergency reassignment override' }),
            { params: Promise.resolve({ id: 'eeeeeeee-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.policy).toEqual(expect.objectContaining({
            overrideApplied: true,
            playbookBindings: expect.arrayContaining([
                expect.objectContaining({ playbookId: 'FAIRNESS-002' }),
                expect.objectContaining({ playbookId: 'FAIRNESS-003' }),
                expect.objectContaining({ playbookId: 'FAIRNESS-004' }),
            ]),
        }));
        expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining('fairness override'),
        }));
        expect(mockSendOpsChannelAlert).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining('override'),
            severity: 'critical',
        }));
    });
});
