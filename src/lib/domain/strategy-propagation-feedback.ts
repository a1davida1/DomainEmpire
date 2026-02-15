import { and, gte, inArray, lte } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import {
    STRATEGY_PROPAGATION_MODULES,
    type StrategyPropagationModule,
} from '@/lib/domain/strategy-propagation';
import { scoreDomainRoiPriority } from '@/lib/domain/roi-prioritization';

type HistoryEntry = {
    at: Date;
    sourceDomainId: string;
    modules: StrategyPropagationModule[];
};

type DomainContext = {
    id: string;
    domain: string;
    niche: string | null;
    lifecycleState: string;
    status: string;
    contentConfig: unknown;
};

type DomainWindowMetrics = {
    revenue: number;
    cost: number;
    pageviews: number;
    clicks: number;
};

export type StrategyPropagationOutcomeSummary = {
    evaluated: number;
    successes: number;
    successRate: number | null;
    avgScoreDelta: number | null;
    crossNiche: {
        samples: number;
        successes: number;
        successRate: number | null;
    };
    sameNiche: {
        samples: number;
        successes: number;
        successRate: number | null;
    };
    unknownNiche?: {
        samples: number;
        successes: number;
        successRate: number | null;
    };
    moduleOutcomes: Array<{
        module: StrategyPropagationModule;
        samples: number;
        successes: number;
        successRate: number | null;
    }>;
};

export type StrategyPropagationPolicyBaseline = {
    minSourceScore: number;
    maxTargetScore: number;
    allowedModules: StrategyPropagationModule[];
    forceCrossNiche: boolean;
};

export type StrategyPropagationPolicyFeedback = {
    lookbackDays: number;
    preWindowDays: number;
    postWindowDays: number;
    minImprovementScore: number;
    outcome: StrategyPropagationOutcomeSummary;
    confidence: number;
    recommendedPolicy: StrategyPropagationPolicyBaseline;
    rationale: string[];
};

function asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asDate(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) return parsed;
    }
    return null;
}

function asNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function ratio(numerator: number, denominator: number): number | null {
    if (denominator <= 0) return null;
    return numerator / denominator;
}

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function toModules(value: unknown): StrategyPropagationModule[] {
    return asArray(value)
        .map((item) => asString(item))
        .filter((item): item is StrategyPropagationModule =>
            Boolean(item) && STRATEGY_PROPAGATION_MODULES.includes(item as StrategyPropagationModule),
        );
}

function extractHistoryEntries(contentConfig: unknown, since: Date): HistoryEntry[] {
    const cfg = asObject(contentConfig);
    const entries = asArray(cfg.strategyPropagationHistory);

    const out: HistoryEntry[] = [];
    for (const rawEntry of entries) {
        const entry = asObject(rawEntry);
        const at = asDate(entry.at);
        const sourceDomainId = asString(entry.sourceDomainId);
        const modules = toModules(entry.modules);
        if (!at || !sourceDomainId || modules.length === 0) continue;
        if (at.getTime() < since.getTime()) continue;

        out.push({
            at,
            sourceDomainId,
            modules,
        });
    }

    return out;
}

function sumMetrics(
    ledgerRows: Array<{ entryDate: Date; impact: string; amount: number }>,
    trafficRows: Array<{ snapshotDate: Date; pageviews: number; clicks: number }>,
    start: Date,
    end: Date,
): DomainWindowMetrics {
    const startMs = start.getTime();
    const endMs = end.getTime();

    let revenue = 0;
    let cost = 0;
    let pageviews = 0;
    let clicks = 0;

    for (const row of ledgerRows) {
        const ts = row.entryDate.getTime();
        if (ts < startMs || ts >= endMs) continue;

        if (row.impact === 'revenue') revenue += row.amount;
        else cost += row.amount;
    }

    for (const row of trafficRows) {
        const ts = row.snapshotDate.getTime();
        if (ts < startMs || ts >= endMs) continue;
        pageviews += row.pageviews;
        clicks += row.clicks;
    }

    return { revenue, cost, pageviews, clicks };
}

