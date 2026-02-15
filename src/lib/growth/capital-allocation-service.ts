import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
    domainResearch,
    promotionCampaigns,
    promotionEvents,
} from '@/lib/db';
import { evaluateCapitalAllocation } from '@/lib/growth/capital-allocation';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';

type DomainRollup = {
    spend: number;
    revenue: number;
};

const MAX_CAMPAIGNS_FETCH = 5000;

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export type CapitalAllocationRecommendationRow = {
    campaignId: string;
    domainResearchId: string;
    domainId: string | null;
    domain: string;
    status: CampaignStatus;
    channels: string[];
    metrics: {
        clicks: number;
        leads: number;
        conversions: number;
        estimatedSpend: number;
        estimatedRevenue: number;
        estimatedNet: number;
        estimatedDailyLoss: number;
        estimatedWeeklyLoss: number;
        allocationSharePct: number;
    };
    unitEconomics: {
        cac: number | null;
        ltv: number | null;
        cacLtvRatio: number | null;
        paybackDays: number | null;
    };
    recommendation: {
        band: 'scale' | 'maintain' | 'optimize' | 'pause';
        hardLimited: boolean;
        reasons: string[];
        priority: number;
        recommendedStatus: CampaignStatus;
        currentBudget: number;
        recommendedBudget: number;
        budgetDelta: number;
        currentDailyCap: number;
        recommendedDailyCap: number;
        dailyCapDelta: number;
    };
};

export type CapitalAllocationRecommendationSummary = {
    windowDays: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    recommendations: CapitalAllocationRecommendationRow[];
    summary: {
        bandCounts: Record<'scale' | 'maintain' | 'optimize' | 'pause', number>;
        hardLimitedCount: number;
        totalBudgetDelta: number;
    };
};

export type CapitalAllocationApplyUpdate = {
    campaignId: string;
    recommendedStatus?: CampaignStatus;
    recommendedBudget?: number;
    recommendedDailyCap?: number;
    rationale?: string;
};

export type CapitalAllocationAppliedCampaign = {
    campaignId: string;
    status: CampaignStatus;
    budget: number;
    dailyCap: number;
};

export type CapitalAllocationApplySummary = {
    updated: CapitalAllocationAppliedCampaign[];
    missingCampaignIds: string[];
};

export class MissingCapitalAllocationCampaignsError extends Error {
    readonly missingCampaignIds: string[];

    constructor(missingCampaignIds: string[]) {
        super('Some campaigns were not found');
        this.name = 'MissingCapitalAllocationCampaignsError';
        this.missingCampaignIds = missingCampaignIds;
    }
}

