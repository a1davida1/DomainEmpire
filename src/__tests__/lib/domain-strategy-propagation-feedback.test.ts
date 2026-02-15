import { describe, expect, it } from 'vitest';
import { recommendStrategyPropagationPolicy } from '@/lib/domain/strategy-propagation-feedback';

describe('strategy propagation feedback policy recommendation', () => {
    const basePolicy = {
        minSourceScore: 75,
        maxTargetScore: 60,
        allowedModules: ['site_template', 'schedule', 'writing_workflow', 'branding'] as const,
        forceCrossNiche: false,
    };

    it('tightens policy on weak outcomes', () => {
        const recommendation = recommendStrategyPropagationPolicy({
            basePolicy: {
                ...basePolicy,
                allowedModules: [...basePolicy.allowedModules],
            },
            outcome: {
                evaluated: 10,
                successes: 3,
                successRate: 0.3,
                avgScoreDelta: -2,
                crossNiche: { samples: 2, successes: 0, successRate: 0 },
                sameNiche: { samples: 8, successes: 3, successRate: 0.375 },
                moduleOutcomes: [
                    { module: 'site_template', samples: 5, successes: 1, successRate: 0.2 },
                    { module: 'schedule', samples: 5, successes: 1, successRate: 0.2 },
                    { module: 'writing_workflow', samples: 5, successes: 4, successRate: 0.8 },
                    { module: 'branding', samples: 5, successes: 4, successRate: 0.8 },
                ],
            },
        });

        expect(recommendation.recommendedPolicy.minSourceScore).toBe(80);
        expect(recommendation.recommendedPolicy.maxTargetScore).toBe(55);
        expect(recommendation.recommendedPolicy.allowedModules).toEqual(['writing_workflow', 'branding']);
        expect(recommendation.recommendedPolicy.forceCrossNiche).toBe(false);
    });

    it('can enable cross-niche when cross performance is strong', () => {
        const recommendation = recommendStrategyPropagationPolicy({
            basePolicy: {
                ...basePolicy,
                allowedModules: [...basePolicy.allowedModules],
            },
            outcome: {
                evaluated: 20,
                successes: 16,
                successRate: 0.8,
                avgScoreDelta: 7,
                crossNiche: { samples: 8, successes: 8, successRate: 1 },
                sameNiche: { samples: 12, successes: 8, successRate: 0.67 },
                moduleOutcomes: [
                    { module: 'site_template', samples: 6, successes: 4, successRate: 0.67 },
                    { module: 'schedule', samples: 6, successes: 4, successRate: 0.67 },
                    { module: 'writing_workflow', samples: 6, successes: 4, successRate: 0.67 },
                    { module: 'branding', samples: 6, successes: 4, successRate: 0.67 },
                ],
            },
        });

        expect(recommendation.recommendedPolicy.minSourceScore).toBe(72);
        expect(recommendation.recommendedPolicy.maxTargetScore).toBe(65);
        expect(recommendation.recommendedPolicy.forceCrossNiche).toBe(true);
    });
});
