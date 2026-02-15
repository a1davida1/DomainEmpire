import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { db, promotionEvents } from '@/lib/db';
import type { CapitalAutoApplyPolicy } from '@/lib/growth/capital-allocation-policy';

type OptimizationAction = 'scale' | 'pause' | 'other';

type ApplyEvent = {
    campaignId: string;
    occurredAt: Date;
    action: OptimizationAction;
};

type CampaignSignal = {
    campaignId: string;
    occurredAt: Date;
    eventType: string;
};

export type CapitalPolicyOutcomeSummary = {
    evaluated: number;
    scaleSamples: number;
    scaleSuccesses: number;
    scaleSuccessRate: number | null;
    pauseSamples: number;
    pauseSuccesses: number;
    pauseSuccessRate: number | null;
};

export type CapitalPolicyFeedback = {
    lookbackDays: number;
    preWindowDays: number;
    postWindowDays: number;
    outcome: CapitalPolicyOutcomeSummary;
    confidence: number;
    recommendedPolicy: CapitalAutoApplyPolicy;
    rationale: string[];
};

function asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function ratio(numerator: number, denominator: number): number | null {
    if (denominator <= 0) return null;
    return numerator / denominator;
}

function classifyAction(attributes: unknown): OptimizationAction {
    const attrs = asObject(attributes);
    const previous = asObject(attrs.previous);
    const next = asObject(attrs.next);

    const previousStatus = asString(previous.status);
    const nextStatus = asString(next.status);
    const previousBudget = asNumber(previous.budget);
    const nextBudget = asNumber(next.budget);

    if (nextStatus === 'paused') return 'pause';
    if (previousStatus === 'paused' && nextStatus === 'active') return 'scale';

    if (previousBudget !== null && nextBudget !== null) {
        if (nextBudget >= previousBudget * 1.05) return 'scale';
        if (nextBudget <= previousBudget * 0.75) return 'pause';
    }

    return 'other';
}

function parseApplyEvents(rows: Array<{ campaignId: string; occurredAt: Date; attributes: unknown }>): ApplyEvent[] {
    return rows.map((row) => ({
        campaignId: row.campaignId,
        occurredAt: row.occurredAt,
        action: classifyAction(row.attributes),
    }));
}

function computeWindowCounts(signals: CampaignSignal[], start: Date, end: Date): { clicks: number; leads: number; conversions: number } {
    let clicks = 0;
    let leads = 0;
    let conversions = 0;

    const startMs = start.getTime();
    const endMs = end.getTime();
    for (const signal of signals) {
        const ts = signal.occurredAt.getTime();
        if (ts < startMs || ts >= endMs) continue;

        if (signal.eventType === 'click') clicks += 1;
        else if (signal.eventType === 'lead') leads += 1;
        else if (signal.eventType === 'conversion') conversions += 1;
    }

    return { clicks, leads, conversions };
}

function assessScaleOutcome(pre: { clicks: number; leads: number; conversions: number }, post: { clicks: number; leads: number; conversions: number }): boolean {
    const preLeadRate = ratio(pre.leads, pre.clicks);
    const postLeadRate = ratio(post.leads, post.clicks);

    const leadRateHealthy = preLeadRate === null || postLeadRate === null
        ? true
        : postLeadRate >= preLeadRate * 0.9;

    return post.leads >= pre.leads && leadRateHealthy;
}

function assessPauseOutcome(pre: { clicks: number; leads: number; conversions: number }, post: { clicks: number; leads: number; conversions: number }): boolean {
    const preLeadRate = ratio(pre.leads, pre.clicks);
    const postLeadRate = ratio(post.leads, post.clicks);

    if (preLeadRate === null && postLeadRate !== null) {
        return true;
    }

    if (preLeadRate !== null && postLeadRate !== null) {
        return postLeadRate >= preLeadRate;
    }

    return post.clicks <= pre.clicks;
}

