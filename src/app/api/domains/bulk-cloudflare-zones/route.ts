import { NextRequest, NextResponse } from 'next/server';
import { and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { createZone, getZoneNameservers } from '@/lib/deploy/cloudflare';

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
    zoneId?: string;
    zoneName?: string;
    nameservers?: string[];
    status?: string;
};

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
            const existingZone = await getZoneNameservers(row.domain);
            if (existingZone) {
                existing.push({
                    domainId: row.id,
                    domain: row.domain,
                    zoneId: existingZone.zoneId,
                    zoneName: existingZone.zoneName,
                    nameservers: existingZone.nameservers,
                    status: 'existing',
                });
                continue;
            }

            const createdZone = await createZone(row.domain, {
                jumpStart: parsed.data.jumpStart,
            });

            if (!createdZone.success) {
                failed.push({
                    domainId: row.id,
                    domain: row.domain,
                    error: createdZone.error || `Failed to create Cloudflare zone for ${row.domain}`,
                });
                continue;
            }

            if (createdZone.alreadyExists) {
                existing.push({
                    domainId: row.id,
                    domain: row.domain,
                    zoneId: createdZone.zoneId,
                    zoneName: createdZone.zoneName,
                    nameservers: createdZone.nameservers,
                    status: createdZone.status ?? 'existing',
                });
                continue;
            }

            created.push({
                domainId: row.id,
                domain: row.domain,
                zoneId: createdZone.zoneId,
                zoneName: createdZone.zoneName,
                nameservers: createdZone.nameservers,
                status: createdZone.status ?? 'created',
            });
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

