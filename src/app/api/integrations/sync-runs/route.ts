import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, integrationConnections, integrationSyncRuns } from '@/lib/db';
import { getRequestUser, requireAuth } from '@/lib/auth';

const RUN_TYPES = ['manual', 'scheduled', 'webhook'] as const;
const RUN_STATUSES = ['running', 'success', 'failed', 'partial'] as const;

const createRunSchema = z.object({
    connectionId: z.string().uuid(),
    runType: z.enum(RUN_TYPES).optional(),
    status: z.enum(RUN_STATUSES).optional(),
    recordsProcessed: z.number().int().min(0).optional(),
    recordsUpserted: z.number().int().min(0).optional(),
    recordsFailed: z.number().int().min(0).optional(),
    errorMessage: z.string().trim().max(5000).optional().nullable(),
    details: z.record(z.string(), z.unknown()).optional(),
    completedAt: z.coerce.date().optional(),
});

async function getAccessibleConnection(
    connectionId: string,
    actor: { id: string; role: string },
) {
    const whereClause = actor.role === 'admin'
        ? eq(integrationConnections.id, connectionId)
        : and(eq(integrationConnections.id, connectionId), eq(integrationConnections.userId, actor.id));

    const rows = await db
        .select({
            id: integrationConnections.id,
            userId: integrationConnections.userId,
        })
        .from(integrationConnections)
        .where(whereClause)
        .limit(1);

    return rows[0] ?? null;
}

// GET /api/integrations/sync-runs?connectionId=...&limit=...
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');
    const parsedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.max(1, Math.min(parsedLimit, 200));

    if (!connectionId || !z.string().uuid().safeParse(connectionId).success) {
        return NextResponse.json({ error: 'Valid connectionId is required' }, { status: 400 });
    }

    try {
        const connection = await getAccessibleConnection(connectionId, actor);
        if (!connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const runs = await db
            .select()
            .from(integrationSyncRuns)
            .where(eq(integrationSyncRuns.connectionId, connectionId))
            .orderBy(desc(integrationSyncRuns.startedAt))
            .limit(limit);

        return NextResponse.json({ runs });
    } catch (error) {
        console.error('Failed to list integration sync runs:', error);
        return NextResponse.json({ error: 'Failed to list integration sync runs' }, { status: 500 });
    }
}

// POST /api/integrations/sync-runs
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const parsed = createRunSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const data = parsed.data;
        const connection = await getAccessibleConnection(data.connectionId, actor);
        if (!connection) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        const status = data.status ?? 'running';
        const completedAt = data.completedAt ?? (status === 'running' ? undefined : new Date());

        const insertedRows = await db
            .insert(integrationSyncRuns)
            .values({
                connectionId: data.connectionId,
                runType: data.runType ?? 'manual',
                status,
                recordsProcessed: data.recordsProcessed ?? 0,
                recordsUpserted: data.recordsUpserted ?? 0,
                recordsFailed: data.recordsFailed ?? 0,
                errorMessage: data.errorMessage ?? null,
                details: data.details ?? {},
                completedAt,
                triggeredBy: actor.id,
            })
            .returning();

        const inserted = insertedRows[0];

        if (status !== 'running') {
            await db
                .update(integrationConnections)
                .set({
                    lastSyncAt: inserted.completedAt ?? new Date(),
                    lastSyncStatus: status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'partial',
                    lastSyncError: status === 'success' ? null : (inserted.errorMessage ?? null),
                    updatedAt: new Date(),
                })
                .where(eq(integrationConnections.id, data.connectionId));
        }

        return NextResponse.json({ run: inserted }, { status: 201 });
    } catch (error) {
        console.error('Failed to create integration sync run:', error);
        return NextResponse.json({ error: 'Failed to create integration sync run' }, { status: 500 });
    }
}
