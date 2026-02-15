import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { scoreDomainRoiPriority, type DomainRoiAction } from '@/lib/domain/roi-prioritization';

export const STRATEGY_PROPAGATION_MODULES = [
    'site_template',
    'schedule',
    'writing_workflow',
    'branding',
] as const;

export type StrategyPropagationModule = (typeof STRATEGY_PROPAGATION_MODULES)[number];

export type DomainStrategyScore = {
    domainId: string;
    domain: string;
    niche: string | null;
    lifecycleState: string;
    status: string;
    siteTemplate: string | null;
    contentConfig: unknown;
    score: number;
    action: DomainRoiAction;
    reasons: string[];
    revenue30d: number;
    cost30d: number;
    net30d: number;
    roiPct: number | null;
    pageviews30d: number;
    clicks30d: number;
    ctrPct: number | null;
};

export type StrategyPropagationRecommendation = {
    source: {
        domainId: string;
        domain: string;
        niche: string | null;
        score: number;
        action: DomainRoiAction;
        net30d: number;
        roiPct: number | null;
    };
    modules: StrategyPropagationModule[];
    targets: Array<{
        domainId: string;
        domain: string;
        niche: string | null;
        score: number;
        action: DomainRoiAction;
        net30d: number;
        roiPct: number | null;
        reason: string;
    }>;
};

export type StrategyPropagationRecommendationSummary = {
    windowDays: number;
    sourceCount: number;
    recommendationCount: number;
    targetCount: number;
    recommendations: StrategyPropagationRecommendation[];
};

export type StrategyPropagationApplyResult = {
    sourceDomainId: string;
    sourceDomain: string;
    modules: StrategyPropagationModule[];
    dryRun: boolean;
    applied: Array<{ domainId: string; domain: string }>;
    skipped: Array<{ domainId: string; domain: string; reason: string }>;
    missingDomainIds: string[];
};

type PropagationHistoryEntry = {
    at: string;
    sourceDomainId: string;
    sourceDomain: string;
    modules: StrategyPropagationModule[];
    appliedBy: string;
    note: string | null;
};

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asModuleList(modules: StrategyPropagationModule[]): StrategyPropagationModule[] {
    const deduped = new Set<StrategyPropagationModule>();
    for (const moduleName of modules) {
        if (STRATEGY_PROPAGATION_MODULES.includes(moduleName)) {
            deduped.add(moduleName);
        }
    }
    return [...deduped];
}

export function getAvailableStrategyPropagationModules(input: {
    siteTemplate: string | null;
    contentConfig: unknown;
}): StrategyPropagationModule[] {
    const config = asObject(input.contentConfig);
    const modules: StrategyPropagationModule[] = [];

    if (asString(input.siteTemplate)) {
        modules.push('site_template');
    }
    if (asObject(config.schedule) && Object.keys(asObject(config.schedule)).length > 0) {
        modules.push('schedule');
    }
    if (asObject(config.writingWorkflow) && Object.keys(asObject(config.writingWorkflow)).length > 0) {
        modules.push('writing_workflow');
    }
    if (asObject(config.branding) && Object.keys(asObject(config.branding)).length > 0) {
        modules.push('branding');
    }

    return modules;
}

export function mergeStrategyPropagationConfig(input: {
    sourceConfig: unknown;
    targetConfig: unknown;
    modules: StrategyPropagationModule[];
    history: PropagationHistoryEntry;
}): Record<string, unknown> {
    const sourceConfig = asObject(input.sourceConfig);
    const nextConfig: Record<string, unknown> = {
        ...asObject(input.targetConfig),
    };

    if (input.modules.includes('schedule') && sourceConfig.schedule !== undefined) {
        nextConfig.schedule = sourceConfig.schedule;
    }
    if (input.modules.includes('writing_workflow') && sourceConfig.writingWorkflow !== undefined) {
        nextConfig.writingWorkflow = sourceConfig.writingWorkflow;
    }
    if (input.modules.includes('branding') && sourceConfig.branding !== undefined) {
        nextConfig.branding = sourceConfig.branding;
    }

    const existingHistoryRaw = nextConfig.strategyPropagationHistory;
    const existingHistory = Array.isArray(existingHistoryRaw)
        ? existingHistoryRaw.filter((entry) => entry && typeof entry === 'object')
        : [];

    const history = [...existingHistory, input.history].slice(-100);
    nextConfig.strategyPropagationHistory = history;

    return nextConfig;
}

