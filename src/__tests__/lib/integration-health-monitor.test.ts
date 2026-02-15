import { describe, expect, it } from 'vitest';
import {
    assessIntegrationConnectionHealth,
    resolveIntegrationHealthConfig,
    runIntegrationHealthSweep,
} from '@/lib/integrations/health-monitor';

describe('integration health monitor', () => {
    it('resolves bounded defaults', () => {
        const config = resolveIntegrationHealthConfig({});

        expect(config.enabled).toBe(false);
        expect(config.staleWarningHours).toBe(24);
        expect(config.staleCriticalHours).toBe(72);
        expect(config.neverSyncedGraceHours).toBe(24);
        expect(config.maxConnections).toBe(1000);
        expect(config.topIssueLimit).toBe(50);
        expect(config.maxAlertsPerSweep).toBe(25);
    });

    it('marks stale failing connection as critical', () => {
        const now = new Date('2026-02-15T12:00:00.000Z');
        const lastSyncAt = new Date('2026-02-10T12:00:00.000Z');

        const assessment = assessIntegrationConnectionHealth({
            status: 'error',
            hasCredential: true,
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            lastSyncAt,
            lastSyncStatus: 'failed',
            now,
            config: {
                staleWarningHours: 24,
                staleCriticalHours: 72,
                neverSyncedGraceHours: 24,
            },
        });

        expect(assessment.severity).toBe('critical');
        expect(assessment.reasons).toContain('connection_status_error');
        expect(assessment.reasons).toContain('last_sync_failed');
        expect(assessment.reasons).toContain('sync_stale_critical');
        expect((assessment.syncAgeHours ?? 0) > 72).toBe(true);
    });

    it('short-circuits sweep when disabled and not forced', async () => {
        const summary = await runIntegrationHealthSweep({
            enabled: false,
            force: false,
        });

        expect(summary.enabled).toBe(false);
        expect(summary.scanned).toBe(0);
        expect(summary.warning).toBe(0);
        expect(summary.critical).toBe(0);
        expect(summary.alertsCreated).toBe(0);
    });
});