export function recommendCapitalAllocationPolicy(input: {
    basePolicy: CapitalAutoApplyPolicy;
    outcome: CapitalPolicyOutcomeSummary;
}): {
    recommendedPolicy: CapitalAutoApplyPolicy;
    rationale: string[];
} {
    const policy: CapitalAutoApplyPolicy = {
        ...input.basePolicy,
    };
    const rationale: string[] = [];

    if (input.outcome.scaleSamples >= 5 && input.outcome.scaleSuccessRate !== null) {
        if (input.outcome.scaleSuccessRate < 0.45) {
            policy.applyScaleWhenLeadsAtLeast = Math.round(clamp(policy.applyScaleWhenLeadsAtLeast + 5, 0, 1_000));
            policy.applyScaleMaxCacLtvRatio = Number(
                clamp(policy.applyScaleMaxCacLtvRatio - 0.05, 0.3, 2).toFixed(4),
            );
            rationale.push('Tightened scale thresholds due to weak scale outcomes');
        } else if (input.outcome.scaleSuccessRate > 0.7) {
            policy.applyScaleWhenLeadsAtLeast = Math.round(clamp(policy.applyScaleWhenLeadsAtLeast - 3, 0, 1_000));
            policy.applyScaleMaxCacLtvRatio = Number(
                clamp(policy.applyScaleMaxCacLtvRatio + 0.05, 0.3, 2).toFixed(4),
            );
            rationale.push('Relaxed scale thresholds due to strong scale outcomes');
        }
    }

    if (input.outcome.pauseSamples >= 5 && input.outcome.pauseSuccessRate !== null) {
        if (input.outcome.pauseSuccessRate < 0.45) {
            policy.applyPauseWhenNetLossBelow = clamp(policy.applyPauseWhenNetLossBelow - 25, -1_000_000, 1_000_000);
            rationale.push('Reduced pause aggressiveness due to weak pause outcomes');
        } else if (input.outcome.pauseSuccessRate > 0.7) {
            policy.applyPauseWhenNetLossBelow = clamp(policy.applyPauseWhenNetLossBelow + 25, -1_000_000, 1_000_000);
            rationale.push('Increased pause aggressiveness due to strong pause outcomes');
        }
    }

    return {
        recommendedPolicy: policy,
        rationale,
    };
}

