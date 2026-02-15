import { describe, expect, it } from 'vitest';
import { selectCapitalAllocationAutoApplyUpdates } from '@/lib/growth/capital-allocation-policy';

describe('growth capital allocation auto-apply policy', () => {
    const policy = {
        applyHardLimitedPauses: true,
        applyPauseWhenNetLossBelow: -50,
        applyScaleWhenLeadsAtLeast: 25,
        applyScaleMaxCacLtvRatio: 0.9,
    };

    it('applies hard-limited pause updates', () => {
        const updates = selectCapitalAllocationAutoApplyUpdates({
            policy,
            recommendations: [{
                campaignId: 'campaign-1',
                metrics: { leads: 5, estimatedNet: -20 },
                unitEconomics: { cacLtvRatio: 1.5 },
                recommendation: {
                    band: 'pause',
                    hardLimited: true,
                    recommendedStatus: 'paused',
                    recommendedBudget: 100,
                    recommendedDailyCap: 1,
                },
            }],
        });

        expect(updates).toHaveLength(1);
        expect(updates[0].rationale).toBe('auto_apply:hard_limited_loss_guardrail');
        expect(updates[0].recommendedStatus).toBe('paused');
    });

    it('applies scale updates when efficiency threshold passes', () => {
        const updates = selectCapitalAllocationAutoApplyUpdates({
            policy,
            recommendations: [{
                campaignId: 'campaign-2',
                metrics: { leads: 40, estimatedNet: 300 },
                unitEconomics: { cacLtvRatio: 0.6 },
                recommendation: {
                    band: 'scale',
                    hardLimited: false,
                    recommendedStatus: 'active',
                    recommendedBudget: 1400,
                    recommendedDailyCap: 6,
                },
            }],
        });

        expect(updates).toHaveLength(1);
        expect(updates[0].rationale).toBe('auto_apply:scale_efficiency_threshold');
        expect(updates[0].recommendedBudget).toBe(1400);
    });

    it('skips recommendations that do not meet thresholds', () => {
        const updates = selectCapitalAllocationAutoApplyUpdates({
            policy,
            recommendations: [{
                campaignId: 'campaign-3',
                metrics: { leads: 8, estimatedNet: -30 },
                unitEconomics: { cacLtvRatio: 1.2 },
                recommendation: {
                    band: 'optimize',
                    hardLimited: false,
                    recommendedStatus: 'active',
                    recommendedBudget: 900,
                    recommendedDailyCap: 2,
                },
            }],
        });

        expect(updates).toHaveLength(0);
    });
});
