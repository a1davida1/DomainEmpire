export type CloudflareShardSaturationSeverity = 'healthy' | 'warning' | 'critical';

export type CloudflareShardSaturationThresholds = {
    minSamples: number;
    shardFailureWarningRatio: number;
    shardFailureCriticalRatio: number;
    regionCoolingWarningRatio: number;
    regionCoolingCriticalRatio: number;
    minShardsPerRegion: number;
};

export type CloudflareShardOperationalMetrics = {
    region: string | null;
    penalty: number;
    cooldownRemainingSeconds: number;
    successCount: number;
    rateLimitCount: number;
    failureCount: number;
};

export type CloudflareShardSaturationMetrics = CloudflareShardOperationalMetrics & {
    observedCount: number;
    instabilityRatio: number;
    saturationSeverity: CloudflareShardSaturationSeverity;
};

export type CloudflareRegionSaturationMetrics = {
    region: string;
    shardCount: number;
    coolingCount: number;
    warningCount: number;
    criticalCount: number;
    maxPenalty: number;
    coolingRatio: number;
    degradedRatio: number;
    avgInstabilityRatio: number;
    severity: CloudflareShardSaturationSeverity;
};

function parseFloatBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseFloat(raw || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseIntBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

export function resolveCloudflareShardSaturationThresholds(
    env: Record<string, string | undefined> = process.env,
): CloudflareShardSaturationThresholds {
    return {
        minSamples: parseIntBounded(env.CLOUDFLARE_SHARD_SATURATION_MIN_SAMPLES, 10, 1, 10_000),
        shardFailureWarningRatio: parseFloatBounded(env.CLOUDFLARE_SHARD_FAILURE_WARNING_RATIO, 0.25, 0.01, 1),
        shardFailureCriticalRatio: parseFloatBounded(env.CLOUDFLARE_SHARD_FAILURE_CRITICAL_RATIO, 0.45, 0.01, 1),
        regionCoolingWarningRatio: parseFloatBounded(env.CLOUDFLARE_REGION_COOLING_WARNING_RATIO, 0.34, 0.01, 1),
        regionCoolingCriticalRatio: parseFloatBounded(env.CLOUDFLARE_REGION_COOLING_CRITICAL_RATIO, 0.60, 0.01, 1),
        minShardsPerRegion: parseIntBounded(env.CLOUDFLARE_REGION_SATURATION_MIN_SHARDS, 2, 1, 100),
    };
}

export function evaluateCloudflareShardSaturation(
    input: CloudflareShardOperationalMetrics,
    thresholds: CloudflareShardSaturationThresholds,
): CloudflareShardSaturationMetrics {
    const observedCount = Math.max(
        0,
        input.successCount + input.rateLimitCount + input.failureCount,
    );
    const instabilityRatio = observedCount > 0
        ? Number(((input.rateLimitCount + input.failureCount) / observedCount).toFixed(4))
        : 0;

    let saturationSeverity: CloudflareShardSaturationSeverity = 'healthy';
    if (input.cooldownRemainingSeconds > 0) {
        saturationSeverity = 'warning';
    }
    if (observedCount >= thresholds.minSamples) {
        if (instabilityRatio >= thresholds.shardFailureCriticalRatio) {
            saturationSeverity = 'critical';
        } else if (instabilityRatio >= thresholds.shardFailureWarningRatio) {
            saturationSeverity = 'warning';
        }
    }
    if (input.penalty >= 60) {
        saturationSeverity = 'critical';
    } else if (input.penalty >= 30 && saturationSeverity === 'healthy') {
        saturationSeverity = 'warning';
    }

    return {
        ...input,
        observedCount,
        instabilityRatio,
        saturationSeverity,
    };
}

export function summarizeCloudflareRegionSaturation(input: {
    rows: Array<Pick<CloudflareShardSaturationMetrics, 'region' | 'penalty' | 'cooldownRemainingSeconds' | 'instabilityRatio' | 'saturationSeverity'>>;
    thresholds: CloudflareShardSaturationThresholds;
}): {
    rows: CloudflareRegionSaturationMetrics[];
    warningRegions: number;
    criticalRegions: number;
} {
    const regionAggregation = new Map<string, {
        shardCount: number;
        coolingCount: number;
        warningCount: number;
        criticalCount: number;
        maxPenalty: number;
        avgInstabilityNumerator: number;
    }>();

    for (const row of input.rows) {
        const regionKey = row.region ?? 'unknown';
        const current = regionAggregation.get(regionKey) ?? {
            shardCount: 0,
            coolingCount: 0,
            warningCount: 0,
            criticalCount: 0,
            maxPenalty: 0,
            avgInstabilityNumerator: 0,
        };
        current.shardCount += 1;
        if (row.cooldownRemainingSeconds > 0) {
            current.coolingCount += 1;
        }
        if (row.saturationSeverity === 'warning') {
            current.warningCount += 1;
        } else if (row.saturationSeverity === 'critical') {
            current.criticalCount += 1;
        }
        current.maxPenalty = Math.max(current.maxPenalty, row.penalty);
        current.avgInstabilityNumerator += row.instabilityRatio;
        regionAggregation.set(regionKey, current);
    }

    const regionRows = [...regionAggregation.entries()]
        .map(([region, aggregate]) => {
            const coolingRatio = aggregate.shardCount > 0
                ? Number((aggregate.coolingCount / aggregate.shardCount).toFixed(4))
                : 0;
            const degradedRatio = aggregate.shardCount > 0
                ? Number(((aggregate.warningCount + aggregate.criticalCount) / aggregate.shardCount).toFixed(4))
                : 0;
            const avgInstabilityRatio = aggregate.shardCount > 0
                ? Number((aggregate.avgInstabilityNumerator / aggregate.shardCount).toFixed(4))
                : 0;

            let severity: CloudflareShardSaturationSeverity = 'healthy';
            if (aggregate.shardCount >= input.thresholds.minShardsPerRegion) {
                if (coolingRatio >= input.thresholds.regionCoolingCriticalRatio || aggregate.criticalCount > 0) {
                    severity = 'critical';
                } else if (
                    coolingRatio >= input.thresholds.regionCoolingWarningRatio
                    || degradedRatio >= input.thresholds.regionCoolingWarningRatio
                ) {
                    severity = 'warning';
                }
            }

            return {
                region,
                shardCount: aggregate.shardCount,
                coolingCount: aggregate.coolingCount,
                warningCount: aggregate.warningCount,
                criticalCount: aggregate.criticalCount,
                maxPenalty: aggregate.maxPenalty,
                coolingRatio,
                degradedRatio,
                avgInstabilityRatio,
                severity,
            };
        })
        .sort((left, right) => {
            const severityRank = { critical: 2, warning: 1, healthy: 0 };
            const severityDelta = severityRank[right.severity] - severityRank[left.severity];
            if (severityDelta !== 0) return severityDelta;
            if (right.coolingRatio !== left.coolingRatio) return right.coolingRatio - left.coolingRatio;
            return right.shardCount - left.shardCount;
        });

    return {
        rows: regionRows,
        warningRegions: regionRows.filter((row) => row.severity === 'warning').length,
        criticalRegions: regionRows.filter((row) => row.severity === 'critical').length,
    };
}
