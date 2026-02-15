export type AbVariantMetrics = {
    id: string;
    value: string;
    impressions: number;
    clicks: number;
    conversions: number;
};

export type ExperimentGateAction =
    | 'continue_collecting'
    | 'rebalance_holdout'
    | 'scale_winner'
    | 'stop_loser'
    | 'stop_no_signal';

export type ExperimentDecisionConfig = {
    holdoutVariantId?: string | null;
    minTotalImpressions: number;
    minVariantImpressions: number;
    minConfidencePct: number;
    minLiftPct: number;
    maxLossPct: number;
    maxDurationDays: number;
    minHoldoutSharePct: number;
};

export type ExperimentDecision = {
    action: ExperimentGateAction;
    reason: string;
    confidencePct: number;
    liftPct: number;
    holdoutSharePct: number;
    metric: 'conversions' | 'clicks';
    totalImpressions: number;
    controlVariantId: string;
    selectedVariantId: string;
    controlRate: number;
    selectedRate: number;
    elapsedDays: number;
};

const DEFAULT_CONFIG: ExperimentDecisionConfig = {
    holdoutVariantId: null,
    minTotalImpressions: 1000,
    minVariantImpressions: 200,
    minConfidencePct: 95,
    minLiftPct: 5,
    maxLossPct: 5,
    maxDurationDays: 21,
    minHoldoutSharePct: 10,
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function toFiniteNonNegative(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value;
    }
    return fallback;
}

function erfApprox(x: number): number {
    // Abramowitz/Stegun approximation
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1 / (1 + p * absX);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
}

function normalCdf(x: number): number {
    return 0.5 * (1 + erfApprox(x / Math.sqrt(2)));
}

function twoSidedConfidencePct(controlRate: number, controlN: number, variantRate: number, variantN: number): number {
    if (controlN <= 0 || variantN <= 0) return 0;
    const pooled = ((controlRate * controlN) + (variantRate * variantN)) / (controlN + variantN);
    const standardError = Math.sqrt(pooled * (1 - pooled) * ((1 / controlN) + (1 / variantN)));
    if (standardError <= 0 || !Number.isFinite(standardError)) return 0;

    const z = (variantRate - controlRate) / standardError;
    const pValue = 2 * (1 - normalCdf(Math.abs(z)));
    const confidence = (1 - pValue) * 100;
    return clamp(Number(confidence.toFixed(2)), 0, 99.99);
}

function rate(successes: number, impressions: number): number {
    if (impressions <= 0) return 0;
    return successes / impressions;
}

function resolveConfig(overrides?: Partial<ExperimentDecisionConfig>): ExperimentDecisionConfig {
    const minTotalImpressions = toFiniteNonNegative(overrides?.minTotalImpressions, DEFAULT_CONFIG.minTotalImpressions);
    const minVariantImpressions = toFiniteNonNegative(overrides?.minVariantImpressions, DEFAULT_CONFIG.minVariantImpressions);
    const minConfidencePct = toFiniteNonNegative(overrides?.minConfidencePct, DEFAULT_CONFIG.minConfidencePct);
    const minLiftPct = toFiniteNonNegative(overrides?.minLiftPct, DEFAULT_CONFIG.minLiftPct);
    const maxLossPct = toFiniteNonNegative(overrides?.maxLossPct, DEFAULT_CONFIG.maxLossPct);
    const maxDurationDays = toFiniteNonNegative(overrides?.maxDurationDays, DEFAULT_CONFIG.maxDurationDays);
    const minHoldoutSharePct = toFiniteNonNegative(overrides?.minHoldoutSharePct, DEFAULT_CONFIG.minHoldoutSharePct);

    return {
        holdoutVariantId: overrides?.holdoutVariantId ?? DEFAULT_CONFIG.holdoutVariantId,
        minTotalImpressions: Math.max(1, Math.floor(minTotalImpressions)),
        minVariantImpressions: Math.max(1, Math.floor(minVariantImpressions)),
        minConfidencePct: clamp(minConfidencePct, 50, 99.99),
        minLiftPct: clamp(minLiftPct, 0, 1000),
        maxLossPct: clamp(maxLossPct, 0, 1000),
        maxDurationDays: Math.max(1, Math.floor(maxDurationDays)),
        minHoldoutSharePct: clamp(minHoldoutSharePct, 0, 50),
    };
}

