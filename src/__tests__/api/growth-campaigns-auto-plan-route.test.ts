import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockGeneratePreview = vi.fn();
const mockApplyAutoplan = vi.fn();

mockCreateRateLimiter.mockReturnValue(() => ({
    allowed: true,
    headers: {},
}));

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/feature-flags', () => ({
    isFeatureEnabled: mockIsFeatureEnabled,
}));

vi.mock('@/lib/rate-limit', () => ({
    createRateLimiter: mockCreateRateLimiter,
    getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/growth/roi-campaign-autoplan', () => ({
    generateRoiCampaignAutoplanPreview: mockGeneratePreview,
    applyRoiCampaignAutoplan: mockApplyAutoplan,
}));

const { GET, POST } = await import('@/app/api/growth/campaigns/auto-plan/route');

function makeGetRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
        nextUrl: new URL(url),
    } as unknown as NextRequest;
}

function makePostRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        url: 'http://localhost/api/growth/campaigns/auto-plan',
        json: async () => body,
    } as unknown as NextRequest;
}

describe('growth campaign auto-plan route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'expert' });
        mockIsFeatureEnabled.mockReturnValue(true);
        mockGeneratePreview.mockResolvedValue({
            windowDays: 30,
            limit: 25,
            actionFilter: ['scale', 'optimize', 'recover', 'incubate'],
            generatedAt: '2026-02-15T12:00:00.000Z',
            count: 1,
            creatableCount: 1,
            blockedCount: 0,
            plans: [],
            blockedReasonCounts: {},
        });
        mockApplyAutoplan.mockResolvedValue({
            attemptedCount: 1,
            createdCount: 1,
            skippedCount: 0,
            created: [{ campaignId: 'campaign-1', domain: 'example.com' }],
            skipped: [],
        });
    });

    it('returns preview on GET with parsed filters', async () => {
        const response = await GET(
            makeGetRequest('http://localhost/api/growth/campaigns/auto-plan?limit=10&windowDays=14&actions=scale,recover'),
        );

        expect(response.status).toBe(200);
        expect(mockGeneratePreview).toHaveBeenCalledWith({
            limit: 10,
            windowDays: 14,
            actions: ['scale', 'recover'],
        });
    });

    it('returns dry-run preview on POST dryRun=true', async () => {
        const response = await POST(makePostRequest({
            dryRun: true,
            limit: 12,
            windowDays: 21,
            actions: ['scale', 'optimize'],
            reason: 'ROI queue auto-plan from domains dashboard',
        }));

        expect(response.status).toBe(200);
        expect(mockGeneratePreview).toHaveBeenCalledWith({
            limit: 12,
            windowDays: 21,
            actions: ['scale', 'optimize'],
        });
        expect(mockApplyAutoplan).not.toHaveBeenCalled();
    });

    it('applies draft creation on POST dryRun=false', async () => {
        const response = await POST(makePostRequest({
            dryRun: false,
            autoLaunch: true,
            autoLaunchActions: ['scale', 'optimize'],
            launchPriority: 4,
            limit: 15,
            windowDays: 30,
            actions: ['scale', 'optimize', 'recover', 'incubate'],
            reason: 'ROI queue auto-plan from domains dashboard',
            maxCreates: 5,
        }));

        expect(response.status).toBe(200);
        expect(mockApplyAutoplan).toHaveBeenCalledWith(expect.objectContaining({
            createdBy: 'user-1',
            reason: 'ROI queue auto-plan from domains dashboard',
            maxCreates: 5,
            autoLaunch: true,
            autoLaunchActions: ['scale', 'optimize'],
            launchPriority: 4,
            requirePreviewApproval: true,
        }));
    });

    it('blocks non-expert apply while allowing dry-run previews', async () => {
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'reviewer' });

        const response = await POST(makePostRequest({
            dryRun: false,
            limit: 15,
            windowDays: 30,
            actions: ['scale', 'optimize', 'recover', 'incubate'],
            reason: 'ROI queue auto-plan from domains dashboard',
        }));

        expect(response.status).toBe(403);
        const body = await response.json();
        expect(body.message).toContain('expert or admin role');
        expect(mockApplyAutoplan).not.toHaveBeenCalled();
    });
});
