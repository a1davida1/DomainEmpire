export type CapitalAllocationBand = 'scale' | 'maintain' | 'optimize' | 'pause';

export type CapitalAllocationEvaluationInput = {
    spend: number;
    revenue: number;
    leads: number;
    clicks: number;
    windowDays: number;
    dailyLoss: number;
    weeklyLoss: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
};

export type CapitalAllocationEvaluation = {
    band: CapitalAllocationBand;
    hardLimited: boolean;
    reasons: string[];
    cac: number | null;
    ltv: number | null;
    cacLtvRatio: number | null;
    paybackDays: number | null;
    recommendedBudgetFactor: number;
    recommendedDailyCapFactor: number;
};

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function finiteNonNegative(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
}

export function evaluateCapitalAllocation(input: CapitalAllocationEvaluationInput): CapitalAllocationEvaluation {
    const spend = finiteNonNegative(input.spend);
    const revenue = finiteNonNegative(input.revenue);
    const leads = Math.max(0, Math.trunc(input.leads || 0));
    const clicks = Math.max(0, Math.trunc(input.clicks || 0));
    const windowDays = Math.max(1, Math.trunc(input.windowDays || 30));
    const dailyLoss = finiteNonNegative(input.dailyLoss);
    const weeklyLoss = finiteNonNegative(input.weeklyLoss);
    const dailyLossLimit = finiteNonNegative(input.dailyLossLimit);
    const weeklyLossLimit = finiteNonNegative(input.weeklyLossLimit);

    const reasons: string[] = [];

    const hardLimited = dailyLoss > dailyLossLimit || weeklyLoss > weeklyLossLimit;
    if (hardLimited) {
        if (dailyLoss > dailyLossLimit) {
            reasons.push(`Daily loss ${round(dailyLoss)} exceeds limit ${round(dailyLossLimit)}`);
        }
        if (weeklyLoss > weeklyLossLimit) {
            reasons.push(`Weekly loss ${round(weeklyLoss)} exceeds limit ${round(weeklyLossLimit)}`);
        }

        return {
            band: 'pause',
            hardLimited: true,
            reasons,
            cac: leads > 0 ? round(spend / leads) : null,
            ltv: leads > 0 ? round(revenue / leads) : null,
            cacLtvRatio: leads > 0 && revenue > 0 ? round((spend / leads) / (revenue / leads), 4) : null,
            paybackDays: revenue > 0 ? round(spend / (revenue / windowDays)) : null,
            recommendedBudgetFactor: 0.25,
            recommendedDailyCapFactor: 0.25,
        };
    }

    const cac = leads > 0 ? spend / leads : null;
    const ltv = leads > 0 ? revenue / leads : null;
    const cacLtvRatio = cac !== null && ltv !== null && ltv > 0 ? cac / ltv : null;
    const dailyRevenue = revenue / windowDays;
    const paybackDays = dailyRevenue > 0 ? spend / dailyRevenue : null;
    const net = revenue - spend;
    const hasDailyLossLimit = dailyLossLimit > 0;

    if (leads === 0 && spend > 0) {
        if ((hasDailyLossLimit && spend >= dailyLossLimit * 0.5) || clicks >= 100) {
            reasons.push('No leads while spend is materially high');
            return {
                band: 'pause',
                hardLimited: false,
                reasons,
                cac: null,
                ltv: null,
                cacLtvRatio: null,
                paybackDays: null,
                recommendedBudgetFactor: 0.4,
                recommendedDailyCapFactor: 0.4,
            };
        }

        reasons.push('No leads yet; reduce spend and continue collecting data');
        return {
            band: 'optimize',
            hardLimited: false,
            reasons,
            cac: null,
            ltv: null,
            cacLtvRatio: null,
            paybackDays: null,
            recommendedBudgetFactor: 0.8,
            recommendedDailyCapFactor: 0.8,
        };
    }

    if (cacLtvRatio !== null && paybackDays !== null) {
        if (cacLtvRatio <= 0.6 && paybackDays <= 30 && net > 0) {
            reasons.push('Strong CAC/LTV and fast payback');
            return {
                band: 'scale',
                hardLimited: false,
                reasons,
                cac: round(cac!),
                ltv: round(ltv!),
                cacLtvRatio: round(cacLtvRatio, 4),
                paybackDays: round(paybackDays, 1),
                recommendedBudgetFactor: 1.3,
                recommendedDailyCapFactor: 1.2,
            };
        }

        if (cacLtvRatio <= 0.9 && paybackDays <= 60) {
            reasons.push('Healthy unit economics; maintain spend');
            return {
                band: 'maintain',
                hardLimited: false,
                reasons,
                cac: round(cac!),
                ltv: round(ltv!),
                cacLtvRatio: round(cacLtvRatio, 4),
                paybackDays: round(paybackDays, 1),
                recommendedBudgetFactor: 1,
                recommendedDailyCapFactor: 1,
            };
        }

        if (cacLtvRatio <= 1.2) {
            reasons.push('Marginal efficiency; optimize and reduce exposure');
            return {
                band: 'optimize',
                hardLimited: false,
                reasons,
                cac: round(cac!),
                ltv: round(ltv!),
                cacLtvRatio: round(cacLtvRatio, 4),
                paybackDays: round(paybackDays, 1),
                recommendedBudgetFactor: 0.8,
                recommendedDailyCapFactor: 0.85,
            };
        }
    }

    reasons.push('Weak efficiency and/or slow payback');
    return {
        band: 'pause',
        hardLimited: false,
        reasons,
        cac: cac !== null ? round(cac) : null,
        ltv: ltv !== null ? round(ltv) : null,
        cacLtvRatio: cacLtvRatio !== null ? round(cacLtvRatio, 4) : null,
        paybackDays: paybackDays !== null ? round(paybackDays, 1) : null,
        recommendedBudgetFactor: 0.5,
        recommendedDailyCapFactor: 0.5,
    };
}
