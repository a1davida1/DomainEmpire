import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { createZone, getZoneNameservers } from '@/lib/deploy/cloudflare';
import {
    recordCloudflareHostShardOutcome,
    resolveCloudflareHostShardPlan,
} from '@/lib/deploy/host-sharding';

const bulkZoneMutationLimiter = createRateLimiter('domain_bulk_cloudflare_zone_mutation', {
    maxRequests: 8,
    windowMs: 60 * 1000,
});

const bulkZoneSchema = z.object({
    domainIds: z.array(z.string().uuid()).min(1).max(50),
    jumpStart: z.boolean().default(false),
});

type ZoneResult = {
    domainId: string;
    domain: string;
    shardKey?: string;
    zoneId?: string;
    zoneName?: string;
    nameservers?: string[];
    status?: string;
};

function isRetryableCloudflareError(message: string): boolean {
    const lowered = message.toLowerCase();
    return lowered.includes('429')
        || lowered.includes('rate limit')
        || lowered.includes('too many requests')
        || lowered.includes('please wait')
        || lowered.includes('timeout')
        || lowered.includes('service unavailable')
        || lowered.includes('gateway');
}

function isRateLimitedCloudflareError(message: string): boolean {
    const lowered = message.toLowerCase();
    return lowered.includes('429')
        || lowered.includes('rate limit')
        || lowered.includes('too many requests');
}

// POST /api/domains/bulk-cloudflare-zones
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const mutationRate = bulkZoneMutationLimiter(`${user.id}:${getClientIp(request)}`);
    if (!mutationRate.allowed) {
        return NextResponse.json(
            { error: 'Too many bulk Cloudflare zone create requests. Please retry shortly.' },
            {
                status: 429,
                headers: mutationRate.headers,
            },
        );
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

    const parsed = bulkZoneSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const uniqueDomainIds = [...new Set(parsed.data.domainIds)];
    const rows = await db
        .select({
            id: domains.id,
            domain: domains.domain,
            niche: domains.niche,
            cloudflareAccount: domains.cloudflareAccount,
        })
        .from(domains)
        .where(and(inArray(domains.id, uniqueDomainIds), notDeleted(domains)));

    if (rows.length !== uniqueDomainIds.length) {
        return NextResponse.json({ error: 'Some domains were not found' }, { status: 404 });
    }

    const created: ZoneResult[] = [];
    const existing: ZoneResult[] = [];
    const failed: Array<{ domainId: string; domain: string; error: string }> = [];

    for (const row of rows) {
        try {
            const shardPlan = await resolveCloudflareHostShardPlan({
                domain: row.domain,
                cloudflareAccount: row.cloudflareAccount ?? null,
                domainNiche: row.niche ?? null,
                maxFallbacks: 3,
            });
            const shouldPersistShard = !row.cloudflareAccount || row.cloudflareAccount.trim().length === 0;
            const shardErrors: string[] = [];

            for (const shard of shardPlan.all) {
                const existingZone = await getZoneNameservers(row.domain, shard.cloudflare);
                if (!existingZone) continue;
                recordCloudflareHostShardOutcome({
                    shardKey: shard.shardKey,
                    accountId: shard.cloudflare.accountId ?? null,
                    sourceConnectionId: shard.connectionId ?? null,
                }, 'success');
                existing.push({
                    domainId: row.id,
                    domain: row.domain,
                    shardKey: shard.shardKey,
                    zoneId: existingZone.zoneId,
                    zoneName: existingZone.zoneName,
                    nameservers: existingZone.nameservers,
                    status: 'existing',
                });
                if (shouldPersistShard) {
                    await db.update(domains)
                        .set({
                            cloudflareAccount: shard.shardKey,
                            updatedAt: new Date(),
                        })
                        .where(eq(domains.id, row.id));
                }
                shardErrors.length = 0;
                break;
            }
            if (shardErrors.length === 0 && existing.some((item) => item.domainId === row.id)) {
                continue;
            }

            for (const shard of shardPlan.all) {
                const createdZone = await createZone(row.domain, {
                    jumpStart: parsed.data.jumpStart,
                }, shard.cloudflare);

                if (!createdZone.success) {
                    const message = createdZone.error || `Failed to create Cloudflare zone for ${row.domain}`;
                    shardErrors.push(`[${shard.shardKey}] ${message}`);
                    recordCloudflareHostShardOutcome(
                        {
                            shardKey: shard.shardKey,
                            accountId: shard.cloudflare.accountId ?? null,
                            sourceConnectionId: shard.connectionId ?? null,
                        },
                        isRateLimitedCloudflareError(message) ? 'rate_limited' : 'failure',
                    );
                    if (isRetryableCloudflareError(message)) {
                        continue;
                    }
                    break;
                }

                recordCloudflareHostShardOutcome({
                    shardKey: shard.shardKey,
                    accountId: shard.cloudflare.accountId ?? null,
                    sourceConnectionId: shard.connectionId ?? null,
                }, 'success');

                if (createdZone.alreadyExists) {
                    existing.push({
                        domainId: row.id,
                        domain: row.domain,
                        shardKey: shard.shardKey,
                        zoneId: createdZone.zoneId,
                        zoneName: createdZone.zoneName,
                        nameservers: createdZone.nameservers,
                        status: createdZone.status ?? 'existing',
                    });
                } else {
                    created.push({
                        domainId: row.id,
                        domain: row.domain,
                        shardKey: shard.shardKey,
                        zoneId: createdZone.zoneId,
                        zoneName: createdZone.zoneName,
                        nameservers: createdZone.nameservers,
                        status: createdZone.status ?? 'created',
                    });
                }
                if (shouldPersistShard) {
                    await db.update(domains)
                        .set({
                            cloudflareAccount: shard.shardKey,
                            updatedAt: new Date(),
                        })
                        .where(eq(domains.id, row.id));
                }

                shardErrors.length = 0;
                break;
            }

            if (shardErrors.length > 0) {
                failed.push({
                    domainId: row.id,
                    domain: row.domain,
                    error: shardErrors.join(' | '),
                });
            }
        } catch (error) {
            failed.push({
                domainId: row.id,
                domain: row.domain,
                error: error instanceof Error ? error.message : 'Unknown Cloudflare zone create error',
            });
        }
    }

    return NextResponse.json({
        success: failed.length === 0,
        requestedCount: uniqueDomainIds.length,
        createdCount: created.length,
        existingCount: existing.length,
        failedCount: failed.length,
        created,
        existing,
        failed,
    });
}
