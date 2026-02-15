import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, integrationConnections, integrationSyncRuns } from '@/lib/db';
import { getRequestUser, requireAuth } from '@/lib/auth';

const RUN_STATUSES = ['running', 'success', 'failed', 'partial'] as const;

const updateRunSchema = z.object({
    status: z.enum(RUN_STATUSES).optional(),
    recordsProcessed: z.number().int().min(0).optional(),
    recordsUpserted: z.number().int().min(0).optional(),
    recordsFailed: z.number().int().min(0).optional(),
    errorMessage: z.string().trim().max(5000).optional().nullable(),
    details: z.record(z.string(), z.unknown()).optional(),
    completedAt: z.coerce.date().optional(),
}).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
});

type Actor = { id: string; role: string };

async function getAccessibleRun(runId: string, actor: Actor) {
    const whereClause = actor.role === 'admin'
        ? eq(integrationSyncRuns.id, runId)
        : and(
            eq(integrationSyncRuns.id, runId),
            eq(integrationConnections.userId, actor.id),
        );

    const rows = await db
        .select({
            runId: integrationSyncRuns.id,
            connectionId: integrationSyncRuns.connectionId,
        })
        .from(integrationSyncRuns)
        .innerJoin(integrationConnections, eq(integrationSyncRuns.connectionId, integrationConnections.id))
        .where(whereClause)
        .limit(1);

    return rows[0] ?? null;
}

// PATCH /api/integrations/sync-runs/[id]
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid sync run id' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const parsed = updateRunSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const run = await getAccessibleRun(id, actor);
        if (!run) {
            return NextResponse.json({ error: 'Sync run not found' }, { status: 404 });
        }

        const data = parsed.data;
        const status = data.status;
        const shouldComplete = status && status !== 'running';
        const completedAt = data.completedAt ?? (shouldComplete ? new Date() : undefined);

        const updateSet: Record<string, unknown> = {};
        if (status !== undefined) updateSet.status = status;
        if (data.recordsProcessed !== undefined) updateSet.recordsProcessed = data.recordsProcessed;
        if (data.recordsUpserted !== undefined) updateSet.recordsUpserted = data.recordsUpserted;
        if (data.recordsFailed !== undefined) updateSet.recordsFailed = data.recordsFailed;
        if (data.errorMessage !== undefined) updateSet.errorMessage = data.errorMessage;
        if (data.details !== undefined) updateSet.details = data.details;
        if (completedAt !== undefined) updateSet.completedAt = completedAt;

        const updatedRows = await db
            .update(integrationSyncRuns)
            .set(updateSet)
            .where(eq(integrationSyncRuns.id, id))
            .returning();

        const updated = updatedRows[0];

        if (status && status !== 'running') {
            await db
                .update(integrationConnections)
                .set({
                    lastSyncAt: updated.completedAt ?? new Date(),
                    lastSyncStatus: status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'partial',
                    lastSyncError: status === 'success' ? null : (updated.errorMessage ?? null),
                    updatedAt: new Date(),
                })
                .where(eq(integrationConnections.id, run.connectionId));
        }

        return NextResponse.json({ run: updated });
    } catch (error) {
        console.error('Failed to update integration sync run:', error);
        return NextResponse.json({ error: 'Failed to update integration sync run' }, { status: 500 });
    }
}