export async function getCapitalAllocationPolicyFeedback(input: {
    lookbackDays?: number;
    preWindowDays?: number;
    postWindowDays?: number;
    maxApplyEvents?: number;
    basePolicy?: CapitalAutoApplyPolicy;
} = {}): Promise<CapitalPolicyFeedback> {
    const lookbackDays = Math.max(7, Math.min(input.lookbackDays ?? 45, 180));
    const preWindowDays = Math.max(1, Math.min(input.preWindowDays ?? 7, 30));
    const postWindowDays = Math.max(1, Math.min(input.postWindowDays ?? 7, 30));
    const maxApplyEvents = Math.max(10, Math.min(input.maxApplyEvents ?? 200, 1000));

    const basePolicy: CapitalAutoApplyPolicy = input.basePolicy ?? {
        applyHardLimitedPauses: true,
        applyPauseWhenNetLossBelow: -50,
        applyScaleWhenLeadsAtLeast: 25,
        applyScaleMaxCacLtvRatio: 0.9,
    };

    const now = new Date();
    const lookbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const applyRows = await db.select({
        campaignId: promotionEvents.campaignId,
        occurredAt: promotionEvents.occurredAt,
        attributes: promotionEvents.attributes,
    })
        .from(promotionEvents)
        .where(and(
            eq(promotionEvents.eventType, 'capital_allocation_applied'),
            gte(promotionEvents.occurredAt, lookbackStart),
            lte(promotionEvents.occurredAt, now),
        ))
        .orderBy(desc(promotionEvents.occurredAt))
        .limit(maxApplyEvents);

    const applyEvents = parseApplyEvents(applyRows).filter((event) => event.action !== 'other');
    if (applyEvents.length === 0) {
        return {
            lookbackDays,
            preWindowDays,
            postWindowDays,
            outcome: {
                evaluated: 0,
                scaleSamples: 0,
                scaleSuccesses: 0,
                scaleSuccessRate: null,
                pauseSamples: 0,
                pauseSuccesses: 0,
                pauseSuccessRate: null,
            },
            confidence: 0,
            recommendedPolicy: basePolicy,
            rationale: [],
        };
    }

    const campaignIds = [...new Set(applyEvents.map((event) => event.campaignId))];
    const earliestApplyAt = new Date(Math.min(...applyEvents.map((event) => event.occurredAt.getTime())));
    const latestApplyAt = new Date(Math.max(...applyEvents.map((event) => event.occurredAt.getTime())));

    const signalStart = new Date(earliestApplyAt.getTime() - preWindowDays * 24 * 60 * 60 * 1000);
    const signalEnd = new Date(latestApplyAt.getTime() + postWindowDays * 24 * 60 * 60 * 1000);
    const signalQueryLimit = Math.max(10_000, Math.min(500_000, maxApplyEvents * 500));

    const signalRowsRaw = await db.select({
        campaignId: promotionEvents.campaignId,
        occurredAt: promotionEvents.occurredAt,
        eventType: promotionEvents.eventType,
    })
        .from(promotionEvents)
        .where(and(
            inArray(promotionEvents.campaignId, campaignIds),
            inArray(promotionEvents.eventType, ['click', 'lead', 'conversion']),
            gte(promotionEvents.occurredAt, signalStart),
            lte(promotionEvents.occurredAt, signalEnd),
        ))
        .limit(signalQueryLimit + 1);

    if (signalRowsRaw.length > signalQueryLimit) {
        console.warn('Capital allocation policy feedback signal query truncated at configured limit', {
            signalQueryLimit,
            campaignCount: campaignIds.length,
            lookbackDays,
        });
    }
    const signalRows = signalRowsRaw.slice(0, signalQueryLimit);

    const signalsByCampaign = new Map<string, CampaignSignal[]>();
    for (const row of signalRows) {
        if (!signalsByCampaign.has(row.campaignId)) {
            signalsByCampaign.set(row.campaignId, []);
        }
        signalsByCampaign.get(row.campaignId)!.push({
            campaignId: row.campaignId,
            occurredAt: row.occurredAt,
            eventType: row.eventType,
        });
    }

    let evaluated = 0;
    let scaleSamples = 0;
    let scaleSuccesses = 0;
    let pauseSamples = 0;
    let pauseSuccesses = 0;

    for (const event of applyEvents) {
        const signals = signalsByCampaign.get(event.campaignId) ?? [];
        const preStart = new Date(event.occurredAt.getTime() - preWindowDays * 24 * 60 * 60 * 1000);
        const postEnd = new Date(event.occurredAt.getTime() + postWindowDays * 24 * 60 * 60 * 1000);

        const pre = computeWindowCounts(signals, preStart, event.occurredAt);
        const post = computeWindowCounts(signals, event.occurredAt, postEnd);

        if (event.action === 'scale') {
            scaleSamples += 1;
            if (assessScaleOutcome(pre, post)) {
                scaleSuccesses += 1;
            }
            evaluated += 1;
        } else if (event.action === 'pause') {
            pauseSamples += 1;
            if (assessPauseOutcome(pre, post)) {
                pauseSuccesses += 1;
            }
            evaluated += 1;
        }
    }

    const outcome: CapitalPolicyOutcomeSummary = {
        evaluated,
        scaleSamples,
        scaleSuccesses,
        scaleSuccessRate: ratio(scaleSuccesses, scaleSamples),
        pauseSamples,
        pauseSuccesses,
        pauseSuccessRate: ratio(pauseSuccesses, pauseSamples),
    };

    const recommendation = recommendCapitalAllocationPolicy({
        basePolicy,
        outcome,
    });

    return {
        lookbackDays,
        preWindowDays,
        postWindowDays,
        outcome,
        confidence: Math.min(1, evaluated / 40),
        recommendedPolicy: recommendation.recommendedPolicy,
        rationale: recommendation.rationale,
    };
}
