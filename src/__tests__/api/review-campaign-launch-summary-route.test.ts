import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockSummary = vi.fn();
const mockListPending = vi.fn();

mockCreateRateLimiter.mockReturnValue(() => ({
    allowed: true,
    headers: {},
}));

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
    getRequestUser: mockGetRequestUser,
}));

vi.mock('@/lib/rate-limit', () => ({
    createRateLimiter: mockCreateRateLimiter,
    getClientIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/review/campaign-launch-sla', () => ({
    getCampaignLaunchReviewSlaSummary: mockSummary,
    listPendingCampaignLaunchReviews: mockListPending,
}));

const { GET } = await import('@/app/api/review/tasks/campaign-launch/summary/route');

function makeRequest(url: string): NextRequest {
    return {
        headers: new Headers(),
        url,
        nextUrl: new URL(url),
    } as unknown as NextRequest;
}

describe('campaign launch review summary route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'reviewer' });
        mockSummary.mockResolvedValue({
            generatedAt: '2026-02-15T00:00:00.000Z',
            dueSoonWindowHours: 6,
            pendingCount: 3,
            dueBreachedCount: 1,
            escalatedCount: 1,
            dueSoonCount: 1,
            nextDueAt: null,
            topOverdue: [],
            scannedCount: 3,
            truncated: false,
        });
        mockListPending.mockResolvedValue([]);
    });

    it('returns SLA summary with parsed filters', async () => {
        const response = await GET(
            makeRequest('http://localhost/api/review/tasks/campaign-launch/summary?limit=120&dueSoonWindowHours=8&topIssueLimit=4'),
        );

        expect(response.status).toBe(200);
        expect(mockSummary).toHaveBeenCalledWith({
            limit: 120,
            dueSoonWindowHours: 8,
            topIssueLimit: 4,
        });
    });

    it('returns CSV export when format=csv', async () => {
        mockListPending.mockResolvedValueOnce([{
            taskId: 'task-1',
            campaignId: 'campaign-1',
            domainId: null,
            domainResearchId: null,
            domain: 'example.com',
            createdAt: '2026-02-14T00:00:00.000Z',
            dueAt: '2026-02-15T00:00:00.000Z',
            escalateAt: '2026-02-16T00:00:00.000Z',
            slaBreached: true,
            escalated: false,
            dueInHours: -1.2,
            escalateInHours: 22.8,
        }]);

        const response = await GET(
            makeRequest('http://localhost/api/review/tasks/campaign-launch/summary?format=csv'),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/csv');
        const body = await response.text();
        expect(body).toContain('metric,value');
        expect(body).toContain('taskId,campaignId,domain');
        expect(body).toContain('example.com');
    });
});