function normalizeToThirtyDay(metrics: DomainWindowMetrics, windowDays: number): DomainWindowMetrics {
    const days = Math.max(1, windowDays);
    const factor = 30 / days;
    return {
        revenue: metrics.revenue * factor,
        cost: metrics.cost * factor,
        pageviews: metrics.pageviews * factor,
        clicks: metrics.clicks * factor,
    };
}

export function recommendStrategyPropagationPolicy(input: {
    basePolicy: StrategyPropagationPolicyBaseline;
    outcome: StrategyPropagationOutcomeSummary;
}): {
    recommendedPolicy: StrategyPropagationPolicyBaseline;
    rationale: string[];
} {
    const next: StrategyPropagationPolicyBaseline = {
        ...input.basePolicy,
        allowedModules: [...new Set(input.basePolicy.allowedModules)],
    };
    const rationale: string[] = [];

    if (input.outcome.evaluated >= 5 && input.outcome.successRate !== null) {
        if (input.outcome.successRate < 0.45) {
            next.minSourceScore = Math.round(clamp(next.minSourceScore + 5, 0, 100));
            next.maxTargetScore = Math.round(clamp(next.maxTargetScore - 5, 0, 100));
            rationale.push('Tightened source/target score bounds due to weak propagation outcomes');
        } else if (input.outcome.successRate > 0.7) {
            next.minSourceScore = Math.round(clamp(next.minSourceScore - 3, 0, 100));
            next.maxTargetScore = Math.round(clamp(next.maxTargetScore + 5, 0, 100));
            rationale.push('Relaxed source/target score bounds due to strong propagation outcomes');
        }
    }

    const recommendedModules = input.outcome.moduleOutcomes
        .filter((row) => row.samples >= 3 && row.successRate !== null && row.successRate >= 0.45)
        .map((row) => row.module);

    if (recommendedModules.length > 0) {
        next.allowedModules = recommendedModules;
        rationale.push('Filtered propagation modules to historically effective set');
    }

    const crossRate = input.outcome.crossNiche.successRate;
    const sameRate = input.outcome.sameNiche.successRate;
    if (
        input.outcome.crossNiche.samples >= 5
        && crossRate !== null
        && (sameRate === null || crossRate >= sameRate + 0.1)
        && crossRate >= 0.5
    ) {
        next.forceCrossNiche = true;
        rationale.push('Enabled cross-niche propagation due to strong cross-niche outcomes');
    } else {
        next.forceCrossNiche = false;
    }

    return {
        recommendedPolicy: next,
        rationale,
    };
}

