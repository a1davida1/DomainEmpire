import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets, mediaModerationTasks } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { appendMediaModerationEvent } from '@/lib/growth/media-review-audit';

const statusEnum = z.enum(['pending', 'approved', 'rejected', 'needs_changes', 'cancelled']);
const approvalModeEnum = z.enum(['any', 'ordered']);

const createTaskSchema = z.object({
    assetId: z.string().uuid(),
    reviewerId: z.string().uuid().optional(),
    backupReviewerId: z.string().uuid().optional(),
    escalationChain: z.array(z.string().uuid()).max(12).optional(),
    teamLeadId: z.string().uuid().optional(),
    notifyOpsAfterHours: z.number().int().min(1).max(720).optional(),
    approvalMode: approvalModeEnum.optional(),
    approverIds: z.array(z.string().uuid()).max(12).optional(),
    minApprovals: z.number().int().min(1).max(12).optional(),
    slaHours: z.number().int().min(1).max(168).optional(),
    escalateAfterHours: z.number().int().min(1).max(336).optional(),
    dueAt: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    openIfPendingExists: z.boolean().optional(),
}).superRefine((value, ctx) => {
    const slaHours = value.slaHours ?? 24;
    const escalateAfterHours = value.escalateAfterHours ?? 48;
    if (escalateAfterHours < slaHours) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['escalateAfterHours'],
            message: 'escalateAfterHours must be >= slaHours',
        });
    }
    if (value.escalationChain && new Set(value.escalationChain).size !== value.escalationChain.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['escalationChain'],
            message: 'escalationChain must contain unique reviewer ids',
        });
    }
    if (value.reviewerId && value.backupReviewerId && value.reviewerId === value.backupReviewerId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['backupReviewerId'],
            message: 'backupReviewerId must differ from reviewerId',
        });
    }
    if (value.approverIds && new Set(value.approverIds).size !== value.approverIds.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['approverIds'],
            message: 'approverIds must contain unique reviewer ids',
        });
    }
    if (typeof value.minApprovals === 'number' && (!value.approverIds || value.approverIds.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minApprovals'],
            message: 'minApprovals requires approverIds',
        });
    }
    if (
        typeof value.minApprovals === 'number'
        && Array.isArray(value.approverIds)
        && value.minApprovals > value.approverIds.length
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minApprovals'],
            message: 'minApprovals cannot exceed approverIds length',
        });
    }
});

function parseBoolean(value: string | null): boolean {
    if (!value) return false;
    return value.toLowerCase() === 'true' || value === '1';
}

function resolveDueAt(createdAt: Date, explicitDueAt: Date | null, slaHours: number | null | undefined): Date {
    if (explicitDueAt && Number.isFinite(explicitDueAt.getTime())) {
        return explicitDueAt;
    }
    const resolvedSlaHours = typeof slaHours === 'number' && Number.isFinite(slaHours)
        ? slaHours
        : 24;
    return new Date(createdAt.getTime() + resolvedSlaHours * 60 * 60 * 1000);
}

