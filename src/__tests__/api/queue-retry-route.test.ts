import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireAuth = vi.fn();
const mockRetryFailedJobsDetailed = vi.fn();
const mockGetContentQueueBackendHealth = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/ai/worker', () => ({
    retryFailedJobsDetailed: mockRetryFailedJobsDetailed,
}));

vi.mock('@/lib/queue/content-queue', () => ({
    getContentQueueBackendHealth: mockGetContentQueueBackendHealth,
}));

const { POST } = await import('@/app/api/queue/retry/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('POST /api/queue/retry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireAuth.mockResolvedValue(null);
        mockGetContentQueueBackendHealth.mockResolvedValue({ mode: 'postgres' });
        mockRetryFailedJobsDetailed.mockResolvedValue({
            mode: 'all',
            dryRun: false,
            selectedCount: 0,
            retriedCount: 0,
            filters: { jobTypes: [], domainId: null, minFailedAgeMs: 120000 },
            candidates: [],
        });
    });

    it('passes replay filters to detailed retry helper', async () => {
        const response = await POST(makeRequest({
            mode: 'transient',
            dryRun: true,
            limit: 40,
            jobTypes: ['deploy', 'research', 'bad type'],
            domainId: '11111111-1111-1111-1111-111111111111',
            minFailedAgeMs: 600000,
        }));

        expect(response.status).toBe(200);
        expect(mockRetryFailedJobsDetailed).toHaveBeenCalledWith(40, {
            mode: 'transient',
            dryRun: true,
            jobTypes: ['deploy', 'research'],
            domainId: '11111111-1111-1111-1111-111111111111',
            minFailedAgeMs: 600000,
        });
    });

    it('falls back to safe defaults for invalid payload values', async () => {
        await POST(makeRequest({
            mode: 'unsupported',
            dryRun: false,
            limit: -20,
            jobTypes: [' ', '***'],
            domainId: 'not-a-uuid',
            minFailedAgeMs: -1,
        }));

        expect(mockRetryFailedJobsDetailed).toHaveBeenCalledWith(1, {
            mode: 'all',
            dryRun: false,
            jobTypes: [],
            domainId: undefined,
            minFailedAgeMs: 0,
        });
    });
});
