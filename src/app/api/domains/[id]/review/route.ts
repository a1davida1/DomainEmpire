import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db, contentQueue, domains } from '@/lib/db';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { checkIdempotencyKey, storeIdempotencyResult } from '@/lib/api/idempotency';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

interface PageProps {
    params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const siteReviewLimiter = createRateLimiter('domain_site_review', {
    maxRequests: 6,
    windowMs: 60 * 1000,
});

// POST /api/domains/[id]/review — queue background site review job
export async function POST(request: NextRequest, { params }: PageProps) {
    const cached = await checkIdempotencyKey(request);
    if (cached) return cached;

    const authError = await requireAuth(request);
    if (authError) return authError;

    const actor = getRequestUser(request);
    const rate = siteReviewLimiter(`${actor.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Rate limit exceeded. Please wait and try again.' },
            { status: 429, headers: rate.headers },
        );
    }

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: 'Invalid domain ID format' }, { status: 400 });
    }

    try {
        const domainResult = await db
            .select({
                id: domains.id,
                domain: domains.domain,
            })
            .from(domains)
            .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
            .limit(1);

        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const existing = await db
            .select({
                id: contentQueue.id,
                status: contentQueue.status,
                createdAt: contentQueue.createdAt,
            })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.domainId, id),
                eq(contentQueue.jobType, 'domain_site_review'),
                inArray(contentQueue.status, ['pending', 'processing']),
            ))
            .orderBy(desc(contentQueue.createdAt))
            .limit(1);

        const jobId = existing[0]?.id ?? randomUUID();
        if (existing.length === 0) {
            await enqueueContentJob({
                id: jobId,
                domainId: id,
                jobType: 'domain_site_review',
                priority: 2,
                payload: {
                    domain: domainResult[0].domain,
                    requestedByUserId: actor.id,
                },
                status: 'pending',
                scheduledFor: new Date(),
                maxAttempts: 2,
            });
        }

        const response = NextResponse.json({
            success: true,
            domain: domainResult[0].domain,
            jobId,
            queued: existing.length === 0,
            message: existing.length === 0 ? 'Site review queued' : 'Site review already queued',
        }, { status: 202, headers: rate.headers });

        await storeIdempotencyResult(request, response);
        return response;
    } catch (error) {
        console.error('Domain site review failed:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to review site' },
            { status: 500 },
        );
    }
}

// GET /api/domains/[id]/review — get last review + in-progress job
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
        return NextResponse.json({ error: 'Invalid domain ID format' }, { status: 400 });
    }

    try {
        const domainResult = await db
            .select({
                id: domains.id,
                domain: domains.domain,
                lastReviewScore: domains.lastReviewScore,
                lastReviewedAt: domains.lastReviewedAt,
                lastReviewResult: domains.lastReviewResult,
            })
            .from(domains)
            .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
            .limit(1);

        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const activeJob = await db
            .select({
                id: contentQueue.id,
                status: contentQueue.status,
                createdAt: contentQueue.createdAt,
                startedAt: contentQueue.startedAt,
            })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.domainId, id),
                eq(contentQueue.jobType, 'domain_site_review'),
                inArray(contentQueue.status, ['pending', 'processing']),
            ))
            .orderBy(desc(contentQueue.createdAt))
            .limit(1);

        return NextResponse.json({
            domain: domainResult[0].domain,
            lastReviewScore: domainResult[0].lastReviewScore,
            lastReviewedAt: domainResult[0].lastReviewedAt,
            lastReviewResult: domainResult[0].lastReviewResult,
            activeJob: activeJob[0] || null,
        });
    } catch (error) {
        console.error('Get site review status failed:', error);
        return NextResponse.json({ error: 'Failed to get site review status' }, { status: 500 });
    }
}

