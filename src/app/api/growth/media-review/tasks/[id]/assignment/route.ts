import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, mediaModerationTasks, users } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { appendMediaModerationEvent } from '@/lib/growth/media-review-audit';
import { evaluateMediaReviewAssignmentPolicy } from '@/lib/growth/media-review-assignment-policy';
import { resolveFairnessPlaybookBindings } from '@/lib/growth/fairness-playbooks';
import { createNotification } from '@/lib/notifications';
import { sendOpsChannelAlert, shouldForwardFairnessWarningsToOps } from '@/lib/alerts/ops-channel';
import { createFairnessIncidentTickets } from '@/lib/alerts/fairness-incidents';

const assignmentSchema = z.object({
    claim: z.boolean().optional(),
    release: z.boolean().optional(),
    force: z.boolean().optional(),
    reviewerId: z.string().uuid().nullable().optional(),
    backupReviewerId: z.string().uuid().nullable().optional(),
    escalationChain: z.array(z.string().uuid()).max(12).nullable().optional(),
    teamLeadId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, ctx) => {
    const hasExplicitAssignmentField =
        value.reviewerId !== undefined
        || value.backupReviewerId !== undefined
        || value.escalationChain !== undefined
        || value.teamLeadId !== undefined;

    if (!value.claim && !value.release && !hasExplicitAssignmentField) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'No assignment fields provided',
        });
    }

    if (value.claim && value.release) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['claim'],
            message: 'claim and release cannot both be true',
        });
    }

    if (value.claim && value.reviewerId !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reviewerId'],
            message: 'reviewerId cannot be provided when claim is true',
        });
    }

    if (value.release && value.reviewerId !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reviewerId'],
            message: 'reviewerId cannot be provided when release is true',
        });
    }

    if (
        value.reviewerId
        && value.backupReviewerId
        && value.reviewerId === value.backupReviewerId
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['backupReviewerId'],
            message: 'backupReviewerId must differ from reviewerId',
        });
    }

    if (value.escalationChain && new Set(value.escalationChain).size !== value.escalationChain.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['escalationChain'],
            message: 'escalationChain must contain unique reviewer ids',
        });
    }

    if (value.force && !value.reason) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reason'],
            message: 'reason is required when force is true',
        });
    }
});

type UserRole = 'editor' | 'reviewer' | 'expert' | 'admin';
type FairnessIncidentTicket = Awaited<ReturnType<typeof createFairnessIncidentTickets>>[number];

const ROLE_LEVELS: Record<UserRole, number> = {
    editor: 1,
    reviewer: 2,
    expert: 3,
    admin: 4,
};

function hasMinimumRole(role: string | null | undefined, minimum: UserRole): boolean {
    const normalized = (role as UserRole) || 'editor';
    return (ROLE_LEVELS[normalized] || 0) >= ROLE_LEVELS[minimum];
}

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        if (!value) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

