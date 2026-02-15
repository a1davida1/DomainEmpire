import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, mediaAssets, mediaModerationTasks } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { appendMediaModerationEvent } from '@/lib/growth/media-review-audit';

const decisionStatusEnum = z.enum(['approved', 'rejected', 'needs_changes', 'cancelled']);

const decisionSchema = z.object({
    status: decisionStatusEnum,
    reviewNotes: z.string().trim().min(6).max(500).optional(),
    moderationReason: z.string().trim().max(500).nullable().optional(),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ApprovalMode = 'any' | 'ordered';

type ApprovalWorkflow = {
    mode: ApprovalMode;
    approverIds: string[];
    minApprovals: number;
};

type ApprovalRecord = {
    reviewerId: string;
    reviewedAt: string;
    reviewNotes: string | null;
};

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return { ...value };
}

function toUuidArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => UUID_REGEX.test(entry)))];
}

function parseApprovalWorkflow(metadata: Record<string, unknown>): ApprovalWorkflow | null {
    const raw = metadata.approvalWorkflow;
    if (!raw || Array.isArray(raw) || typeof raw !== 'object') {
        return null;
    }

    const rawRecord = raw as Record<string, unknown>;
    const approverIds = toUuidArray(rawRecord.approverIds);
    if (approverIds.length === 0) {
        return null;
    }

    const mode: ApprovalMode = rawRecord.mode === 'ordered' ? 'ordered' : 'any';
    const minApprovalsRaw = Number(rawRecord.minApprovals);
    const minApprovals = Number.isFinite(minApprovalsRaw)
        ? Math.max(1, Math.min(Math.floor(minApprovalsRaw), approverIds.length))
        : (mode === 'ordered' ? approverIds.length : 1);

    return {
        mode,
        approverIds,
        minApprovals,
    };
}

