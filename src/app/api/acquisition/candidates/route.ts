import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { db, acquisitionEvents, contentQueue, domainResearch } from '@/lib/db';
import { enqueueContentJob } from '@/lib/queue/content-queue';

const listingSchema = z.object({
    domain: z.string().min(3).max(253),
    tld: z.string().max(20).optional(),
    listingSource: z.string().max(100).optional(),
    listingId: z.string().max(255).optional(),
    listingType: z.string().max(50).optional(),
    currentBid: z.number().min(0).optional(),
    buyNowPrice: z.number().min(0).optional(),
    auctionEndsAt: z.string().datetime().optional(),
    acquisitionCost: z.number().min(0).optional(),
    niche: z.string().max(100).optional(),
});

const ingestSchema = z.object({
    source: z.string().max(100).optional(),
    quickMode: z.boolean().optional(),
    forceRefresh: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    listings: z.array(listingSchema).min(1).max(500).optional(),
    domain: z.string().min(3).max(253).optional(),
    tld: z.string().max(20).optional(),
    listingSource: z.string().max(100).optional(),
    listingId: z.string().max(255).optional(),
    listingType: z.string().max(50).optional(),
    currentBid: z.number().min(0).optional(),
    buyNowPrice: z.number().min(0).optional(),
    auctionEndsAt: z.string().datetime().optional(),
    acquisitionCost: z.number().min(0).optional(),
    niche: z.string().max(100).optional(),
}).refine((data) => Boolean(data.listings?.length) || Boolean(data.domain), {
    message: 'Provide either listings[] or a single domain payload',
    path: ['listings'],
});

const decisionEnum = z.enum(['researching', 'buy', 'pass', 'watchlist', 'bought']);

function normalizeIngestPayload(body: z.infer<typeof ingestSchema>): Record<string, unknown> {
    const listings = body.listings && body.listings.length > 0
        ? body.listings
        : [{
            domain: body.domain!,
            tld: body.tld,
            listingSource: body.listingSource,
            listingId: body.listingId,
            listingType: body.listingType,
            currentBid: body.currentBid,
            buyNowPrice: body.buyNowPrice,
            auctionEndsAt: body.auctionEndsAt,
            acquisitionCost: body.acquisitionCost,
            niche: body.niche,
        }];

    return {
        source: body.source,
        quickMode: body.quickMode ?? false,
        forceRefresh: body.forceRefresh ?? false,
        listings,
    };
}

function parseBoolean(value: string | null): boolean {
    if (!value) return false;
    return value.toLowerCase() === 'true' || value === '1';
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = ingestSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = normalizeIngestPayload(parsed.data);
        const listingCount = Array.isArray(payload.listings) ? payload.listings.length : 0;
        const priority = parsed.data.priority ?? 3;

        const jobId = await enqueueContentJob({
            jobType: 'ingest_listings',
            payload,
            status: 'pending',
            priority,
        });

        return NextResponse.json({
            success: true,
            jobId,
            listingCount,
            priority,
        }, { status: 202 });
    } catch (error) {
        console.error('Failed to enqueue candidate ingestion:', error);
        return NextResponse.json(
            { error: 'Failed to enqueue candidate ingestion' },
            { status: 500 },
        );
    }
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const url = new URL(request.url);
        const limitParam = Number.parseInt(url.searchParams.get('limit') || '50', 10);
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 200)) : 50;
        const includeEvents = parseBoolean(url.searchParams.get('includeEvents'));
        const includeQueue = parseBoolean(url.searchParams.get('includeQueue'));
        const decisionRaw = url.searchParams.get('decision');
        const decision = decisionRaw ? decisionEnum.safeParse(decisionRaw) : null;

        if (decisionRaw && !decision?.success) {
            return NextResponse.json({ error: 'Invalid decision filter' }, { status: 400 });
        }

        let query = db
            .select()
            .from(domainResearch)
            .orderBy(desc(domainResearch.createdAt))
            .limit(limit);

        if (decision?.success) {
            query = db
                .select()
                .from(domainResearch)
                .where(eq(domainResearch.decision, decision.data))
                .orderBy(desc(domainResearch.createdAt))
                .limit(limit);
        }

        const candidates = await query;
        if (candidates.length === 0) {
            return NextResponse.json({ candidates: [] });
        }

        const ids = candidates.map((candidate) => candidate.id);

        let eventsByResearchId: Record<string, Array<typeof acquisitionEvents.$inferSelect>> = {};
        if (includeEvents) {
            const events = await db
                .select()
                .from(acquisitionEvents)
                .where(inArray(acquisitionEvents.domainResearchId, ids))
                .orderBy(desc(acquisitionEvents.createdAt));

            eventsByResearchId = events.reduce<Record<string, Array<typeof acquisitionEvents.$inferSelect>>>((acc, event) => {
                const list = acc[event.domainResearchId] || [];
                list.push(event);
                acc[event.domainResearchId] = list;
                return acc;
            }, {});
        }

        let queueByResearchId: Record<string, string[]> = {};
        if (includeQueue) {
            const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
            const queueRows = await db
                .select({
                    jobType: contentQueue.jobType,
                    payload: contentQueue.payload,
                })
                .from(contentQueue)
                .where(and(
                    inArray(contentQueue.jobType, ['ingest_listings', 'enrich_candidate', 'score_candidate', 'create_bid_plan']),
                    inArray(contentQueue.status, ['pending', 'processing']),
                    sql`${contentQueue.payload} ->> 'domainResearchId' IN (${idList})`,
                ));

            queueByResearchId = queueRows.reduce<Record<string, string[]>>((acc, row) => {
                const payload = row.payload as Record<string, unknown> | null;
                const researchId = typeof payload?.domainResearchId === 'string' ? payload.domainResearchId : null;
                if (!researchId) {
                    return acc;
                }
                const list = acc[researchId] || [];
                list.push(row.jobType);
                acc[researchId] = [...new Set(list)];
                return acc;
            }, {});
        }

        return NextResponse.json({
            candidates: candidates.map((candidate) => ({
                ...candidate,
                events: includeEvents ? (eventsByResearchId[candidate.id] || []) : undefined,
                pendingStages: includeQueue ? (queueByResearchId[candidate.id] || []) : undefined,
            })),
        });
    } catch (error) {
        console.error('Failed to fetch acquisition candidates:', error);
        return NextResponse.json(
            { error: 'Failed to fetch acquisition candidates' },
            { status: 500 },
        );
    }
}
