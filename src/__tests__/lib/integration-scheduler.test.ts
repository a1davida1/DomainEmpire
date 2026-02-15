import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockEnqueueContentJob = vi.fn();

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
    sql: vi.fn((...args: unknown[]) => ({ type: 'sql', args })),
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: mockSelect,
    },
    contentQueue: {
        id: 'id',
        jobType: 'job_type',
        status: 'status',
        payload: 'payload',
    },
    integrationConnections: {
        id: 'id',
        userId: 'user_id',
        provider: 'provider',
        status: 'status',
        config: 'config',
        lastSyncAt: 'last_sync_at',
        createdAt: 'created_at',
    },
    integrationSyncRuns: {
        id: 'id',
        connectionId: 'connection_id',
        status: 'status',
    },
}));

vi.mock('@/lib/queue/content-queue', () => ({
    enqueueContentJob: mockEnqueueContentJob,
}));

const { scheduleIntegrationConnectionSyncJobs } = await import('@/lib/integrations/scheduler');

describe('integration scheduler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEnqueueContentJob.mockResolvedValue('job-1');
    });

    it('queues scheduled sync jobs when connections are due', async () => {
        const now = new Date();
        const lastSyncAt = new Date(now.getTime() - (5 * 60 * 60 * 1000)); // 5h ago
        mockLimit
            // list candidate connections
            .mockResolvedValueOnce([
                {
                    id: '00000000-0000-4000-8000-000000000010',
                    userId: '00000000-0000-4000-8000-000000000001',
                    provider: 'cloudflare',
                    status: 'connected',
                    config: {
                        autoSyncEnabled: true,
                        syncIntervalMinutes: 60,
                        syncLookbackDays: 14,
                    },
                    lastSyncAt,
                    createdAt: new Date(now.getTime() - (48 * 60 * 60 * 1000)),
                },
            ])
            // existing queue job check
            .mockResolvedValueOnce([])
            // existing running sync run check
            .mockResolvedValueOnce([]);

        const summary = await scheduleIntegrationConnectionSyncJobs();

        expect(summary.consideredConnections).toBe(1);
        expect(summary.queuedJobs).toBe(1);
        expect(summary.skippedNotDue).toBe(0);
        expect(mockEnqueueContentJob).toHaveBeenCalledTimes(1);
        expect(mockEnqueueContentJob).toHaveBeenCalledWith(expect.objectContaining({
            jobType: 'run_integration_connection_sync',
            status: 'pending',
            payload: expect.objectContaining({
                connectionId: '00000000-0000-4000-8000-000000000010',
                actorUserId: '00000000-0000-4000-8000-000000000001',
                runType: 'scheduled',
                days: 14,
            }),
        }));
    });

    it('skips auto-sync-disabled connections', async () => {
        mockLimit.mockResolvedValueOnce([
            {
                id: '00000000-0000-4000-8000-000000000020',
                userId: '00000000-0000-4000-8000-000000000001',
                provider: 'godaddy',
                status: 'connected',
                config: {
                    autoSyncEnabled: false,
                    syncIntervalMinutes: 60,
                    syncLookbackDays: 30,
                },
                lastSyncAt: null,
                createdAt: new Date(Date.now() - (24 * 60 * 60 * 1000)),
            },
        ]);

        const summary = await scheduleIntegrationConnectionSyncJobs();

        expect(summary.consideredConnections).toBe(1);
        expect(summary.skippedDisabled).toBe(1);
        expect(summary.queuedJobs).toBe(0);
        expect(mockEnqueueContentJob).not.toHaveBeenCalled();
    });
});
