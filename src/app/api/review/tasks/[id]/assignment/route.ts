import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { ReviewError } from '@/lib/review/errors';
import { assignReviewTask } from '@/lib/review/task-assignment';

const assignmentSchema = z.object({
    claim: z.boolean().optional(),
    release: z.boolean().optional(),
    reviewerId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().min(3).max(300).optional(),
}).superRefine((value, ctx) => {
    const actionCount = Number(value.claim === true)
        + Number(value.release === true)
        + Number(value.reviewerId !== undefined);

    if (actionCount !== 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reviewerId'],
            message: 'Provide exactly one action: claim, release, or reviewerId',
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
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const mode = parsed.data.claim
        ? 'claim'
        : parsed.data.release
            ? 'release'
            : 'set';

    try {
        const result = await assignReviewTask({
            taskId: id,
            mode,
            reviewerId: parsed.data.reviewerId,
            reason: parsed.data.reason,
            actor: {
                id: user.id,
                role: user.role,
            },
        });

        return NextResponse.json({
            success: true,
            changed: result.changed,
            task: {
                id: result.taskId,
                taskType: result.taskType,
                status: result.status,
                previousReviewerId: result.previousReviewerId,
                reviewerId: result.reviewerId,
            },
        });
    } catch (error) {
        const statusCode = error instanceof ReviewError ? error.statusCode : 500;
        const message = error instanceof Error ? error.message : 'Failed to assign review task';
        console.error('Failed to assign review task:', error);
        return NextResponse.json(
            { error: message },
            { status: statusCode },
        );
    }
}
