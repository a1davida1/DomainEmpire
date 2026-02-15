import { and, eq, inArray, sql } from 'drizzle-orm';
import {
    db,
    acquisitionEvents,
    contentQueue,
    domainResearch,
    promotionCampaigns,
    promotionJobs,
    reviewTasks,
} from '@/lib/db';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';
import { evaluateGrowthLaunchFreeze, shouldBlockGrowthLaunchForScope } from '@/lib/growth/launch-freeze';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { NotFoundError, ConflictError, ForbiddenError, ChecklistValidationError } from '@/lib/review/errors';

export type ReviewTaskDecisionStatus = 'approved' | 'rejected' | 'cancelled';

export type ReviewTaskDecisionInput = {
    taskId: string;
    status: ReviewTaskDecisionStatus;
    reviewNotes: string;
    checklistPatch?: Record<string, unknown>;
    clearHardFail?: boolean;
    actor: {
        id: string;
        role: string;
    };
};

export type ReviewTaskDecisionResult = {
    taskId: string;
    status: ReviewTaskDecisionStatus;
    bidPlanQueued: boolean;
    campaignLaunchQueued: boolean;
};

export const REQUIRED_DOMAIN_BUY_CHECKLIST_KEYS = [
    'underwritingReviewed',
    'tmCheckPassed',
    'budgetCheckPassed',
] as const;

async function queueBidPlanIfMissing(domainResearchId: string, domain: string, createdBy: string): Promise<boolean> {
    let queued = false;
    await db.transaction(async (tx) => {
        // Advisory lock prevents TOCTOU race where concurrent callers both
        // see no existing job and enqueue duplicates.
        await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`bid_plan:${domainResearchId}`}))`,
        );

        const existing = await tx
            .select({ id: contentQueue.id })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.jobType, 'create_bid_plan'),
                inArray(contentQueue.status, ['pending', 'processing']),
                sql`${contentQueue.payload} ->> 'domainResearchId' = ${domainResearchId}`,
            ))
            .limit(1);

        if (existing.length > 0) {
            return;
        }

        await enqueueContentJob({
            jobType: 'create_bid_plan',
            payload: {
                domainResearchId,
                domain,
                createdBy,
                reviewTaskDecision: true,
            },
            status: 'pending',
            priority: 4,
        }, tx);
        queued = true;
    });
    return queued;
}

async function queueCampaignLaunchIfMissing(campaignId: string, createdBy: string, reviewTaskId: string): Promise<boolean> {
    let queued = false;
    await db.transaction(async (tx) => {
        await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`campaign_launch:${campaignId}`}))`,
        );

        const [campaign] = await tx.select({
            id: promotionCampaigns.id,
            status: promotionCampaigns.status,
        })
            .from(promotionCampaigns)
            .where(eq(promotionCampaigns.id, campaignId))
            .limit(1);

        if (!campaign) {
            throw new NotFoundError(`Campaign not found for campaign_launch review task: ${campaignId}`);
        }
        if (campaign.status === 'cancelled' || campaign.status === 'completed') {
            return;
        }

        const existing = await tx
            .select({ id: contentQueue.id })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.jobType, 'create_promotion_plan'),
                inArray(contentQueue.status, ['pending', 'processing']),
                sql`${contentQueue.payload} ->> 'campaignId' = ${campaignId}`,
            ))
            .limit(1);

        if (existing.length > 0) {
            return;
        }

        const now = new Date();
        const promotionJobPayload = {
            launchedBy: createdBy,
            force: false,
            metadata: {
                source: 'review_task_approval',
                reviewTaskId,
            },
            requestedAt: now.toISOString(),
        } as Record<string, unknown>;

        const [promotionJob] = await tx.insert(promotionJobs).values({
            campaignId,
            jobType: 'create_promotion_plan',
            status: 'pending',
            payload: promotionJobPayload,
        }).returning({
            id: promotionJobs.id,
        });

        if (!promotionJob?.id) {
            throw new Error(`Failed to create promotion job for campaign_launch task ${reviewTaskId}`);
        }

        const queueJobId = await enqueueContentJob({
            jobType: 'create_promotion_plan',
            status: 'pending',
            priority: 3,
            payload: {
                campaignId,
                promotionJobId: promotionJob.id,
                launchedBy: createdBy,
                force: false,
                metadata: {
                    source: 'review_task_approval',
                    reviewTaskId,
                },
            },
        }, tx);

        await tx.update(promotionJobs).set({
            payload: {
                ...promotionJobPayload,
                contentQueueJobId: queueJobId,
            },
        }).where(eq(promotionJobs.id, promotionJob.id));

        queued = true;
    });

    return queued;
}

function isChecklistApproved(checklist: Record<string, unknown>): boolean {
    return REQUIRED_DOMAIN_BUY_CHECKLIST_KEYS.every((key) => checklist[key] === true);
}