function parseApprovalRecords(metadata: Record<string, unknown>): ApprovalRecord[] {
    const raw = metadata.approvals;
    if (!Array.isArray(raw)) {
        return [];
    }

    const seen = new Set<string>();
    const records: ApprovalRecord[] = [];

    for (const entry of raw) {
        if (!entry || Array.isArray(entry) || typeof entry !== 'object') {
            continue;
        }
        const record = entry as Record<string, unknown>;
        const reviewerId = typeof record.reviewerId === 'string' ? record.reviewerId.trim() : '';
        if (!UUID_REGEX.test(reviewerId) || seen.has(reviewerId)) {
            continue;
        }
        seen.add(reviewerId);
        records.push({
            reviewerId,
            reviewedAt: typeof record.reviewedAt === 'string' && record.reviewedAt.length > 0
                ? record.reviewedAt
                : new Date(0).toISOString(),
            reviewNotes: typeof record.reviewNotes === 'string' ? record.reviewNotes : null,
        });
    }

    return records;
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

        const parsed = decisionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const [task] = await db.select().from(mediaModerationTasks)
            .where(eq(mediaModerationTasks.id, id))
            .limit(1);

        if (!task) {
            return NextResponse.json({ error: 'Media moderation task not found' }, { status: 404 });
        }

        const taskMetadata = asMetadata(task.metadata);
        const approvalWorkflow = parseApprovalWorkflow(taskMetadata);
        const existingApprovals = parseApprovalRecords(taskMetadata);
        const listedApprover = approvalWorkflow?.approverIds.includes(user.id) ?? false;

        // Auth: admin, assigned reviewer, or listed approver
        const isAdmin = user.role === 'admin';
        const isAssignedReviewer = task.reviewerId === user.id;
        if (!isAdmin && !isAssignedReviewer && !listedApprover) {
            return NextResponse.json({ error: 'Not authorized to decide on this task' }, { status: 403 });
        }

        if (task.status !== 'pending') {
            return NextResponse.json(
                { error: `Task already ${task.status}` },
                { status: 409 },
            );
        }

        if (payload.status === 'approved' && approvalWorkflow && !listedApprover && user.role !== 'admin') {
            return NextResponse.json({ error: 'User is not in the approval workflow' }, { status: 403 });
        }

        if (task.reviewerId && task.reviewerId !== user.id && user.role !== 'admin') {
            const canApproveInAnyMode = payload.status === 'approved'
                && approvalWorkflow
                && approvalWorkflow.mode === 'any'
                && listedApprover;
            if (!canApproveInAnyMode) {
                return NextResponse.json({ error: 'Task assigned to another reviewer' }, { status: 403 });
            }
        }

        if (
            payload.status === 'approved'
            && approvalWorkflow
            && approvalWorkflow.mode === 'ordered'
            && user.role !== 'admin'
        ) {
            const nextExpectedApproverId = approvalWorkflow.approverIds[existingApprovals.length] ?? null;
            if (!nextExpectedApproverId || nextExpectedApproverId !== user.id) {
                return NextResponse.json({
                    error: 'Out-of-order approval attempt',
                    nextExpectedApproverId,
                }, { status: 409 });
            }
        }

        if (
            payload.status === 'approved'
            && approvalWorkflow
            && existingApprovals.some((approval) => approval.reviewerId === user.id)
            && user.role !== 'admin'
        ) {
            return NextResponse.json(
                { error: 'This reviewer already approved the task' },
                { status: 409 },
            );
        }

        const now = new Date();
        const nowIso = now.toISOString();
        let nextMetadata = taskMetadata;
        let partialApproval: {
            approvedCount: number;
            requiredApprovals: number;
            mode: ApprovalMode;
            nextReviewerId: string | null;
        } | null = null;

        if (payload.status === 'approved' && approvalWorkflow) {
            const updatedApprovals: ApprovalRecord[] = [
                ...existingApprovals,
                {
                    reviewerId: user.id,
                    reviewedAt: nowIso,
                    reviewNotes: payload.reviewNotes ?? null,
                },
            ];

            const approvedCount = updatedApprovals.length;
            const requiredApprovals = approvalWorkflow.minApprovals;
            const nextReviewerId = approvalWorkflow.mode === 'ordered'
                ? (approvalWorkflow.approverIds[approvedCount] ?? null)
                : null;

            nextMetadata = {
                ...taskMetadata,
                approvalWorkflow,
                approvals: updatedApprovals,
                approvalProgress: {
                    approvedCount,
                    requiredApprovals,
                    mode: approvalWorkflow.mode,
                    completed: approvedCount >= requiredApprovals,
                    nextReviewerId,
                },
                lastApprovalAt: nowIso,
                lastApprovalBy: user.id,
            };

            if (approvedCount < requiredApprovals) {
                partialApproval = {
                    approvedCount,
                    requiredApprovals,
                    mode: approvalWorkflow.mode,
                    nextReviewerId,
                };
            }
        }

        if (!partialApproval && approvalWorkflow) {
            nextMetadata = {
                ...nextMetadata,
                approvalWorkflow,
                approvalProgress: nextMetadata.approvalProgress ?? {
                    approvedCount: existingApprovals.length,
                    requiredApprovals: approvalWorkflow.minApprovals,
                    mode: approvalWorkflow.mode,
                    completed: payload.status === 'approved',
                    nextReviewerId: null,
                },
            };
        }

        const result = await db.transaction(async (tx) => {
            if (partialApproval) {
                const [pendingTask] = await tx.update(mediaModerationTasks)
                    .set({
                        status: 'pending',
                        reviewerId: partialApproval.nextReviewerId ?? task.reviewerId ?? null,
                        reviewNotes: payload.reviewNotes ?? task.reviewNotes ?? null,
                        metadata: nextMetadata,
                        updatedAt: now,
                    })
                    .where(and(
                        eq(mediaModerationTasks.id, id),
                        eq(mediaModerationTasks.userId, task.userId),
                        eq(mediaModerationTasks.status, 'pending'),
                    ))
                    .returning();

                if (!pendingTask) {
                    return {
                        task: null,
                        asset: null,
                        partialApproval: null,
                    };
                }

                await appendMediaModerationEvent(tx, {
                    userId: task.userId,
                    taskId: pendingTask.id,
                    assetId: pendingTask.assetId,
                    actorId: user.id,
                    eventType: 'approved',
                    payload: {
                        partial: true,
                        approvedCount: partialApproval.approvedCount,
                        requiredApprovals: partialApproval.requiredApprovals,
                        nextReviewerId: partialApproval.nextReviewerId,
                        reviewNotes: payload.reviewNotes ?? null,
                        moderationReason: payload.moderationReason ?? null,
                    },
                });

                return {
                    task: pendingTask,
                    asset: null as typeof mediaAssets.$inferSelect | null,
                    partialApproval,
                };
            }

            const [updatedTask] = await tx.update(mediaModerationTasks)
                .set({
                    status: payload.status,
                    reviewedBy: user.id,
                    reviewedAt: now,
                    reviewNotes: payload.reviewNotes ?? null,
                    metadata: nextMetadata,
                    updatedAt: now,
                })
                .where(and(
                    eq(mediaModerationTasks.id, id),
                    eq(mediaModerationTasks.userId, task.userId),
                    eq(mediaModerationTasks.status, 'pending'),
                ))
                .returning();

            if (!updatedTask) {
                return {
                    task: null,
                    asset: null,
                    partialApproval: null as null,
                };
            }

            let updatedAsset: typeof mediaAssets.$inferSelect | null = null;
            if (payload.status !== 'cancelled') {
                const [asset] = await tx.select({
                    id: mediaAssets.id,
                    metadata: mediaAssets.metadata,
                })
                    .from(mediaAssets)
                    .where(eq(mediaAssets.id, updatedTask.assetId))
                    .limit(1);

                if (asset) {
                    const assetMetadata = asMetadata(asset.metadata);
                    assetMetadata.moderationStatus = payload.status;
                    assetMetadata.moderationReason = payload.moderationReason ?? payload.reviewNotes ?? null;
                    assetMetadata.moderationUpdatedAt = nowIso;
                    assetMetadata.moderationUpdatedBy = user.id;
                    const existingHistory = Array.isArray(assetMetadata.moderationHistory)
                        ? assetMetadata.moderationHistory
                        : [];
                    assetMetadata.moderationHistory = [
                        ...existingHistory,
                        {
                            status: payload.status,
                            reason: payload.moderationReason ?? payload.reviewNotes ?? null,
                            updatedAt: nowIso,
                            updatedBy: user.id,
                            source: 'media_moderation_task',
                            taskId: updatedTask.id,
                        },
                    ].slice(-100);

                    const [assetRow] = await tx.update(mediaAssets)
                        .set({ metadata: assetMetadata })
                        .where(eq(mediaAssets.id, asset.id))
                        .returning();
                    updatedAsset = assetRow ?? null;
                }
            }

            await appendMediaModerationEvent(tx, {
                userId: task.userId,
                taskId: updatedTask.id,
                assetId: updatedTask.assetId,
                actorId: user.id,
                eventType: payload.status,
                payload: {
                    partial: false,
                    reviewNotes: payload.reviewNotes ?? null,
                    moderationReason: payload.moderationReason ?? null,
                    approvalsApplied: approvalWorkflow ? parseApprovalRecords(nextMetadata).length : null,
                },
            });

            return {
                task: updatedTask,
                asset: updatedAsset,
                partialApproval: null as null,
            };
        });

        if (!result.task) {
            return NextResponse.json(
                { error: 'Task decision changed by another process; retry' },
                { status: 409 },
            );
        }

        return NextResponse.json({
            success: true,
            task: result.task,
            asset: result.asset,
            awaitingApprovals: Boolean(result.partialApproval),
            partialApproval: result.partialApproval,
        });
    } catch (error) {
        console.error('Failed to update media moderation task decision:', error);
        return NextResponse.json(
            { error: 'Failed to update media moderation task decision' },
            { status: 500 },
        );
    }
}
