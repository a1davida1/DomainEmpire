import { and, eq } from 'drizzle-orm';
import { db, reviewTasks, users } from '@/lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/review/errors';

type Actor = {
    id: string;
    role: string;
};

type AssignMode = 'claim' | 'release' | 'set';

export type AssignReviewTaskInput = {
    taskId: string;
    mode: AssignMode;
    reviewerId?: string | null;
    reason?: string;
    actor: Actor;
};

export type AssignReviewTaskResult = {
    taskId: string;
    taskType: 'domain_buy' | 'content_publish' | 'campaign_launch';
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    previousReviewerId: string | null;
    reviewerId: string | null;
    changed: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return { ...value };
}

function toNullableTrimmedString(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function mergeAssignmentMetadata(input: {
    checklistJson: Record<string, unknown> | null;
    actor: Actor;
    mode: AssignMode;
    reason: string | null;
    previousReviewerId: string | null;
    reviewerId: string | null;
    timestamp: string;
}): Record<string, unknown> {
    const checklist = asRecord(input.checklistJson);
    const system = asRecord(checklist._system);

    const rawHistory = Array.isArray(system.assignmentHistory)
        ? system.assignmentHistory.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        : [];

    const assignmentEvent = {
        at: input.timestamp,
        actorId: input.actor.id,
        actorRole: input.actor.role,
        mode: input.mode,
        reason: input.reason,
        previousReviewerId: input.previousReviewerId,
        reviewerId: input.reviewerId,
    };

    const assignmentHistory = [...rawHistory.slice(-49), assignmentEvent];

    return {
        ...checklist,
        _system: {
            ...system,
            lastAssignment: assignmentEvent,
            assignmentHistory,
        },
    };
}

export async function assignReviewTask(input: AssignReviewTaskInput): Promise<AssignReviewTaskResult> {
    const isAdmin = input.actor.role === 'admin';
    const reason = toNullableTrimmedString(input.reason);

    return db.transaction(async (tx) => {
        const [task] = await tx.select({
            id: reviewTasks.id,
            taskType: reviewTasks.taskType,
            status: reviewTasks.status,
            reviewerId: reviewTasks.reviewerId,
            checklistJson: reviewTasks.checklistJson,
        })
            .from(reviewTasks)
            .where(eq(reviewTasks.id, input.taskId))
            .limit(1)
            .for('update');

        if (!task) {
            throw new NotFoundError('Review task not found');
        }
        if (task.status !== 'pending') {
            throw new ConflictError(`Task is already ${task.status}`);
        }

        const previousReviewerId = task.reviewerId ?? null;
        let nextReviewerId: string | null = previousReviewerId;

        if (input.mode === 'claim') {
            if (!isAdmin && previousReviewerId && previousReviewerId !== input.actor.id) {
                throw new ForbiddenError('Task is already assigned to another reviewer');
            }
            nextReviewerId = input.actor.id;
        } else if (input.mode === 'release') {
            if (!isAdmin && previousReviewerId !== input.actor.id) {
                throw new ForbiddenError('Only the assigned reviewer can release this task');
            }
            nextReviewerId = null;
        } else {
            const targetReviewerId = toNullableTrimmedString(input.reviewerId ?? null);
            if (!isAdmin && targetReviewerId !== input.actor.id) {
                throw new ForbiddenError('Only admins can assign tasks to other reviewers');
            }
            if (!isAdmin && previousReviewerId && previousReviewerId !== input.actor.id) {
                throw new ForbiddenError('Task is already assigned to another reviewer');
            }
            nextReviewerId = targetReviewerId;
        }

        if (nextReviewerId) {
            const [reviewer] = await tx.select({
                id: users.id,
                role: users.role,
                isActive: users.isActive,
            })
                .from(users)
                .where(eq(users.id, nextReviewerId))
                .limit(1);

            if (!reviewer || reviewer.isActive === false) {
                throw new NotFoundError('Reviewer not found or inactive');
            }
            if (!inArrayLiteral(reviewer.role, ['reviewer', 'expert', 'admin'])) {
                throw new ForbiddenError('Assigned user must be reviewer/expert/admin');
            }
        }

        const changed = previousReviewerId !== nextReviewerId;
        if (!changed) {
            return {
                taskId: task.id,
                taskType: task.taskType,
                status: task.status,
                previousReviewerId,
                reviewerId: nextReviewerId,
                changed: false,
            };
        }

        const now = new Date();
        const nextChecklistJson = mergeAssignmentMetadata({
            checklistJson: (task.checklistJson as Record<string, unknown> | null) ?? null,
            actor: input.actor,
            mode: input.mode,
            reason,
            previousReviewerId,
            reviewerId: nextReviewerId,
            timestamp: now.toISOString(),
        });

        const [updatedTask] = await tx.update(reviewTasks).set({
            reviewerId: nextReviewerId,
            checklistJson: nextChecklistJson,
            updatedAt: now,
        }).where(and(
            eq(reviewTasks.id, task.id),
            eq(reviewTasks.status, 'pending'),
        )).returning({
            id: reviewTasks.id,
            taskType: reviewTasks.taskType,
            status: reviewTasks.status,
            reviewerId: reviewTasks.reviewerId,
        });

        if (!updatedTask) {
            throw new ConflictError('Task assignment changed concurrently');
        }

        return {
            taskId: updatedTask.id,
            taskType: updatedTask.taskType,
            status: updatedTask.status,
            previousReviewerId,
            reviewerId: updatedTask.reviewerId ?? null,
            changed: true,
        };
    });
}

function inArrayLiteral(value: string | null, expected: string[]): boolean {
    if (!value) return false;
    return expected.includes(value);
}
