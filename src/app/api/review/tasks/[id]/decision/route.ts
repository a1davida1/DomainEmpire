import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { decideReviewTask, REQUIRED_DOMAIN_BUY_CHECKLIST_KEYS } from '@/lib/review/task-decision';
import { ReviewError, ChecklistValidationError } from '@/lib/review/errors';

const decisionSchema = z.object({
    status: z.enum(['approved', 'rejected', 'cancelled']),
    reviewNotes: z.string().min(8).max(500),
    checklistJson: z.record(z.string(), z.unknown()).optional(),
    clearHardFail: z.boolean().optional(),
});

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
    const { id } = await params;

    try {
        const body = await request.json();
        const parsed = decisionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const result = await decideReviewTask({
            taskId: id,
            status: parsed.data.status,
            reviewNotes: parsed.data.reviewNotes,
            checklistPatch: parsed.data.checklistJson,
            clearHardFail: parsed.data.clearHardFail,
            actor: {
                id: user.id,
                role: user.role,
            },
        });

        return NextResponse.json({
            success: true,
            id: result.taskId,
            status: result.status,
            reviewNotes: parsed.data.reviewNotes,
            bidPlanQueued: result.bidPlanQueued,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update review task';
        const statusCode = error instanceof ReviewError ? error.statusCode : 500;
        console.error('Failed to update review task decision:', error);
        return NextResponse.json({
            error: message,
            requiredChecklist: error instanceof ChecklistValidationError ? REQUIRED_DOMAIN_BUY_CHECKLIST_KEYS : undefined,
        }, { status: statusCode });
    }
}