export async function generateStrategyPropagationRecommendations(input: {
    windowDays?: number;
    sourceLimit?: number;
    targetLimitPerSource?: number;
    minSourceScore?: number;
    maxTargetScore?: number;
} = {}): Promise<StrategyPropagationRecommendationSummary> {
    const windowDays = Math.max(7, Math.min(input.windowDays ?? 30, 120));
    const sourceLimit = Math.max(1, Math.min(input.sourceLimit ?? 20, 100));
    const targetLimitPerSource = Math.max(1, Math.min(input.targetLimitPerSource ?? 5, 20));
    const minSourceScore = Math.max(0, Math.min(input.minSourceScore ?? 75, 100));
    const maxTargetScore = Math.max(0, Math.min(input.maxTargetScore ?? 60, 100));
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const domainRows = await db.select({
        id: domains.id,
        domain: domains.domain,
        niche: domains.niche,
        lifecycleState: domains.lifecycleState,
        status: domains.status,
        siteTemplate: domains.siteTemplate,
        contentConfig: domains.contentConfig,
    })
        .from(domains)
        .where(notDeleted(domains))
        .limit(5000);

    if (domainRows.length === 0) {
        return {
            windowDays,
            sourceCount: 0,
            recommendationCount: 0,
            targetCount: 0,
            recommendations: [],
        };
    }

    const domainIds = domainRows.map((row) => row.id);

    const [ledgerRollups, trafficRollups] = await Promise.all([
        db.select({
            domainId: domainFinanceLedgerEntries.domainId,
            revenue30d: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            cost30d: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'cost' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
        })
            .from(domainFinanceLedgerEntries)
            .where(and(
                inArray(domainFinanceLedgerEntries.domainId, domainIds),
                gte(domainFinanceLedgerEntries.entryDate, windowStart),
            ))
            .groupBy(domainFinanceLedgerEntries.domainId),
        db.select({
            domainId: revenueSnapshots.domainId,
            pageviews30d: sql<number>`sum(coalesce(${revenueSnapshots.pageviews}, 0))::int`,
            clicks30d: sql<number>`sum(coalesce(${revenueSnapshots.clicks}, 0))::int`,
        })
            .from(revenueSnapshots)
            .where(and(
                inArray(revenueSnapshots.domainId, domainIds),
                gte(revenueSnapshots.snapshotDate, windowStart),
            ))
            .groupBy(revenueSnapshots.domainId),
    ]);

    const ledgerByDomain = new Map(ledgerRollups.map((row) => [row.domainId, row]));
    const trafficByDomain = new Map(trafficRollups.map((row) => [row.domainId, row]));

    const scored: DomainStrategyScore[] = domainRows.map((row) => {
        const ledger = ledgerByDomain.get(row.id);
        const traffic = trafficByDomain.get(row.id);
        const score = scoreDomainRoiPriority({
            lifecycleState: row.lifecycleState,
            revenue30d: Number(ledger?.revenue30d ?? 0),
            cost30d: Number(ledger?.cost30d ?? 0),
            pageviews30d: Number(traffic?.pageviews30d ?? 0),
            clicks30d: Number(traffic?.clicks30d ?? 0),
        });

        return {
            domainId: row.id,
            domain: row.domain,
            niche: row.niche ?? null,
            lifecycleState: row.lifecycleState,
            status: row.status,
            siteTemplate: row.siteTemplate,
            contentConfig: row.contentConfig,
            score: score.score,
            action: score.action,
            reasons: score.reasons,
            revenue30d: Number(ledger?.revenue30d ?? 0),
            cost30d: Number(ledger?.cost30d ?? 0),
            net30d: score.net30d,
            roiPct: score.roiPct,
            pageviews30d: Number(traffic?.pageviews30d ?? 0),
            clicks30d: Number(traffic?.clicks30d ?? 0),
            ctrPct: score.ctrPct,
        };
    });

    const sourceCandidates = scored
        .filter((row) => row.score >= minSourceScore && row.action === 'scale')
        .sort((left, right) => right.score - left.score)
        .slice(0, sourceLimit);

    const targetCandidates = scored.filter((row) =>
        row.score <= maxTargetScore
        && row.lifecycleState !== 'sell'
        && row.lifecycleState !== 'sunset'
        && row.status !== 'forsale',
    );

    const recommendations: StrategyPropagationRecommendation[] = [];
    let targetCount = 0;

    for (const source of sourceCandidates) {
        const modules = getAvailableStrategyPropagationModules({
            siteTemplate: source.siteTemplate,
            contentConfig: source.contentConfig,
        });
        if (modules.length === 0) {
            continue;
        }

        const targets = targetCandidates
            .filter((target) => target.domainId !== source.domainId)
            .filter((target) => {
                if (source.niche && target.niche) {
                    return source.niche === target.niche;
                }
                return true;
            })
            .sort((left, right) => left.score - right.score)
            .slice(0, targetLimitPerSource)
            .map((target) => ({
                domainId: target.domainId,
                domain: target.domain,
                niche: target.niche,
                score: target.score,
                action: target.action,
                net30d: round(target.net30d),
                roiPct: target.roiPct,
                reason: `Source ${source.domain} (${source.score}) can transfer ${modules.join(', ')} to improve ${target.domain} (${target.score}).`,
            }));

        if (targets.length === 0) {
            continue;
        }

        targetCount += targets.length;
        recommendations.push({
            source: {
                domainId: source.domainId,
                domain: source.domain,
                niche: source.niche,
                score: source.score,
                action: source.action,
                net30d: round(source.net30d),
                roiPct: source.roiPct,
            },
            modules,
            targets,
        });
    }

    return {
        windowDays,
        sourceCount: sourceCandidates.length,
        recommendationCount: recommendations.length,
        targetCount,
        recommendations,
    };
}

