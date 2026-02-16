export type FeatureFlag =
    | 'acquisition_underwriting_v1'
    | 'preview_gate_v1'
    | 'growth_channels_v1'
    | 'kdp_generator_v1';

export type FeatureFlagContext = {
    userId?: string;
    sessionId?: string;
};

type FeatureFlagConfig = {
    envKey: string;
    defaultEnabled: boolean;
};

const FEATURE_FLAGS: Record<FeatureFlag, FeatureFlagConfig> = {
    acquisition_underwriting_v1: {
        envKey: 'FEATURE_ACQUISITION_UNDERWRITING_V1',
        defaultEnabled: true,
    },
    preview_gate_v1: {
        envKey: 'FEATURE_PREVIEW_GATE_V1',
        defaultEnabled: true,
    },
    growth_channels_v1: {
        envKey: 'FEATURE_GROWTH_CHANNELS_V1',
        defaultEnabled: true,
    },
    kdp_generator_v1: {
        envKey: 'FEATURE_KDP_GENERATOR_V1',
        defaultEnabled: false,
    },
};

function parseBoolean(value: string | undefined): boolean | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
    return null;
}

function parseRolloutPercentage(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(parsed, 100));
}

function hashToBucket(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % 100;
}

function getAllowlist(envKey: string): Set<string> {
    const raw = process.env[`${envKey}_ALLOWLIST`];
    if (!raw) return new Set<string>();
    const ids = raw.split(',').map((item) => item.trim()).filter(Boolean);
    return new Set(ids);
}

export function isFeatureEnabled(flag: FeatureFlag, context: FeatureFlagContext = {}): boolean {
    const config = FEATURE_FLAGS[flag];

    const explicitValue = parseBoolean(process.env[config.envKey]);
    const enabled = explicitValue ?? config.defaultEnabled;
    if (!enabled) return false;

    const allowlist = getAllowlist(config.envKey);
    if (context.userId && allowlist.has(context.userId)) {
        return true;
    }

    const defaultRollout = enabled ? 100 : 0;
    const rollout = parseRolloutPercentage(
        process.env[`${config.envKey}_ROLLOUT_PERCENT`],
        defaultRollout,
    );
    if (rollout >= 100) return true;
    if (rollout <= 0) return false;

    const identity = context.sessionId || context.userId || 'anonymous';
    return hashToBucket(`${flag}:${identity}`) < rollout;
}

export function getFeatureFlagSnapshot(context: FeatureFlagContext = {}): Record<FeatureFlag, boolean> {
    return {
        acquisition_underwriting_v1: isFeatureEnabled('acquisition_underwriting_v1', context),
        preview_gate_v1: isFeatureEnabled('preview_gate_v1', context),
        growth_channels_v1: isFeatureEnabled('growth_channels_v1', context),
        kdp_generator_v1: isFeatureEnabled('kdp_generator_v1', context),
    };
}
