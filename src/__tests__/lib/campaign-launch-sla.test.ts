import { describe, expect, it } from 'vitest';
import {
    resolveCampaignLaunchReviewEscalationConfig,
    runCampaignLaunchReviewEscalationSweep,
} from '@/lib/review/campaign-launch-sla';

describe('campaign launch review SLA', () => {
    it('resolves defaults', () => {
        const config = resolveCampaignLaunchReviewEscalationConfig({});

        expect(config.enabled).toBe(true);
        expect(config.limit).toBe(250);
        expect(config.maxAlertsPerSweep).toBe(25);
        expect(config.alertCooldownHours).toBe(24);
        expect(config.createInAppNotifications).toBe(true);
        expect(config.notifyOps).toBe(true);
    });

    it('parses configured overrides', () => {
        const config = resolveCampaignLaunchReviewEscalationConfig({
            CAMPAIGN_LAUNCH_REVIEW_SWEEP_ENABLED: 'false',
            CAMPAIGN_LAUNCH_REVIEW_SWEEP_LIMIT: '600',
            CAMPAIGN_LAUNCH_REVIEW_MAX_ALERTS_PER_SWEEP: '40',
            CAMPAIGN_LAUNCH_REVIEW_ALERT_COOLDOWN_HOURS: '12',
            CAMPAIGN_LAUNCH_REVIEW_IN_APP_NOTIFICATIONS: 'false',
            CAMPAIGN_LAUNCH_REVIEW_NOTIFY_OPS: 'false',
        });

        expect(config.enabled).toBe(false);
        expect(config.limit).toBe(600);
        expect(config.maxAlertsPerSweep).toBe(40);
        expect(config.alertCooldownHours).toBe(12);
        expect(config.createInAppNotifications).toBe(false);
        expect(config.notifyOps).toBe(false);
    });

    it('short-circuits sweep when disabled and not forced', async () => {
        const summary = await runCampaignLaunchReviewEscalationSweep({
            enabled: false,
            force: false,
        });

        expect(summary.enabled).toBe(false);
        expect(summary.scanned).toBe(0);
        expect(summary.pendingCount).toBe(0);
        expect(summary.alerted).toBe(0);
        expect(summary.errors).toBe(0);
    });
});
