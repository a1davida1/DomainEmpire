import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError, ChecklistValidationError } from '@/lib/review/errors';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockDecideReviewTask = vi.fn();
vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/review/task-decision', () => ({
    decideReviewTask: mockDecideReviewTask,
    REQUIRED_DOMAIN_BUY_CHECKLIST_KEYS: [
        'underwritingReviewed',
        'tmCheckPassed',
        'budgetCheckPassed',
    ],
}));

const { POST } = await import('@/app/api/review/tasks/[id]/decision/route');

function makeRequest(body: unknown): NextRequest {
    return {
        json: async () => body,
        headers: new Headers(),
    } as unknown as NextRequest;
}

describe('review task decision route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'reviewer-1', role: 'reviewer', name: 'Reviewer' });
    });

    it('returns 400 for invalid request payload', async () => {
        const response = await POST(makeRequest({
            status: 'approved',
            reviewNotes: 'short',
        }), { params: Promise.resolve({ id: 'task-1' }) });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Validation failed');
    });

    it('returns 404 when task is missing', async () => {
        mockDecideReviewTask.mockRejectedValueOnce(new NotFoundError('Review task not found'));

        const response = await POST(makeRequest({
            status: 'approved',
            reviewNotes: 'Looks good to proceed',
            checklistJson: {
                underwritingReviewed: true,
                tmCheckPassed: true,
                budgetCheckPassed: true,
            },
        }), { params: Promise.resolve({ id: 'task-1' }) });

        expect(response.status).toBe(404);
    });

    it('returns 400 when checklist requirements are not met', async () => {
        mockDecideReviewTask.mockRejectedValueOnce(
            new ChecklistValidationError('Cannot approve domain_buy task: checklist requirements not satisfied'),
        );

        const response = await POST(makeRequest({
            status: 'approved',
            reviewNotes: 'Approving now with missing checks',
            checklistJson: { underwritingReviewed: true },
        }), { params: Promise.resolve({ id: 'task-1' }) });

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.requiredChecklist).toContain('tmCheckPassed');
    });

    it('returns success payload when decision succeeds', async () => {
        mockDecideReviewTask.mockResolvedValueOnce({
            taskId: 'task-1',
            status: 'approved',
            bidPlanQueued: true,
            campaignLaunchQueued: true,
        });

        const response = await POST(makeRequest({
            status: 'approved',
            reviewNotes: 'All checks passed. Approving buy.',
            checklistJson: {
                underwritingReviewed: true,
                tmCheckPassed: true,
                budgetCheckPassed: true,
            },
        }), { params: Promise.resolve({ id: 'task-1' }) });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.bidPlanQueued).toBe(true);
        expect(body.campaignLaunchQueued).toBe(true);
        expect(mockDecideReviewTask).toHaveBeenCalledWith(expect.objectContaining({
            taskId: 'task-1',
            status: 'approved',
        }));
    });
});