export async function applyDomainStrategyPropagation(input: {
    sourceDomainId: string;
    targetDomainIds: string[];
    modules: StrategyPropagationModule[];
    appliedBy: string;
    note?: string | null;
    dryRun?: boolean;
    forceCrossNiche?: boolean;
}): Promise<StrategyPropagationApplyResult> {
    const modules = asModuleList(input.modules);
    const targetDomainIds = [...new Set(input.targetDomainIds)].filter((id) => id !== input.sourceDomainId);

    const [source] = await db.select({
        id: domains.id,
        domain: domains.domain,
        niche: domains.niche,
        siteTemplate: domains.siteTemplate,
        contentConfig: domains.contentConfig,
    })
        .from(domains)
        .where(and(eq(domains.id, input.sourceDomainId), notDeleted(domains)))
        .limit(1);

    if (!source) {
        throw new Error('Source domain not found');
    }

    if (modules.length === 0) {
        throw new Error('No valid propagation modules provided');
    }

    if (targetDomainIds.length === 0) {
        return {
            sourceDomainId: source.id,
            sourceDomain: source.domain,
            modules,
            dryRun: Boolean(input.dryRun),
            applied: [],
            skipped: [],
            missingDomainIds: [],
        };
    }

    const targetRows = await db.select({
        id: domains.id,
        domain: domains.domain,
        niche: domains.niche,
        siteTemplate: domains.siteTemplate,
        contentConfig: domains.contentConfig,
    })
        .from(domains)
        .where(and(inArray(domains.id, targetDomainIds), notDeleted(domains)));

    const targetById = new Map(targetRows.map((row) => [row.id, row]));
    const missingDomainIds = targetDomainIds.filter((id) => !targetById.has(id));

    const applied: Array<{ domainId: string; domain: string }> = [];
    const skipped: Array<{ domainId: string; domain: string; reason: string }> = [];

    const now = new Date();
    const historyEntry: PropagationHistoryEntry = {
        at: now.toISOString(),
        sourceDomainId: source.id,
        sourceDomain: source.domain,
        modules,
        appliedBy: input.appliedBy,
        note: input.note?.trim() ? input.note.trim() : null,
    };

    const shouldDryRun = Boolean(input.dryRun);
    const plannedUpdates: Array<{
        target: { id: string; domain: string };
        set: Record<string, unknown>;
    }> = [];

    for (const targetId of targetDomainIds) {
        const target = targetById.get(targetId);
        if (!target) continue;

        if (!input.forceCrossNiche && source.niche && target.niche && source.niche !== target.niche) {
            skipped.push({
                domainId: target.id,
                domain: target.domain,
                reason: 'niche_mismatch',
            });
            continue;
        }

        const nextContentConfig = mergeStrategyPropagationConfig({
            sourceConfig: source.contentConfig,
            targetConfig: target.contentConfig,
            modules,
            history: historyEntry,
        });

        const set: Record<string, unknown> = {
            contentConfig: nextContentConfig,
            updatedAt: now,
        };
        if (modules.includes('site_template') && source.siteTemplate) {
            set.siteTemplate = source.siteTemplate;
        }

        if (shouldDryRun) {
            applied.push({
                domainId: target.id,
                domain: target.domain,
            });
            continue;
        }

        plannedUpdates.push({
            target: {
                id: target.id,
                domain: target.domain,
            },
            set,
        });
    }

    if (!shouldDryRun && plannedUpdates.length > 0) {
        const committedApplied: Array<{ domainId: string; domain: string }> = [];

        await db.transaction(async (tx) => {
            for (const updatePlan of plannedUpdates) {
                await tx.update(domains)
                    .set(updatePlan.set)
                    .where(eq(domains.id, updatePlan.target.id));

                committedApplied.push({
                    domainId: updatePlan.target.id,
                    domain: updatePlan.target.domain,
                });
            }
        });

        applied.push(...committedApplied);
    }

    return {
        sourceDomainId: source.id,
        sourceDomain: source.domain,
        modules,
        dryRun: shouldDryRun,
        applied,
        skipped,
        missingDomainIds,
    };
}
