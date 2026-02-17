import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db, domains, integrationConnections } from '@/lib/db';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { encryptSecret } from '@/lib/security/encryption';

const PROVIDERS = [
    'godaddy',
    'namecheap',
    'sedo',
    'bodis',
    'cloudflare',
    'cpanel',
    'google_analytics',
    'google_search_console',
    'semrush',
    'mailchimp',
    'convertkit',
    'figma',
    'impact',
    'cj',
    'awin',
    'rakuten',
    'custom',
] as const;

const CATEGORIES = ['registrar', 'parking', 'affiliate_network', 'analytics', 'email', 'design', 'hosting', 'seo', 'other'] as const;
const STATUSES = ['pending', 'connected', 'error', 'disabled'] as const;

const upsertSchema = z.object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    domainId: z.string().uuid().nullable().optional(),
    provider: z.enum(PROVIDERS),
    category: z.enum(CATEGORIES),
    displayName: z.string().trim().min(1).max(255).optional(),
    status: z.enum(STATUSES).optional(),
    credential: z.string().optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional(),
});

const connectionReturning = {
    id: integrationConnections.id,
    userId: integrationConnections.userId,
    domainId: integrationConnections.domainId,
    provider: integrationConnections.provider,
    category: integrationConnections.category,
    displayName: integrationConnections.displayName,
    status: integrationConnections.status,
    config: integrationConnections.config,
    encryptedCredential: integrationConnections.encryptedCredential,
    lastSyncAt: integrationConnections.lastSyncAt,
    lastSyncStatus: integrationConnections.lastSyncStatus,
    lastSyncError: integrationConnections.lastSyncError,
    createdBy: integrationConnections.createdBy,
    createdAt: integrationConnections.createdAt,
    updatedAt: integrationConnections.updatedAt,
} as const;

function normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

async function ensureDomainExists(domainId: string | null | undefined): Promise<boolean> {
    if (!domainId) return true;
    const existingDomain = await db
        .select({ id: domains.id })
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1);
    return existingDomain.length > 0;
}

// GET /api/integrations/connections
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);
    const { searchParams } = new URL(request.url);

    const provider = searchParams.get('provider');
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const rawDomainId = searchParams.get('domainId');
    const requestedUserId = searchParams.get('userId');

    if (provider && !PROVIDERS.includes(provider as (typeof PROVIDERS)[number])) {
        return NextResponse.json({ error: 'Invalid provider filter' }, { status: 400 });
    }
    if (category && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
        return NextResponse.json({ error: 'Invalid category filter' }, { status: 400 });
    }
    if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
        return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }
    if (rawDomainId && rawDomainId !== 'null' && !z.string().uuid().safeParse(rawDomainId).success) {
        return NextResponse.json({ error: 'Invalid domainId filter' }, { status: 400 });
    }
    if (requestedUserId && !z.string().uuid().safeParse(requestedUserId).success) {
        return NextResponse.json({ error: 'Invalid userId filter' }, { status: 400 });
    }
    if (requestedUserId && actor.role !== 'admin' && requestedUserId !== actor.id) {
        return NextResponse.json({ error: 'Forbidden: cannot query another user' }, { status: 403 });
    }

    const providerFilter = provider
        ? (provider as typeof integrationConnections.$inferSelect.provider)
        : null;
    const categoryFilter = category
        ? (category as typeof integrationConnections.$inferSelect.category)
        : null;
    const statusFilter = status
        ? (status as typeof integrationConnections.$inferSelect.status)
        : null;

    const targetUserId = actor.role === 'admin' && requestedUserId ? requestedUserId : actor.id;
    const whereClauses: SQL[] = [eq(integrationConnections.userId, targetUserId)];

    if (providerFilter) whereClauses.push(eq(integrationConnections.provider, providerFilter));
    if (categoryFilter) whereClauses.push(eq(integrationConnections.category, categoryFilter));
    if (statusFilter) whereClauses.push(eq(integrationConnections.status, statusFilter));
    if (rawDomainId === 'null') {
        whereClauses.push(isNull(integrationConnections.domainId));
    } else if (rawDomainId) {
        whereClauses.push(eq(integrationConnections.domainId, rawDomainId));
    }

    try {
        const rows = await db
            .select({
                id: integrationConnections.id,
                userId: integrationConnections.userId,
                domainId: integrationConnections.domainId,
                domain: domains.domain,
                provider: integrationConnections.provider,
                category: integrationConnections.category,
                displayName: integrationConnections.displayName,
                status: integrationConnections.status,
                config: integrationConnections.config,
                encryptedCredential: integrationConnections.encryptedCredential,
                lastSyncAt: integrationConnections.lastSyncAt,
                lastSyncStatus: integrationConnections.lastSyncStatus,
                lastSyncError: integrationConnections.lastSyncError,
                createdBy: integrationConnections.createdBy,
                createdAt: integrationConnections.createdAt,
                updatedAt: integrationConnections.updatedAt,
            })
            .from(integrationConnections)
            .leftJoin(domains, eq(integrationConnections.domainId, domains.id))
            .where(and(...whereClauses))
            .orderBy(desc(integrationConnections.updatedAt));

        return NextResponse.json({
            connections: rows.map((row) => ({
                id: row.id,
                userId: row.userId,
                domainId: row.domainId,
                domain: row.domain,
                provider: row.provider,
                category: row.category,
                displayName: row.displayName,
                status: row.status,
                config: row.config,
                hasCredential: Boolean(row.encryptedCredential),
                lastSyncAt: row.lastSyncAt,
                lastSyncStatus: row.lastSyncStatus,
                lastSyncError: row.lastSyncError,
                createdBy: row.createdBy,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            })),
        });
    } catch (error) {
        console.error('Failed to list integration connections:', error);
        return NextResponse.json({ error: 'Failed to list integration connections' }, { status: 500 });
    }
}

