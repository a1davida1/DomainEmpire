import { afterEach, describe, expect, it } from 'vitest';
import { getFeatureFlagSnapshot, isFeatureEnabled } from '@/lib/feature-flags';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
});

describe('feature flags', () => {
    it('uses built-in defaults when env vars are not set', () => {
        delete process.env.FEATURE_ACQUISITION_UNDERWRITING_V1;
        delete process.env.FEATURE_PREVIEW_GATE_V1;
        delete process.env.FEATURE_GROWTH_CHANNELS_V1;
        delete process.env.FEATURE_KDP_GENERATOR_V1;

        const snapshot = getFeatureFlagSnapshot({ userId: 'user-1' });
        expect(snapshot.acquisition_underwriting_v1).toBe(true);
        expect(snapshot.preview_gate_v1).toBe(true);
        expect(snapshot.growth_channels_v1).toBe(true);
        expect(snapshot.kdp_generator_v1).toBe(false);
    });

    it('supports explicit disable via env', () => {
        process.env.FEATURE_PREVIEW_GATE_V1 = 'false';
        expect(isFeatureEnabled('preview_gate_v1', { userId: 'user-1' })).toBe(false);
    });

    it('supports rollout percentages', () => {
        process.env.FEATURE_GROWTH_CHANNELS_V1 = 'true';
        process.env.FEATURE_GROWTH_CHANNELS_V1_ROLLOUT_PERCENT = '0';
        expect(isFeatureEnabled('growth_channels_v1', { userId: 'user-1' })).toBe(false);

        process.env.FEATURE_GROWTH_CHANNELS_V1_ROLLOUT_PERCENT = '100';
        expect(isFeatureEnabled('growth_channels_v1', { userId: 'user-1' })).toBe(true);
    });

    it('supports allowlist overrides during partial rollout', () => {
        process.env.FEATURE_GROWTH_CHANNELS_V1 = 'true';
        process.env.FEATURE_GROWTH_CHANNELS_V1_ROLLOUT_PERCENT = '0';
        process.env.FEATURE_GROWTH_CHANNELS_V1_ALLOWLIST = 'vip-user';

        expect(isFeatureEnabled('growth_channels_v1', { userId: 'vip-user' })).toBe(true);
        expect(isFeatureEnabled('growth_channels_v1', { userId: 'other-user' })).toBe(false);
    });
});
