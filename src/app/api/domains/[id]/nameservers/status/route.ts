import { resolveNs } from 'node:dns/promises';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { db, domainRegistrarProfiles, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { getZoneNameservers } from '@/lib/deploy/cloudflare';
import { isAutomatedNameserverRegistrar } from '@/lib/deploy/registrar';
import { resolveCloudflareHostShardPlan } from '@/lib/deploy/host-sharding';
import {
    classifyNameserverMatch,
    resolveNameserverOnboardingStatus,
    uniqueNameservers,
} from '@/lib/domain/nameserver-status';

const nameserverStatusReadLimiter = createRateLimiter('domain_nameserver_status_read', {
    maxRequests: 120,
    windowMs: 60 * 1000,
});

type RouteParams = {
    params: Promise<{ id: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractLastConfiguredNameservers(metadata: unknown): string[] {
    if (!isRecord(metadata)) return [];
    const nameserverState = metadata.nameserverState;
    if (!isRecord(nameserverState)) return [];
    const values = nameserverState.nameservers;
    if (!Array.isArray(values)) return [];
    return uniqueNameservers(values.filter((value): value is string => typeof value === 'string'));
}

function extractString(metadata: unknown, key: string): string | null {
    if (!isRecord(metadata)) return null;
    const value = metadata[key];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    const rate = nameserverStatusReadLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many nameserver status checks. Please retry shortly.' },
            { status: 429, headers: rate.headers },
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
            niche: domains.niche,
            registrar: domains.registrar,
            cloudflareAccount: domains.cloudflareAccount,
            profileMetadata: domainRegistrarProfiles.metadata,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domainRow) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const registrar = (domainRow.registrar || '').trim().toLowerCase();
        const registrarAutomated = isAutomatedNameserverRegistrar(registrar);
        const lastConfiguredNameservers = extractLastConfiguredNameservers(domainRow.profileMetadata);

        let shardWarnings: string[] = [];
        let zone: {
            zoneId: string;
            zoneName: string;
            nameservers: string[];
            shardKey: string;
        } | null = null;

        try {
            const shardPlan = await resolveCloudflareHostShardPlan({
                domain: domainRow.domain,
                cloudflareAccount: domainRow.cloudflareAccount ?? null,
                domainNiche: domainRow.niche ?? null,
                maxFallbacks: 3,
            });
            shardWarnings = [...new Set(shardPlan.primary.warnings)];
            for (const shard of shardPlan.all) {
                const resolved = await getZoneNameservers(domainRow.domain, shard.cloudflare);
                if (!resolved) continue;
                zone = {
                    zoneId: resolved.zoneId,
                    zoneName: resolved.zoneName,
                    nameservers: resolved.nameservers,
                    shardKey: shard.shardKey,
                };
                break;
            }
        } catch (error) {
            shardWarnings = [
                error instanceof Error ? error.message : 'Cloudflare shard resolution failed',
            ];
        }

        if (!zone) {
            const fallback = await getZoneNameservers(domainRow.domain);
            if (fallback) {
                zone = {
                    zoneId: fallback.zoneId,
                    zoneName: fallback.zoneName,
                    nameservers: fallback.nameservers,
                    shardKey: 'default',
                };
            }
        }

        let liveNameservers: string[] = [];
        let liveLookupError: string | null = null;
        try {
            liveNameservers = uniqueNameservers(await resolveNs(domainRow.domain));
        } catch (error) {
            liveLookupError = error instanceof Error ? error.message : 'Live DNS lookup failed';
        }

        const targetNameservers = zone?.nameservers ?? [];
        const liveMatch = classifyNameserverMatch(liveNameservers, targetNameservers);
        const status = resolveNameserverOnboardingStatus({
            registrarAutomated,
            cloudflareZoneAvailable: Boolean(zone),
            targetNameservers,
            lastConfiguredNameservers,
            liveMatch,
            liveLookupSucceeded: !liveLookupError,
        });

        const nameserverState = isRecord(domainRow.profileMetadata) && isRecord(domainRow.profileMetadata.nameserverState)
            ? domainRow.profileMetadata.nameserverState
            : null;

        return NextResponse.json({
            domain: {
                id: domainRow.id,
                domain: domainRow.domain,
                registrar: domainRow.registrar,
                cloudflareAccount: domainRow.cloudflareAccount,
            },
            zone: {
                exists: Boolean(zone),
                zoneId: zone?.zoneId ?? null,
                zoneName: zone?.zoneName ?? null,
                nameservers: zone?.nameservers ?? [],
                shardKey: zone?.shardKey ?? null,
                warnings: shardWarnings,
            },
            registrar: {
                automated: registrarAutomated,
                lastConfiguredNameservers,
                source: extractString(nameserverState, 'source'),
                lastUpdatedAt: extractString(nameserverState, 'updatedAt'),
            },
            liveDns: {
                nameservers: liveNameservers,
                checkedAt: new Date().toISOString(),
                lookupError: liveLookupError,
                matchToCloudflare: liveMatch,
            },
            status,
            actions: {
                canCreateZone: !zone,
                canSwitchNameservers: registrarAutomated && Boolean(zone),
            },
        }, { headers: rate.headers });
    } catch (error) {
        console.error('Failed to load nameserver status:', error);
        return NextResponse.json(
            { error: 'Failed to load nameserver status' },
            { status: 500, headers: rate.headers },
        );
    }
}
