import { createNotification } from '@/lib/notifications';
import {
    applyDomainStrategyPropagation,
    generateStrategyPropagationRecommendations,
    STRATEGY_PROPAGATION_MODULES,
    type StrategyPropagationModule,
} from '@/lib/domain/strategy-propagation';
import { getStrategyPropagationPolicyFeedback } from '@/lib/domain/strategy-propagation-feedback';

export type StrategyPropagationSweepConfig = {
    enabled: boolean;
    dryRun: boolean;
    autoTunePolicy: boolean;
    forceCrossNiche: boolean;
    windowDays: number;
    sourceLimit: number;
    targetLimitPerSource: number;
    minSourceScore: number;
    maxTargetScore: number;
    maxRecommendationApplies: number;
    maxTargetUpdates: number;
    allowedModules: StrategyPropagationModule[];
};

export type StrategyPropagationSweepSummary = {
    enabled: boolean;
    dryRun: boolean;
    recommendationCount: number;
    candidateSources: number;
    candidateTargets: number;
    appliedSources: number;
    appliedTargets: number;
    skippedTargets: number;
    missingDomainCount: number;
    errorCount: number;
    forceCrossNiche: boolean;
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

function parseModuleList(raw: string | undefined): StrategyPropagationModule[] {
    if (!raw || raw.trim().length === 0) {
        return [...STRATEGY_PROPAGATION_MODULES];
    }

    const parsed = raw
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is StrategyPropagationModule =>
            STRATEGY_PROPAGATION_MODULES.includes(item as StrategyPropagationModule),
        );

    if (parsed.length === 0) {
        return [...STRATEGY_PROPAGATION_MODULES];
    }

    return [...new Set(parsed)];
}

export function resolveStrategyPropagationSweepConfig(
    env: Record<string, string | undefined> = process.env,
): StrategyPropagationSweepConfig {
    return {
        enabled: parseBool(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_ENABLED, false),
        dryRun: parseBool(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_DRY_RUN, true),
        autoTunePolicy: parseBool(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_AUTO_TUNE, false),
        forceCrossNiche: parseBool(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_FORCE_CROSS_NICHE, false),
        windowDays: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_WINDOW_DAYS, 30, 7, 120),
        sourceLimit: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_SOURCE_LIMIT, 10, 1, 100),
        targetLimitPerSource: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_TARGETS_PER_SOURCE, 5, 1, 20),
        minSourceScore: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_MIN_SOURCE_SCORE, 75, 0, 100),
        maxTargetScore: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_MAX_TARGET_SCORE, 60, 0, 100),
        maxRecommendationApplies: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_MAX_RECOMMENDATIONS, 20, 1, 200),
        maxTargetUpdates: parseIntBounded(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_MAX_TARGET_UPDATES, 100, 1, 2000),
        allowedModules: parseModuleList(env.DOMAIN_STRATEGY_PROPAGATION_SWEEP_MODULES),
    };
}

function mergeConfig(
    base: StrategyPropagationSweepConfig,
    override: Partial<StrategyPropagationSweepConfig>,
): StrategyPropagationSweepConfig {
    return {
        ...base,
        ...override,
        allowedModules: override.allowedModules && override.allowedModules.length > 0
            ? [...new Set(override.allowedModules)]
            : base.allowedModules,
    };
}

