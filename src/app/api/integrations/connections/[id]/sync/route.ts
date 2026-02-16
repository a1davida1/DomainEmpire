import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { runIntegrationConnectionSync } from '@/lib/integrations/executor';

const syncRequestSchema = z.object({
    runType: z.enum(['manual', 'scheduled', 'webhook']).optional(),
    days: z.number().int().min(1).max(365).optional(),
});

// POST /api/integrations/connections/[id]/sync
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid connection id' }, { status: 400 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const parsed = syncRequestSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const result = await runIntegrationConnectionSync(
            id,
            { userId: actor.id, role: actor.role },
            parsed.data,
        );

        if ('error' in result) {
            if (result.error === 'not_found') {
                return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
            }
            if (result.error === 'forbidden') {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            if (result.error === 'already_running') {
                return NextResponse.json(
                    {
                        error: 'A sync is already running for this connection',
                        code: 'sync_already_running',
                        runId: result.runId,
                    },
                    { status: 409 },
                );
            }
        }

        return NextResponse.json({
            success: true,
            connectionId: id,
            run: result.run,
            provider: result.connection.provider,
            domainId: result.connection.domainId,
            domain: result.connection.domainName,
        });
    } catch (error) {
        console.error('Failed to execute integration sync:', error);
        return NextResponse.json({ error: 'Failed to execute integration sync' }, { status: 500 });
    }
}
