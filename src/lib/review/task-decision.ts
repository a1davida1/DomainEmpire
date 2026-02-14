import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, acquisitionEvents, contentQueue, domainResearch, reviewTasks } from '@/lib/db';
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

function isChecklistApproved(checklist: Record<string, unknown>): boolean {
    return REQUIRED_DOMAIN_BUY_CHECKLIST_KEYS.every((key) => checklist[key] === true);
}

export async function decideReviewTask(input: ReviewTaskDecisionInput): Promise<ReviewTaskDecisionResult> {
    const [task] = await db
        .select()
        .from(reviewTasks)
        .where(eq(reviewTasks.id, input.taskId))
        .limit(1);

    if (!task) {
        throw new NotFoundError('Review task not found');
    }

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

    let bidPlanQueued = false;
    let bidPlanQueueResearchId: string | null = null;
    let bidPlanQueueDomain: string | null = null;

    await db.transaction(async (tx) => {
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
            }
        }
    });

    if (bidPlanQueueResearchId && bidPlanQueueDomain) {
        bidPlanQueued = await queueBidPlanIfMissing(
            bidPlanQueueResearchId,
            bidPlanQueueDomain,
            input.actor.id,
        );
    }

    return {
        taskId: task.id,
        status: input.status,
        bidPlanQueued,
    };
}
