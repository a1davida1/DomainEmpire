import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, acquisitionEvents, contentQueue, domainResearch, reviewTasks } from '@/lib/db';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';
import { requeueContentJobIds } from '@/lib/queue/content-queue';

const decisionSchema = z.object({
    decision: z.enum(['buy', 'watchlist', 'pass']),
    decisionReason: z.string().min(8).max(500),
    recommendedMaxBid: z.number().min(0).max(25000).optional(),
    clearHardFail: z.boolean().optional(),
});

type DecisionDbClient = Pick<typeof db, 'select' | 'update' | 'insert' | 'execute'>;

async function queueBidPlanIfMissing(
    domainResearchId: string,
    domain: string,
    createdBy: string,
    tx: DecisionDbClient,
): Promise<string | null> {
    // Advisory lock scoped to transaction prevents TOCTOU race where
    // concurrent callers both see no existing job and enqueue duplicates.
    // Belt-and-suspenders: partial unique index uq_queue_active_bid_plan
    // added in migration 0031 catches any remaining edge cases.
    await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`bid_plan:${domainResearchId}`}))`,
    );

    const existing = await tx
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(and(
            eq(contentQueue.jobType, 'create_bid_plan'),
            inArray(contentQueue.status, ['pending', 'processing']),
            sql`${contentQueue.payload} ->> 'domainResearchId' = ${domainResearchId}`,
        ))
        .limit(1);

    if (existing.length > 0) {
        return null;
    }

    const jobId = randomUUID();
    await tx.insert(contentQueue).values({
        id: jobId,
        jobType: 'create_bid_plan',
        payload: {
            domainResearchId,
            domain,
            createdBy,
            manualDecision: true,
        },
        status: 'pending',
        priority: 4,
        scheduledFor: new Date(),
        maxAttempts: 3,
    });

    return jobId;
}

async function syncDomainBuyReviewTaskDecision(opts: {
    domainResearchId: string;
    domainId: string | null;
    decision: 'buy' | 'watchlist' | 'pass';
    decisionReason: string;
    recommendedMaxBid: number | null;
    reviewerId: string;
}, client: DecisionDbClient = db): Promise<'approved' | 'rejected'> {
    const targetStatus: 'approved' | 'rejected' = opts.decision === 'buy' ? 'approved' : 'rejected';
    const checklistJson: Record<string, unknown> = {
        decision: opts.decision,
        decisionReason: opts.decisionReason,
        recommendedMaxBid: opts.recommendedMaxBid,
        underwritingVersion: 'acquisition_underwriting_v1',
        updatedAt: new Date().toISOString(),
    };

    const existing = await client
        .select({
            id: reviewTasks.id,
        })
        .from(reviewTasks)
        .where(and(
            eq(reviewTasks.taskType, 'domain_buy'),
            eq(reviewTasks.domainResearchId, opts.domainResearchId),
        ))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(1);

    if (existing.length === 0) {
        await client.insert(reviewTasks).values({
            taskType: 'domain_buy',
            entityId: opts.domainResearchId,
            domainId: opts.domainId,
            domainResearchId: opts.domainResearchId,
            status: targetStatus,
            checklistJson,
            reviewerId: opts.reviewerId,
            reviewedAt: new Date(),
            reviewNotes: opts.decisionReason,
            createdBy: opts.reviewerId,
        });
        return targetStatus;
    }

    await client.update(reviewTasks).set({
        status: targetStatus,
        checklistJson,
        reviewerId: opts.reviewerId,
        reviewedAt: new Date(),
        reviewNotes: opts.decisionReason,
        updatedAt: new Date(),
    }).where(eq(reviewTasks.id, existing[0].id));

    return targetStatus;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;
    const user = getRequestUser(request);

    const { id } = await params;

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const parsed = decisionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const researchRows = await db
            .select({
                id: domainResearch.id,
                domain: domainResearch.domain,
                domainId: domainResearch.domainId,
                decision: domainResearch.decision,
                hardFailReason: domainResearch.hardFailReason,
                recommendedMaxBid: domainResearch.recommendedMaxBid,
            })
            .from(domainResearch)
            .where(eq(domainResearch.id, id))
            .limit(1);
        const research = researchRows[0];

        if (!research) {
            return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
        }

        const wantsClearHardFail = parsed.data.clearHardFail === true;
        const isAdmin = user.role === 'admin';
        if (wantsClearHardFail && !isAdmin) {
            return NextResponse.json(
                { error: 'Only admins can clear hard-fail flags' },
                { status: 403 },
            );
        }

        if (parsed.data.decision === 'buy' && research.hardFailReason && !wantsClearHardFail) {
            return NextResponse.json({
                error: 'Cannot set decision to buy while hard-fail reason exists',
                hardFailReason: research.hardFailReason,
            }, { status: 403 });
        }

        const effectiveMaxBid = parsed.data.recommendedMaxBid
            ?? (typeof research.recommendedMaxBid === 'number' ? research.recommendedMaxBid : null);
        if (parsed.data.decision === 'buy' && (!effectiveMaxBid || effectiveMaxBid <= 0)) {
            return NextResponse.json({
                error: 'Buying decision requires a positive recommendedMaxBid',
            }, { status: 400 });
        }

        const eventTypeMap = {
            buy: 'approved',
            watchlist: 'watchlist',
            pass: 'passed',
        } as const;

        let reviewTaskStatus: 'approved' | 'rejected' = 'rejected';
        let bidPlanJobId: string | null = null;

        await db.transaction(async (tx) => {
            await tx.update(domainResearch).set({
                decision: parsed.data.decision,
                decisionReason: parsed.data.decisionReason,
                recommendedMaxBid: typeof effectiveMaxBid === 'number' ? effectiveMaxBid : null,
                hardFailReason: wantsClearHardFail ? null : research.hardFailReason,
            }).where(eq(domainResearch.id, research.id));

            if (parsed.data.decision === 'buy' && research.domainId) {
                await advanceDomainLifecycleForAcquisition({
                    domainId: research.domainId,
                    targetState: 'approved',
                    actorId: user.id,
                    actorRole: user.role,
                    reason: parsed.data.decisionReason,
                    metadata: {
                        source: 'acquisition_candidates_decision',
                        domainResearchId: research.id,
                    },
                }, tx);
            }

            await tx.insert(acquisitionEvents).values({
                domainResearchId: research.id,
                eventType: eventTypeMap[parsed.data.decision],
                createdBy: user.id,
                payload: {
                    domain: research.domain,
                    previousDecision: research.decision,
                    decision: parsed.data.decision,
                    decisionReason: parsed.data.decisionReason,
                    recommendedMaxBid: typeof effectiveMaxBid === 'number' ? effectiveMaxBid : null,
                    clearedHardFail: wantsClearHardFail,
                    actorRole: user.role,
                    manualDecision: true,
                },
            });

            reviewTaskStatus = await syncDomainBuyReviewTaskDecision({
                domainResearchId: research.id,
                domainId: research.domainId ?? null,
                decision: parsed.data.decision,
                decisionReason: parsed.data.decisionReason,
                recommendedMaxBid: typeof effectiveMaxBid === 'number' ? effectiveMaxBid : null,
                reviewerId: user.id,
            }, tx);

            if (parsed.data.decision === 'buy') {
                bidPlanJobId = await queueBidPlanIfMissing(
                    research.id, research.domain, user.id, tx,
                );
            }
        });

        // Notify queue backend after transaction commits (job is durable in DB).
        if (bidPlanJobId) {
            try {
                await requeueContentJobIds([bidPlanJobId]);
            } catch (requeueError) {
                console.error('Bid plan job persisted but requeue notification failed:', {
                    jobId: bidPlanJobId,
                    domainResearchId: research.id,
                    error: requeueError instanceof Error ? requeueError.message : String(requeueError),
                });
            }
        }

        return NextResponse.json({
            success: true,
            id: research.id,
            domain: research.domain,
            decision: parsed.data.decision,
            decisionReason: parsed.data.decisionReason,
            recommendedMaxBid: typeof effectiveMaxBid === 'number' ? effectiveMaxBid : null,
            bidPlanQueued: bidPlanJobId !== null,
            reviewTaskStatus,
        });
    } catch (error) {
        console.error('Failed to set acquisition decision:', error);
        return NextResponse.json(
            { error: 'Failed to set acquisition decision' },
            { status: 500 },
        );
    }
}