// POST /api/integrations/connections
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);

    try {
        const body = await request.json();
        const parsed = upsertSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
        }

        const data = parsed.data;
        const targetUserId = actor.role === 'admin' && data.userId ? data.userId : actor.id;

        if (data.userId && actor.role !== 'admin' && data.userId !== actor.id) {
            return NextResponse.json({ error: 'Forbidden: cannot create connection for another user' }, { status: 403 });
        }

        const domainExists = await ensureDomainExists(data.domainId);
        if (!domainExists) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const normalizedDisplayName = normalizeOptionalText(data.displayName);
        const encryptedCredential = Object.prototype.hasOwnProperty.call(data, 'credential')
            ? (data.credential && data.credential.trim().length > 0 ? encryptSecret(data.credential.trim()) : null)
            : undefined;

        if (data.id) {
            const existingById = await db
                .select({
                    id: integrationConnections.id,
                    userId: integrationConnections.userId,
                })
                .from(integrationConnections)
                .where(eq(integrationConnections.id, data.id))
                .limit(1);

            if (existingById.length === 0) {
                return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
            }

            if (actor.role !== 'admin' && existingById[0].userId !== actor.id) {
                return NextResponse.json({ error: 'Forbidden: cannot update this connection' }, { status: 403 });
            }

            const updateSet: Record<string, unknown> = {
                provider: data.provider,
                category: data.category,
                updatedAt: new Date(),
            };
            if (data.status !== undefined) updateSet.status = data.status;
            if (data.config !== undefined) updateSet.config = data.config;
            if (data.domainId !== undefined) updateSet.domainId = data.domainId;
            if (data.displayName !== undefined) updateSet.displayName = normalizedDisplayName;
            if (encryptedCredential !== undefined) updateSet.encryptedCredential = encryptedCredential;

            const updatedRows = await db
                .update(integrationConnections)
                .set(updateSet)
                .where(eq(integrationConnections.id, data.id))
                .returning(connectionReturning);

            if (updatedRows.length === 0) {
                return NextResponse.json({ error: 'Connection not found after update' }, { status: 404 });
            }

            const updated = updatedRows[0];
            return NextResponse.json({
                connection: {
                    ...updated,
                    hasCredential: Boolean(updated.encryptedCredential),
                },
            });
        }

        const upserted = await db.transaction(async (tx) => {
            const txWithExecute = tx as typeof tx & {
                execute?: (query: ReturnType<typeof sql>) => Promise<unknown>;
            };

            if (typeof txWithExecute.execute === 'function') {
                const lockKey = `integration_connection:${targetUserId}:${data.provider}:${data.domainId ?? 'null'}`;
                await txWithExecute.execute(
                    sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
                );
            }

            const lookupConditions = [
                eq(integrationConnections.userId, targetUserId),
                eq(integrationConnections.provider, data.provider),
                data.domainId ? eq(integrationConnections.domainId, data.domainId) : isNull(integrationConnections.domainId),
            ];

            const existing = await tx
                .select({ id: integrationConnections.id })
                .from(integrationConnections)
                .where(and(...lookupConditions))
                .limit(1);

            const updateSet: Record<string, unknown> = {
                category: data.category,
                updatedAt: new Date(),
            };
            if (data.status !== undefined) updateSet.status = data.status;
            if (data.config !== undefined) updateSet.config = data.config;
            if (data.displayName !== undefined) updateSet.displayName = normalizedDisplayName;
            if (encryptedCredential !== undefined) updateSet.encryptedCredential = encryptedCredential;

            if (existing.length > 0) {
                const updatedRows = await tx
                    .update(integrationConnections)
                    .set(updateSet)
                    .where(eq(integrationConnections.id, existing[0].id))
                    .returning(connectionReturning);

                return {
                    created: false,
                    connection: updatedRows[0],
                };
            }

            const insertedRows = await tx
                .insert(integrationConnections)
                .values({
                    userId: targetUserId,
                    domainId: data.domainId ?? null,
                    provider: data.provider,
                    category: data.category,
                    displayName: normalizedDisplayName,
                    status: data.status ?? 'pending',
                    encryptedCredential: encryptedCredential ?? null,
                    config: data.config ?? {},
                    createdBy: actor.id,
                    updatedAt: new Date(),
                })
                .returning(connectionReturning);

            return {
                created: true,
                connection: insertedRows[0],
            };
        });

        return NextResponse.json({
            connection: {
                ...upserted.connection,
                hasCredential: Boolean(upserted.connection.encryptedCredential),
            },
        }, { status: upserted.created ? 201 : 200 });
    } catch (error) {
        console.error('Failed to upsert integration connection:', error);
        return NextResponse.json({ error: 'Failed to upsert integration connection' }, { status: 500 });
    }
}

// DELETE /api/integrations/connections?id=...
export async function DELETE(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);
    const id = request.nextUrl.searchParams.get('id');

    if (!id || !z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }

    try {
        const existing = await db
            .select({
                id: integrationConnections.id,
                userId: integrationConnections.userId,
            })
            .from(integrationConnections)
            .where(eq(integrationConnections.id, id))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
        }

        if (actor.role !== 'admin' && existing[0].userId !== actor.id) {
            return NextResponse.json({ error: 'Forbidden: cannot delete this connection' }, { status: 403 });
        }

        await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete integration connection:', error);
        return NextResponse.json({ error: 'Failed to delete integration connection' }, { status: 500 });
    }
}
