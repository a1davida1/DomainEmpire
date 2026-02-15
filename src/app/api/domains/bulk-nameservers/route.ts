import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domainOwnershipEvents, domainRegistrarProfiles, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { updateNameservers } from '@/lib/deploy/godaddy';
import { getZoneNameservers } from '@/lib/deploy/cloudflare';

const bulkNameserverMutationLimiter = createRateLimiter('domain_bulk_nameserver_mutation', {
    maxRequests: 8,
    windowMs: 60 * 1000,
});

const bulkNameserverPreflightLimiter = createRateLimiter('domain_bulk_nameserver_preflight', {
    maxRequests: 40,
    windowMs: 60 * 1000,
});

const hostnameRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/i;

const bulkNameserverSchema = z.object({
    domainIds: z.array(z.string().uuid()).min(1).max(50),
    nameservers: z.array(z.string().trim().min(3).max(255)).min(2).max(8).optional(),
    reason: z.string().trim().min(8).max(1000).nullable().optional(),
    dryRun: z.boolean().default(false),
});

type BulkNameserverFailureCode =
    | 'missing_cloudflare_zone'
    | 'nameserver_update_failed';

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

// POST /api/domains/bulk-nameservers
export async function POST(request: NextRequest) {
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

    const parsed = bulkNameserverSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const limiter = parsed.data.dryRun
        ? bulkNameserverPreflightLimiter
        : bulkNameserverMutationLimiter;
    const rateResult = limiter(`${user.id}:${getClientIp(request)}`);
    if (!rateResult.allowed) {
        return NextResponse.json(
            {
                error: parsed.data.dryRun
                    ? 'Too many bulk nameserver preflight checks. Please retry shortly.'
                    : 'Too many bulk nameserver updates. Please retry shortly.',
            },
            {
                status: 429,
                headers: rateResult.headers,
            },
        );
    }

    let providedNameservers: string[] | null = null;
    if (parsed.data.nameservers && parsed.data.nameservers.length > 0) {
        try {
            providedNameservers = resolveCloudflareNameservers(parsed.data.nameservers);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid nameserver configuration';
            return NextResponse.json({ error: message }, { status: 400 });
        }
    }

    const uniqueDomainIds = [...new Set(parsed.data.domainIds)];
    const rows = await db.select({
        id: domains.id,
        domain: domains.domain,
        registrar: domains.registrar,
        profileId: domainRegistrarProfiles.id,
        profileMetadata: domainRegistrarProfiles.metadata,
    })
        .from(domains)
        .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
        .where(and(inArray(domains.id, uniqueDomainIds), notDeleted(domains)));

    if (rows.length !== uniqueDomainIds.length) {
        return NextResponse.json({ error: 'Some domains were not found' }, { status: 404 });
    }

    const failures: Array<{
        domainId: string;
        domain: string;
        error: string;
        code: BulkNameserverFailureCode;
    }> = [];
    const successes: Array<{ domainId: string; domain: string }> = [];
    const ready: Array<{
        domainId: string;
        domain: string;
        nameservers: string[];
        source: 'request' | 'cloudflare_zone_lookup';
        previousNameservers: string[];
        zoneId?: string;
        zoneName?: string;
    }> = [];
    const skipped: Array<{ domainId: string; domain: string; reason: string }> = [];
    const reason = parsed.data.reason ?? 'Manual bulk nameserver cutover to Cloudflare';

    for (const row of rows) {
        if (row.registrar !== 'godaddy') {
            skipped.push({
                domainId: row.id,
                domain: row.domain,
                reason: `Unsupported registrar for automated cutover: ${row.registrar}`,
            });
            continue;
        }

        try {
            let nameservers: string[];
            let nameserverSource: 'request' | 'cloudflare_zone_lookup';
            let zoneId: string | null = null;
            let zoneName: string | null = null;

            if (providedNameservers) {
                nameservers = providedNameservers;
                nameserverSource = 'request';
            } else {
                const zone = await getZoneNameservers(row.domain);
                if (!zone) {
                    failures.push({
                        domainId: row.id,
                        domain: row.domain,
                        error: `Unable to resolve Cloudflare nameservers for ${row.domain}. Add the zone in Cloudflare first or provide nameservers explicitly.`,
                        code: 'missing_cloudflare_zone',
                    });
                    continue;
                }
                nameservers = zone.nameservers;
                nameserverSource = 'cloudflare_zone_lookup';
                zoneId = zone.zoneId;
                zoneName = zone.zoneName;
            }

            const previousMetadata = isRecord(row.profileMetadata) ? row.profileMetadata : {};
            const previousNameservers = extractPreviousNameservers(previousMetadata);
            ready.push({
                domainId: row.id,
                domain: row.domain,
                nameservers,
                source: nameserverSource,
                previousNameservers,
                ...(zoneId ? { zoneId } : {}),
                ...(zoneName ? { zoneName } : {}),
            });

            if (parsed.data.dryRun) {
                continue;
            }

            const pendingAt = new Date();
            const pendingMetadata: Record<string, unknown> = {
                ...previousMetadata,
                nameserverState: {
                    provider: 'cloudflare',
                    nameservers,
                    source: nameserverSource,
                    ...(zoneId ? { zoneId } : {}),
                    ...(zoneName ? { zoneName } : {}),
                    pending: true,
                    pendingAt: pendingAt.toISOString(),
                    pendingBy: user.id,
                },
            };

            let profileIdForEvents: string | null = row.profileId ?? null;
            await db.transaction(async (tx) => {
                const [pendingProfile] = await tx.insert(domainRegistrarProfiles)
                    .values({
                        domainId: row.id,
                        metadata: pendingMetadata,
                        lastSyncedAt: pendingAt,
                        updatedAt: pendingAt,
                    })
                    .onConflictDoUpdate({
                        target: domainRegistrarProfiles.domainId,
                        set: {
                            metadata: pendingMetadata,
                            lastSyncedAt: pendingAt,
                            updatedAt: pendingAt,
                        },
                    })
                    .returning({
                        id: domainRegistrarProfiles.id,
                    });

                profileIdForEvents = pendingProfile?.id ?? profileIdForEvents;

                await tx.insert(domainOwnershipEvents)
                    .values({
                        domainId: row.id,
                        profileId: profileIdForEvents,
                        actorId: user.id,
                        eventType: 'ownership_changed',
                        source: 'manual',
                        summary: `Nameserver cutover pending to Cloudflare (${nameservers.join(', ')})`,
                        previousState: { nameservers: previousNameservers },
                        nextState: {
                            provider: 'cloudflare',
                            nameservers,
                            pending: true,
                        },
                        reason,
                        metadata: {
                            action: 'bulk_nameserver_cutover_pending',
                            registrar: row.registrar,
                            source: nameserverSource,
                            ...(zoneId ? { zoneId } : {}),
                            ...(zoneName ? { zoneName } : {}),
                        },
                        createdAt: pendingAt,
                    });
            });

            await updateNameservers(row.domain, nameservers);

            const now = new Date();
            const nextMetadata: Record<string, unknown> = {
                ...pendingMetadata,
                nameserverState: {
                    provider: 'cloudflare',
                    nameservers,
                    source: nameserverSource,
                    ...(zoneId ? { zoneId } : {}),
                    ...(zoneName ? { zoneName } : {}),
                    pending: false,
                    pendingAt: null,
                    pendingBy: null,
                    updatedAt: now.toISOString(),
                    updatedBy: user.id,
                },
            };

            await db.transaction(async (tx) => {
                const [profile] = await tx.insert(domainRegistrarProfiles)
                    .values({
                        domainId: row.id,
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
                    });

                await tx.insert(domainOwnershipEvents)
                    .values({
                        domainId: row.id,
                        profileId: profile?.id ?? profileIdForEvents,
                        actorId: user.id,
                        eventType: 'ownership_changed',
                        source: 'manual',
                        summary: `Nameservers switched to Cloudflare (${nameservers.join(', ')})`,
                        previousState: { nameservers: previousNameservers },
                        nextState: {
                            provider: 'cloudflare',
                            nameservers,
                        },
                        reason,
                        metadata: {
                            action: 'bulk_nameserver_cutover',
                            registrar: row.registrar,
                            source: nameserverSource,
                            ...(zoneId ? { zoneId } : {}),
                            ...(zoneName ? { zoneName } : {}),
                        },
                        createdAt: now,
                    });
            });

            successes.push({
                domainId: row.id,
                domain: row.domain,
            });
        } catch (error) {
            failures.push({
                domainId: row.id,
                domain: row.domain,
                error: error instanceof Error ? error.message : 'Unknown nameserver update error',
                code: 'nameserver_update_failed',
            });
        }
    }

    if (parsed.data.dryRun) {
        return NextResponse.json({
            success: failures.length === 0,
            dryRun: true,
            resolutionMode: providedNameservers ? 'request' : 'per_domain_cloudflare_lookup',
            ...(providedNameservers ? { nameservers: providedNameservers } : {}),
            readyCount: ready.length,
            failedCount: failures.length,
            skippedCount: skipped.length,
            ready,
            failures,
            skipped,
        });
    }

    return NextResponse.json({
        success: failures.length === 0,
        resolutionMode: providedNameservers ? 'request' : 'per_domain_cloudflare_lookup',
        ...(providedNameservers ? { nameservers: providedNameservers } : {}),
        successCount: successes.length,
        failedCount: failures.length,
        skippedCount: skipped.length,
        successes,
        failures,
        skipped,
    });
}
