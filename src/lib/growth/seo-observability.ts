export type SeoObservabilityFlag =
    | 'ranking_volatility'
    | 'indexation_low'
    | 'conversion_drop'
    | 'runtime_failures';

export type SeoDomainObservabilityInput = {
    impressionsCurrent: number;
    clicksCurrent: number;
    currentConversions: number;
    priorConversions: number;
    runtimeFailures: number;
    latestAvgPosition: number | null;
    priorAvgPosition: number | null;
    stdDevPosition: number;
};

export type SeoDomainObservability = {
    flags: SeoObservabilityFlag[];
    rankingDelta: number | null;
    conversionDeltaPct: number | null;
    ctrPct: number | null;
};

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function finite(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return value;
}

export function computeStdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => {
        const delta = value - mean;
        return sum + delta * delta;
    }, 0) / values.length;
    return round(Math.sqrt(Math.max(variance, 0)), 3);
}

export function evaluateSeoDomainObservability(
    input: SeoDomainObservabilityInput,
): SeoDomainObservability {
    const impressionsCurrent = Math.max(0, finite(input.impressionsCurrent));
    const clicksCurrent = Math.max(0, finite(input.clicksCurrent));
    const currentConversions = Math.max(0, Math.trunc(finite(input.currentConversions)));
    const priorConversions = Math.max(0, Math.trunc(finite(input.priorConversions)));
    const runtimeFailures = Math.max(0, Math.trunc(finite(input.runtimeFailures)));
    const stdDevPosition = Math.max(0, finite(input.stdDevPosition));

    const flags: SeoObservabilityFlag[] = [];

    const latestAvgPosition = typeof input.latestAvgPosition === 'number' && Number.isFinite(input.latestAvgPosition)
        ? input.latestAvgPosition
        : null;
    const priorAvgPosition = typeof input.priorAvgPosition === 'number' && Number.isFinite(input.priorAvgPosition)
        ? input.priorAvgPosition
        : null;

    const ctrPct = impressionsCurrent > 0
        ? round((clicksCurrent / impressionsCurrent) * 100, 3)
        : null;

    const latest = latestAvgPosition !== null ? finite(latestAvgPosition) : null;
    const prior = priorAvgPosition !== null ? finite(priorAvgPosition) : null;
    const rankingDelta = latest !== null && prior !== null
        ? round(latest - prior, 3)
        : null;
    if (stdDevPosition >= 8 || (rankingDelta !== null && rankingDelta >= 5)) {
        flags.push('ranking_volatility');
    }

    if (impressionsCurrent < 100) {
        flags.push('indexation_low');
    }

    const conversionDeltaPct = priorConversions > 0
        ? round(((currentConversions - priorConversions) / priorConversions) * 100, 2)
        : null;
    if (priorConversions >= 10 && conversionDeltaPct !== null && conversionDeltaPct <= -40) {
        flags.push('conversion_drop');
    }

    if (runtimeFailures >= 3) {
        flags.push('runtime_failures');
    }

    return {
        flags,
        rankingDelta,
        conversionDeltaPct,
        ctrPct,
    };
}
