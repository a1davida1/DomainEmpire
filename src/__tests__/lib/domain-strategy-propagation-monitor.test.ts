import { describe, expect, it } from 'vitest';
import {
    resolveStrategyPropagationSweepConfig,
    runStrategyPropagationSweep,
} from '@/lib/domain/strategy-propagation-monitor';

describe('domain strategy propagation monitor', () => {
    it('resolves safe defaults', () => {
        const config = resolveStrategyPropagationSweepConfig({});

        expect(config.enabled).toBe(false);
        expect(config.dryRun).toBe(true);
        expect(config.autoTunePolicy).toBe(false);
        expect(config.forceCrossNiche).toBe(false);
        expect(config.windowDays).toBe(30);
        expect(config.sourceLimit).toBe(10);
        expect(config.targetLimitPerSource).toBe(5);
        expect(config.minSourceScore).toBe(75);
        expect(config.maxTargetScore).toBe(60);
        expect(config.maxRecommendationApplies).toBe(20);
        expect(config.maxTargetUpdates).toBe(100);
        expect(config.allowedModules).toEqual([
            'site_template',
            'schedule',
            'writing_workflow',
            'branding',
        ]);
    });

    it('parses configured values', () => {
        const config = resolveStrategyPropagationSweepConfig({
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_ENABLED: 'true',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_DRY_RUN: 'false',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_AUTO_TUNE: 'true',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_FORCE_CROSS_NICHE: 'true',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_WINDOW_DAYS: '45',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_SOURCE_LIMIT: '15',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_TARGETS_PER_SOURCE: '4',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_MIN_SOURCE_SCORE: '82',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_MAX_TARGET_SCORE: '55',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_MAX_RECOMMENDATIONS: '12',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_MAX_TARGET_UPDATES: '40',
            DOMAIN_STRATEGY_PROPAGATION_SWEEP_MODULES: 'schedule,branding,invalid',
        });

        expect(config.enabled).toBe(true);
        expect(config.dryRun).toBe(false);
        expect(config.autoTunePolicy).toBe(true);
        expect(config.forceCrossNiche).toBe(true);
        expect(config.windowDays).toBe(45);
        expect(config.sourceLimit).toBe(15);
        expect(config.targetLimitPerSource).toBe(4);
        expect(config.minSourceScore).toBe(82);
        expect(config.maxTargetScore).toBe(55);
        expect(config.maxRecommendationApplies).toBe(12);
        expect(config.maxTargetUpdates).toBe(40);
        expect(config.allowedModules).toEqual(['schedule', 'branding']);
    });

    it('short-circuits when sweep is disabled and not forced', async () => {
        const summary = await runStrategyPropagationSweep({
            enabled: false,
            force: false,
        });

        expect(summary.enabled).toBe(false);
        expect(summary.recommendationCount).toBe(0);
        expect(summary.candidateSources).toBe(0);
        expect(summary.candidateTargets).toBe(0);
        expect(summary.appliedSources).toBe(0);
        expect(summary.appliedTargets).toBe(0);
    });
});
