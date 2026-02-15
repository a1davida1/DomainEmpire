import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domainOwnershipEvents, domainRegistrarProfiles, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { updateNameservers } from '@/lib/deploy/godaddy';
import { getZoneNameservers } from '@/lib/deploy/cloudflare';

const nameserverMutationLimiter = createRateLimiter('domain_nameserver_mutation', {
    maxRequests: 12,
    windowMs: 60 * 1000,
});

const nameserverPreflightLimiter = createRateLimiter('domain_nameserver_preflight', {
    maxRequests: 60,
    windowMs: 60 * 1000,
});

const hostnameRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/i;

const postSchema = z.object({
    nameservers: z.array(z.string().trim().min(3).max(255)).min(2).max(8).optional(),
    reason: z.string().trim().min(8).max(1000).nullable().optional(),
    dryRun: z.boolean().default(false),
});

type RouteParams = {
    params: Promise<{ id: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNameserver(value: string): string {
    return value.trim().toLowerCase().replace(/\.+$/g, '');
}

function isValidNameserver(value: string): boolean {
    return hostnameRegex.test(value);
}

function resolveCloudflareNameservers(input: string[]): string[] {
    const resolved = input
        .map((value) => normalizeNameserver(value));

    const nameservers = [...new Set(resolved)];

    if (nameservers.length < 2) {
        throw new Error('At least two Cloudflare nameservers are required.');
    }

    const invalid = nameservers.find((value) => !isValidNameserver(value));
    if (invalid) {
        throw new Error(`Invalid nameserver hostname: ${invalid}`);
    }

    const nonCloudflare = nameservers.find((value) => !value.endsWith('.cloudflare.com'));
    if (nonCloudflare) {
        throw new Error(`Only Cloudflare nameservers are permitted for this action: ${nonCloudflare}`);
    }

    return nameservers;
}

function extractPreviousNameservers(metadata: unknown): string[] {
    if (!isRecord(metadata)) return [];
    const state = metadata.nameserverState;
    if (!isRecord(state)) return [];
    const values = state.nameservers;
    if (!Array.isArray(values)) return [];
    return values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => normalizeNameserver(value))
        .filter(Boolean);
}

// POST /api/domains/[id]/nameservers
export async function POST(request: NextRequest, { params }: RouteParams) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Bad Request', message: 'Invalid JSON in request body' },
            { status: 400 },
        );
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const limiter = parsed.data.dryRun ? nameserverPreflightLimiter : nameserverMutationLimiter;
    const rateResult = limiter(`${user.id}:${getClientIp(request)}`);
    if (!rateResult.allowed) {
        return NextResponse.json(
            {
                error: parsed.data.dryRun
                    ? 'Too many nameserver preflight checks. Please retry shortly.'
                    : 'Too many nameserver updates. Please retry shortly.',
            },
            {
                status: 429,
                headers: rateResult.headers,
            },
        );
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const [domainRow] = await db.select({
            id: domains.id,
            domain: domains.domain,
            registrar: domains.registrar,
            profileId: domainRegistrarProfiles.id,
            profileMetadata: domainRegistrarProfiles.metadata,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domainRow) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        if (domainRow.registrar !== 'godaddy') {
            return NextResponse.json(
                { error: `Automated nameserver cutover is currently supported only for GoDaddy domains (found: ${domainRow.registrar}).` },
                { status: 400 },
            );
        }

        let nameservers: string[];
        let nameserverSource: 'request' | 'cloudflare_zone_lookup';
        let zoneId: string | null = null;
        let zoneName: string | null = null;

        if (parsed.data.nameservers && parsed.data.nameservers.length > 0) {
            try {
                nameservers = resolveCloudflareNameservers(parsed.data.nameservers);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Invalid nameserver configuration';
                return NextResponse.json({ error: message }, { status: 400 });
            }
            nameserverSource = 'request';
        } else {
            const zone = await getZoneNameservers(domainRow.domain);
            if (!zone) {
                return NextResponse.json(
                    { error: `Unable to resolve Cloudflare nameservers for ${domainRow.domain}. Add the zone in Cloudflare first or provide nameservers explicitly.` },
                    { status: 400 },
                );
            }
            nameservers = zone.nameservers;
            nameserverSource = 'cloudflare_zone_lookup';
            zoneId = zone.zoneId;
            zoneName = zone.zoneName;
        }

        const previousMetadata = isRecord(domainRow.profileMetadata) ? domainRow.profileMetadata : {};
        const previousNameservers = extractPreviousNameservers(previousMetadata);

        if (parsed.data.dryRun) {
            return NextResponse.json({
                success: true,
                dryRun: true,
                domain: {
                    id: domainRow.id,
                    domain: domainRow.domain,
                    registrar: domainRow.registrar,
                },
                nameservers,
                source: nameserverSource,
                previousNameservers,
                ...(zoneId ? { zoneId } : {}),
                ...(zoneName ? { zoneName } : {}),
            });
        }

        try {
            await updateNameservers(domainRow.domain, nameservers);
        } catch (error) {
            return NextResponse.json(
                {
                    error: 'Failed to update nameservers at GoDaddy',
                    message: error instanceof Error ? error.message : 'Unknown registrar API error',
                },
                { status: 502 },
            );
        }

        const now = new Date();
        const nextMetadata: Record<string, unknown> = {
            ...previousMetadata,
            nameserverState: {
                provider: 'cloudflare',
                nameservers,
                source: nameserverSource,
                ...(zoneId ? { zoneId } : {}),
                ...(zoneName ? { zoneName } : {}),
                updatedAt: now.toISOString(),
                updatedBy: user.id,
            },
        };

        const reason = parsed.data.reason ?? 'Manual nameserver cutover to Cloudflare';

        const result = await db.transaction(async (tx) => {
            const [profile] = await tx.insert(domainRegistrarProfiles)
                .values({
                    domainId: id,
                    metadata: nextMetadata,
                    lastSyncedAt: now,
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: domainRegistrarProfiles.domainId,
                    set: {
                        metadata: nextMetadata,
                        lastSyncedAt: now,
                        updatedAt: now,
                    },
                })
                .returning({
                    id: domainRegistrarProfiles.id,
                    updatedAt: domainRegistrarProfiles.updatedAt,
                });

            const [event] = await tx.insert(domainOwnershipEvents)
                .values({
                    domainId: id,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
                    actorId: user.id,
                    eventType: 'ownership_changed',
                    source: 'manual',
                    summary: `Nameservers switched to Cloudflare (${nameservers.join(', ')})`,
                    previousState: {
                        nameservers: previousNameservers,
                    },
                    nextState: {
                        provider: 'cloudflare',
                        nameservers,
                    },
                    reason,
                    metadata: {
                        action: 'nameserver_cutover',
                        registrar: domainRow.registrar,
                        source: nameserverSource,
                        ...(zoneId ? { zoneId } : {}),
                        ...(zoneName ? { zoneName } : {}),
                    },
                    createdAt: now,
                })
                .returning({
                    id: domainOwnershipEvents.id,
                    createdAt: domainOwnershipEvents.createdAt,
                    summary: domainOwnershipEvents.summary,
                });

            return {
                profile: profile ?? null,
                event: event ?? null,
            };
        });

        return NextResponse.json({
            success: true,
            domain: {
                id: domainRow.id,
                domain: domainRow.domain,
                registrar: domainRow.registrar,
            },
            nameservers,
            source: nameserverSource,
            ...(zoneId ? { zoneId } : {}),
            ...(zoneName ? { zoneName } : {}),
            profile: result.profile,
            event: result.event,
        });
    } catch (error) {
        console.error('Failed to switch nameservers:', error);
        return NextResponse.json(
            { error: 'Failed to switch nameservers' },
            { status: 500 },
        );
    }
}
