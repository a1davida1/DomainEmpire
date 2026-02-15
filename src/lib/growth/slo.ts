export type SloStatus = 'unknown' | 'healthy' | 'warning' | 'critical';

export type SuccessRateSloAssessment = {
    target: number;
    actual: number | null;
    failureBudget: number;
    failureRate: number | null;
    burnPct: number | null;
    status: SloStatus;
};

export type MaxThresholdSloAssessment = {
    maxThreshold: number;
    actual: number | null;
    burnPct: number | null;
    status: SloStatus;
};

function clampZeroToOne(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

function statusFromBurn(burnPct: number | null): SloStatus {
    if (burnPct === null || !Number.isFinite(burnPct)) return 'unknown';
    if (burnPct > 100) return 'critical';
    if (burnPct > 50) return 'warning';
    return 'healthy';
}

export function assessSuccessRateSlo(input: {
    successRate: number | null;
    target: number;
}): SuccessRateSloAssessment {
    const target = clampZeroToOne(input.target);
    const failureBudget = Math.max(0, 1 - target);
    const normalizedSuccessRate = input.successRate === null
        ? null
        : clampZeroToOne(input.successRate);
    const failureRate = normalizedSuccessRate === null
        ? null
        : 1 - normalizedSuccessRate;

    const burnPct = (failureRate === null || failureBudget <= 0)
        ? null
        : (failureRate / failureBudget) * 100;

    return {
        target,
        actual: normalizedSuccessRate,
        failureBudget,
        failureRate,
        burnPct,
        status: statusFromBurn(burnPct),
    };
}

export function assessMaxThresholdSlo(input: {
    actual: number | null;
    maxThreshold: number;
}): MaxThresholdSloAssessment {
    const maxThreshold = Math.max(0, input.maxThreshold);
    const actual = (input.actual === null || !Number.isFinite(input.actual))
        ? null
        : Math.max(0, input.actual);
    const burnPct = (actual === null || maxThreshold <= 0)
        ? null
        : (actual / maxThreshold) * 100;

    return {
        maxThreshold,
        actual,
        burnPct,
        status: statusFromBurn(burnPct),
    };
}