export async function decideReviewTask(input: ReviewTaskDecisionInput): Promise<ReviewTaskDecisionResult> {
    let bidPlanQueued = false;
    let bidPlanQueueResearchId: string | null = null;
    let bidPlanQueueDomain: string | null = null;
    let campaignLaunchQueued = false;
    let campaignLaunchQueueCampaignId: string | null = null;
    let resolvedTaskId: string = '';

    await db.transaction(async (tx) => {
        // Lock the row to prevent concurrent decision races (TOCTOU)
        const [task] = await tx
            .select()
            .from(reviewTasks)
            .where(eq(reviewTasks.id, input.taskId))
            .limit(1)
            .for('update');

        if (!task) {
            throw new NotFoundError('Review task not found');
        }

        resolvedTaskId = task.id;

        if (task.status !== 'pending' && input.actor.role !== 'admin') {
            throw new ConflictError(`Task already finalized as ${task.status}. Admin role required to override.`);
        }

        const mergedChecklist = {
            ...(task.checklistJson as Record<string, unknown> | null ?? {}),
            ...(input.checklistPatch ?? {}),
        };

        if (task.taskType === 'domain_buy' && input.status === 'approved' && !isChecklistApproved(mergedChecklist)) {
            throw new ChecklistValidationError('Cannot approve domain_buy task: checklist requirements not satisfied');
        }

        await tx.update(reviewTasks).set({
            status: input.status,
            reviewNotes: input.reviewNotes,
            checklistJson: mergedChecklist,
            reviewerId: input.actor.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(reviewTasks.id, task.id));

        if (task.taskType === 'domain_buy' && task.domainResearchId) {
            const [research] = await tx
                .select({
                    id: domainResearch.id,
                    domain: domainResearch.domain,
                    domainId: domainResearch.domainId,
                    hardFailReason: domainResearch.hardFailReason,
                })
                .from(domainResearch)
                .where(eq(domainResearch.id, task.domainResearchId))
                .limit(1);

            if (!research) {
                throw new Error(`Missing domainResearch for task.domainResearchId: ${task.domainResearchId}`);
            }

            const clearHardFail = input.clearHardFail === true;
            if (clearHardFail && input.actor.role !== 'admin') {
                throw new ForbiddenError('Only admins can clear hard-fail flags');
            }

            if (input.status === 'approved') {
                if (research.hardFailReason && !clearHardFail) {
                    throw new ForbiddenError('Cannot approve domain_buy while hard-fail is active');
                }

                await tx.update(domainResearch).set({
                    decision: 'buy',
                    decisionReason: input.reviewNotes,
                    hardFailReason: clearHardFail ? null : research.hardFailReason,
                }).where(eq(domainResearch.id, research.id));

                const lifecycleDomainId = task.domainId ?? research.domainId ?? null;
                if (lifecycleDomainId) {
                    await advanceDomainLifecycleForAcquisition({
                        domainId: lifecycleDomainId,
                        targetState: 'approved',
                        actorId: input.actor.id,
                        actorRole: input.actor.role,
                        reason: input.reviewNotes,
                        metadata: {
                            source: 'review_task_decision',
                            reviewTaskId: task.id,
                            domainResearchId: research.id,
                        },
                    }, tx);
                }

                await tx.insert(acquisitionEvents).values({
                    domainResearchId: research.id,
                    eventType: 'approved',
                    createdBy: input.actor.id,
                    payload: {
                        source: 'review_task',
                        reviewTaskId: task.id,
                        decision: 'buy',
                        reviewNotes: input.reviewNotes,
                        clearHardFail,
                    },
                });

                bidPlanQueueResearchId = research.id;
                bidPlanQueueDomain = research.domain;
            } else if (input.status === 'rejected') {
                await tx.update(domainResearch).set({
                    decision: 'pass',
                    decisionReason: input.reviewNotes,
                }).where(eq(domainResearch.id, research.id));

                await tx.insert(acquisitionEvents).values({
                    domainResearchId: research.id,
                    eventType: 'passed',
                    createdBy: input.actor.id,
                    payload: {
                        source: 'review_task',
                        reviewTaskId: task.id,
                        decision: 'pass',
                        reviewNotes: input.reviewNotes,
                    },
                });
            } else if (input.status === 'cancelled') {
                await tx.insert(acquisitionEvents).values({
                    domainResearchId: research.id,
                    eventType: 'cancelled',
                    createdBy: input.actor.id,
                    payload: {
                        source: 'review_task',
                        reviewTaskId: task.id,
                        decision: 'cancelled',
                        reviewNotes: input.reviewNotes,
                    },
                });
            }
        }

        if (task.taskType === 'campaign_launch' && input.status === 'approved' && task.entityId) {
            campaignLaunchQueueCampaignId = task.entityId;
        }
    });

    if (bidPlanQueueResearchId && bidPlanQueueDomain) {
        bidPlanQueued = await queueBidPlanIfMissing(
            bidPlanQueueResearchId,
            bidPlanQueueDomain,
            input.actor.id,
        );
    }
    if (campaignLaunchQueueCampaignId) {
        const launchFreeze = await evaluateGrowthLaunchFreeze();
        if (shouldBlockGrowthLaunchForScope({ state: launchFreeze })) {
            console.warn('Campaign launch queue skipped due to active launch-freeze', {
                campaignId: campaignLaunchQueueCampaignId,
                reviewTaskId: resolvedTaskId || input.taskId,
                freezeLevel: launchFreeze.level,
                reasonCodes: launchFreeze.reasonCodes,
            });
        } else {
            campaignLaunchQueued = await queueCampaignLaunchIfMissing(
                campaignLaunchQueueCampaignId,
                input.actor.id,
                resolvedTaskId || input.taskId,
            );
        }
    }

    return {
        taskId: resolvedTaskId || input.taskId,
        status: input.status,
        bidPlanQueued,
        campaignLaunchQueued,
    };
}
