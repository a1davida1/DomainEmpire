import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/review/errors';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockAssignReviewTask = vi.fn();
vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/review/task-assignment', () => ({
    assignReviewTask: mockAssignReviewTask,
}));

const { PATCH } = await import('@/app/api/review/tasks/[id]/assignment/route');

function makeRequest(body: unknown): NextRequest {
    return {
        json: async () => body,
        headers: new Headers(),
    } as unknown as NextRequest;
}

describe('review task assignment route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'reviewer-1', role: 'reviewer', name: 'Reviewer' });
    });

    it('returns validation error when payload has multiple actions', async () => {
        const response = await PATCH(
            makeRequest({ claim: true, reviewerId: '11111111-1111-4111-8111-111111111111' }),
            { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toContain('Validation failed');
    });

    it('returns success payload on valid assignment', async () => {
        mockAssignReviewTask.mockResolvedValueOnce({
            taskId: '11111111-1111-4111-8111-111111111111',
            taskType: 'campaign_launch',
            status: 'pending',
            previousReviewerId: null,
            reviewerId: 'reviewer-1',
            changed: true,
        });

        const response = await PATCH(
            makeRequest({ claim: true }),
            { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.task.reviewerId).toBe('reviewer-1');
        expect(mockAssignReviewTask).toHaveBeenCalledWith(expect.objectContaining({
            taskId: '11111111-1111-4111-8111-111111111111',
            mode: 'claim',
        }));
    });

    it('maps review errors to status codes', async () => {
        mockAssignReviewTask.mockRejectedValueOnce(new ForbiddenError('Task is already assigned to another reviewer'));

        const response = await PATCH(
            makeRequest({ claim: true }),
            { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) },
        );

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('already assigned');
    });
});
