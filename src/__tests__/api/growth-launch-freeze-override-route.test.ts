import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockEvaluateGrowthLaunchFreeze = vi.fn();
const mockGetActiveOverride = vi.fn();
const mockListOverrideHistory = vi.fn();
const mockListOverrideRequests = vi.fn();
const mockResolveConfig = vi.fn();
const mockResolveAllowedRoles = vi.fn();
const mockCanMutateOverride = vi.fn();
const mockValidateOverride = vi.fn();
const mockApplyOverride = vi.fn();
const mockClearOverride = vi.fn();
const mockDecideOverrideRequest = vi.fn();
const mockCreateNotification = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/notifications', () => ({
    createNotification: mockCreateNotification,
}));

vi.mock('@/lib/growth/launch-freeze', () => ({
    evaluateGrowthLaunchFreeze: mockEvaluateGrowthLaunchFreeze,
    getActiveGrowthLaunchFreezeOverride: mockGetActiveOverride,
    listGrowthLaunchFreezeOverrideHistory: mockListOverrideHistory,
    listGrowthLaunchFreezeOverrideRequests: mockListOverrideRequests,
    resolveGrowthLaunchFreezeConfig: mockResolveConfig,
    resolveGrowthLaunchFreezeOverrideAllowedRoles: mockResolveAllowedRoles,
    canMutateGrowthLaunchFreezeOverride: mockCanMutateOverride,
    validateGrowthLaunchFreezeOverride: mockValidateOverride,
    applyGrowthLaunchFreezeOverride: mockApplyOverride,
    clearGrowthLaunchFreezeOverride: mockClearOverride,
    decideGrowthLaunchFreezeOverrideRequest: mockDecideOverrideRequest,
}));

const { GET, POST, PATCH } = await import('@/app/api/growth/launch-freeze/override/route');

function makeRequest(opts?: {
    url?: string;
    body?: unknown;
}): NextRequest {
    return {
        headers: new Headers(),
        url: opts?.url || 'http://localhost/api/growth/launch-freeze/override',
        nextUrl: new URL(opts?.url || 'http://localhost/api/growth/launch-freeze/override'),
        json: async () => opts?.body ?? {},
    } as unknown as NextRequest;
}

