import { createNotification } from '@/lib/notifications';
import {
    applyCapitalAllocationUpdates,
    generateCapitalAllocationRecommendations,
    type CampaignStatus,
} from '@/lib/growth/capital-allocation-service';
import {
    selectCapitalAllocationAutoApplyUpdates,
    type CapitalAutoApplyPolicy,
} from '@/lib/growth/capital-allocation-policy';
import { getCapitalAllocationPolicyFeedback } from '@/lib/growth/capital-allocation-feedback';

export type CapitalAllocationSweepConfig = {
    enabled: boolean;
    dryRun: boolean;
    autoTunePolicy: boolean;
    statuses: CampaignStatus[];
    windowDays: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    recommendationLimit: number;
    maxAutoApplyUpdates: number;
    policy: CapitalAutoApplyPolicy;
};

export type CapitalAllocationSweepSummary = {
    enabled: boolean;
    dryRun: boolean;
    recommendations: number;
    candidateUpdates: number;
    appliedCount: number;
    missingCampaignCount: number;
    hardLimitedCount: number;
    bandCounts: Record<'scale' | 'maintain' | 'optimize' | 'pause', number>;
    windowDays: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    autoTuneApplied: boolean;
    feedbackConfidence: number | null;
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
    return fallback;
}

function parseIntBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseFloatBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseFloat(raw || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseStatuses(raw: string | undefined): CampaignStatus[] {
    const allowed: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'cancelled'];
    if (!raw) return ['active', 'paused'];

    const parsed = raw
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is CampaignStatus => allowed.includes(item as CampaignStatus));

    return parsed.length > 0 ? [...new Set(parsed)] : ['active', 'paused'];
}

export function resolveCapitalAllocationSweepConfig(
    env: Record<string, string | undefined> = process.env,
): CapitalAllocationSweepConfig {
    return {
        enabled: parseBool(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_ENABLED, false),
        dryRun: parseBool(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_DRY_RUN, true),
        autoTunePolicy: parseBool(env.GROWTH_CAPITAL_ALLOCATION_POLICY_AUTO_TUNE, false),
        statuses: parseStatuses(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_STATUSES),
        windowDays: parseIntBounded(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_WINDOW_DAYS, 30, 7, 120),
        dailyLossLimit: parseFloatBounded(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_DAILY_LOSS_LIMIT, 150, 0, 1_000_000),
        weeklyLossLimit: parseFloatBounded(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_WEEKLY_LOSS_LIMIT, 750, 0, 1_000_000),
        recommendationLimit: parseIntBounded(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_LIMIT, 200, 1, 1000),
        maxAutoApplyUpdates: parseIntBounded(env.GROWTH_CAPITAL_ALLOCATION_SWEEP_MAX_UPDATES, 50, 1, 500),
        policy: {
            applyHardLimitedPauses: parseBool(env.GROWTH_CAPITAL_ALLOCATION_POLICY_APPLY_HARD_LIMITED, true),
            applyPauseWhenNetLossBelow: parseFloatBounded(
                env.GROWTH_CAPITAL_ALLOCATION_POLICY_PAUSE_NET_LOSS_BELOW,
                -50,
                -1_000_000,
                1_000_000,
            ),
            applyScaleWhenLeadsAtLeast: parseIntBounded(
                env.GROWTH_CAPITAL_ALLOCATION_POLICY_SCALE_LEADS_AT_LEAST,
                25,
                0,
                1_000_000,
            ),
            applyScaleMaxCacLtvRatio: parseFloatBounded(
                env.GROWTH_CAPITAL_ALLOCATION_POLICY_SCALE_MAX_CAC_LTV,
                0.9,
                0,
                10,
            ),
        },
    };
}

function mergeConfig(
    base: CapitalAllocationSweepConfig,
    override: Partial<Omit<CapitalAllocationSweepConfig, 'policy'>> & { policy?: Partial<CapitalAutoApplyPolicy> },
): CapitalAllocationSweepConfig {
    return {
        ...base,
        ...override,
        statuses: override.statuses && override.statuses.length > 0 ? [...new Set(override.statuses)] : base.statuses,
        policy: {
            ...base.policy,
            ...(override.policy ?? {}),
        },
    };
}

