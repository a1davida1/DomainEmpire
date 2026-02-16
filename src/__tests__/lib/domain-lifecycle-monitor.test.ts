import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateNotification = vi.fn();
const mockSendOpsChannelAlert = vi.fn();
const mockNotDeleted = vi.fn(() => ({ type: 'notDeleted' }));

let lifecycleEventsRows: Array<{
    id: string;
    domainId: string;
    domain: string;
    fromState: string;
    toState: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}> = [];

const sqlMock = ((strings: TemplateStringsArray, ...values: unknown[]) => ({
    type: 'sql',
    strings: [...strings],
    values,
})) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => unknown);

vi.mock('drizzle-orm', () => ({
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    desc: vi.fn((...args: unknown[]) => ({ type: 'desc', args })),
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
    sql: sqlMock,
}));

vi.mock('@/lib/db/soft-delete', () => ({
    notDeleted: mockNotDeleted,
}));

vi.mock('@/lib/notifications', () => ({
    createNotification: mockCreateNotification,
}));

vi.mock('@/lib/alerts/ops-channel', () => ({
    sendOpsChannelAlert: mockSendOpsChannelAlert,
}));

vi.mock('@/lib/db', () => ({
    db: {
        select: () => ({
            from: () => ({
                innerJoin: () => ({
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => lifecycleEventsRows,
                        }),
                    }),
                }),
            }),
        }),
    },
    domainLifecycleEvents: {
        id: 'id',
        domainId: 'domainId',
        fromState: 'fromState',
        toState: 'toState',
        metadata: 'metadata',
        createdAt: 'createdAt',
    },
    domains: {
        id: 'id',
        domain: 'domain',
        deletedAt: 'deletedAt',
    },
}));

const { runDomainLifecycleMonitorSweep } = await import('@/lib/domain/lifecycle-monitor');

describe('runDomainLifecycleMonitorSweep', () => {
    const originalEnabled = process.env.DOMAIN_LIFECYCLE_MONITOR_SWEEP_ENABLED;

    beforeEach(() => {
        vi.clearAllMocks();
        lifecycleEventsRows = [];
        mockSendOpsChannelAlert.mockResolvedValue({
            delivered: true,
            reason: null,
            statusCode: 200,
        });
        if (originalEnabled === undefined) {
            delete process.env.DOMAIN_LIFECYCLE_MONITOR_SWEEP_ENABLED;
        } else {
            process.env.DOMAIN_LIFECYCLE_MONITOR_SWEEP_ENABLED = originalEnabled;
        }
    });

    it('detects manual reversion and source-SLO breaches, then emits alerts', async () => {
        const now = Date.now();
        lifecycleEventsRows = [
            {
                id: 'evt-2',
                domainId: 'domain-1',
                domain: 'alpha.com',
                fromState: 'growth',
                toState: 'build',
                metadata: { source: 'manual_ui' },
                createdAt: new Date(now - 5 * 60 * 60 * 1000),
            },
            {
                id: 'evt-1',
                domainId: 'domain-1',
                domain: 'alpha.com',
                fromState: 'build',
                toState: 'growth',
                metadata: { source: 'deploy_processor' },
                createdAt: new Date(now - 6 * 60 * 60 * 1000),
            },
            {
                id: 'evt-3',
                domainId: 'domain-2',
                domain: 'beta.com',
                fromState: 'build',
                toState: 'growth',
                metadata: { source: 'manual' },
                createdAt: new Date(now - 4 * 60 * 60 * 1000),
            },
            {
                id: 'evt-4',
                domainId: 'domain-3',
                domain: 'gamma.com',
                fromState: 'build',
                toState: 'growth',
                metadata: { source: 'manual' },
                createdAt: new Date(now - 3 * 60 * 60 * 1000),
            },
        ];

        const summary = await runDomainLifecycleMonitorSweep({
            notify: true,
            dryRun: false,
            windowHours: 24,
            oscillationWindowHours: 24,
            maxAlertsPerSweep: 10,
            sloMinSamples: 2,
            sourceThresholds: {
                acquisition_pipeline: 0,
                deploy_processor: 0,
                growth_campaign_launch: 0.8,
                finance_ledger: 0,
            },
        });

        expect(summary.manualReversions).toBe(1);
        expect(summary.oscillations).toBe(1);
        expect(summary.sloBreaches).toBe(1);
        expect(summary.alertsCreated).toBe(3);

        expect(mockCreateNotification).toHaveBeenCalledTimes(3);
        expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining('Lifecycle manual reversion detected'),
            severity: 'warning',
            domainId: 'domain-1',
            actionUrl: expect.stringContaining('/docs/ops/domain-lifecycle-alert-playbooks.md#lifecycle-001-manual-lifecycle-reversion'),
            metadata: expect.objectContaining({
                anomalyType: 'manual_reversion',
                playbookId: 'LIFECYCLE-001',
            }),
        }));
        expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
            title: expect.stringContaining('Lifecycle automation SLO breach'),
            severity: 'critical',
            actionUrl: expect.stringContaining('/docs/ops/domain-lifecycle-alert-playbooks.md#lifecycle-005-lifecycle-automation-slo-breach-critical'),
            metadata: expect.objectContaining({
                anomalyType: 'automation_slo_breach',
                playbookId: 'LIFECYCLE-005',
            }),
        }));
        expect(mockSendOpsChannelAlert).toHaveBeenCalledTimes(1);
        expect(mockSendOpsChannelAlert).toHaveBeenCalledWith(expect.objectContaining({
            details: expect.objectContaining({
                anomalyType: 'automation_slo_breach',
                playbookId: 'LIFECYCLE-005',
            }),
        }));
    });

    it('supports dry-run mode without creating notifications', async () => {
        const now = Date.now();
        lifecycleEventsRows = [
            {
                id: 'evt-1',
                domainId: 'domain-1',
                domain: 'alpha.com',
                fromState: 'growth',
                toState: 'build',
                metadata: { source: 'manual' },
                createdAt: new Date(now - 2 * 60 * 60 * 1000),
            },
        ];

        const summary = await runDomainLifecycleMonitorSweep({
            notify: true,
            dryRun: true,
            windowHours: 24,
            sourceThresholds: {
                acquisition_pipeline: 0,
                deploy_processor: 0,
                growth_campaign_launch: 0,
                finance_ledger: 0,
            },
        });

        expect(summary.manualReversions).toBe(1);
        expect(summary.alertsCreated).toBe(0);
        expect(summary.opsAlertsSent).toBe(0);
        expect(mockCreateNotification).not.toHaveBeenCalled();
        expect(mockSendOpsChannelAlert).not.toHaveBeenCalled();
    });

    it('short-circuits when monitor is disabled and force is false', async () => {
        process.env.DOMAIN_LIFECYCLE_MONITOR_SWEEP_ENABLED = 'false';

        const summary = await runDomainLifecycleMonitorSweep({
            force: false,
        });

        expect(summary.enabled).toBe(false);
        expect(summary.scannedEvents).toBe(0);
        expect(summary.alertsCreated).toBe(0);
        expect(mockCreateNotification).not.toHaveBeenCalled();
    });
});
