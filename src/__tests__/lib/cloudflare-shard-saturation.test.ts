import { describe, expect, it } from 'vitest';
import {
    evaluateCloudflareShardSaturation,
    resolveCloudflareShardSaturationThresholds,
    summarizeCloudflareRegionSaturation,
} from '@/lib/integrations/cloudflare-shard-saturation';

describe('cloudflare shard saturation', () => {
    it('marks a shard critical when instability exceeds critical threshold', () => {
        const thresholds = resolveCloudflareShardSaturationThresholds({
            CLOUDFLARE_SHARD_SATURATION_MIN_SAMPLES: '10',
            CLOUDFLARE_SHARD_FAILURE_WARNING_RATIO: '0.25',
            CLOUDFLARE_SHARD_FAILURE_CRITICAL_RATIO: '0.45',
            CLOUDFLARE_REGION_COOLING_WARNING_RATIO: '0.34',
            CLOUDFLARE_REGION_COOLING_CRITICAL_RATIO: '0.60',
            CLOUDFLARE_REGION_SATURATION_MIN_SHARDS: '2',
        });

        const result = evaluateCloudflareShardSaturation({
            region: 'us-east',
            penalty: 10,
            cooldownRemainingSeconds: 0,
            successCount: 5,
            rateLimitCount: 3,
            failureCount: 2,
        }, thresholds);

        expect(result.observedCount).toBe(10);
        expect(result.instabilityRatio).toBe(0.5);
        expect(result.saturationSeverity).toBe('critical');
    });

    it('marks region critical when cooling ratio breaches threshold', () => {
        const thresholds = resolveCloudflareShardSaturationThresholds({
            CLOUDFLARE_SHARD_SATURATION_MIN_SAMPLES: '10',
            CLOUDFLARE_SHARD_FAILURE_WARNING_RATIO: '0.25',
            CLOUDFLARE_SHARD_FAILURE_CRITICAL_RATIO: '0.45',
            CLOUDFLARE_REGION_COOLING_WARNING_RATIO: '0.34',
            CLOUDFLARE_REGION_COOLING_CRITICAL_RATIO: '0.60',
            CLOUDFLARE_REGION_SATURATION_MIN_SHARDS: '2',
        });

        const summary = summarizeCloudflareRegionSaturation({
            thresholds,
            rows: [
                {
                    region: 'us-east',
                    penalty: 5,
                    cooldownRemainingSeconds: 120,
                    instabilityRatio: 0.1,
                    saturationSeverity: 'warning',
                },
                {
                    region: 'us-east',
                    penalty: 5,
                    cooldownRemainingSeconds: 180,
                    instabilityRatio: 0.2,
                    saturationSeverity: 'warning',
                },
                {
                    region: 'eu-west',
                    penalty: 0,
                    cooldownRemainingSeconds: 0,
                    instabilityRatio: 0,
                    saturationSeverity: 'healthy',
                },
            ],
        });

        expect(summary.criticalRegions).toBe(1);
        expect(summary.warningRegions).toBe(0);
        expect(summary.rows[0]?.region).toBe('us-east');
        expect(summary.rows[0]?.severity).toBe('critical');
    });

    it('clamps thresholds to safe bounds', () => {
        const thresholds = resolveCloudflareShardSaturationThresholds({
            CLOUDFLARE_SHARD_SATURATION_MIN_SAMPLES: '-1',
            CLOUDFLARE_SHARD_FAILURE_WARNING_RATIO: '2',
            CLOUDFLARE_SHARD_FAILURE_CRITICAL_RATIO: '0',
            CLOUDFLARE_REGION_COOLING_WARNING_RATIO: '-4',
            CLOUDFLARE_REGION_COOLING_CRITICAL_RATIO: '9',
            CLOUDFLARE_REGION_SATURATION_MIN_SHARDS: '9999',
        });

        expect(thresholds.minSamples).toBe(1);
        expect(thresholds.shardFailureWarningRatio).toBe(1);
        expect(thresholds.shardFailureCriticalRatio).toBe(0.01);
        expect(thresholds.regionCoolingWarningRatio).toBe(0.01);
        expect(thresholds.regionCoolingCriticalRatio).toBe(1);
        expect(thresholds.minShardsPerRegion).toBe(100);
    });
});
