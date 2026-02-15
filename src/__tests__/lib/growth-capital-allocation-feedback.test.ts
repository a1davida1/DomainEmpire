import { describe, expect, it } from 'vitest';
import { recommendCapitalAllocationPolicy } from '@/lib/growth/capital-allocation-feedback';

describe('capital allocation feedback policy recommendation', () => {
    const basePolicy = {
        applyHardLimitedPauses: true,
        applyPauseWhenNetLossBelow: -50,
        applyScaleWhenLeadsAtLeast: 25,
        applyScaleMaxCacLtvRatio: 0.9,
    };

    it('tightens thresholds on weak outcomes', () => {
        const recommendation = recommendCapitalAllocationPolicy({
            basePolicy,
            outcome: {
                evaluated: 20,
                scaleSamples: 10,
                scaleSuccesses: 3,
                scaleSuccessRate: 0.3,
                pauseSamples: 10,
                pauseSuccesses: 3,
                pauseSuccessRate: 0.3,
            },
        });

        expect(recommendation.recommendedPolicy.applyScaleWhenLeadsAtLeast).toBe(30);
        expect(recommendation.recommendedPolicy.applyScaleMaxCacLtvRatio).toBe(0.85);
        expect(recommendation.recommendedPolicy.applyPauseWhenNetLossBelow).toBe(-75);
        expect(recommendation.rationale.length).toBeGreaterThan(0);
    });

    it('relaxes thresholds on strong outcomes', () => {
        const recommendation = recommendCapitalAllocationPolicy({
            basePolicy,
            outcome: {
                evaluated: 20,
                scaleSamples: 10,
                scaleSuccesses: 8,
                scaleSuccessRate: 0.8,
                pauseSamples: 10,
                pauseSuccesses: 8,
                pauseSuccessRate: 0.8,
            },
        });

        expect(recommendation.recommendedPolicy.applyScaleWhenLeadsAtLeast).toBe(22);
        expect(recommendation.recommendedPolicy.applyScaleMaxCacLtvRatio).toBe(0.95);
        expect(recommendation.recommendedPolicy.applyPauseWhenNetLossBelow).toBe(-25);
    });
});
