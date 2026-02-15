import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockExecuteGrowthCredentialDrill = vi.fn();
const mockListGrowthCredentialDrillRuns = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/credential-drills', () => ({
    executeGrowthCredentialDrill: mockExecuteGrowthCredentialDrill,
    listGrowthCredentialDrillRuns: mockListGrowthCredentialDrillRuns,
}));

const { GET, POST } = await import('@/app/api/growth/channel-credentials/drill/route');

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
        url: 'http://localhost/api/growth/channel-credentials/drill',
    } as unknown as NextRequest;
}

describe('growth/channel-credentials/drill route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockListGrowthCredentialDrillRuns.mockResolvedValue([]);
        mockExecuteGrowthCredentialDrill.mockResolvedValue({
            status: 'success',
            dryRun: true,
            scope: 'all',
            checklist: {
                campaignLaunchFrozen: false,
                monitoringChecked: false,
                providerTokensRevoked: false,
                reconnectCompleted: false,
                testPublishValidated: false,
            },
            results: {
                scope: 'all',
                channels: ['pinterest', 'youtube_shorts'],
                activeCountBefore: { pinterest: 1, youtube_shorts: 1 },
                revokedCount: { pinterest: 0, youtube_shorts: 0 },
                reconnectApplied: { pinterest: false, youtube_shorts: false },
                refreshValidated: { pinterest: false, youtube_shorts: false },
                refreshRefreshed: { pinterest: false, youtube_shorts: false },
                missingChecklistFields: [],
                errors: [],
            },
            run: {
                id: 'run-1',
            },
        });
    });

    it('lists recent drill runs', async () => {
        mockListGrowthCredentialDrillRuns.mockResolvedValueOnce([
            { id: 'run-1', status: 'success' },
        ]);

        const response = await GET(makeGetRequest('http://localhost/api/growth/channel-credentials/drill?limit=10'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.runs).toHaveLength(1);
        expect(mockListGrowthCredentialDrillRuns).toHaveBeenCalledWith('user-1', { limit: 10, status: undefined });
    });

    it('executes dry-run drill', async () => {
        const response = await POST(makePostRequest({
            dryRun: true,
            scope: 'all',
        }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.status).toBe('success');
        expect(mockExecuteGrowthCredentialDrill).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            dryRun: true,
            scope: 'all',
        }));
    });

    it('returns 409 when drill fails checklist validation', async () => {
        mockExecuteGrowthCredentialDrill.mockResolvedValueOnce({
            status: 'failed',
            dryRun: false,
            scope: 'all',
            checklist: {
                campaignLaunchFrozen: false,
                monitoringChecked: true,
                providerTokensRevoked: true,
                reconnectCompleted: false,
                testPublishValidated: false,
            },
            results: {
                scope: 'all',
                channels: ['pinterest', 'youtube_shorts'],
                activeCountBefore: { pinterest: 1, youtube_shorts: 1 },
                revokedCount: { pinterest: 0, youtube_shorts: 0 },
                reconnectApplied: { pinterest: false, youtube_shorts: false },
                refreshValidated: { pinterest: false, youtube_shorts: false },
                refreshRefreshed: { pinterest: false, youtube_shorts: false },
                missingChecklistFields: ['campaignLaunchFrozen', 'reconnectCompleted', 'testPublishValidated'],
                errors: ['Incident checklist incomplete'],
            },
            run: { id: 'run-2' },
        });

        const response = await POST(makePostRequest({
            dryRun: false,
            incidentChecklistId: 'INC-1234',
            checklist: {
                monitoringChecked: true,
                providerTokensRevoked: true,
            },
        }));
        expect(response.status).toBe(409);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body.status).toBe('failed');
    });

    it('requires incidentChecklistId for non-dry-run drills', async () => {
        const response = await POST(makePostRequest({
            dryRun: false,
            checklist: {
                campaignLaunchFrozen: true,
                monitoringChecked: true,
                providerTokensRevoked: true,
                reconnectCompleted: true,
                testPublishValidated: true,
            },
        }));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Validation failed');
        expect(mockExecuteGrowthCredentialDrill).not.toHaveBeenCalled();
    });
});
