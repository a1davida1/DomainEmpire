import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockCountActiveCredentials = vi.fn();
const mockRevokeCredentials = vi.fn();
const mockCreateNotification = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/channel-credentials', () => ({
    countActiveGrowthChannelCredentials: mockCountActiveCredentials,
    revokeGrowthCredentialsForReconnect: mockRevokeCredentials,
}));

vi.mock('@/lib/notifications', () => ({
    createNotification: mockCreateNotification,
}));

const { POST } = await import('@/app/api/growth/channel-credentials/reconnect/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
        url: 'http://localhost/api/growth/channel-credentials/reconnect',
    } as unknown as NextRequest;
}

describe('growth/channel-credentials reconnect route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockCountActiveCredentials.mockResolvedValue(2);
        mockRevokeCredentials.mockResolvedValue(2);
        mockCreateNotification.mockResolvedValue('notification-1');
    });

    it('supports dry run without revoking', async () => {
        const response = await POST(makeRequest({ dryRun: true, channel: 'pinterest' }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.dryRun).toBe(true);
        expect(body.activeCount).toBe(2);
        expect(mockRevokeCredentials).not.toHaveBeenCalled();
    });

    it('revokes active credentials and notifies', async () => {
        const response = await POST(makeRequest({ channel: 'youtube_shorts' }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.revokedCount).toBe(2);
        expect(mockRevokeCredentials).toHaveBeenCalledWith('user-1', 'youtube_shorts');
        expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('returns 404 when there are no active credentials', async () => {
        mockCountActiveCredentials.mockResolvedValue(0);

        const response = await POST(makeRequest({}));
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('No active credentials');
        expect(mockRevokeCredentials).not.toHaveBeenCalled();
    });
});

