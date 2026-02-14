import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth, requireRole } from '@/lib/auth';
import { db, reviewTasks } from '@/lib/db';

const taskTypeEnum = z.enum(['domain_buy', 'content_publish', 'campaign_launch']);
const taskStatusEnum = z.enum(['pending', 'approved', 'rejected', 'cancelled']);

const DEFAULT_SLA_HOURS = 24;
const DEFAULT_ESCALATE_AFTER_HOURS = 48;

const createTaskSchema = z.object({
    taskType: taskTypeEnum,
    entityId: z.string().uuid().optional(),
    domainId: z.string().uuid().optional(),
    articleId: z.string().uuid().optional(),
    domainResearchId: z.string().uuid().optional(),
    checklistJson: z.record(z.string(), z.unknown()).optional(),
    slaHours: z.number().int().min(1).max(168).optional(),
    escalateAfterHours: z.number().int().min(1).max(336).optional(),
    autoApproveAfterHours: z.number().int().min(1).max(336).optional(),
    autoRejectAfterHours: z.number().int().min(1).max(336).optional(),
    backupReviewerId: z.string().uuid().optional(),
    confidenceThresholds: z.record(z.string(), z.unknown()).optional(),
    reviewNotes: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
    const resolvedEntityId = value.entityId || value.domainResearchId || value.articleId || value.domainId;
    if (!resolvedEntityId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['entityId'],
            message: 'Provide entityId or one of domainResearchId/articleId/domainId',
        });
    }
    if (value.taskType === 'domain_buy' && !value.domainResearchId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['domainResearchId'],
            message: 'domainResearchId is required for domain_buy tasks',
        });
    }
    const resolvedSla = value.slaHours ?? DEFAULT_SLA_HOURS;
    const resolvedEscalate = value.escalateAfterHours ?? DEFAULT_ESCALATE_AFTER_HOURS;
    if (resolvedEscalate < resolvedSla) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['escalateAfterHours'],
            message: 'escalateAfterHours must be >= slaHours',
        });
    }
    if (
        typeof value.autoApproveAfterHours === 'number'
        && typeof value.autoRejectAfterHours === 'number'
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['autoApproveAfterHours'],
            message: 'Configure either autoApproveAfterHours or autoRejectAfterHours, not both',
        });
    }
});

function parseBoolean(value: string | null): boolean {
    if (!value) return false;
    return value.toLowerCase() === 'true' || value === '1';
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const url = new URL(request.url);
        const limitParam = Number.parseInt(url.searchParams.get('limit') || '50', 10);
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 200)) : 50;

        const taskTypeRaw = url.searchParams.get('taskType');
        const statusRaw = url.searchParams.get('status');
        const domainResearchId = url.searchParams.get('domainResearchId');
        const onlyMine = parseBoolean(url.searchParams.get('onlyMine'));
        const user = getRequestUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
        }

        const conditions: Array<ReturnType<typeof eq>> = [];
        if (taskTypeRaw) {
            const parsedTaskType = taskTypeEnum.safeParse(taskTypeRaw);
            if (!parsedTaskType.success) {
                return NextResponse.json({ error: 'Invalid taskType filter' }, { status: 400 });
            }
            conditions.push(eq(reviewTasks.taskType, parsedTaskType.data));
        }
        if (statusRaw) {
            const parsedStatus = taskStatusEnum.safeParse(statusRaw);
            if (!parsedStatus.success) {
                return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
            }
            conditions.push(eq(reviewTasks.status, parsedStatus.data));
        }
        if (domainResearchId) {
            if (!z.string().uuid().safeParse(domainResearchId).success) {
                return NextResponse.json({ error: 'Invalid domainResearchId filter' }, { status: 400 });
            }
            conditions.push(eq(reviewTasks.domainResearchId, domainResearchId));
        }
        if (onlyMine) {
            conditions.push(eq(reviewTasks.reviewerId, user.id));
        }

        let query = db.select().from(reviewTasks);
        if (conditions.length > 0) {
            query = query.where(and(...conditions)) as typeof query;
        }

        const tasks = await query
            .orderBy(desc(reviewTasks.createdAt))
            .limit(limit);

        return NextResponse.json({ count: tasks.length, tasks });
    } catch (error) {
        console.error('Failed to list review tasks:', error);
        return NextResponse.json(
            { error: 'Failed to list review tasks' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON in request body' },
                { status: 400 },
            );
        }
        const parsed = createTaskSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const entityId = payload.entityId || payload.domainResearchId || payload.articleId || payload.domainId;
        if (!entityId) {
            return NextResponse.json({ error: 'Unable to resolve entityId' }, { status: 400 });
        }

        const [task] = await db.insert(reviewTasks).values({
            taskType: payload.taskType,
            entityId,
            domainId: payload.domainId ?? null,
            articleId: payload.articleId ?? null,
            domainResearchId: payload.domainResearchId ?? null,
            checklistJson: payload.checklistJson ?? {},
            status: 'pending',
            slaHours: payload.slaHours ?? DEFAULT_SLA_HOURS,
            escalateAfterHours: payload.escalateAfterHours ?? DEFAULT_ESCALATE_AFTER_HOURS,
            autoApproveAfterHours: payload.autoApproveAfterHours ?? null,
            autoRejectAfterHours: payload.autoRejectAfterHours ?? null,
            backupReviewerId: payload.backupReviewerId ?? null,
            confidenceThresholds: payload.confidenceThresholds ?? {},
            reviewNotes: payload.reviewNotes ?? null,
            createdBy: user.id,
        }).returning();

        return NextResponse.json({ success: true, task }, { status: 201 });
    } catch (error) {
        console.error('Failed to create review task:', error);
        return NextResponse.json(
            { error: 'Failed to create review task' },
            { status: 500 },
        );
    }
}