function parseDate(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed;
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        const url = new URL(request.url);
        const limitParam = Number.parseInt(url.searchParams.get('limit') || '50', 10);
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 200)) : 50;
        const statusRaw = url.searchParams.get('status');
        const reviewerIdRaw = url.searchParams.get('reviewerId');
        const assetIdRaw = url.searchParams.get('assetId');
        const slaBreachedOnly = parseBoolean(url.searchParams.get('slaBreachedOnly'));
        const now = new Date();

        const conditions: SQL[] = [eq(mediaModerationTasks.userId, user.id)];
        if (statusRaw) {
            const parsedStatus = statusEnum.safeParse(statusRaw);
            if (!parsedStatus.success) {
                return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
            }
            conditions.push(eq(mediaModerationTasks.status, parsedStatus.data));
        }
        if (reviewerIdRaw) {
            if (!z.string().uuid().safeParse(reviewerIdRaw).success) {
                return NextResponse.json({ error: 'Invalid reviewerId filter' }, { status: 400 });
            }
            conditions.push(eq(mediaModerationTasks.reviewerId, reviewerIdRaw));
        }
        if (assetIdRaw) {
            if (!z.string().uuid().safeParse(assetIdRaw).success) {
                return NextResponse.json({ error: 'Invalid assetId filter' }, { status: 400 });
            }
            conditions.push(eq(mediaModerationTasks.assetId, assetIdRaw));
        }
        if (slaBreachedOnly) {
            const createdAtOrNow = sql`COALESCE(${mediaModerationTasks.createdAt}, ${now})`;
            const dueAtBySla = sql`${createdAtOrNow} + (COALESCE(${mediaModerationTasks.slaHours}, 24) * INTERVAL '1 hour')`;
            const dueAtResolved = sql`COALESCE(${mediaModerationTasks.dueAt}, ${dueAtBySla})`;
            const escalateAt = sql`${createdAtOrNow} + (${mediaModerationTasks.escalateAfterHours} * INTERVAL '1 hour')`;

            conditions.push(sql`(
                ${mediaModerationTasks.status} = 'pending'
                AND (
                    ${now} > ${dueAtResolved}
                    OR (
                        ${mediaModerationTasks.escalateAfterHours} IS NOT NULL
                        AND ${now} > ${escalateAt}
                    )
                )
            )`);
        }

        const whereClause = and(...conditions);
        const [countRow] = await db.select({ total: count() })
            .from(mediaModerationTasks)
            .where(whereClause);
        const totalCount = Number(countRow?.total) || 0;

        const rows = await db.select().from(mediaModerationTasks)
            .where(whereClause)
            .orderBy(desc(mediaModerationTasks.createdAt))
            .limit(limit);

        if (rows.length === 0) {
            return NextResponse.json({ count: totalCount, tasks: [] });
        }

        const assetIds = [...new Set(rows.map((row) => row.assetId))];
        const assetRows = await db.select({
            id: mediaAssets.id,
            type: mediaAssets.type,
            url: mediaAssets.url,
            folder: mediaAssets.folder,
            metadata: mediaAssets.metadata,
        })
            .from(mediaAssets)
            .where(and(
                eq(mediaAssets.userId, user.id),
                inArray(mediaAssets.id, assetIds),
            ));

        const assetsById = assetRows.reduce<Record<string, typeof assetRows[number]>>((acc, row) => {
            acc[row.id] = row;
            return acc;
        }, {});

        const nowMs = now.getTime();
        const enriched = rows.map((task) => {
            const createdAt = task.createdAt ?? new Date();
            const dueAt = resolveDueAt(createdAt, task.dueAt ?? null, task.slaHours ?? null);
            const escalateAt = typeof task.escalateAfterHours === 'number' && Number.isFinite(task.escalateAfterHours)
                ? new Date(createdAt.getTime() + task.escalateAfterHours * 60 * 60 * 1000)
                : null;
            const pending = task.status === 'pending';
            return {
                ...task,
                asset: assetsById[task.assetId] ?? null,
                sla: {
                    dueAt,
                    escalateAt,
                    isBreached: pending && nowMs > dueAt.getTime(),
                    isEscalated: pending && escalateAt !== null && nowMs > escalateAt.getTime(),
                },
            };
        });

        return NextResponse.json({
            count: totalCount,
            tasks: enriched,
        });
    } catch (error) {
        console.error('Failed to list media moderation tasks:', error);
        return NextResponse.json(
            { error: 'Failed to list media moderation tasks' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = createTaskSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const [asset] = await db.select({
            id: mediaAssets.id,
            userId: mediaAssets.userId,
            metadata: mediaAssets.metadata,
        })
            .from(mediaAssets)
            .where(and(
                eq(mediaAssets.id, payload.assetId),
                eq(mediaAssets.userId, user.id),
            ))
            .limit(1);

        if (!asset) {
            return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
        }

        const openIfPendingExists = payload.openIfPendingExists ?? true;
        const now = new Date();
        const dueAtInput = parseDate(payload.dueAt ?? null);
        const resolvedSlaHours = payload.slaHours ?? 24;
        const resolvedEscalateAfterHours = payload.escalateAfterHours ?? 48;
        const dueAt = resolveDueAt(now, dueAtInput, resolvedSlaHours);
        const approverIds = payload.approverIds ?? [];
        const approvalWorkflow = approverIds.length > 0
            ? {
                mode: payload.approvalMode ?? 'any',
                approverIds,
                minApprovals: payload.minApprovals
                    ?? ((payload.approvalMode ?? 'any') === 'ordered' ? approverIds.length : 1),
            }
            : null;

        const result = await db.transaction(async (tx) => {
            if (openIfPendingExists) {
                const [existing] = await tx.select()
                    .from(mediaModerationTasks)
                    .where(and(
                        eq(mediaModerationTasks.userId, user.id),
                        eq(mediaModerationTasks.assetId, payload.assetId),
                        eq(mediaModerationTasks.status, 'pending'),
                    ))
                    .orderBy(desc(mediaModerationTasks.createdAt))
                    .limit(1)
                    .for('update');
                if (existing) {
                    return { created: false, task: existing };
                }
            }

            const [task] = await tx.insert(mediaModerationTasks)
                .values({
                    userId: user.id,
                    assetId: payload.assetId,
                    status: 'pending',
                    slaHours: resolvedSlaHours,
                    escalateAfterHours: resolvedEscalateAfterHours,
                    dueAt,
                    reviewerId: payload.reviewerId ?? null,
                    backupReviewerId: payload.backupReviewerId ?? null,
                    metadata: {
                        ...(payload.metadata ?? {}),
                        createdFrom: 'growth_media_vault',
                        requestedAt: now.toISOString(),
                        escalationChain: payload.escalationChain ?? [],
                        teamLeadId: payload.teamLeadId ?? null,
                        notifyOpsAfterHours: payload.notifyOpsAfterHours ?? null,
                        approvalWorkflow,
                        approvals: [],
                        approvalProgress: approvalWorkflow
                            ? {
                                approvedCount: 0,
                                requiredApprovals: approvalWorkflow.minApprovals,
                                mode: approvalWorkflow.mode,
                                completed: false,
                                nextReviewerId: approvalWorkflow.mode === 'ordered'
                                    ? (approvalWorkflow.approverIds[0] ?? null)
                                    : null,
                            }
                            : null,
                    },
                    createdBy: user.id,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();

            await appendMediaModerationEvent(tx, {
                userId: user.id,
                taskId: task.id,
                assetId: task.assetId,
                actorId: user.id,
                eventType: 'created',
                payload: {
                    status: task.status,
                    slaHours: task.slaHours,
                    escalateAfterHours: task.escalateAfterHours,
                    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
                },
            });
            if (task.reviewerId) {
                await appendMediaModerationEvent(tx, {
                    userId: user.id,
                    taskId: task.id,
                    assetId: task.assetId,
                    actorId: user.id,
                    eventType: 'assigned',
                    payload: {
                        reviewerId: task.reviewerId,
                        backupReviewerId: task.backupReviewerId,
                    },
                });
            }

            return { created: true, task };
        });

        return NextResponse.json({
            success: true,
            created: result.created,
            task: result.task,
        }, { status: result.created ? 201 : 200 });
    } catch (error) {
        console.error('Failed to create media moderation task:', error);
        return NextResponse.json(
            { error: 'Failed to create media moderation task' },
            { status: 500 },
        );
    }
}
