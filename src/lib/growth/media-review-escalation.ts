import { and, asc, eq } from 'drizzle-orm';
import { db, mediaModerationTasks } from '@/lib/db';
import { appendMediaModerationEvent } from '@/lib/growth/media-review-audit';

type TaskRow = typeof mediaModerationTasks.$inferSelect;

type EscalationAction = 'escalated' | 'ops_notified' | 'skipped';

export type MediaReviewEscalationResultItem = {
    taskId: string;
    action: EscalationAction;
    reason: string;
    previousReviewerId: string | null;
    nextReviewerId: string | null;
};

export type MediaReviewEscalationSweepResult = {
    dryRun: boolean;
    scanned: number;
    eligible: number;
    escalated: number;
    opsNotified: number;
    skipped: number;
    results: MediaReviewEscalationResultItem[];
};

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

function normalizeReviewerList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function uniqueReviewers(reviewers: Array<string | null | undefined>): string[] {
    const out: string[] = [];
    for (const reviewer of reviewers) {
        if (!reviewer) continue;
        if (out.includes(reviewer)) continue;
        out.push(reviewer);
    }
    return out;
}

function resolveEscalateAt(task: TaskRow, now: Date): Date {
    if (!task.createdAt) {
        console.warn(`resolveEscalateAt: task ${task.id} has null createdAt; using updatedAt or now fallback`);
        const fallback = task.updatedAt ?? now;
        return new Date(fallback.getTime() + task.escalateAfterHours * 60 * 60 * 1000);
    }
    return new Date(task.createdAt.getTime() + task.escalateAfterHours * 60 * 60 * 1000);
}

function selectNextReviewer(task: TaskRow): {
    reviewerSequence: string[];
    nextReviewerId: string | null;
    nextCursor: number;
    currentCursor: number;
    metadata: Record<string, unknown>;
    notifyOpsAfterHours: number | null;
    teamLeadId: string | null;
} {
    const metadata = asMetadata(task.metadata);
    const chain = normalizeReviewerList(metadata.escalationChain);
    const teamLeadId = typeof metadata.teamLeadId === 'string' && metadata.teamLeadId.trim().length > 0
        ? metadata.teamLeadId.trim()
        : null;
    const notifyOpsAfterHoursRaw = Number(metadata.notifyOpsAfterHours);
    const notifyOpsAfterHours = Number.isFinite(notifyOpsAfterHoursRaw) && notifyOpsAfterHoursRaw > 0
        ? Math.floor(notifyOpsAfterHoursRaw)
        : null;

    const reviewerSequence = uniqueReviewers([
        task.backupReviewerId,
        ...chain,
        teamLeadId,
    ]);
    const currentCursorRaw = Number(metadata.escalationCursor);
    const currentCursor = Number.isFinite(currentCursorRaw) ? Math.floor(currentCursorRaw) : -1;
    const startIndex = Math.max(0, currentCursor + 1);

    let nextReviewerId: string | null = null;
    let nextCursor = currentCursor;
    for (let index = startIndex; index < reviewerSequence.length; index += 1) {
        const reviewerId = reviewerSequence[index];
        if (reviewerId === task.reviewerId) {
            continue;
        }
        nextReviewerId = reviewerId;
        nextCursor = index;
        break;
    }

    return {
        reviewerSequence,
        nextReviewerId,
        nextCursor,
        currentCursor,
        metadata,
        notifyOpsAfterHours,
        teamLeadId,
    };
}

