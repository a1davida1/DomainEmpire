import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
    db,
    contentQueue,
    domainChannelProfiles,
    domainResearch,
    promotionCampaigns,
    promotionEvents,
    promotionJobs,
    reviewTasks,
} from '@/lib/db';
import { getDomainRoiPriorities } from '@/lib/domain/roi-priority-service';
import {
    emitGrowthLaunchFreezeIncident,
    evaluateGrowthLaunchFreeze,
    shouldBlockGrowthLaunchForScope,
} from '@/lib/growth/launch-freeze';
import { enqueueContentJob } from '@/lib/queue/content-queue';

export type RoiAutoplanAction = 'scale' | 'optimize' | 'recover' | 'incubate';
type GrowthChannel = 'pinterest' | 'youtube_shorts';
const DEFAULT_AUTO_PLAN_ACTIONS: RoiAutoplanAction[] = ['scale', 'optimize', 'recover', 'incubate'];

export type RoiCampaignAutoplanItem = {
    domainId: string;
    domain: string;
    action: RoiAutoplanAction;
    score: number;
    net30d: number;
    roiPct: number | null;
    reasons: string[];
    domainResearchId: string | null;
    domainResearchDecision: string | null;
    recommendedChannels: GrowthChannel[];
    recommendedBudget: number;
    recommendedDailyCap: number;
    status: 'creatable' | 'blocked';
    blockedReasonCode: string | null;
    blockedReason: string | null;
    existingCampaignId: string | null;
    existingCampaignStatus: string | null;
};

export type RoiCampaignAutoplanPreview = {
    windowDays: number;
    limit: number;
    actionFilter: RoiAutoplanAction[];
    generatedAt: string;
    count: number;
    creatableCount: number;
    blockedCount: number;
    plans: RoiCampaignAutoplanItem[];
    blockedReasonCounts: Record<string, number>;
};

export type RoiCampaignAutoplanApplyResult = {
    attemptedCount: number;
    createdCount: number;
    skippedCount: number;
    launchQueuedCount: number;
    launchBlockedCount: number;
    launchReviewTasksCreatedCount: number;
    launchReviewTasksLinkedCount: number;
    launchFreezeBlockedCount?: number;
    launchFreezeActive?: boolean;
    launchFreezeLevel?: 'healthy' | 'warning' | 'critical';
    launchFreezeReasonCodes?: string[];
    created: Array<{
        campaignId: string;
        domain: string;
        domainResearchId: string;
        action: RoiAutoplanAction;
        channels: GrowthChannel[];
        budget: number;
        dailyCap: number;
    }>;
    skipped: Array<{
        domain: string;
        domainResearchId: string | null;
        reasonCode: string;
        reason: string;
    }>;
    launchQueued: Array<{
        campaignId: string;
        domain: string;
        jobId: string;
        deduped: boolean;
        promotionJobId: string | null;
    }>;
    launchBlocked: Array<{
        campaignId: string;
        domain: string;
        reasonCode: string;
        reason: string;
        reviewTaskId?: string | null;
        reviewTaskSource?: 'created' | 'existing';
        reviewDueAt?: string | null;
        reviewEscalateAt?: string | null;
    }>;
};

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value ?? Number.NaN)) return fallback;
    const normalized = Math.floor(value ?? fallback);
    if (normalized < min) return min;
    if (normalized > max) return max;
    return normalized;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function defaultChannelsForAction(action: RoiAutoplanAction): GrowthChannel[] {
    if (action === 'recover' || action === 'incubate') {
        return ['pinterest'];
    }
    return ['youtube_shorts', 'pinterest'];
}

function baseBudgetForAction(action: RoiAutoplanAction): number {
    switch (action) {
        case 'scale':
            return 300;
        case 'optimize':
            return 175;
        case 'recover':
            return 80;
        case 'incubate':
            return 120;
    }
}

function baseDailyCapForAction(action: RoiAutoplanAction): number {
    switch (action) {
        case 'scale':
            return 4;
        case 'optimize':
            return 2;
        case 'recover':
            return 1;
        case 'incubate':
            return 1;
    }
}

