import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockListCredentialStatus = vi.fn();
const mockGetCredentialStatus = vi.fn();
const mockUpsertCredential = vi.fn();
const mockRefreshCredential = vi.fn();
const mockRevokeCredential = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/growth/channel-credentials', () => ({
    listGrowthChannelCredentialStatus: mockListCredentialStatus,
    getGrowthChannelCredentialStatus: mockGetCredentialStatus,
    upsertGrowthChannelCredential: mockUpsertCredential,
    refreshGrowthChannelCredential: mockRefreshCredential,
    revokeGrowthChannelCredential: mockRevokeCredential,
}));

const { GET, PUT, POST, DELETE } = await import('@/app/api/growth/channel-credentials/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
    } as unknown as NextRequest;
}

function makeJsonRequest(url: string, body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url,
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth/channel-credentials route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin', name: 'User One' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockListCredentialStatus.mockResolvedValue([]);
        mockGetCredentialStatus.mockResolvedValue(null);
        mockRefreshCredential.mockResolvedValue(null);
        mockRevokeCredential.mockResolvedValue(false);
    });

    it('returns all credential statuses', async () => {
        mockListCredentialStatus.mockResolvedValue([
            {
                userId: 'user-1',
                channel: 'pinterest',
                configured: true,
                revoked: false,
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
                hasRefreshToken: false,
                scopes: [],
                providerAccountId: null,
                metadata: {},
                updatedAt: null,
            },
        ]);

        const response = await GET(makeGetRequest('http://localhost/api/growth/channel-credentials'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.credentials).toHaveLength(1);
        expect(mockListCredentialStatus).toHaveBeenCalledWith('user-1');
    });

    it('returns single channel status when channel filter is provided', async () => {
        mockGetCredentialStatus.mockResolvedValue({
            userId: 'user-1',
            channel: 'youtube_shorts',
            configured: true,
            revoked: false,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            hasRefreshToken: true,
            scopes: [],
            providerAccountId: null,
            metadata: {},
            updatedAt: null,
        });

        const response = await GET(makeGetRequest('http://localhost/api/growth/channel-credentials?channel=youtube_shorts'));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.credentials).toHaveLength(1);
        expect(body.credentials[0].channel).toBe('youtube_shorts');
    });

    it('upserts credential payload', async () => {
        mockUpsertCredential.mockResolvedValue({
            userId: 'user-1',
            channel: 'pinterest',
            configured: true,
            revoked: false,
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            hasRefreshToken: false,
            scopes: [],
            providerAccountId: null,
            metadata: { boardId: 'board-1' },
            updatedAt: null,
        });

        const response = await PUT(makeJsonRequest(
            'http://localhost/api/growth/channel-credentials',
            {
                channel: 'pinterest',
                accessToken: 'token-1',
                metadata: { boardId: 'board-1' },
            },
        ));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(mockUpsertCredential).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'user-1',
            channel: 'pinterest',
            accessToken: 'token-1',
        }));
    });

    it('returns 404 when deleting missing credential', async () => {
        mockRevokeCredential.mockResolvedValue(false);

        const response = await DELETE(makeGetRequest('http://localhost/api/growth/channel-credentials?channel=pinterest'));
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toContain('not found');
    });

    it('refreshes a credential via POST', async () => {
        mockRefreshCredential.mockResolvedValue({
            refreshed: true,
            credential: {
                userId: 'user-1',
                channel: 'youtube_shorts',
                configured: true,
                revoked: false,
                accessTokenExpiresAt: null,
                refreshTokenExpiresAt: null,
                hasRefreshToken: true,
                scopes: [],
                providerAccountId: null,
                metadata: {},
                updatedAt: null,
            },
        });

        const response = await POST(makeJsonRequest(
            'http://localhost/api/growth/channel-credentials',
            {
                channel: 'youtube_shorts',
            },
        ));

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.refreshed).toBe(true);
        expect(mockRefreshCredential).toHaveBeenCalledWith(
            'user-1',
            'youtube_shorts',
            { force: true },
        );
    });
});
