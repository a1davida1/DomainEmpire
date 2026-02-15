import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockRunMediaReviewEscalationSweep = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/media-review-escalation', () => ({
    runMediaReviewEscalationSweep: mockRunMediaReviewEscalationSweep,
}));

const { POST } = await import('@/app/api/growth/media-review/escalations/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth media-review/escalations route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'reviewer', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockRunMediaReviewEscalationSweep.mockResolvedValue({
            dryRun: false,
            scanned: 4,
            eligible: 2,
            escalated: 1,
            opsNotified: 1,
            skipped: 2,
            results: [],
        });
    });

    it('runs escalation sweep for current user', async () => {
        const response = await POST(makeRequest({
            dryRun: false,
            limit: 50,
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.userId).toBe('user-1');
        expect(body.escalated).toBe(1);
        expect(mockRunMediaReviewEscalationSweep).toHaveBeenCalledWith({
            userId: 'user-1',
            actorId: 'user-1',
            dryRun: false,
            limit: 50,
        });
    });

    it('blocks non-admin from targeting another user', async () => {
        const response = await POST(makeRequest({
            userId: '11111111-1111-4111-8111-111111111111',
            dryRun: true,
        }));

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.error).toContain('admins');
    });
});