function adjustBudgetBySignals(opts: {
    baseBudget: number;
    score: number;
    roiPct: number | null;
    net30d: number;
}): number {
    let factor = opts.score >= 85 ? 1.2 : opts.score >= 70 ? 1 : 0.85;
    if (opts.roiPct !== null && opts.roiPct < 0) {
        factor *= 0.75;
    }
    if (opts.net30d < 0) {
        factor *= 0.85;
    }
    return roundMoney(Math.max(0, opts.baseBudget * factor));
}

export async function generateRoiCampaignAutoplanPreview(input?: {
    limit?: number;
    windowDays?: number;
    actions?: RoiAutoplanAction[];
}): Promise<RoiCampaignAutoplanPreview> {
    const limit = clampInteger(input?.limit, 1, 200, 25);
    const windowDays = clampInteger(input?.windowDays, 7, 120, 30);
    const actionFilter: RoiAutoplanAction[] = (input?.actions && input.actions.length > 0)
        ? [...new Set(input.actions)]
        : [...DEFAULT_AUTO_PLAN_ACTIONS];

    const roi = await getDomainRoiPriorities({
        limit,
        windowDays,
    });

    const candidates = roi.priorities.filter((priority) =>
        actionFilter.includes(priority.action as RoiAutoplanAction),
    );

    if (candidates.length === 0) {
        return {
            windowDays,
            limit,
            actionFilter,
            generatedAt: new Date().toISOString(),
            count: 0,
            creatableCount: 0,
            blockedCount: 0,
            plans: [],
            blockedReasonCounts: {},
        };
    }

    const candidateDomains = [...new Set(candidates.map((row) => row.domain.toLowerCase()))];
    const candidateDomainIds = [...new Set(candidates.map((row) => row.domainId))];

    const researchRows = await db.select({
        id: domainResearch.id,
        domain: domainResearch.domain,
        domainId: domainResearch.domainId,
        decision: domainResearch.decision,
        hardFailReason: domainResearch.hardFailReason,
    })
        .from(domainResearch)
        .where(inArray(domainResearch.domain, candidateDomains));

    const researchByDomain = new Map(
        researchRows.map((row) => [row.domain.toLowerCase(), row]),
    );

    const researchIds = researchRows.map((row) => row.id);
    const existingCampaignRows = researchIds.length > 0
        ? await db.select({
            id: promotionCampaigns.id,
            domainResearchId: promotionCampaigns.domainResearchId,
            status: promotionCampaigns.status,
            createdAt: promotionCampaigns.createdAt,
        })
            .from(promotionCampaigns)
            .where(and(
                inArray(promotionCampaigns.domainResearchId, researchIds),
                inArray(promotionCampaigns.status, ['draft', 'active', 'paused']),
            ))
            .orderBy(desc(promotionCampaigns.createdAt))
        : [];

    const existingByResearchId = new Map<string, typeof existingCampaignRows[number]>();
    for (const row of existingCampaignRows) {
        if (!existingByResearchId.has(row.domainResearchId)) {
            existingByResearchId.set(row.domainResearchId, row);
        }
    }

    const profileRows = candidateDomainIds.length > 0
        ? await db.select({
            domainId: domainChannelProfiles.domainId,
            channel: domainChannelProfiles.channel,
            enabled: domainChannelProfiles.enabled,
            compatibility: domainChannelProfiles.compatibility,
        })
            .from(domainChannelProfiles)
            .where(inArray(domainChannelProfiles.domainId, candidateDomainIds))
        : [];

    const profileByDomainChannel = new Map<string, typeof profileRows[number]>();
    for (const row of profileRows) {
        profileByDomainChannel.set(`${row.domainId}:${row.channel}`, row);
    }

    const plans: RoiCampaignAutoplanItem[] = candidates.map((candidate) => {
        const research = researchByDomain.get(candidate.domain.toLowerCase()) ?? null;
        const baseChannels = defaultChannelsForAction(candidate.action as RoiAutoplanAction);
        const recommendedChannels = baseChannels.filter((channel) => {
            const profile = profileByDomainChannel.get(`${candidate.domainId}:${channel}`);
            if (!profile) return true;
            return profile.enabled && profile.compatibility !== 'blocked';
        });

        const recommendedBudget = adjustBudgetBySignals({
            baseBudget: baseBudgetForAction(candidate.action as RoiAutoplanAction),
            score: candidate.score,
            roiPct: candidate.roiPct,
            net30d: candidate.net30d,
        });
        const recommendedDailyCap = baseDailyCapForAction(candidate.action as RoiAutoplanAction);

        if (!research) {
            return {
                domainId: candidate.domainId,
                domain: candidate.domain,
                action: candidate.action as RoiAutoplanAction,
                score: candidate.score,
                net30d: candidate.net30d,
                roiPct: candidate.roiPct,
                reasons: candidate.reasons,
                domainResearchId: null,
                domainResearchDecision: null,
                recommendedChannels,
                recommendedBudget,
                recommendedDailyCap,
                status: 'blocked',
                blockedReasonCode: 'missing_domain_research',
                blockedReason: 'No domain_research record found for this domain.',
                existingCampaignId: null,
                existingCampaignStatus: null,
            };
        }

        if (research.hardFailReason) {
            return {
                domainId: candidate.domainId,
                domain: candidate.domain,
                action: candidate.action as RoiAutoplanAction,
                score: candidate.score,
                net30d: candidate.net30d,
                roiPct: candidate.roiPct,
                reasons: candidate.reasons,
                domainResearchId: research.id,
                domainResearchDecision: research.decision,
                recommendedChannels,
                recommendedBudget,
                recommendedDailyCap,
                status: 'blocked',
                blockedReasonCode: 'research_hard_fail',
                blockedReason: 'Domain research indicates a hard-fail candidate.',
                existingCampaignId: null,
                existingCampaignStatus: null,
            };
        }

        const existing = existingByResearchId.get(research.id);
        if (existing) {
            return {
                domainId: candidate.domainId,
                domain: candidate.domain,
                action: candidate.action as RoiAutoplanAction,
                score: candidate.score,
                net30d: candidate.net30d,
                roiPct: candidate.roiPct,
                reasons: candidate.reasons,
                domainResearchId: research.id,
                domainResearchDecision: research.decision,
                recommendedChannels,
                recommendedBudget,
                recommendedDailyCap,
                status: 'blocked',
                blockedReasonCode: 'existing_open_campaign',
                blockedReason: `Open campaign already exists (${existing.status}).`,
                existingCampaignId: existing.id,
                existingCampaignStatus: existing.status,
            };
        }

        if (recommendedChannels.length === 0) {
            return {
                domainId: candidate.domainId,
                domain: candidate.domain,
                action: candidate.action as RoiAutoplanAction,
                score: candidate.score,
                net30d: candidate.net30d,
                roiPct: candidate.roiPct,
                reasons: candidate.reasons,
                domainResearchId: research.id,
                domainResearchDecision: research.decision,
                recommendedChannels,
                recommendedBudget,
                recommendedDailyCap,
                status: 'blocked',
                blockedReasonCode: 'no_enabled_channels',
                blockedReason: 'No enabled compatible channels remain for this domain.',
                existingCampaignId: null,
                existingCampaignStatus: null,
            };
        }

        return {
            domainId: candidate.domainId,
            domain: candidate.domain,
            action: candidate.action as RoiAutoplanAction,
            score: candidate.score,
            net30d: candidate.net30d,
            roiPct: candidate.roiPct,
            reasons: candidate.reasons,
            domainResearchId: research.id,
            domainResearchDecision: research.decision,
            recommendedChannels,
            recommendedBudget,
            recommendedDailyCap,
            status: 'creatable',
            blockedReasonCode: null,
            blockedReason: null,
            existingCampaignId: null,
            existingCampaignStatus: null,
        };
    });

    const blockedReasonCounts = plans.reduce<Record<string, number>>((acc, plan) => {
        if (plan.status !== 'blocked' || !plan.blockedReasonCode) {
            return acc;
        }
        acc[plan.blockedReasonCode] = (acc[plan.blockedReasonCode] || 0) + 1;
        return acc;
    }, {});

    return {
        windowDays,
        limit,
        actionFilter,
        generatedAt: new Date().toISOString(),
        count: plans.length,
        creatableCount: plans.filter((plan) => plan.status === 'creatable').length,
        blockedCount: plans.filter((plan) => plan.status === 'blocked').length,
        plans,
        blockedReasonCounts,
    };
}

