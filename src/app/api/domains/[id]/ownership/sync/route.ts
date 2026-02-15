import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domains, integrationConnections } from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { runIntegrationConnectionSync } from '@/lib/integrations/executor';
import { notDeleted } from '@/lib/db/soft-delete';

const ownershipSyncLimiter = createRateLimiter('domain_ownership_sync_mutation', {
    maxRequests: 20,
    windowMs: 60 * 1000,
});

const syncSchema = z.object({
    connectionId: z.string().uuid().optional(),
    days: z.number().int().min(1).max(365).optional(),
});

const SUPPORTED_REGISTRAR_PROVIDERS = ['godaddy', 'namecheap'] as const;

type RouteParams = {
    params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const actor = getRequestUser(request);
    if (!actor.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const rateResult = ownershipSyncLimiter(`${actor.id}:${getClientIp(request)}`);
    if (!rateResult.allowed) {
        return NextResponse.json(
            { error: 'Too many registrar sync requests. Please retry shortly.' },
            {
                status: 429,
                headers: rateResult.headers,
            },
        );
    }

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const [domainRow] = await db.select({
        id: domains.id,
        domain: domains.domain,
        registrar: domains.registrar,
    })
        .from(domains)
        .where(and(eq(domains.id, id), notDeleted(domains)))
        .limit(1);

    if (!domainRow) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const registrarRaw = typeof domainRow.registrar === 'string'
        ? domainRow.registrar.toLowerCase()
        : '';
    if (!SUPPORTED_REGISTRAR_PROVIDERS.includes(registrarRaw as (typeof SUPPORTED_REGISTRAR_PROVIDERS)[number])) {
        return NextResponse.json(
            { error: `Registrar sync is not currently supported for ${domainRow.registrar}` },
            { status: 400 },
        );
    }
    const registrarProvider = registrarRaw as (typeof SUPPORTED_REGISTRAR_PROVIDERS)[number];

    const explicitConnectionId = parsed.data.connectionId;
    let selectedConnectionId: string | null = null;

    const domainConnectionQuery = db.select({
        id: integrationConnections.id,
    })
        .from(integrationConnections)
        .where(and(
            eq(integrationConnections.provider, registrarProvider),
            eq(integrationConnections.domainId, id),
            eq(integrationConnections.status, 'connected'),
            ...(actor.role !== 'admin' ? [eq(integrationConnections.userId, actor.id)] : []),
            ...(explicitConnectionId ? [eq(integrationConnections.id, explicitConnectionId)] : []),
        ))
        .orderBy(desc(integrationConnections.updatedAt))
        .limit(1);

    const [domainConnection] = await domainConnectionQuery;
    if (domainConnection?.id) {
        selectedConnectionId = domainConnection.id;
    } else {
        const portfolioConnectionQuery = db.select({
            id: integrationConnections.id,
        })
            .from(integrationConnections)
            .where(and(
                eq(integrationConnections.provider, registrarProvider),
                isNull(integrationConnections.domainId),
                eq(integrationConnections.status, 'connected'),
                ...(actor.role !== 'admin' ? [eq(integrationConnections.userId, actor.id)] : []),
                ...(explicitConnectionId ? [eq(integrationConnections.id, explicitConnectionId)] : []),
            ))
            .orderBy(desc(integrationConnections.updatedAt))
            .limit(1);
        const [portfolioConnection] = await portfolioConnectionQuery;
        selectedConnectionId = portfolioConnection?.id ?? null;
    }

    if (!selectedConnectionId) {
        return NextResponse.json(
            {
                error: `No connected ${registrarProvider} integration found for this domain. Add a registrar connection first.`,
            },
            { status: 404 },
        );
    }

    const result = await runIntegrationConnectionSync(
        selectedConnectionId,
        { userId: actor.id, role: actor.role },
        {
            runType: 'manual',
            days: parsed.data.days ?? 90,
        },
    );

    if ('error' in result) {
        if (result.error === 'not_found') {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
        success: true,
        domain: {
            id: domainRow.id,
            domain: domainRow.domain,
            registrar: domainRow.registrar,
        },
        connectionId: result.connection.id,
        provider: result.connection.provider,
        run: result.run,
    });
}