function toIdList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = assignmentSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const isAdminLike = user.role === 'admin' || user.role === 'expert';
        const taskWhere = isAdminLike
            ? eq(mediaModerationTasks.id, id)
            : and(
                eq(mediaModerationTasks.id, id),
                eq(mediaModerationTasks.reviewerId, user.id),
            );
        const [task] = await db.select().from(mediaModerationTasks)
            .where(taskWhere)
            .limit(1);

        if (!task) {
            return NextResponse.json({ error: 'Media moderation task not found' }, { status: 404 });
        }
        if (task.status !== 'pending') {
            return NextResponse.json(
                { error: `Task is ${task.status}; only pending tasks can be reassigned` },
                { status: 409 },
            );
        }

        const currentMetadata = asMetadata(task.metadata);

        const nextReviewerId = payload.claim
            ? user.id
            : payload.release
                ? null
                : (payload.reviewerId !== undefined ? payload.reviewerId : task.reviewerId);
        const nextBackupReviewerId = payload.backupReviewerId !== undefined
            ? payload.backupReviewerId
            : task.backupReviewerId;

        const nextMetadata: Record<string, unknown> = { ...currentMetadata };
        const currentEscalationChain = toIdList(currentMetadata.escalationChain);

        if (payload.escalationChain !== undefined) {
            nextMetadata.escalationChain = payload.escalationChain ?? [];
        }
        if (payload.teamLeadId !== undefined) {
            nextMetadata.teamLeadId = payload.teamLeadId ?? null;
        }

        const nextEscalationChain = payload.escalationChain !== undefined
            ? (payload.escalationChain ?? [])
            : currentEscalationChain;
        const nextTeamLeadId = payload.teamLeadId !== undefined
            ? payload.teamLeadId
            : (typeof nextMetadata.teamLeadId === 'string' ? nextMetadata.teamLeadId : null);

        if (nextReviewerId && nextBackupReviewerId && nextReviewerId === nextBackupReviewerId) {
            return NextResponse.json(
                { error: 'backupReviewerId must differ from reviewerId' },
                { status: 400 },
            );
        }

        if (!isAdminLike) {
            if (payload.force) {
                return NextResponse.json(
                    { error: 'Only expert/admin users can use force assignment override' },
                    { status: 403 },
                );
            }
            if (payload.backupReviewerId !== undefined || payload.escalationChain !== undefined || payload.teamLeadId !== undefined) {
                return NextResponse.json(
                    { error: 'Only expert/admin users can modify routing controls' },
                    { status: 403 },
                );
            }

            if (payload.claim && task.reviewerId && task.reviewerId !== user.id) {
                return NextResponse.json(
                    { error: 'Task already assigned to another reviewer' },
                    { status: 403 },
                );
            }

            if (nextReviewerId !== null && nextReviewerId !== user.id) {
                return NextResponse.json(
                    { error: 'Reviewers can only self-assign tasks' },
                    { status: 403 },
                );
            }

            if (payload.release && task.reviewerId && task.reviewerId !== user.id) {
                return NextResponse.json(
                    { error: 'Only the assigned reviewer can release this task' },
                    { status: 403 },
                );
            }
        }

        const roleValidationTargets = uniqueIds([
            payload.reviewerId !== undefined ? nextReviewerId : null,
            payload.backupReviewerId !== undefined ? nextBackupReviewerId : null,
            ...(payload.escalationChain !== undefined ? nextEscalationChain : []),
            payload.teamLeadId !== undefined ? nextTeamLeadId : null,
        ]);

        if (roleValidationTargets.length > 0) {
            const reviewerRows = await db.select({
                id: users.id,
                role: users.role,
            })
                .from(users)
                .where(inArray(users.id, roleValidationTargets))
                .limit(roleValidationTargets.length);

            const roleById = reviewerRows.reduce<Record<string, string>>((acc, row) => {
                acc[row.id] = row.role;
                return acc;
            }, {});

            const missing = roleValidationTargets.filter((reviewerId) => !roleById[reviewerId]);
            if (missing.length > 0) {
                return NextResponse.json(
                    { error: 'One or more reviewer IDs do not exist', missingReviewerIds: missing },
                    { status: 400 },
                );
            }

            if (payload.reviewerId !== undefined && nextReviewerId && !hasMinimumRole(roleById[nextReviewerId], 'reviewer')) {
                return NextResponse.json(
                    { error: 'reviewerId must reference a reviewer/expert/admin user' },
                    { status: 400 },
                );
            }
            if (payload.backupReviewerId !== undefined && nextBackupReviewerId && !hasMinimumRole(roleById[nextBackupReviewerId], 'reviewer')) {
                return NextResponse.json(
                    { error: 'backupReviewerId must reference a reviewer/expert/admin user' },
                    { status: 400 },
                );
            }
            if (payload.escalationChain !== undefined) {
                const invalidEscalationTarget = nextEscalationChain.find((reviewerId) => !hasMinimumRole(roleById[reviewerId], 'reviewer'));
                if (invalidEscalationTarget) {
                    return NextResponse.json(
                        {
                            error: 'escalationChain contains a non-reviewer user id',
                            reviewerId: invalidEscalationTarget,
                        },
                        { status: 400 },
                    );
                }
            }
            if (payload.teamLeadId !== undefined && nextTeamLeadId && !hasMinimumRole(roleById[nextTeamLeadId], 'expert')) {
                return NextResponse.json(
                    { error: 'teamLeadId must reference an expert/admin user' },
                    { status: 400 },
                );
            }
        }

        const now = new Date();
        const nowIso = now.toISOString();
        let policyEvaluation: Awaited<ReturnType<typeof evaluateMediaReviewAssignmentPolicy>> | null = null;
        let policyOverrideApplied = false;
        const forwardWarningsToOps = shouldForwardFairnessWarningsToOps();
        let policySignalCodes: string[] = [];
        let policyPlaybookBindings: ReturnType<typeof resolveFairnessPlaybookBindings> = [];
        let policyIncidentTickets: FairnessIncidentTicket[] = [];

        if (nextReviewerId && nextReviewerId !== task.reviewerId) {
            policyEvaluation = await evaluateMediaReviewAssignmentPolicy({
                userId: user.id,
                taskId: task.id,
                targetReviewerId: nextReviewerId,
                previousReviewerId: task.reviewerId ?? null,
                now,
            });

            if (policyEvaluation.violations.length > 0) {
                if (payload.force && isAdminLike) {
                    policyOverrideApplied = true;
                } else {
                    const violationCodes = policyEvaluation.violations.map((item) => item.code);
                    const blockedPlaybookBindings = resolveFairnessPlaybookBindings(violationCodes);
                    let blockedIncidentTickets: FairnessIncidentTicket[] = [];

                    try {
                        blockedIncidentTickets = await createFairnessIncidentTickets({
                            userId: user.id,
                            actorId: user.id,
                            taskId: task.id,
                            targetReviewerId: nextReviewerId,
                            signalCodes: violationCodes,
                            summaryPrefix: `Fairness policy blocked assignment for task ${task.id}`,
                            details: {
                                targetReviewerId: nextReviewerId,
                                violations: policyEvaluation.violations,
                                alerts: policyEvaluation.alerts,
                                snapshot: policyEvaluation.snapshot,
                                overrideApplied: false,
                            },
                        });
                    } catch (incidentError) {
                        console.error('Failed to create fairness policy incident ticket:', incidentError);
                    }

                    try {
                        await createNotification({
                            type: 'info',
                            severity: 'warning',
                            title: 'Moderation assignment blocked by fairness policy',
                            message: `Task ${task.id} assignment to ${nextReviewerId} blocked (${policyEvaluation.violations.map((item) => item.code).join(', ')})`,
                            userId: user.id,
                            actionUrl: blockedPlaybookBindings[0]?.runbookUrl,
                            metadata: {
                                taskId: task.id,
                                targetReviewerId: nextReviewerId,
                                signalCodes: violationCodes,
                                playbookBindings: blockedPlaybookBindings,
                                incidentTickets: blockedIncidentTickets,
                            },
                            sendEmail: false,
                        });
                    } catch (notificationError) {
                        console.error('Failed to create fairness policy notification:', notificationError);
                    }
                    try {
                        await sendOpsChannelAlert({
                            source: 'growth_media_review_assignment',
                            severity: 'warning',
                            title: 'Fairness policy blocked moderation assignment',
                            message: `Assignment blocked for task ${task.id} to reviewer ${nextReviewerId}`,
                            details: {
                                userId: user.id,
                                taskId: task.id,
                                actorId: user.id,
                                targetReviewerId: nextReviewerId,
                                violationCodes,
                                playbookBindings: blockedPlaybookBindings,
                                incidentTickets: blockedIncidentTickets,
                            },
                        });
                    } catch (opsAlertError) {
                        console.error('Failed to send ops channel alert for blocked assignment:', opsAlertError);
                    }
                    return NextResponse.json(
                        {
                            error: 'Assignment blocked by fairness policy',
                            violations: policyEvaluation.violations,
                            alerts: policyEvaluation.alerts,
                            snapshot: policyEvaluation.snapshot,
                            signalCodes: violationCodes,
                            playbookBindings: blockedPlaybookBindings,
                            incidentTickets: blockedIncidentTickets,
                        },
                        { status: 409 },
                    );
                }
            }

            policySignalCodes = [...new Set([
                ...policyEvaluation.violations.map((item) => item.code),
                ...(policyOverrideApplied ? ['override_applied'] : []),
                ...policyEvaluation.alerts.map((item) => item.code),
            ])];
            policyPlaybookBindings = resolveFairnessPlaybookBindings(policySignalCodes);
        }

        const assignmentChanged = task.reviewerId !== nextReviewerId || task.backupReviewerId !== nextBackupReviewerId;
        if (assignmentChanged) {
            nextMetadata.escalationState = 'assigned';
            nextMetadata.escalationCursor = -1;
            nextMetadata.escalationUpdatedAt = nowIso;
            nextMetadata.lastAssignmentAt = nowIso;
            nextMetadata.lastAssignmentBy = user.id;
            nextMetadata.opsNotifiedAt = null;
        }

        if (policyEvaluation) {
            nextMetadata.assignmentPolicy = {
                lastEvaluatedAt: nowIso,
                overrideApplied: policyOverrideApplied,
                violations: policyEvaluation.violations,
                alerts: policyEvaluation.alerts,
                snapshot: policyEvaluation.snapshot,
                signalCodes: policySignalCodes,
                playbookBindings: policyPlaybookBindings,
            };
        }

        if (payload.reason) {
            nextMetadata.assignmentReason = payload.reason;
        }

        const [updatedTask] = await db.transaction(async (tx) => {
            const [taskRow] = await tx.update(mediaModerationTasks)
                .set({
                    reviewerId: nextReviewerId,
                    backupReviewerId: nextBackupReviewerId,
                    metadata: nextMetadata,
                    updatedAt: now,
                })
                .where(and(
                    eq(mediaModerationTasks.id, id),
                    eq(mediaModerationTasks.userId, task.userId),
                    eq(mediaModerationTasks.status, 'pending'),
                ))
                .returning();

            if (!taskRow) {
                return [null];
            }

            await appendMediaModerationEvent(tx, {
                userId: user.id,
                taskId: taskRow.id,
                assetId: taskRow.assetId,
                actorId: user.id,
                eventType: 'assigned',
                payload: {
                    action: payload.claim
                        ? 'claim'
                        : payload.release
                            ? 'release'
                            : 'set',
                    previousReviewerId: task.reviewerId,
                    nextReviewerId,
                    previousBackupReviewerId: task.backupReviewerId,
                    nextBackupReviewerId,
                    escalationChain: nextEscalationChain,
                    teamLeadId: nextTeamLeadId,
                    reason: payload.reason ?? null,
                    policyOverrideApplied,
                    policyViolations: policyEvaluation?.violations ?? [],
                    policyAlerts: policyEvaluation?.alerts ?? [],
                    policySnapshot: policyEvaluation?.snapshot ?? null,
                    policySignalCodes,
                    playbookBindings: policyPlaybookBindings,
                },
            });

            return [taskRow];
        });

        if (!updatedTask) {
            return NextResponse.json(
                { error: 'Task assignment changed by another process; retry' },
                { status: 409 },
            );
        }

        if (policyEvaluation && (policyOverrideApplied || policyEvaluation.alerts.length > 0)) {
            const signalCodes = policySignalCodes.join(', ');

            try {
                policyIncidentTickets = await createFairnessIncidentTickets({
                    userId: user.id,
                    actorId: user.id,
                    taskId: updatedTask.id,
                    targetReviewerId: nextReviewerId,
                    signalCodes: policySignalCodes,
                    summaryPrefix: policyOverrideApplied
                        ? `Fairness override applied for assignment task ${updatedTask.id}`
                        : `Fairness policy signals detected for assignment task ${updatedTask.id}`,
                    details: {
                        targetReviewerId: nextReviewerId,
                        violations: policyEvaluation.violations,
                        alerts: policyEvaluation.alerts,
                        snapshot: policyEvaluation.snapshot,
                        overrideApplied: policyOverrideApplied,
                    },
                });
            } catch (incidentError) {
                console.error('Failed to create fairness assignment incident ticket:', incidentError);
            }

            try {
                await createNotification({
                    type: 'info',
                    severity: policyOverrideApplied ? 'warning' : 'info',
                    title: policyOverrideApplied
                        ? 'Moderation assignment fairness override applied'
                        : 'Moderation assignment policy alert',
                    message: `Task ${updatedTask.id} assignment signals: ${signalCodes}`,
                    userId: user.id,
                    actionUrl: policyPlaybookBindings[0]?.runbookUrl,
                    metadata: {
                        taskId: updatedTask.id,
                        signalCodes: policySignalCodes,
                        playbookBindings: policyPlaybookBindings,
                        overrideApplied: policyOverrideApplied,
                        incidentTickets: policyIncidentTickets,
                    },
                    sendEmail: policyOverrideApplied,
                });
            } catch (notificationError) {
                console.error('Failed to create assignment policy signal notification:', notificationError);
            }

            if (policyOverrideApplied || (forwardWarningsToOps && policyEvaluation.alerts.length > 0)) {
                try {
                    await sendOpsChannelAlert({
                        source: 'growth_media_review_assignment',
                        severity: policyOverrideApplied ? 'critical' : 'warning',
                        title: policyOverrideApplied
                            ? 'Fairness override applied in moderation assignment'
                            : 'Fairness warning in moderation assignment',
                        message: `Task ${updatedTask.id} assignment signals: ${signalCodes}`,
                        details: {
                            userId: user.id,
                            taskId: updatedTask.id,
                            actorId: user.id,
                            overrideApplied: policyOverrideApplied,
                            alertCodes: policyEvaluation.alerts.map((item) => item.code),
                            violationCodes: policyEvaluation.violations.map((item) => item.code),
                            signalCodes: policySignalCodes,
                            playbookBindings: policyPlaybookBindings,
                            incidentTickets: policyIncidentTickets,
                            snapshot: policyEvaluation.snapshot,
                        },
                    });
                } catch (opsAlertError) {
                    console.error('Failed to send ops channel alert for assignment policy signal:', opsAlertError);
                }
            }
        }

        return NextResponse.json({
            success: true,
            task: updatedTask,
            policy: policyEvaluation
                ? {
                    overrideApplied: policyOverrideApplied,
                    violations: policyEvaluation.violations,
                    alerts: policyEvaluation.alerts,
                    snapshot: policyEvaluation.snapshot,
                    signalCodes: policySignalCodes,
                    playbookBindings: policyPlaybookBindings,
                }
                : null,
            incidentTickets: policyIncidentTickets,
        });
    } catch (error) {
        console.error('Failed to update media moderation assignment:', error);
        return NextResponse.json(
            { error: 'Failed to update media moderation assignment' },
            { status: 500 },
        );
    }
}