describe('growth launch freeze override route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.GROWTH_LAUNCH_FREEZE_OVERRIDE_ALLOWED_ROLES;

        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'Admin User' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockResolveConfig.mockReturnValue({
            enabled: true,
            warningBurnPct: 50,
            criticalBurnPct: 100,
            windowHours: [24, 168],
            blockedChannels: ['pinterest', 'youtube_shorts'],
            blockedActions: ['scale', 'optimize', 'recover', 'incubate'],
            recoveryHealthyWindowsRequired: 2,
        });
        mockEvaluateGrowthLaunchFreeze.mockResolvedValue({
            enabled: true,
            active: false,
            rawActive: false,
            blockedChannels: ['pinterest', 'youtube_shorts'],
            blockedActions: ['scale', 'optimize', 'recover', 'incubate'],
            recoveryHoldActive: false,
            recoveryHealthyWindows: 0,
            recoveryHealthyWindowsRequired: 2,
            level: 'healthy',
            warningBurnPct: 50,
            criticalBurnPct: 100,
            reasonCodes: [],
            overrideActive: false,
            overrideId: null,
            overrideExpiresAt: null,
            overrideReason: null,
            triggers: [],
            windowSummaries: [],
            generatedAt: '2026-02-15T00:00:00.000Z',
        });
        mockGetActiveOverride.mockResolvedValue(null);
        mockListOverrideHistory.mockResolvedValue([]);
        mockListOverrideRequests.mockResolvedValue([]);
        mockResolveAllowedRoles.mockReturnValue(new Set(['admin']));
        mockCanMutateOverride.mockReturnValue(true);
        mockValidateOverride.mockReturnValue({ valid: true, errors: [] });
        mockCreateNotification.mockResolvedValue('notification-1');
        mockApplyOverride.mockResolvedValue({
            id: 'ovr-1',
            actorUserId: 'user-1',
            reason: 'Emergency override for scoped freeze handling',
            createdAt: '2026-02-15T00:00:00.000Z',
            expiresAt: null,
            postmortemUrl: null,
            incidentKey: null,
            override: { blockedChannels: ['pinterest'] },
            status: 'active',
            supersededById: null,
        });
        mockDecideOverrideRequest.mockResolvedValue({
            request: {
                id: '00000000-0000-4000-8000-000000000123',
                requestedByUserId: 'user-2',
                requestedByRole: 'expert',
                reason: 'Emergency override for scoped freeze handling',
                submittedAt: '2026-02-15T00:00:00.000Z',
                expiresAt: null,
                postmortemUrl: null,
                incidentKey: null,
                override: { blockedChannels: ['pinterest'] },
                status: 'approved',
                decidedAt: '2026-02-15T01:00:00.000Z',
                decidedByUserId: 'user-1',
                decisionReason: 'Approved for active critical incident.',
                appliedOverrideId: 'ovr-1',
            },
            appliedOverride: {
                id: 'ovr-1',
                actorUserId: 'user-1',
                reason: 'Approved request 123',
                createdAt: '2026-02-15T01:00:00.000Z',
                expiresAt: null,
                postmortemUrl: null,
                incidentKey: null,
                override: { blockedChannels: ['pinterest'] },
                status: 'active',
                supersededById: null,
            },
        });
    });

    it('returns override status and history on GET', async () => {
        const response = await GET(makeRequest());
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.canMutate).toBe(true);
        expect(body.baseConfig.warningBurnPct).toBe(50);
        expect(body.requests).toEqual([]);
    });

    it('blocks POST for non-allowed role governance', async () => {
        mockGetRequestUser.mockReturnValue({ id: 'user-2', role: 'expert', name: 'Expert User' });
        mockCanMutateOverride.mockReturnValue(false);

        const response = await POST(makeRequest({
            body: {
                reason: 'Emergency override for scoped freeze handling',
                override: { blockedChannels: ['pinterest'] },
            },
        }));

        expect(response.status).toBe(403);
        expect(mockApplyOverride).not.toHaveBeenCalled();
    });

    it('submits approval request for non-allowed role when requested', async () => {
        mockGetRequestUser.mockReturnValue({ id: 'user-2', role: 'expert', name: 'Expert User' });
        mockCanMutateOverride.mockReturnValue(false);

        const response = await POST(makeRequest({
            body: {
                reason: 'Emergency override for scoped freeze handling',
                requestApproval: true,
                override: { blockedChannels: ['pinterest'] },
            },
        }));

        expect(response.status).toBe(202);
        const body = await response.json();
        expect(body.approvalRequested).toBe(true);
        expect(mockCreateNotification).toHaveBeenCalledTimes(1);
        expect(mockApplyOverride).not.toHaveBeenCalled();
    });

    it('applies override for admin role', async () => {
        const response = await POST(makeRequest({
            body: {
                reason: 'Emergency override for scoped freeze handling',
                override: { blockedChannels: ['pinterest'], blockedActions: ['scale'] },
            },
        }));

        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body.applied).toBe(true);
        expect(mockApplyOverride).toHaveBeenCalledTimes(1);
    });

    it('decides a pending override request via PATCH', async () => {
        const response = await PATCH(makeRequest({
            body: {
                requestId: '00000000-0000-4000-8000-000000000123',
                decision: 'approved',
                decisionReason: 'Approved for active critical incident.',
            },
        }));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.decided).toBe(true);
        expect(body.decision.status).toBe('approved');
        expect(mockDecideOverrideRequest).toHaveBeenCalledTimes(1);
    });

    it('blocks PATCH decision for non-allowed role governance', async () => {
        mockGetRequestUser.mockReturnValue({ id: 'user-2', role: 'expert', name: 'Expert User' });
        mockCanMutateOverride.mockReturnValue(false);

        const response = await PATCH(makeRequest({
            body: {
                requestId: '00000000-0000-4000-8000-000000000123',
                decision: 'rejected',
                decisionReason: 'Rejecting because incident severity has recovered.',
            },
        }));

        expect(response.status).toBe(403);
        expect(mockDecideOverrideRequest).not.toHaveBeenCalled();
    });
});