export async function runCapitalAllocationSweep(input: {
    force?: boolean;
    appliedBy?: string;
    notify?: boolean;
} & Partial<Omit<CapitalAllocationSweepConfig, 'policy'>> & {
    policy?: Partial<CapitalAutoApplyPolicy>;
} = {}): Promise<CapitalAllocationSweepSummary> {
    const config = mergeConfig(resolveCapitalAllocationSweepConfig(), input);
    if (!config.enabled && !input.force) {
        return {
            enabled: false,
            dryRun: config.dryRun,
            recommendations: 0,
            candidateUpdates: 0,
            appliedCount: 0,
            missingCampaignCount: 0,
            hardLimitedCount: 0,
            bandCounts: { scale: 0, maintain: 0, optimize: 0, pause: 0 },
            windowDays: config.windowDays,
            dailyLossLimit: config.dailyLossLimit,
            weeklyLossLimit: config.weeklyLossLimit,
            autoTuneApplied: false,
            feedbackConfidence: null,
        };
    }

    let effectivePolicy = config.policy;
    let autoTuneApplied = false;
    let feedbackConfidence: number | null = null;
    if (config.autoTunePolicy) {
        const feedback = await getCapitalAllocationPolicyFeedback({
            lookbackDays: Math.max(30, config.windowDays),
            preWindowDays: 7,
            postWindowDays: 7,
            maxApplyEvents: 300,
            basePolicy: config.policy,
        });
        feedbackConfidence = feedback.confidence;
        if (feedback.confidence >= 0.35 && feedback.outcome.evaluated >= 5) {
            effectivePolicy = feedback.recommendedPolicy;
            autoTuneApplied = true;
        }
    }

    const recommendationResult = await generateCapitalAllocationRecommendations({
        windowDays: config.windowDays,
        dailyLossLimit: config.dailyLossLimit,
        weeklyLossLimit: config.weeklyLossLimit,
        statuses: config.statuses,
        limit: config.recommendationLimit,
    });

    const suggestedUpdates = selectCapitalAllocationAutoApplyUpdates({
        recommendations: recommendationResult.recommendations,
        policy: effectivePolicy,
    }).slice(0, config.maxAutoApplyUpdates);

    let appliedCount = 0;
    let missingCampaignCount = 0;

    if (!config.dryRun && suggestedUpdates.length > 0) {
        const applied = await applyCapitalAllocationUpdates({
            updates: suggestedUpdates,
            appliedBy: input.appliedBy || 'system:capital_allocation_sweep',
            strict: false,
        });
        appliedCount = applied.updated.length;
        missingCampaignCount = applied.missingCampaignIds.length;
    }

    const summary: CapitalAllocationSweepSummary = {
        enabled: true,
        dryRun: config.dryRun,
        recommendations: recommendationResult.recommendations.length,
        candidateUpdates: suggestedUpdates.length,
        appliedCount,
        missingCampaignCount,
        hardLimitedCount: recommendationResult.summary.hardLimitedCount,
        bandCounts: recommendationResult.summary.bandCounts,
        windowDays: recommendationResult.windowDays,
        dailyLossLimit: recommendationResult.dailyLossLimit,
        weeklyLossLimit: recommendationResult.weeklyLossLimit,
        autoTuneApplied,
        feedbackConfidence,
    };

    const shouldNotify = input.notify ?? true;
    if (shouldNotify && suggestedUpdates.length > 0) {
        await createNotification({
            type: 'info',
            severity: config.dryRun ? 'info' : 'warning',
            title: config.dryRun
                ? 'Capital allocation sweep dry-run recommendations available'
                : 'Capital allocation sweep applied budget updates',
            message: config.dryRun
                ? `Identified ${suggestedUpdates.length} update candidate(s) from ${recommendationResult.recommendations.length} recommendation(s).`
                : `Applied ${appliedCount} update(s) with ${missingCampaignCount} missing campaign(s) out of ${suggestedUpdates.length} candidates.`,
            actionUrl: '/dashboard/growth',
            metadata: {
                source: 'capital_allocation_sweep',
                dryRun: config.dryRun,
                recommendationCount: recommendationResult.recommendations.length,
                candidateUpdates: suggestedUpdates.length,
                appliedCount,
                missingCampaignCount,
                hardLimitedCount: recommendationResult.summary.hardLimitedCount,
                bandCounts: recommendationResult.summary.bandCounts,
                windowDays: recommendationResult.windowDays,
                dailyLossLimit: recommendationResult.dailyLossLimit,
                weeklyLossLimit: recommendationResult.weeklyLossLimit,
                statuses: config.statuses,
                policy: effectivePolicy,
                autoTuneApplied,
                feedbackConfidence,
            },
        });
    }

    return summary;
}
