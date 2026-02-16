import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockRequireRole = vi.fn();
const mockGetRequestUser = vi.fn();
const mockCreateRateLimiter = vi.fn();
const mockRunDomainLifecycleMonitorSweep = vi.fn();

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

vi.mock('@/lib/domain/lifecycle-monitor', () => ({
    runDomainLifecycleMonitorSweep: mockRunDomainLifecycleMonitorSweep,
}));

const { POST } = await import('@/app/api/domains/lifecycle/sweep/route');

function makeRequest(body: unknown): NextRequest {
    return {
        headers: new Headers(),
        json: async () => body,
    } as unknown as NextRequest;
}

describe('domain lifecycle monitor sweep route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireRole.mockResolvedValue(null);
        mockGetRequestUser.mockReturnValue({ id: 'user-1', role: 'admin' });
        mockRunDomainLifecycleMonitorSweep.mockResolvedValue({
            enabled: true,
            dryRun: false,
            windowHours: 168,
            scannedEvents: 12,
            manualReversions: 1,
            oscillations: 0,
            sloBreaches: 0,
            alertsCreated: 1,
            opsAlertsSent: 0,
            opsAlertsFailed: 0,
            generatedAt: '2026-02-16T00:00:00.000Z',
            windowStart: '2026-02-09T00:00:00.000Z',
            sourceStats: [],
            samples: {
                manualReversions: [],
                oscillations: [],
            },
        });
    });

    it('runs lifecycle monitor sweep with payload overrides', async () => {
        const response = await POST(makeRequest({
            force: true,
            notify: false,
            dryRun: true,
            windowHours: 48,
            maxEvents: 2000,
            maxAlertsPerSweep: 10,
            oscillationWindowHours: 12,
            sloMinSamples: 3,
            sourceThresholds: {
                growth_campaign_launch: 0.9,
            },
        }));

        expect(response.status).toBe(200);
        expect(mockRunDomainLifecycleMonitorSweep).toHaveBeenCalledWith({
            force: true,
            notify: false,
            dryRun: true,
            windowHours: 48,
            maxEvents: 2000,
            maxAlertsPerSweep: 10,
            oscillationWindowHours: 12,
            sloMinSamples: 3,
            sourceThresholds: {
                growth_campaign_launch: 0.9,
            },
        });
    });
});