export async function applyRoiCampaignAutoplan(input: {
    preview: RoiCampaignAutoplanPreview;
    createdBy: string;
    reason?: string;
    maxCreates?: number;
    autoLaunch?: boolean;
    autoLaunchActions?: RoiAutoplanAction[];
    launchPriority?: number;
    requirePreviewApproval?: boolean;
}): Promise<RoiCampaignAutoplanApplyResult> {
    const creatablePlans = input.preview.plans.filter((plan) => plan.status === 'creatable');
    const maxCreates = clampInteger(
        input.maxCreates,
        1,
        200,
        creatablePlans.length > 0 ? creatablePlans.length : 1,
    );
    const plansToApply = creatablePlans.slice(0, maxCreates);

    const created: RoiCampaignAutoplanApplyResult['created'] = [];
    const skipped: RoiCampaignAutoplanApplyResult['skipped'] = [];
    const launchQueued: RoiCampaignAutoplanApplyResult['launchQueued'] = [];
    const launchBlocked: RoiCampaignAutoplanApplyResult['launchBlocked'] = [];
    let launchReviewTasksCreatedCount = 0;
    let launchReviewTasksLinkedCount = 0;
    const allowedAutoLaunchActions: RoiAutoplanAction[] = (input.autoLaunchActions && input.autoLaunchActions.length > 0)
        ? [...new Set(input.autoLaunchActions)]
        : [...DEFAULT_AUTO_PLAN_ACTIONS];

    async function queueCampaignLaunchForCampaign(opts: {
        campaignId: string;
        domain: string;
        domainResearchId: string;
        channels: GrowthChannel[];
    }) {
        const force = false;
        const metadata = {
            autoPlannedFromRoi: true,
            source: 'roi_campaign_autoplan',
        } as Record<string, unknown>;

        if (input.requirePreviewApproval && !force) {
            const [approvedReviewTask] = await db.select({
                id: reviewTasks.id,
            })
                .from(reviewTasks)
                .where(and(
                    eq(reviewTasks.taskType, 'campaign_launch'),
                    eq(reviewTasks.entityId, opts.campaignId),
                    eq(reviewTasks.status, 'approved'),
                ))
                .orderBy(desc(reviewTasks.reviewedAt))
                .limit(1);

            if (!approvedReviewTask) {
                const [pendingReviewTask] = await db.select({
                    id: reviewTasks.id,
                    createdAt: reviewTasks.createdAt,
                    slaHours: reviewTasks.slaHours,
                    escalateAfterHours: reviewTasks.escalateAfterHours,
                })
                    .from(reviewTasks)
                    .where(and(
                        eq(reviewTasks.taskType, 'campaign_launch'),
                        eq(reviewTasks.entityId, opts.campaignId),
                        eq(reviewTasks.status, 'pending'),
                    ))
                    .orderBy(desc(reviewTasks.createdAt))
                    .limit(1);

                let reviewTaskId = pendingReviewTask?.id ?? null;
                let reviewTaskSource: 'created' | 'existing' = 'existing';
                let reviewDueAt: string | null = null;
                let reviewEscalateAt: string | null = null;

                if (pendingReviewTask?.createdAt) {
                    const createdAt = new Date(pendingReviewTask.createdAt);
                    if (Number.isFinite(createdAt.getTime()) && Number.isFinite(pendingReviewTask.slaHours)) {
                        reviewDueAt = new Date(createdAt.getTime() + Number(pendingReviewTask.slaHours) * 60 * 60 * 1000).toISOString();
                    }
                    if (Number.isFinite(createdAt.getTime()) && Number.isFinite(pendingReviewTask.escalateAfterHours)) {
                        reviewEscalateAt = new Date(createdAt.getTime() + Number(pendingReviewTask.escalateAfterHours) * 60 * 60 * 1000).toISOString();
                    }
                }

                if (!reviewTaskId) {
                    const [createdReviewTask] = await db.insert(reviewTasks).values({
                        taskType: 'campaign_launch',
                        entityId: opts.campaignId,
                        domainResearchId: opts.domainResearchId,
                        checklistJson: {
                            campaignId: opts.campaignId,
                            channels: opts.channels,
                            requestedBy: input.createdBy,
                            source: 'roi_campaign_autoplan',
                        },
                        status: 'pending',
                        reviewNotes: 'Awaiting reviewer approval before campaign launch',
                        createdBy: input.createdBy,
                    }).returning({
                        id: reviewTasks.id,
                        createdAt: reviewTasks.createdAt,
                        slaHours: reviewTasks.slaHours,
                        escalateAfterHours: reviewTasks.escalateAfterHours,
                    });
                    reviewTaskId = createdReviewTask?.id ?? null;
                    reviewTaskSource = 'created';
                    if (createdReviewTask?.createdAt) {
                        const createdAt = new Date(createdReviewTask.createdAt);
                        if (Number.isFinite(createdAt.getTime()) && Number.isFinite(createdReviewTask.slaHours)) {
                            reviewDueAt = new Date(createdAt.getTime() + Number(createdReviewTask.slaHours) * 60 * 60 * 1000).toISOString();
                        }
                        if (Number.isFinite(createdAt.getTime()) && Number.isFinite(createdReviewTask.escalateAfterHours)) {
                            reviewEscalateAt = new Date(createdAt.getTime() + Number(createdReviewTask.escalateAfterHours) * 60 * 60 * 1000).toISOString();
                        }
                    }
                }

                if (reviewTaskSource === 'created') {
                    launchReviewTasksCreatedCount += 1;
                } else {
                    launchReviewTasksLinkedCount += 1;
                }

                launchBlocked.push({
                    campaignId: opts.campaignId,
                    domain: opts.domain,
                    reasonCode: 'approval_required',
                    reason: 'Campaign launch blocked: campaign_launch review task is not approved.',
                    reviewTaskId,
                    reviewTaskSource,
                    reviewDueAt,
                    reviewEscalateAt,
                });
                return;
            }
        }

        const promotionJobPayload = {
            launchedBy: input.createdBy,
            force,
            metadata,
            requestedAt: new Date().toISOString(),
        };

        const launch = await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${opts.campaignId}))`);

            const existingQueueRows = await tx.select({
                id: contentQueue.id,
            })
                .from(contentQueue)
                .where(and(
                    eq(contentQueue.jobType, 'create_promotion_plan'),
                    inArray(contentQueue.status, ['pending', 'processing']),
                    sql`${contentQueue.payload} ->> 'campaignId' = ${opts.campaignId}`,
                ))
                .limit(1);

            if (existingQueueRows.length > 0) {
                return {
                    deduped: true as const,
                    jobId: existingQueueRows[0].id,
                    promotionJobId: null as string | null,
                };
            }

            const [promotionJob] = await tx.insert(promotionJobs).values({
                campaignId: opts.campaignId,
                jobType: 'create_promotion_plan',
                status: 'pending',
                payload: promotionJobPayload,
            }).returning({
                id: promotionJobs.id,
            });

            if (!promotionJob?.id) {
                throw new Error(`Failed to create launch promotion job for ${opts.campaignId}`);
            }

            const queuePayload = {
                campaignId: opts.campaignId,
                promotionJobId: promotionJob.id,
                launchedBy: input.createdBy,
                force,
                metadata,
            };

            const queueJobId = await enqueueContentJob({
                jobType: 'create_promotion_plan',
                status: 'pending',
                priority: clampInteger(input.launchPriority, 0, 100, 3),
                payload: queuePayload,
            }, tx);

            await tx.update(promotionJobs).set({
                payload: {
                    ...promotionJobPayload,
                    contentQueueJobId: queueJobId,
                },
            }).where(eq(promotionJobs.id, promotionJob.id));

            return {
                deduped: false as const,
                jobId: queueJobId,
                promotionJobId: promotionJob.id,
            };
        });

        launchQueued.push({
            campaignId: opts.campaignId,
            domain: opts.domain,
            jobId: launch.jobId,
            deduped: launch.deduped,
            promotionJobId: launch.promotionJobId,
        });
    }

    for (const plan of plansToApply) {
        if (!plan.domainResearchId) {
            skipped.push({
                domain: plan.domain,
                domainResearchId: null,
                reasonCode: 'missing_domain_research',
                reason: 'No domain_research record found for this domain.',
            });
            continue;
        }
        const domainResearchId = plan.domainResearchId;

        await db.transaction(async (tx) => {
            const [existingCampaign] = await tx.select({
                id: promotionCampaigns.id,
                status: promotionCampaigns.status,
            })
                .from(promotionCampaigns)
                .where(and(
                    eq(promotionCampaigns.domainResearchId, domainResearchId),
                    inArray(promotionCampaigns.status, ['draft', 'active', 'paused']),
                ))
                .orderBy(desc(promotionCampaigns.createdAt))
                .limit(1);

            if (existingCampaign) {
                skipped.push({
                    domain: plan.domain,
                    domainResearchId,
                    reasonCode: 'existing_open_campaign',
                    reason: `Open campaign already exists (${existingCampaign.status}).`,
                });
                return;
            }

            const now = new Date();
            const [campaign] = await tx.insert(promotionCampaigns).values({
                domainResearchId,
                channels: plan.recommendedChannels,
                budget: plan.recommendedBudget,
                dailyCap: plan.recommendedDailyCap,
                status: 'draft',
                metrics: {
                    autoPlannedFromRoi: true,
                    action: plan.action,
                    score: plan.score,
                    net30d: plan.net30d,
                    roiPct: plan.roiPct,
                    reason: input.reason ?? null,
                    createdBy: input.createdBy,
                    createdAt: now.toISOString(),
                },
                createdAt: now,
                updatedAt: now,
            }).returning({
                id: promotionCampaigns.id,
            });

            if (!campaign?.id) {
                skipped.push({
                    domain: plan.domain,
                    domainResearchId,
                    reasonCode: 'campaign_insert_failed',
                    reason: 'Failed to create campaign draft.',
                });
                return;
            }

            await tx.insert(promotionEvents).values({
                campaignId: campaign.id,
                eventType: 'roi_auto_plan_created',
                attributes: {
                    createdBy: input.createdBy,
                    action: plan.action,
                    score: plan.score,
                    reason: input.reason ?? null,
                },
                occurredAt: now,
            });

            created.push({
                campaignId: campaign.id,
                domain: plan.domain,
                domainResearchId,
                action: plan.action,
                channels: plan.recommendedChannels,
                budget: plan.recommendedBudget,
                dailyCap: plan.recommendedDailyCap,
            });
        });
    }

    let launchFreezeState: Awaited<ReturnType<typeof evaluateGrowthLaunchFreeze>> | null = null;
    let launchFreezeIncidentSent = false;
    let launchFreezeBlockedCount = 0;
    if (input.autoLaunch) {
        launchFreezeState = await evaluateGrowthLaunchFreeze();

        for (const campaign of created) {
            const freezeBlocked = launchFreezeState
                ? shouldBlockGrowthLaunchForScope({
                    state: launchFreezeState,
                    scope: {
                        channels: campaign.channels,
                        action: campaign.action,
                    },
                })
                : false;
            if (freezeBlocked) {
                if (!launchFreezeIncidentSent && launchFreezeState) {
                    await emitGrowthLaunchFreezeIncident({
                        state: launchFreezeState,
                        actorUserId: input.createdBy,
                        context: 'roi_campaign_autoplan',
                        campaignId: campaign.campaignId,
                    });
                    launchFreezeIncidentSent = true;
                }
                launchFreezeBlockedCount += 1;
                launchBlocked.push({
                    campaignId: campaign.campaignId,
                    domain: campaign.domain,
                    reasonCode: 'slo_launch_freeze',
                    reason: 'Auto-launch blocked: growth launch-freeze is active due to SLO error-budget burn.',
                });
                continue;
            }

            if (!allowedAutoLaunchActions.includes(campaign.action)) {
                launchBlocked.push({
                    campaignId: campaign.campaignId,
                    domain: campaign.domain,
                    reasonCode: 'auto_launch_policy_block',
                    reason: `Auto-launch policy does not allow action "${campaign.action}".`,
                });
                continue;
            }

            await queueCampaignLaunchForCampaign({
                campaignId: campaign.campaignId,
                domain: campaign.domain,
                domainResearchId: campaign.domainResearchId,
                channels: campaign.channels,
            });
        }
    }

    return {
        attemptedCount: plansToApply.length,
        createdCount: created.length,
        skippedCount: skipped.length,
        launchQueuedCount: launchQueued.length,
        launchBlockedCount: launchBlocked.length,
        launchReviewTasksCreatedCount,
        launchReviewTasksLinkedCount,
        ...(input.autoLaunch ? {
            launchFreezeBlockedCount,
            launchFreezeActive: launchFreezeState?.active ?? false,
            launchFreezeLevel: launchFreezeState?.level ?? 'healthy',
            launchFreezeReasonCodes: launchFreezeState?.reasonCodes ?? [],
        } : {}),
        created,
        skipped,
        launchQueued,
        launchBlocked,
    };
}