export async function runMediaReviewEscalationSweep(input: {
    userId: string;
    actorId: string | null;
    dryRun?: boolean;
    limit?: number;
    now?: Date;
}): Promise<MediaReviewEscalationSweepResult> {
    const dryRun = input.dryRun ?? false;
    const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(input.limit ?? 100, 500)) : 100;
    const now = input.now ?? new Date();

    const pendingTasks = await db.select().from(mediaModerationTasks)
        .where(and(
            eq(mediaModerationTasks.userId, input.userId),
            eq(mediaModerationTasks.status, 'pending'),
        ))
        .orderBy(asc(mediaModerationTasks.createdAt))
        .limit(limit);

    const results: MediaReviewEscalationResultItem[] = [];
    let eligible = 0;
    let escalated = 0;
    let opsNotified = 0;
    let skipped = 0;

    for (const task of pendingTasks) {
        const escalateAt = resolveEscalateAt(task, now);
        if (now.getTime() < escalateAt.getTime()) {
            skipped += 1;
            results.push({
                taskId: task.id,
                action: 'skipped',
                reason: 'not_yet_eligible',
                previousReviewerId: task.reviewerId ?? null,
                nextReviewerId: null,
            });
            continue;
        }
        eligible += 1;

        const {
            reviewerSequence,
            nextReviewerId,
            nextCursor,
            metadata,
            notifyOpsAfterHours,
        } = selectNextReviewer(task);

        if (!nextReviewerId) {
            const createdAt = task.createdAt ?? now;
            const notifyOpsAt = notifyOpsAfterHours
                ? new Date(createdAt.getTime() + notifyOpsAfterHours * 60 * 60 * 1000)
                : null;
            const canNotifyOps = notifyOpsAt !== null && now.getTime() >= notifyOpsAt.getTime();
            const alreadyNotified = typeof metadata.opsNotifiedAt === 'string' && metadata.opsNotifiedAt.length > 0;

            if (!canNotifyOps || alreadyNotified) {
                skipped += 1;
                results.push({
                    taskId: task.id,
                    action: 'skipped',
                    reason: canNotifyOps ? 'ops_already_notified' : 'no_remaining_reviewer',
                    previousReviewerId: task.reviewerId ?? null,
                    nextReviewerId: null,
                });
                continue;
            }

            if (!dryRun) {
                const nextMetadata = {
                    ...metadata,
                    escalationState: 'ops_notified',
                    opsNotifiedAt: now.toISOString(),
                    escalationUpdatedAt: now.toISOString(),
                };
                await db.transaction(async (tx) => {
                    const [updatedRow] = await tx.update(mediaModerationTasks)
                        .set({
                            metadata: nextMetadata,
                            updatedAt: now,
                        })
                        .where(and(
                            eq(mediaModerationTasks.id, task.id),
                            eq(mediaModerationTasks.userId, input.userId),
                            eq(mediaModerationTasks.status, 'pending'),
                        ))
                        .returning();

                    if (!updatedRow) {
                        return;
                    }

                    await appendMediaModerationEvent(tx, {
                        userId: input.userId,
                        taskId: task.id,
                        assetId: task.assetId,
                        actorId: input.actorId,
                        eventType: 'escalated',
                        payload: {
                            action: 'ops_notified',
                            reason: 'no_remaining_reviewer',
                            reviewerSequence,
                        },
                    });
                });
            }

            opsNotified += 1;
            results.push({
                taskId: task.id,
                action: 'ops_notified',
                reason: 'no_remaining_reviewer',
                previousReviewerId: task.reviewerId ?? null,
                nextReviewerId: null,
            });
            continue;
        }

        if (!dryRun) {
            const nextMetadata = {
                ...metadata,
                escalationState: 'escalated',
                escalationCursor: nextCursor,
                escalationUpdatedAt: now.toISOString(),
                escalatedCount: Math.max(0, Number(metadata.escalatedCount) || 0) + 1,
                lastEscalatedAt: now.toISOString(),
            };

            await db.transaction(async (tx) => {
                const [updatedRow] = await tx.update(mediaModerationTasks)
                    .set({
                        reviewerId: nextReviewerId,
                        metadata: nextMetadata,
                        updatedAt: now,
                    })
                    .where(and(
                        eq(mediaModerationTasks.id, task.id),
                        eq(mediaModerationTasks.userId, input.userId),
                        eq(mediaModerationTasks.status, 'pending'),
                    ))
                    .returning();

                if (!updatedRow) {
                    return;
                }

                await appendMediaModerationEvent(tx, {
                    userId: input.userId,
                    taskId: task.id,
                    assetId: task.assetId,
                    actorId: input.actorId,
                    eventType: 'escalated',
                    payload: {
                        previousReviewerId: task.reviewerId ?? null,
                        nextReviewerId,
                        escalationCursor: nextCursor,
                        reviewerSequence,
                    },
                });
            });
        }

        escalated += 1;
        results.push({
            taskId: task.id,
            action: 'escalated',
            reason: 'reviewer_reassigned',
            previousReviewerId: task.reviewerId ?? null,
            nextReviewerId,
        });
    }

    return {
        dryRun,
        scanned: pendingTasks.length,
        eligible,
        escalated,
        opsNotified,
        skipped,
        results,
    };
}