export async function generateCapitalAllocationRecommendations(input: {
    windowDays: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    statuses: CampaignStatus[];
    limit: number;
}): Promise<CapitalAllocationRecommendationSummary> {
    const now = new Date();
    const fetchLimit = Math.max(1, Math.min(Math.floor(input.limit), MAX_CAMPAIGNS_FETCH));
    const windowStart = new Date(now.getTime() - (input.windowDays - 1) * 24 * 60 * 60 * 1000);
    const oneDayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDayStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const campaigns = await db.select({
        id: promotionCampaigns.id,
        status: promotionCampaigns.status,
        budget: promotionCampaigns.budget,
        dailyCap: promotionCampaigns.dailyCap,
        channels: promotionCampaigns.channels,
        domainResearchId: promotionCampaigns.domainResearchId,
        domainId: domainResearch.domainId,
        domain: domainResearch.domain,
    })
        .from(promotionCampaigns)
        .innerJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
        .where(inArray(promotionCampaigns.status, input.statuses))
        .orderBy(sql`${promotionCampaigns.createdAt} desc`)
        .limit(fetchLimit);

    if (campaigns.length === 0) {
        return {
            windowDays: input.windowDays,
            dailyLossLimit: input.dailyLossLimit,
            weeklyLossLimit: input.weeklyLossLimit,
            recommendations: [],
            summary: {
                bandCounts: { scale: 0, maintain: 0, optimize: 0, pause: 0 },
                hardLimitedCount: 0,
                totalBudgetDelta: 0,
            },
        };
    }

    const campaignIds = campaigns.map((campaign) => campaign.id);
    const domainIds = [...new Set(campaigns
        .map((campaign) => campaign.domainId)
        .filter((domainId): domainId is string => typeof domainId === 'string' && domainId.length > 0))];

    const [campaignEventRollups, domainWindowRollups, domainDayRollups, domainWeekRollups] = await Promise.all([
        db.select({
            campaignId: promotionEvents.campaignId,
            clicks: sql<number>`sum(case when ${promotionEvents.eventType} = 'click' then 1 else 0 end)::int`,
            leads: sql<number>`sum(case when ${promotionEvents.eventType} = 'lead' then 1 else 0 end)::int`,
            conversions: sql<number>`sum(case when ${promotionEvents.eventType} = 'conversion' then 1 else 0 end)::int`,
        })
            .from(promotionEvents)
            .where(and(
                inArray(promotionEvents.campaignId, campaignIds),
                gte(promotionEvents.occurredAt, windowStart),
                lte(promotionEvents.occurredAt, now),
            ))
            .groupBy(promotionEvents.campaignId),
        domainIds.length > 0
            ? db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                spend: sql<number>`sum(case when ${domainFinanceLedgerEntries.entryType} = 'channel_spend' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
                revenue: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(
                    inArray(domainFinanceLedgerEntries.domainId, domainIds),
                    gte(domainFinanceLedgerEntries.entryDate, windowStart),
                    lte(domainFinanceLedgerEntries.entryDate, now),
                ))
                .groupBy(domainFinanceLedgerEntries.domainId)
            : Promise.resolve([]),
        domainIds.length > 0
            ? db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                spend: sql<number>`sum(case when ${domainFinanceLedgerEntries.entryType} = 'channel_spend' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
                revenue: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(
                    inArray(domainFinanceLedgerEntries.domainId, domainIds),
                    gte(domainFinanceLedgerEntries.entryDate, oneDayStart),
                    lte(domainFinanceLedgerEntries.entryDate, now),
                ))
                .groupBy(domainFinanceLedgerEntries.domainId)
            : Promise.resolve([]),
        domainIds.length > 0
            ? db.select({
                domainId: domainFinanceLedgerEntries.domainId,
                spend: sql<number>`sum(case when ${domainFinanceLedgerEntries.entryType} = 'channel_spend' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
                revenue: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            })
                .from(domainFinanceLedgerEntries)
                .where(and(
                    inArray(domainFinanceLedgerEntries.domainId, domainIds),
                    gte(domainFinanceLedgerEntries.entryDate, sevenDayStart),
                    lte(domainFinanceLedgerEntries.entryDate, now),
                ))
                .groupBy(domainFinanceLedgerEntries.domainId)
            : Promise.resolve([]),
    ]);

    const eventByCampaign = new Map(campaignEventRollups.map((row) => [row.campaignId, row]));
    const windowByDomain = new Map<string, DomainRollup>(
        domainWindowRollups.map((row) => [row.domainId, { spend: Number(row.spend) || 0, revenue: Number(row.revenue) || 0 }]),
    );
    const dayByDomain = new Map<string, DomainRollup>(
        domainDayRollups.map((row) => [row.domainId, { spend: Number(row.spend) || 0, revenue: Number(row.revenue) || 0 }]),
    );
    const weekByDomain = new Map<string, DomainRollup>(
        domainWeekRollups.map((row) => [row.domainId, { spend: Number(row.spend) || 0, revenue: Number(row.revenue) || 0 }]),
    );

    const domainCampaigns = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
        if (!campaign.domainId) continue;
        if (!domainCampaigns.has(campaign.domainId)) {
            domainCampaigns.set(campaign.domainId, []);
        }
        domainCampaigns.get(campaign.domainId)!.push(campaign);
    }

    const domainClicks = new Map<string, number>();
    for (const [domainId, domainCampaignList] of domainCampaigns.entries()) {
        const clicks = domainCampaignList.reduce((sum, campaign) => {
            const row = eventByCampaign.get(campaign.id);
            return sum + Number(row?.clicks ?? 0);
        }, 0);
        domainClicks.set(domainId, clicks);
    }

    const recommendations = campaigns.map((campaign) => {
        const events = eventByCampaign.get(campaign.id);
        const clicks = Number(events?.clicks ?? 0);
        const leads = Number(events?.leads ?? 0);
        const conversions = Number(events?.conversions ?? 0);

        const domainId = campaign.domainId ?? null;
        const domainWindow = domainId ? (windowByDomain.get(domainId) ?? { spend: 0, revenue: 0 }) : { spend: 0, revenue: 0 };
        const domainDay = domainId ? (dayByDomain.get(domainId) ?? { spend: 0, revenue: 0 }) : { spend: 0, revenue: 0 };
        const domainWeek = domainId ? (weekByDomain.get(domainId) ?? { spend: 0, revenue: 0 }) : { spend: 0, revenue: 0 };

        const campaignsOnDomain = domainId ? (domainCampaigns.get(domainId) ?? []) : [];
        const domainTotalClicks = domainId ? (domainClicks.get(domainId) ?? 0) : 0;
        let share = 1;
        if (domainId) {
            if (domainTotalClicks > 0) {
                share = clicks / domainTotalClicks;
            } else if (campaignsOnDomain.length > 0) {
                share = 1 / campaignsOnDomain.length;
            }
        }
        share = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));

        const estimatedSpend = domainWindow.spend * share;
        const estimatedRevenue = domainWindow.revenue * share;
        const estimatedDailyLoss = Math.max(0, (domainDay.spend - domainDay.revenue) * share);
        const estimatedWeeklyLoss = Math.max(0, (domainWeek.spend - domainWeek.revenue) * share);

        const evaluation = evaluateCapitalAllocation({
            spend: estimatedSpend,
            revenue: estimatedRevenue,
            leads,
            clicks,
            windowDays: input.windowDays,
            dailyLoss: estimatedDailyLoss,
            weeklyLoss: estimatedWeeklyLoss,
            dailyLossLimit: input.dailyLossLimit,
            weeklyLossLimit: input.weeklyLossLimit,
        });

        const currentBudget = Number(campaign.budget ?? 0);
        const currentDailyCap = Number(campaign.dailyCap ?? 0);
        const recommendedBudget = Math.max(0, round(currentBudget * evaluation.recommendedBudgetFactor));
        const recommendedDailyCap = Math.max(0, Math.round(currentDailyCap * evaluation.recommendedDailyCapFactor));
        const recommendedStatus = evaluation.band === 'pause'
            ? 'paused'
            : campaign.status === 'paused' && evaluation.band === 'scale'
                ? 'active'
                : campaign.status;

        const priority = evaluation.hardLimited
            ? 100
            : evaluation.band === 'pause'
                ? 90
                : evaluation.band === 'optimize'
                    ? 70
                    : evaluation.band === 'scale'
                        ? 50
                        : 30;

        return {
            campaignId: campaign.id,
            domainResearchId: campaign.domainResearchId,
            domainId,
            domain: campaign.domain,
            status: campaign.status as CampaignStatus,
            channels: campaign.channels,
            metrics: {
                clicks,
                leads,
                conversions,
                estimatedSpend: round(estimatedSpend),
                estimatedRevenue: round(estimatedRevenue),
                estimatedNet: round(estimatedRevenue - estimatedSpend),
                estimatedDailyLoss: round(estimatedDailyLoss),
                estimatedWeeklyLoss: round(estimatedWeeklyLoss),
                allocationSharePct: round(share * 100, 2),
            },
            unitEconomics: {
                cac: evaluation.cac,
                ltv: evaluation.ltv,
                cacLtvRatio: evaluation.cacLtvRatio,
                paybackDays: evaluation.paybackDays,
            },
            recommendation: {
                band: evaluation.band,
                hardLimited: evaluation.hardLimited,
                reasons: evaluation.reasons,
                priority,
                recommendedStatus: recommendedStatus as CampaignStatus,
                currentBudget,
                recommendedBudget,
                budgetDelta: round(recommendedBudget - currentBudget),
                currentDailyCap,
                recommendedDailyCap,
                dailyCapDelta: recommendedDailyCap - currentDailyCap,
            },
        };
    })
        .sort((left, right) => right.recommendation.priority - left.recommendation.priority)
        .slice(0, input.limit);

    const bandCounts = recommendations.reduce<Record<'scale' | 'maintain' | 'optimize' | 'pause', number>>((acc, row) => {
        acc[row.recommendation.band] += 1;
        return acc;
    }, { scale: 0, maintain: 0, optimize: 0, pause: 0 });

    const hardLimitedCount = recommendations.filter((row) => row.recommendation.hardLimited).length;
    const totalBudgetDelta = round(recommendations.reduce((sum, row) => sum + row.recommendation.budgetDelta, 0));

    return {
        windowDays: input.windowDays,
        dailyLossLimit: input.dailyLossLimit,
        weeklyLossLimit: input.weeklyLossLimit,
        recommendations,
        summary: {
            bandCounts,
            hardLimitedCount,
            totalBudgetDelta,
        },
    };
}

export async function applyCapitalAllocationUpdates(input: {
    updates: CapitalAllocationApplyUpdate[];
    appliedBy: string;
    strict?: boolean;
    now?: Date;
}): Promise<CapitalAllocationApplySummary> {
    if (input.updates.length === 0) {
        return { updated: [], missingCampaignIds: [] };
    }

    const campaignIds = input.updates.map((update) => update.campaignId);
    const campaigns = await db.select({
        id: promotionCampaigns.id,
        status: promotionCampaigns.status,
        budget: promotionCampaigns.budget,
        dailyCap: promotionCampaigns.dailyCap,
    })
        .from(promotionCampaigns)
        .where(inArray(promotionCampaigns.id, campaignIds));
    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

    const missingCampaignIds = campaignIds.filter((campaignId) => !campaignById.has(campaignId));
    if ((input.strict ?? true) && missingCampaignIds.length > 0) {
        throw new MissingCapitalAllocationCampaignsError(missingCampaignIds);
    }

    const updatesToApply = input.updates.filter((update) => campaignById.has(update.campaignId));
    if (updatesToApply.length === 0) {
        return { updated: [], missingCampaignIds };
    }

    const now = input.now ?? new Date();
    const updated = await db.transaction(async (tx) => {
        const applied: CapitalAllocationAppliedCampaign[] = [];
        for (const update of updatesToApply) {
            const current = campaignById.get(update.campaignId)!;
            const set: Record<string, unknown> = {
                updatedAt: now,
            };
            if (update.recommendedStatus !== undefined) {
                set.status = update.recommendedStatus;
            }
            if (update.recommendedBudget !== undefined) {
                set.budget = update.recommendedBudget;
            }
            if (update.recommendedDailyCap !== undefined) {
                set.dailyCap = update.recommendedDailyCap;
            }

            const [campaign] = await tx.update(promotionCampaigns)
                .set(set)
                .where(eq(promotionCampaigns.id, update.campaignId))
                .returning({
                    id: promotionCampaigns.id,
                    status: promotionCampaigns.status,
                    budget: promotionCampaigns.budget,
                    dailyCap: promotionCampaigns.dailyCap,
                });

            await tx.insert(promotionEvents).values({
                campaignId: update.campaignId,
                eventType: 'capital_allocation_applied',
                occurredAt: now,
                attributes: {
                    appliedBy: input.appliedBy,
                    rationale: update.rationale ?? null,
                    previous: {
                        status: current.status,
                        budget: Number(current.budget ?? 0),
                        dailyCap: Number(current.dailyCap ?? 0),
                    },
                    next: {
                        status: campaign.status,
                        budget: Number(campaign.budget ?? 0),
                        dailyCap: Number(campaign.dailyCap ?? 0),
                    },
                },
            });

            applied.push({
                campaignId: campaign.id,
                status: campaign.status as CampaignStatus,
                budget: Number(campaign.budget ?? 0),
                dailyCap: Number(campaign.dailyCap ?? 0),
            });
        }
        return applied;
    });

    return {
        updated,
        missingCampaignIds,
    };
}