export function evaluateExperimentDecision(input: {
    variants: AbVariantMetrics[];
    startedAt: Date;
    now?: Date;
    config?: Partial<ExperimentDecisionConfig>;
}): ExperimentDecision {
    const now = input.now ?? new Date();
    const config = resolveConfig(input.config);

    const variants = input.variants.map((variant) => ({
        ...variant,
        impressions: toFiniteNonNegative(variant.impressions, 0),
        clicks: toFiniteNonNegative(variant.clicks, 0),
        conversions: toFiniteNonNegative(variant.conversions, 0),
    }));

    const uniqueVariantIds = new Set<string>();
    for (const variant of variants) {
        if (uniqueVariantIds.has(variant.id)) {
            throw new Error(`Duplicate variant id detected: ${variant.id}`);
        }
        uniqueVariantIds.add(variant.id);
    }

    if (variants.length < 2) {
        return {
            action: 'continue_collecting',
            reason: 'Need at least two variants to evaluate',
            confidencePct: 0,
            liftPct: 0,
            holdoutSharePct: 0,
            metric: 'clicks',
            totalImpressions: variants.reduce((sum, variant) => sum + variant.impressions, 0),
            controlVariantId: variants[0]?.id ?? 'unknown',
            selectedVariantId: variants[0]?.id ?? 'unknown',
            controlRate: 0,
            selectedRate: 0,
            elapsedDays: 0,
        };
    }

    const totalImpressions = variants.reduce((sum, variant) => sum + variant.impressions, 0);
    const totalConversions = variants.reduce((sum, variant) => sum + variant.conversions, 0);
    const metric: ExperimentDecision['metric'] = totalConversions > 0 ? 'conversions' : 'clicks';

    const controlVariant = variants.find((variant) => variant.id === config.holdoutVariantId) ?? variants[0];
    const treatmentCandidates = variants.filter((variant) => variant.id !== controlVariant.id);
    const selectedVariant = treatmentCandidates.sort((left, right) => {
        const leftSuccesses = metric === 'conversions' ? left.conversions : left.clicks;
        const rightSuccesses = metric === 'conversions' ? right.conversions : right.clicks;
        const leftRate = rate(leftSuccesses, left.impressions);
        const rightRate = rate(rightSuccesses, right.impressions);
        if (rightRate !== leftRate) return rightRate - leftRate;
        return right.impressions - left.impressions;
    }).find((candidate) => candidate.id !== controlVariant.id);

    if (!selectedVariant) {
        throw new Error('No non-control treatment variant available for decision gate evaluation');
    }

    const controlSuccesses = metric === 'conversions' ? controlVariant.conversions : controlVariant.clicks;
    const selectedSuccesses = metric === 'conversions' ? selectedVariant.conversions : selectedVariant.clicks;
    const controlRate = rate(controlSuccesses, controlVariant.impressions);
    const selectedRate = rate(selectedSuccesses, selectedVariant.impressions);
    const liftPct = controlRate <= 0
        ? (selectedRate > 0 ? 100 : 0)
        : Number((((selectedRate - controlRate) / controlRate) * 100).toFixed(2));
    const confidencePct = twoSidedConfidencePct(
        controlRate,
        controlVariant.impressions,
        selectedRate,
        selectedVariant.impressions,
    );
    const holdoutSharePct = totalImpressions > 0
        ? Number(((controlVariant.impressions / totalImpressions) * 100).toFixed(2))
        : 0;
    const elapsedDays = Math.max(
        0,
        Math.floor((now.getTime() - input.startedAt.getTime()) / (24 * 60 * 60 * 1000)),
    );

    if (
        totalImpressions >= config.minTotalImpressions
        && holdoutSharePct < config.minHoldoutSharePct
    ) {
        return {
            action: 'rebalance_holdout',
            reason: `Holdout share ${holdoutSharePct}% below required ${config.minHoldoutSharePct}%`,
            confidencePct,
            liftPct,
            holdoutSharePct,
            metric,
            totalImpressions,
            controlVariantId: controlVariant.id,
            selectedVariantId: selectedVariant.id,
            controlRate: Number((controlRate * 100).toFixed(3)),
            selectedRate: Number((selectedRate * 100).toFixed(3)),
            elapsedDays,
        };
    }

    if (
        totalImpressions < config.minTotalImpressions
        || controlVariant.impressions < config.minVariantImpressions
        || selectedVariant.impressions < config.minVariantImpressions
    ) {
        return {
            action: 'continue_collecting',
            reason: 'Insufficient sample size for decision gate',
            confidencePct,
            liftPct,
            holdoutSharePct,
            metric,
            totalImpressions,
            controlVariantId: controlVariant.id,
            selectedVariantId: selectedVariant.id,
            controlRate: Number((controlRate * 100).toFixed(3)),
            selectedRate: Number((selectedRate * 100).toFixed(3)),
            elapsedDays,
        };
    }

    if (confidencePct >= config.minConfidencePct && liftPct >= config.minLiftPct) {
        return {
            action: 'scale_winner',
            reason: `Lift ${liftPct}% at ${confidencePct}% confidence exceeds scale thresholds`,
            confidencePct,
            liftPct,
            holdoutSharePct,
            metric,
            totalImpressions,
            controlVariantId: controlVariant.id,
            selectedVariantId: selectedVariant.id,
            controlRate: Number((controlRate * 100).toFixed(3)),
            selectedRate: Number((selectedRate * 100).toFixed(3)),
            elapsedDays,
        };
    }

    if (confidencePct >= config.minConfidencePct && liftPct <= -config.maxLossPct) {
        return {
            action: 'stop_loser',
            reason: `Negative lift ${liftPct}% at ${confidencePct}% confidence exceeds loss threshold`,
            confidencePct,
            liftPct,
            holdoutSharePct,
            metric,
            totalImpressions,
            controlVariantId: controlVariant.id,
            selectedVariantId: selectedVariant.id,
            controlRate: Number((controlRate * 100).toFixed(3)),
            selectedRate: Number((selectedRate * 100).toFixed(3)),
            elapsedDays,
        };
    }

    if (elapsedDays >= config.maxDurationDays && confidencePct < config.minConfidencePct) {
        return {
            action: 'stop_no_signal',
            reason: `No significant outcome within ${elapsedDays} day(s)`,
            confidencePct,
            liftPct,
            holdoutSharePct,
            metric,
            totalImpressions,
            controlVariantId: controlVariant.id,
            selectedVariantId: selectedVariant.id,
            controlRate: Number((controlRate * 100).toFixed(3)),
            selectedRate: Number((selectedRate * 100).toFixed(3)),
            elapsedDays,
        };
    }

    return {
        action: 'continue_collecting',
        reason: 'Signal not yet decisive',
        confidencePct,
        liftPct,
        holdoutSharePct,
        metric,
        totalImpressions,
        controlVariantId: controlVariant.id,
        selectedVariantId: selectedVariant.id,
        controlRate: Number((controlRate * 100).toFixed(3)),
        selectedRate: Number((selectedRate * 100).toFixed(3)),
        elapsedDays,
    };
}
