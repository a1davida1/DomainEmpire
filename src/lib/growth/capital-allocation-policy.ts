export type CapitalAutoApplyPolicy = {
    applyHardLimitedPauses: boolean;
    applyPauseWhenNetLossBelow: number;
    applyScaleWhenLeadsAtLeast: number;
    applyScaleMaxCacLtvRatio: number;
};

export type CapitalAutoRecommendationInput = {
    campaignId: string;
    metrics: {
        leads: number;
        estimatedNet: number;
    };
    unitEconomics: {
        cacLtvRatio: number | null;
    };
    recommendation: {
        band: 'scale' | 'maintain' | 'optimize' | 'pause';
        hardLimited: boolean;
        recommendedStatus: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
        recommendedBudget: number;
        recommendedDailyCap: number;
    };
};

export type CapitalAutoApplyUpdate = {
    campaignId: string;
    recommendedStatus?: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
    recommendedBudget?: number;
    recommendedDailyCap?: number;
    rationale?: string;
};

export function selectCapitalAllocationAutoApplyUpdates(input: {
    recommendations: CapitalAutoRecommendationInput[];
    policy: CapitalAutoApplyPolicy;
}): CapitalAutoApplyUpdate[] {
    const updates: CapitalAutoApplyUpdate[] = [];

    for (const row of input.recommendations) {
        const recommendation = row.recommendation;
        const leads = row.metrics.leads;
        const estimatedNet = row.metrics.estimatedNet;
        const cacLtvRatio = row.unitEconomics.cacLtvRatio;

        if (recommendation.hardLimited && input.policy.applyHardLimitedPauses) {
            updates.push({
                campaignId: row.campaignId,
                recommendedStatus: 'paused',
                recommendedBudget: recommendation.recommendedBudget,
                recommendedDailyCap: recommendation.recommendedDailyCap,
                rationale: 'auto_apply:hard_limited_loss_guardrail',
            });
            continue;
        }

        if (
            recommendation.band === 'pause'
            && estimatedNet <= input.policy.applyPauseWhenNetLossBelow
        ) {
            updates.push({
                campaignId: row.campaignId,
                recommendedStatus: recommendation.recommendedStatus,
                recommendedBudget: recommendation.recommendedBudget,
                recommendedDailyCap: recommendation.recommendedDailyCap,
                rationale: 'auto_apply:pause_net_loss_threshold',
            });
            continue;
        }

        if (
            recommendation.band === 'scale'
            && leads >= input.policy.applyScaleWhenLeadsAtLeast
            && (cacLtvRatio === null || cacLtvRatio <= input.policy.applyScaleMaxCacLtvRatio)
        ) {
            updates.push({
                campaignId: row.campaignId,
                recommendedStatus: recommendation.recommendedStatus,
                recommendedBudget: recommendation.recommendedBudget,
                recommendedDailyCap: recommendation.recommendedDailyCap,
                rationale: 'auto_apply:scale_efficiency_threshold',
            });
        }
    }

    return updates;
}
