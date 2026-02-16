import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domainOwnershipEvents, domainRegistrarProfiles, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { updateNameservers } from '@/lib/deploy/godaddy';
import { getZoneNameserverMap } from '@/lib/deploy/cloudflare';
import {
    recordCloudflareHostShardOutcome,
    resolveCloudflareHostShardPlan,
    type CloudflareHostShard,
} from '@/lib/deploy/host-sharding';

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

function normalizeDomain(value: string): string {
    return value.trim().toLowerCase();
}

function cloudflareShardLookupKey(shard: CloudflareHostShard): string {
    const accountId = shard.cloudflare.accountId?.trim() || 'default';
    const apiToken = shard.cloudflare.apiToken?.trim() || 'env';
    return `${accountId}::${apiToken}`;
}

function isValidNameserver(value: string): boolean {
    return hostnameRegex.test(value);
}

function isRateLimitedCloudflareError(message: string): boolean {
    const lowered = message.toLowerCase();
    return lowered.includes('429')
        || lowered.includes('rate limit')
        || lowered.includes('too many requests');
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
        cloudflareAccount: domains.cloudflareAccount,
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
        shardKey?: string;
        zoneId?: string;
        zoneName?: string;
    }> = [];
    const skipped: Array<{ domainId: string; domain: string; reason: string }> = [];
    const warnings: string[] = [];
    const reason = parsed.data.reason ?? 'Manual bulk nameserver cutover to Cloudflare';

    const shardPlanByDomainId = new Map<string, CloudflareHostShard[]>();
    await Promise.all(rows.map(async (row) => {
        const plan = await resolveCloudflareHostShardPlan({
            domain: row.domain,
            cloudflareAccount: row.cloudflareAccount ?? null,
            maxFallbacks: 3,
        });
        shardPlanByDomainId.set(row.id, plan.all);
    }));

    const zoneLookupByShardKey = new Map<string, Map<string, {
        zoneId: string;
        zoneName: string;
        nameservers: string[];
    }>>();
    if (!providedNameservers) {
        const grouped = new Map<string, {
            shard: CloudflareHostShard;
            domains: string[];
        }>();

        for (const row of rows) {
            const shardPlan = shardPlanByDomainId.get(row.id) || [];
            for (const shard of shardPlan) {
                const key = cloudflareShardLookupKey(shard);
                const current = grouped.get(key);
                if (!current) {
                    grouped.set(key, {
                        shard,
                        domains: [normalizeDomain(row.domain)],
                    });
                    continue;
                }
                current.domains.push(normalizeDomain(row.domain));
            }
        }

        const lookupErrors: string[] = [];
        for (const [key, { shard, domains: groupedDomains }] of grouped.entries()) {
            try {
                const lookup = await getZoneNameserverMap(groupedDomains, shard.cloudflare);
                zoneLookupByShardKey.set(key, lookup);
                recordCloudflareHostShardOutcome({
                    shardKey: shard.shardKey,
                    accountId: shard.cloudflare.accountId ?? null,
                    sourceConnectionId: shard.connectionId ?? null,
                }, 'success');
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown Cloudflare zone lookup error';
                recordCloudflareHostShardOutcome(
                    {
                        shardKey: shard.shardKey,
                        accountId: shard.cloudflare.accountId ?? null,
                        sourceConnectionId: shard.connectionId ?? null,
                    },
                    isRateLimitedCloudflareError(message) ? 'rate_limited' : 'failure',
                );
                lookupErrors.push(`[${shard.shardKey}] ${message}`);
            }
        }

        if (zoneLookupByShardKey.size === 0 && grouped.size > 0) {
            return NextResponse.json(
                {
                    error: 'Cloudflare zone lookup failed. Please retry shortly.',
                    details: lookupErrors.join(' | '),
                },
                { status: 503 },
            );
        }

        if (lookupErrors.length > 0) {
            warnings.push(
                `Some Cloudflare shard lookups failed; continuing with available shard responses (${lookupErrors.slice(0, 2).join(' | ')}).`,
            );
        }
    }

    for (const row of rows) {
        const hostShardPlan = shardPlanByDomainId.get(row.id) || [];

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
                const normalizedDomain = normalizeDomain(row.domain);
                let zone: { zoneId: string; zoneName: string; nameservers: string[] } | null = null;
                let zoneShardKey: string | null = null;
                for (const shard of hostShardPlan) {
                    const lookupKey = cloudflareShardLookupKey(shard);
                    const shardLookup = zoneLookupByShardKey.get(lookupKey);
                    const matched = shardLookup?.get(normalizedDomain);
                    if (!matched) continue;
                    zone = matched;
                    zoneShardKey = shard.shardKey;
                    break;
                }

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
                if (zoneShardKey) {
                    // Prefer the shard that actually resolved the zone.
                    const matchedShard = hostShardPlan.find((shard) => shard.shardKey === zoneShardKey);
                    if (matchedShard) {
                        hostShardPlan.splice(hostShardPlan.indexOf(matchedShard), 1);
                        hostShardPlan.unshift(matchedShard);
                    }
                }
            }

            const previousMetadata = isRecord(row.profileMetadata) ? row.profileMetadata : {};
            const previousNameservers = extractPreviousNameservers(previousMetadata);
            ready.push({
                domainId: row.id,
                domain: row.domain,
                nameservers,
                source: nameserverSource,
                previousNameservers,
                ...(hostShardPlan[0] ? { shardKey: hostShardPlan[0].shardKey } : {}),
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
            ...(warnings.length > 0 ? { warnings } : {}),
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
        ...(warnings.length > 0 ? { warnings } : {}),
        successCount: successes.length,
        failedCount: failures.length,
        skippedCount: skipped.length,
        successes,
        failures,
        skipped,
    });
}
