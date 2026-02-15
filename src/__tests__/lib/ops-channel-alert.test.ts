import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalFetch = global.fetch;

describe('ops channel alert utility', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete process.env.OPS_ALERT_WEBHOOK_URL;
        delete process.env.GROWTH_FAIRNESS_OPS_WEBHOOK_URL;
        delete process.env.GROWTH_FAIRNESS_OPS_FORWARD_WARNINGS;
        delete process.env.OPS_ALERT_MIN_INTERVAL_SECONDS;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns not configured when webhook env vars are missing', async () => {
        const { sendOpsChannelAlert, resetOpsChannelAlertDedupCache } = await import('@/lib/alerts/ops-channel');
        resetOpsChannelAlertDedupCache();
        const result = await sendOpsChannelAlert({
            source: 'growth_media_review_assignment',
            severity: 'warning',
            title: 'Test',
            message: 'No webhook should no-op',
        });

        expect(result).toEqual({ delivered: false, reason: 'webhook_not_configured' });
    });

    it('posts alert payload to configured webhook', async () => {
        process.env.GROWTH_FAIRNESS_OPS_WEBHOOK_URL = 'https://ops.example/webhook';
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        global.fetch = fetchMock as unknown as typeof fetch;

        const { sendOpsChannelAlert, resetOpsChannelAlertDedupCache } = await import('@/lib/alerts/ops-channel');
        resetOpsChannelAlertDedupCache();
        const result = await sendOpsChannelAlert({
            source: 'growth_media_review_assignment',
            severity: 'critical',
            title: 'Override applied',
            message: 'Assignment override triggered',
            details: { taskId: 'task-1' },
        });

        expect(result.delivered).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://ops.example/webhook',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('rate-limits repeated alerts with the same dedup key', async () => {
        process.env.GROWTH_FAIRNESS_OPS_WEBHOOK_URL = 'https://ops.example/webhook';
        process.env.OPS_ALERT_MIN_INTERVAL_SECONDS = '3600';
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
        global.fetch = fetchMock as unknown as typeof fetch;

        const { sendOpsChannelAlert, resetOpsChannelAlertDedupCache } = await import('@/lib/alerts/ops-channel');
        resetOpsChannelAlertDedupCache();

        const first = await sendOpsChannelAlert({
            source: 'growth_media_review_assignment',
            severity: 'warning',
            title: 'Duplicate warning',
            message: 'First send should deliver',
        });
        const second = await sendOpsChannelAlert({
            source: 'growth_media_review_assignment',
            severity: 'warning',
            title: 'Duplicate warning',
            message: 'Second send should be blocked',
        });

        expect(first.delivered).toBe(true);
        expect(second).toEqual({ delivered: false, reason: 'rate_limited' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('parses forward warnings flag from env', async () => {
        const { shouldForwardFairnessWarningsToOps } = await import('@/lib/alerts/ops-channel');

        expect(shouldForwardFairnessWarningsToOps()).toBe(false);

        process.env.GROWTH_FAIRNESS_OPS_FORWARD_WARNINGS = 'true';
        expect(shouldForwardFairnessWarningsToOps()).toBe(true);

        process.env.GROWTH_FAIRNESS_OPS_FORWARD_WARNINGS = '0';
        expect(shouldForwardFairnessWarningsToOps()).toBe(false);
    });
});