export async function runStrategyPropagationSweep(input: {
    force?: boolean;
    appliedBy?: string;
    notify?: boolean;
} & Partial<StrategyPropagationSweepConfig> = {}): Promise<StrategyPropagationSweepSummary> {
    const config = mergeConfig(resolveStrategyPropagationSweepConfig(), input);

    if (!config.enabled && !input.force) {
        return {
            enabled: false,
            dryRun: config.dryRun,
            recommendationCount: 0,
            candidateSources: 0,
            candidateTargets: 0,
            appliedSources: 0,
            appliedTargets: 0,
            skippedTargets: 0,
            missingDomainCount: 0,
            errorCount: 0,
            forceCrossNiche: config.forceCrossNiche,
            autoTuneApplied: false,
            feedbackConfidence: null,
        };
    }

    let effectiveConfig = config;
    let autoTuneApplied = false;
    let feedbackConfidence: number | null = null;
    if (config.autoTunePolicy) {
        const feedback = await getStrategyPropagationPolicyFeedback({
            lookbackDays: Math.max(45, config.windowDays),
            preWindowDays: 14,
            postWindowDays: 14,
            maxEvents: 1000,
            minImprovementScore: 5,
            basePolicy: {
                minSourceScore: config.minSourceScore,
                maxTargetScore: config.maxTargetScore,
                allowedModules: config.allowedModules,
                forceCrossNiche: config.forceCrossNiche,
            },
        });
        feedbackConfidence = feedback.confidence;
        if (feedback.confidence >= 0.35 && feedback.outcome.evaluated >= 5) {
            effectiveConfig = {
                ...effectiveConfig,
                minSourceScore: feedback.recommendedPolicy.minSourceScore,
                maxTargetScore: feedback.recommendedPolicy.maxTargetScore,
                allowedModules: feedback.recommendedPolicy.allowedModules,
                forceCrossNiche: feedback.recommendedPolicy.forceCrossNiche,
            };
            autoTuneApplied = true;
        }
    }

    const recommendationSummary = await generateStrategyPropagationRecommendations({
        windowDays: effectiveConfig.windowDays,
        sourceLimit: effectiveConfig.sourceLimit,
        targetLimitPerSource: effectiveConfig.targetLimitPerSource,
        minSourceScore: effectiveConfig.minSourceScore,
        maxTargetScore: effectiveConfig.maxTargetScore,
    });

    const recommendations = recommendationSummary.recommendations
        .slice(0, effectiveConfig.maxRecommendationApplies)
        .map((recommendation) => ({
            ...recommendation,
            modules: recommendation.modules.filter((moduleName) =>
                effectiveConfig.allowedModules.includes(moduleName),
            ),
        }))
        .filter((recommendation) => recommendation.modules.length > 0);

    const assignedTargets = new Set<string>();
    let candidateTargets = 0;
    let appliedSources = 0;
    let appliedTargets = 0;
    let skippedTargets = 0;
    let missingDomainCount = 0;
    let errorCount = 0;

    for (const recommendation of recommendations) {
        const remainingCapacity = effectiveConfig.maxTargetUpdates - appliedTargets;
        if (remainingCapacity <= 0) {
            break;
        }

        const targetDomainIds = recommendation.targets
            .map((target) => target.domainId)
            .filter((targetDomainId) => !assignedTargets.has(targetDomainId))
            .slice(0, remainingCapacity);

        if (targetDomainIds.length === 0) {
            continue;
        }

        candidateTargets += targetDomainIds.length;

        try {
            const applyResult = await applyDomainStrategyPropagation({
                sourceDomainId: recommendation.source.domainId,
                targetDomainIds,
                modules: recommendation.modules,
                appliedBy: input.appliedBy || 'system:strategy_propagation_sweep',
                note: 'auto_sweep',
                dryRun: effectiveConfig.dryRun,
                forceCrossNiche: effectiveConfig.forceCrossNiche,
            });

            appliedSources += 1;
            appliedTargets += applyResult.applied.length;
            skippedTargets += applyResult.skipped.length;
            missingDomainCount += applyResult.missingDomainIds.length;

            for (const target of applyResult.applied) {
                assignedTargets.add(target.domainId);
            }
        } catch (err) {
            errorCount += 1;
            console.error('Strategy propagation apply failed during sweep', {
                sourceDomainId: recommendation.source.domainId,
                targetCount: targetDomainIds.length,
                error: err,
            });
        }
    }

    const summary: StrategyPropagationSweepSummary = {
        enabled: true,
        dryRun: effectiveConfig.dryRun,
        recommendationCount: recommendationSummary.recommendationCount,
        candidateSources: recommendations.length,
        candidateTargets,
        appliedSources,
        appliedTargets,
        skippedTargets,
        missingDomainCount,
        errorCount,
        forceCrossNiche: effectiveConfig.forceCrossNiche,
        autoTuneApplied,
        feedbackConfidence,
    };

    const shouldNotify = input.notify ?? true;
    if (shouldNotify && summary.candidateTargets > 0) {
        try {
            await createNotification({
                type: 'info',
                severity: summary.errorCount > 0 ? 'warning' : 'info',
                title: summary.dryRun
                    ? 'Strategy propagation sweep dry-run available'
                    : 'Strategy propagation sweep applied updates',
                message: summary.dryRun
                    ? `Identified ${summary.candidateTargets} candidate target update(s) across ${summary.candidateSources} source domain(s).`
                    : `Applied ${summary.appliedTargets} target update(s) across ${summary.appliedSources} source domain(s).`,
                actionUrl: '/dashboard/domains',
                metadata: {
                    source: 'strategy_propagation_sweep',
                    ...summary,
                    allowedModules: effectiveConfig.allowedModules,
                    windowDays: effectiveConfig.windowDays,
                    sourceLimit: effectiveConfig.sourceLimit,
                    targetLimitPerSource: effectiveConfig.targetLimitPerSource,
                    minSourceScore: effectiveConfig.minSourceScore,
                    maxTargetScore: effectiveConfig.maxTargetScore,
                },
            });
        } catch (notificationError) {
            console.error('Failed to create strategy propagation sweep notification', {
                error: notificationError,
                summary,
            });
        }
    }

    return summary;
}