export async function getStrategyPropagationPolicyFeedback(input: {
    lookbackDays?: number;
    preWindowDays?: number;
    postWindowDays?: number;
    maxEvents?: number;
    minImprovementScore?: number;
    basePolicy?: StrategyPropagationPolicyBaseline;
} = {}): Promise<StrategyPropagationPolicyFeedback> {
    const lookbackDays = Math.max(14, Math.min(input.lookbackDays ?? 60, 365));
    const preWindowDays = Math.max(1, Math.min(input.preWindowDays ?? 14, 60));
    const postWindowDays = Math.max(1, Math.min(input.postWindowDays ?? 14, 60));
    const maxEvents = Math.max(10, Math.min(input.maxEvents ?? 500, 5000));
    const minImprovementScore = Math.max(1, Math.min(input.minImprovementScore ?? 5, 50));

    const basePolicy: StrategyPropagationPolicyBaseline = input.basePolicy ?? {
        minSourceScore: 75,
        maxTargetScore: 60,
        allowedModules: [...STRATEGY_PROPAGATION_MODULES],
        forceCrossNiche: false,
    };

    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const domainRows = await db.select({
        id: domains.id,
        domain: domains.domain,
        niche: domains.niche,
        lifecycleState: domains.lifecycleState,
        status: domains.status,
        contentConfig: domains.contentConfig,
    })
        .from(domains)
        .where(notDeleted(domains))
        .limit(5000);

    const domainById = new Map<string, DomainContext>(domainRows.map((row) => [row.id, {
        id: row.id,
        domain: row.domain,
        niche: row.niche,
        lifecycleState: row.lifecycleState,
        status: row.status,
        contentConfig: row.contentConfig,
    }]));

    const latestEventByTarget = new Map<string, { targetDomainId: string; event: HistoryEntry }>();
    for (const domain of domainById.values()) {
        const history = extractHistoryEntries(domain.contentConfig, since)
            .sort((left, right) => right.at.getTime() - left.at.getTime());

        if (history.length === 0) continue;
        const latest = history[0];
        latestEventByTarget.set(domain.id, {
            targetDomainId: domain.id,
            event: latest,
        });
    }

    const eventRows = [...latestEventByTarget.values()]
        .sort((left, right) => right.event.at.getTime() - left.event.at.getTime())
        .slice(0, maxEvents);

    if (eventRows.length === 0) {
        const emptyOutcome: StrategyPropagationOutcomeSummary = {
            evaluated: 0,
            successes: 0,
            successRate: null,
            avgScoreDelta: null,
            crossNiche: { samples: 0, successes: 0, successRate: null },
            sameNiche: { samples: 0, successes: 0, successRate: null },
            unknownNiche: { samples: 0, successes: 0, successRate: null },
            moduleOutcomes: STRATEGY_PROPAGATION_MODULES.map((module) => ({
                module,
                samples: 0,
                successes: 0,
                successRate: null,
            })),
        };

        return {
            lookbackDays,
            preWindowDays,
            postWindowDays,
            minImprovementScore,
            outcome: emptyOutcome,
            confidence: 0,
            recommendedPolicy: basePolicy,
            rationale: [],
        };
    }

    const targetIds = eventRows.map((row) => row.targetDomainId);
    const earliestAt = new Date(Math.min(...eventRows.map((row) => row.event.at.getTime())));
    const latestAt = new Date(Math.max(...eventRows.map((row) => row.event.at.getTime())));

    const rangeStart = new Date(earliestAt.getTime() - preWindowDays * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(latestAt.getTime() + postWindowDays * 24 * 60 * 60 * 1000);

    const [ledgerRows, trafficRows] = await Promise.all([
        db.select({
            domainId: domainFinanceLedgerEntries.domainId,
            entryDate: domainFinanceLedgerEntries.entryDate,
            impact: domainFinanceLedgerEntries.impact,
            amount: domainFinanceLedgerEntries.amount,
        })
            .from(domainFinanceLedgerEntries)
            .where(and(
                inArray(domainFinanceLedgerEntries.domainId, targetIds),
                gte(domainFinanceLedgerEntries.entryDate, rangeStart),
                lte(domainFinanceLedgerEntries.entryDate, rangeEnd),
            )),
        db.select({
            domainId: revenueSnapshots.domainId,
            snapshotDate: revenueSnapshots.snapshotDate,
            pageviews: revenueSnapshots.pageviews,
            clicks: revenueSnapshots.clicks,
        })
            .from(revenueSnapshots)
            .where(and(
                inArray(revenueSnapshots.domainId, targetIds),
                gte(revenueSnapshots.snapshotDate, rangeStart),
                lte(revenueSnapshots.snapshotDate, rangeEnd),
            )),
    ]);

    const ledgerByDomain = new Map<string, Array<{ entryDate: Date; impact: string; amount: number }>>();
    for (const row of ledgerRows) {
        if (!ledgerByDomain.has(row.domainId)) ledgerByDomain.set(row.domainId, []);
        ledgerByDomain.get(row.domainId)!.push({
            entryDate: row.entryDate,
            impact: row.impact,
            amount: asNumber(row.amount),
        });
    }

    const trafficByDomain = new Map<string, Array<{ snapshotDate: Date; pageviews: number; clicks: number }>>();
    for (const row of trafficRows) {
        if (!trafficByDomain.has(row.domainId)) trafficByDomain.set(row.domainId, []);
        trafficByDomain.get(row.domainId)!.push({
            snapshotDate: row.snapshotDate,
            pageviews: Number(row.pageviews ?? 0),
            clicks: Number(row.clicks ?? 0),
        });
    }

    let evaluated = 0;
    let successes = 0;
    let totalDelta = 0;

    const moduleStats = new Map<StrategyPropagationModule, { samples: number; successes: number }>();
    for (const moduleName of STRATEGY_PROPAGATION_MODULES) {
        moduleStats.set(moduleName, { samples: 0, successes: 0 });
    }

    let crossNicheSamples = 0;
    let crossNicheSuccesses = 0;
    let sameNicheSamples = 0;
    let sameNicheSuccesses = 0;
    let unknownNicheSamples = 0;
    let unknownNicheSuccesses = 0;

    for (const row of eventRows) {
        const target = domainById.get(row.targetDomainId);
        const source = domainById.get(row.event.sourceDomainId);
        if (!target || !source) continue;

        const preStart = new Date(row.event.at.getTime() - preWindowDays * 24 * 60 * 60 * 1000);
        const postEnd = new Date(row.event.at.getTime() + postWindowDays * 24 * 60 * 60 * 1000);

        const preMetrics = sumMetrics(
            ledgerByDomain.get(target.id) ?? [],
            trafficByDomain.get(target.id) ?? [],
            preStart,
            row.event.at,
        );
        const postMetrics = sumMetrics(
            ledgerByDomain.get(target.id) ?? [],
            trafficByDomain.get(target.id) ?? [],
            row.event.at,
            postEnd,
        );

        const preMetrics30d = normalizeToThirtyDay(preMetrics, preWindowDays);
        const postMetrics30d = normalizeToThirtyDay(postMetrics, postWindowDays);

        const preScore = scoreDomainRoiPriority({
            lifecycleState: target.lifecycleState,
            revenue30d: preMetrics30d.revenue,
            cost30d: preMetrics30d.cost,
            pageviews30d: preMetrics30d.pageviews,
            clicks30d: preMetrics30d.clicks,
        }).score;
        const postScore = scoreDomainRoiPriority({
            lifecycleState: target.lifecycleState,
            revenue30d: postMetrics30d.revenue,
            cost30d: postMetrics30d.cost,
            pageviews30d: postMetrics30d.pageviews,
            clicks30d: postMetrics30d.clicks,
        }).score;

        const scoreDelta = postScore - preScore;
        const success = scoreDelta >= minImprovementScore;

        evaluated += 1;
        totalDelta += scoreDelta;
        if (success) successes += 1;

        const hasNiches = Boolean(source.niche && target.niche);
        if (!hasNiches) {
            unknownNicheSamples += 1;
            if (success) unknownNicheSuccesses += 1;
        } else if (source.niche !== target.niche) {
            crossNicheSamples += 1;
            if (success) crossNicheSuccesses += 1;
        } else {
            sameNicheSamples += 1;
            if (success) sameNicheSuccesses += 1;
        }

        for (const moduleName of row.event.modules) {
            const stat = moduleStats.get(moduleName);
            if (!stat) continue;
            stat.samples += 1;
            if (success) stat.successes += 1;
        }
    }

    const outcome: StrategyPropagationOutcomeSummary = {
        evaluated,
        successes,
        successRate: ratio(successes, evaluated),
        avgScoreDelta: evaluated > 0 ? round(totalDelta / evaluated, 2) : null,
        crossNiche: {
            samples: crossNicheSamples,
            successes: crossNicheSuccesses,
            successRate: ratio(crossNicheSuccesses, crossNicheSamples),
        },
        sameNiche: {
            samples: sameNicheSamples,
            successes: sameNicheSuccesses,
            successRate: ratio(sameNicheSuccesses, sameNicheSamples),
        },
        unknownNiche: {
            samples: unknownNicheSamples,
            successes: unknownNicheSuccesses,
            successRate: ratio(unknownNicheSuccesses, unknownNicheSamples),
        },
        moduleOutcomes: STRATEGY_PROPAGATION_MODULES.map((moduleName) => {
            const stat = moduleStats.get(moduleName)!;
            return {
                module: moduleName,
                samples: stat.samples,
                successes: stat.successes,
                successRate: ratio(stat.successes, stat.samples),
            };
        }),
    };

    const recommendation = recommendStrategyPropagationPolicy({
        basePolicy,
        outcome,
    });

    return {
        lookbackDays,
        preWindowDays,
        postWindowDays,
        minImprovementScore,
        outcome,
        confidence: Math.min(1, evaluated / 30),
        recommendedPolicy: recommendation.recommendedPolicy,
        rationale: recommendation.rationale,
    };
}
