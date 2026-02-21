import { describe, expect, it } from 'vitest';
import {
    buildQueueSloAlerts,
    normalizePerJobTypeConcurrency,
    normalizeWorkerConcurrency,
    parseJobTypeConcurrencyMap,
    type QueueSloThresholds,
} from '../../lib/ai/worker-queue-utils';

const TEST_THRESHOLDS: QueueSloThresholds = {
    pendingAgeMs: 10_000,
    errorRatePct: 5,
    workerIdleMs: 15_000,
    pendingBacklog: 12,
};

describe('worker queue utilities', () => {
    it('parses per-job-type concurrency map with sanitization', () => {
        const parsed = parseJobTypeConcurrencyMap('deploy:2, research: 4, bad-type:9, seo_optimize:500, generate_draft:-1,invalid');

        expect(parsed).toEqual({
            deploy: 2,
            research: 4,
            seo_optimize: 32,
        });
    });

    it('normalizes worker concurrency using fallback and clamps range', () => {
        expect(normalizeWorkerConcurrency(undefined, 6)).toBe(6);
        expect(normalizeWorkerConcurrency(0, 6)).toBe(1);
        expect(normalizeWorkerConcurrency(99, 6)).toBe(32);
        expect(normalizeWorkerConcurrency(7.9, 6)).toBe(7);
    });

    it('merges per-job-type overrides with defaults safely', () => {
        const merged = normalizePerJobTypeConcurrency(
            {
                deploy: 1,
                research: 8,
                badType: -1,
                'bad-type': 4,
                generate_outline: 100,
            },
            {
                deploy: 2,
                generate_draft: 1,
            },
        );

        expect(merged).toEqual({
            deploy: 1,
            generate_draft: 1,
            research: 8,
            generate_outline: 32,
        });
    });

    it('builds queue SLO alerts with warning and critical severities', () => {
        const alerts = buildQueueSloAlerts({
            oldestPendingAgeMs: 25_000,
            errorRate24h: 12,
            pending: 30,
            latestWorkerActivityAgeMs: 20_000,
            thresholds: TEST_THRESHOLDS,
        });

        expect(alerts.map((alert) => alert.code)).toEqual([
            'pending_age',
            'error_rate',
            'pending_backlog',
            'worker_idle',
        ]);
        expect(alerts.find((alert) => alert.code === 'pending_age')?.severity).toBe('critical');
        expect(alerts.find((alert) => alert.code === 'error_rate')?.severity).toBe('critical');
        expect(alerts.find((alert) => alert.code === 'pending_backlog')?.severity).toBe('critical');
        expect(alerts.find((alert) => alert.code === 'worker_idle')?.severity).toBe('critical');
    });

    it('does not emit worker idle when there is no pending backlog', () => {
        const alerts = buildQueueSloAlerts({
            oldestPendingAgeMs: null,
            errorRate24h: 0,
            pending: 0,
            latestWorkerActivityAgeMs: 99_000,
            thresholds: TEST_THRESHOLDS,
        });

        expect(alerts).toEqual([]);
    });
});
