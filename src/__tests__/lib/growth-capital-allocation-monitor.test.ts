import { describe, expect, it } from 'vitest';
import {
    resolveCapitalAllocationSweepConfig,
    runCapitalAllocationSweep,
} from '@/lib/growth/capital-allocation-monitor';

describe('growth capital allocation monitor', () => {
    it('resolves safe defaults from env', () => {
        const config = resolveCapitalAllocationSweepConfig({});

        expect(config.enabled).toBe(false);
        expect(config.dryRun).toBe(true);
        expect(config.autoTunePolicy).toBe(false);
        expect(config.statuses).toEqual(['active', 'paused']);
        expect(config.windowDays).toBe(30);
        expect(config.dailyLossLimit).toBe(150);
        expect(config.weeklyLossLimit).toBe(750);
        expect(config.recommendationLimit).toBe(200);
        expect(config.maxAutoApplyUpdates).toBe(50);
        expect(config.policy.applyHardLimitedPauses).toBe(true);
        expect(config.policy.applyPauseWhenNetLossBelow).toBe(-50);
        expect(config.policy.applyScaleWhenLeadsAtLeast).toBe(25);
        expect(config.policy.applyScaleMaxCacLtvRatio).toBe(0.9);
    });

    it('parses and bounds configured values', () => {
        const config = resolveCapitalAllocationSweepConfig({
            GROWTH_CAPITAL_ALLOCATION_SWEEP_ENABLED: 'true',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_DRY_RUN: 'false',
            GROWTH_CAPITAL_ALLOCATION_POLICY_AUTO_TUNE: 'true',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_STATUSES: 'active,paused,active,invalid',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_WINDOW_DAYS: '10',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_DAILY_LOSS_LIMIT: '220.5',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_WEEKLY_LOSS_LIMIT: '1200.25',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_LIMIT: '150',
            GROWTH_CAPITAL_ALLOCATION_SWEEP_MAX_UPDATES: '25',
            GROWTH_CAPITAL_ALLOCATION_POLICY_APPLY_HARD_LIMITED: 'false',
            GROWTH_CAPITAL_ALLOCATION_POLICY_PAUSE_NET_LOSS_BELOW: '-125',
            GROWTH_CAPITAL_ALLOCATION_POLICY_SCALE_LEADS_AT_LEAST: '40',
            GROWTH_CAPITAL_ALLOCATION_POLICY_SCALE_MAX_CAC_LTV: '0.75',
        });

        expect(config.enabled).toBe(true);
        expect(config.dryRun).toBe(false);
        expect(config.autoTunePolicy).toBe(true);
        expect(config.statuses).toEqual(['active', 'paused']);
        expect(config.windowDays).toBe(10);
        expect(config.dailyLossLimit).toBe(220.5);
        expect(config.weeklyLossLimit).toBe(1200.25);
        expect(config.recommendationLimit).toBe(150);
        expect(config.maxAutoApplyUpdates).toBe(25);
        expect(config.policy.applyHardLimitedPauses).toBe(false);
        expect(config.policy.applyPauseWhenNetLossBelow).toBe(-125);
        expect(config.policy.applyScaleWhenLeadsAtLeast).toBe(40);
        expect(config.policy.applyScaleMaxCacLtvRatio).toBe(0.75);
    });

    it('short-circuits when sweep is disabled and not forced', async () => {
        const summary = await runCapitalAllocationSweep({
            enabled: false,
            force: false,
        });

        expect(summary.enabled).toBe(false);
        expect(summary.recommendations).toBe(0);
        expect(summary.candidateUpdates).toBe(0);
        expect(summary.appliedCount).toBe(0);
    });
});
