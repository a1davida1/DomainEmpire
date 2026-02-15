import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockRunSweep = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/review/campaign-launch-sla', () => ({
    runCampaignLaunchReviewEscalationSweep: mockRunSweep,
}));

const { POST } = await import('@/app/api/review/tasks/campaign-launch/escalations/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('campaign launch review escalation route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockRunSweep.mockResolvedValue({
            enabled: true,
            dryRun: false,
            scanned: 1,
            pendingCount: 1,
            escalatedEligible: 1,
            alerted: 1,
            cooldownSkipped: 0,
            cappedSkipped: 0,
            opsDelivered: 1,
            opsFailed: 0,
            errors: 0,
            generatedAt: '2026-02-15T00:00:00.000Z',
            samples: [],
        });
    });

    it('runs escalation sweep with payload options', async () => {
        const response = await POST(makeRequest({
            dryRun: true,
            notify: false,
            force: true,
            limit: 120,
            maxAlertsPerSweep: 10,
            alertCooldownHours: 8,
        }));

        expect(response.status).toBe(200);
        expect(mockRunSweep).toHaveBeenCalledWith({
            dryRun: true,
            force: true,
            notify: false,
            limit: 120,
            maxAlertsPerSweep: 10,
            alertCooldownHours: 8,
        });
    });

    it('rejects forced sweeps for non-admin users', async () => {
        mockGetRequestUser.mockReturnValueOnce({ id: 'user-1', role: 'reviewer' });
        const response = await POST(makeRequest({ force: true }));

        expect(response.status).toBe(403);
        expect(mockRunSweep).not.toHaveBeenCalled();
    });
});
