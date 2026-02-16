import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
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

const zoneMutationLimiter = createRateLimiter('domain_cloudflare_zone_mutation', {
    maxRequests: 20,
    windowMs: 60 * 1000,
});

const createZoneSchema = z.object({
    jumpStart: z.boolean().default(false),
});

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

type RouteParams = {
    params: Promise<{ id: string }>;
};

// POST /api/domains/[id]/cloudflare-zone
export async function POST(request: NextRequest, { params }: RouteParams) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const rate = zoneMutationLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many Cloudflare zone create requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    const parsed = createZoneSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400, headers: rate.headers });
        }

        const [domainRow] = await db.select({
            id: domains.id,
            domain: domains.domain,
            cloudflareAccount: domains.cloudflareAccount,
        })
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domainRow) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404, headers: rate.headers });
        }

        const shardPlan = await resolveCloudflareHostShardPlan({
            domain: domainRow.domain,
            cloudflareAccount: domainRow.cloudflareAccount ?? null,
            maxFallbacks: 3,
        });

        for (const shard of shardPlan.all) {
            const existing = await getZoneNameservers(domainRow.domain, shard.cloudflare);
            if (!existing) continue;
            recordCloudflareHostShardOutcome({
                shardKey: shard.shardKey,
                accountId: shard.cloudflare.accountId ?? null,
                sourceConnectionId: shard.connectionId ?? null,
            }, 'success');
            return NextResponse.json({
                success: true,
                created: false,
                status: 'existing',
                domainId: domainRow.id,
                domain: domainRow.domain,
                shardKey: shard.shardKey,
                zoneId: existing.zoneId,
                zoneName: existing.zoneName,
                nameservers: existing.nameservers,
                warnings: shardPlan.primary.warnings,
            }, { headers: rate.headers });
        }

        const shardErrors: string[] = [];
        for (const shard of shardPlan.all) {
            const created = await createZone(domainRow.domain, {
                jumpStart: parsed.data.jumpStart,
            }, shard.cloudflare);

            if (!created.success) {
                const message = created.error || 'Failed to create Cloudflare zone';
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

            return NextResponse.json({
                success: true,
                created: !created.alreadyExists,
                status: created.status ?? (created.alreadyExists ? 'existing' : 'created'),
                domainId: domainRow.id,
                domain: domainRow.domain,
                shardKey: shard.shardKey,
                zoneId: created.zoneId ?? null,
                zoneName: created.zoneName ?? null,
                nameservers: created.nameservers ?? [],
                warnings: shardPlan.primary.warnings,
            }, { headers: rate.headers });
        }

        return NextResponse.json(
            {
                error: 'Failed to create Cloudflare zone',
                message: shardErrors.join(' | ') || 'Unknown Cloudflare zone create error',
            },
            { status: 502, headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to create Cloudflare zone:', error);
        return NextResponse.json(
            { error: 'Failed to create Cloudflare zone' },
            { status: 500, headers: rate.headers },
        );
    }
}
