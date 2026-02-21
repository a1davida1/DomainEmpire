import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockRunWorkerOnce = vi.fn();
const mockRestartWorkerIfDead = vi.fn();

vi.mock('@/lib/auth', () => ({
    requireRole: mockRequireRole,
}));

vi.mock('@/lib/ai/worker', () => ({
    runWorkerOnce: mockRunWorkerOnce,
    getQueueStats: vi.fn(),
    getQueueHealth: vi.fn(),
}));

vi.mock('@/lib/ai/worker-bootstrap', () => ({
    restartWorkerIfDead: mockRestartWorkerIfDead,
}));

vi.mock('@/lib/queue/content-queue', () => ({
    getContentQueueBackendHealth: vi.fn(),
}));

const { POST } = await import('../../app/api/queue/process/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('POST /api/queue/process', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockRestartWorkerIfDead.mockResolvedValue(undefined);
        mockRunWorkerOnce.mockResolvedValue({ processed: 0, failed: 0 });
    });

    it('forwards concurrency and per-job-type concurrency overrides', async () => {
        const response = await POST(makeRequest({
            maxJobs: 30,
            jobTypes: ['deploy', 'research', 'bad type'],
            concurrency: 6,
            perJobTypeConcurrency: {
                deploy: 1,
                research: 2,
                'bad type': 7,
            },
        }));

        expect(response.status).toBe(200);
        expect(mockRequireRole).toHaveBeenCalledWith(expect.any(Object), 'admin');
        expect(mockRunWorkerOnce).toHaveBeenCalledWith({
            maxJobs: 30,
            jobTypes: ['deploy', 'research'],
            concurrency: 6,
            perJobTypeConcurrency: {
                deploy: 1,
                research: 2,
            },
        });
    });

    it('clamps invalid numeric values to safe bounds', async () => {
        await POST(makeRequest({
            maxJobs: -10,
            concurrency: 999,
            perJobTypeConcurrency: {
                deploy: -1,
                research: 0,
                outline: 999,
            },
        }));

        expect(mockRunWorkerOnce).toHaveBeenCalledWith({
            maxJobs: 1,
            jobTypes: undefined,
            concurrency: 32,
            perJobTypeConcurrency: {
                outline: 32,
            },
        });
    });
});
