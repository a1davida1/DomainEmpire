import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, acquisitionEvents, contentQueue, domainResearch, reviewTasks } from '@/lib/db';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';
import { requeueContentJobIds } from '@/lib/queue/content-queue';

const bulkDecisionSchema = z.object({
    candidateIds: z.array(z.string().uuid()).min(1).max(200),
    decision: z.enum(['buy', 'watchlist', 'pass']),
    decisionReason: z.string().min(8).max(500),
    recommendedMaxBid: z.number().min(0).max(25000).optional(),
    clearHardFail: z.boolean().optional(),
});

type DecisionDbClient = Pick<typeof db, 'select' | 'update' | 'insert' | 'execute'>;

type BulkDecisionResult = {
    id: string;
    domain: string | null;
    status: 'updated' | 'failed';
    reasonCode: string | null;
    reason: string | null;
    bidPlanQueued: boolean;
    reviewTaskStatus: 'approved' | 'rejected' | null;
};

async function queueBidPlanIfMissing(
    domainResearchId: string,
    domain: string,
    createdBy: string,
    tx: DecisionDbClient,
): Promise<string | null> {
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

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;
    const user = getRequestUser(request);

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const parsed = bulkDecisionSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const uniqueIds = [...new Set(parsed.data.candidateIds)];
        const wantsClearHardFail = parsed.data.clearHardFail === true;
        const isAdmin = user.role === 'admin';
        if (wantsClearHardFail && !isAdmin) {
            return NextResponse.json(
                { error: 'Only admins can clear hard-fail flags' },
                { status: 403 },
            );
        }

        const candidates = await db
            .select({
                id: domainResearch.id,
                domain: domainResearch.domain,
                domainId: domainResearch.domainId,
                decision: domainResearch.decision,
                hardFailReason: domainResearch.hardFailReason,
                recommendedMaxBid: domainResearch.recommendedMaxBid,
            })
            .from(domainResearch)
            .where(inArray(domainResearch.id, uniqueIds));

        const byId = new Map(candidates.map((row) => [row.id, row]));

        const failures = new Map<string, BulkDecisionResult>();
        const eligible: Array<{
            id: string;
            domain: string;
            domainId: string | null;
            previousDecision: string | null;
            effectiveMaxBid: number | null;
            hardFailReason: string | null;
        }> = [];

        for (const id of uniqueIds) {
            const candidate = byId.get(id);
            if (!candidate) {
                failures.set(id, {
                    id,
                    domain: null,
                    status: 'failed',
                    reasonCode: 'candidate_not_found',
                    reason: 'Candidate not found',
                    bidPlanQueued: false,
                    reviewTaskStatus: null,
                });
                continue;
            }

            if (parsed.data.decision === 'buy' && candidate.hardFailReason && !wantsClearHardFail) {
                failures.set(id, {
                    id,
                    domain: candidate.domain,
                    status: 'failed',
                    reasonCode: 'hard_fail_blocked',
                    reason: 'Cannot set decision to buy while hard-fail reason exists',
                    bidPlanQueued: false,
                    reviewTaskStatus: null,
                });
                continue;
            }

            const effectiveMaxBid = parsed.data.recommendedMaxBid
                ?? (typeof candidate.recommendedMaxBid === 'number' ? candidate.recommendedMaxBid : null);
            if (parsed.data.decision === 'buy' && (!effectiveMaxBid || effectiveMaxBid <= 0)) {
                failures.set(id, {
                    id,
                    domain: candidate.domain,
                    status: 'failed',
                    reasonCode: 'missing_max_bid',
                    reason: 'Buying decision requires a positive recommendedMaxBid',
                    bidPlanQueued: false,
                    reviewTaskStatus: null,
                });
                continue;
            }

            eligible.push({
                id: candidate.id,
                domain: candidate.domain,
                domainId: candidate.domainId ?? null,
                previousDecision: candidate.decision,
                effectiveMaxBid: typeof effectiveMaxBid === 'number' ? effectiveMaxBid : null,
                hardFailReason: candidate.hardFailReason,
            });
        }

        const updatedResults = new Map<string, BulkDecisionResult>();
        const bidPlanJobIds: string[] = [];
        const eventTypeMap = {
            buy: 'approved',
            watchlist: 'watchlist',
            pass: 'passed',
        } as const;

        await db.transaction(async (tx) => {
            for (const candidate of eligible) {
                await tx.update(domainResearch).set({
                    decision: parsed.data.decision,
                    decisionReason: parsed.data.decisionReason,
                    recommendedMaxBid: candidate.effectiveMaxBid,
                    hardFailReason: wantsClearHardFail ? null : candidate.hardFailReason,
                }).where(eq(domainResearch.id, candidate.id));

                if (parsed.data.decision === 'buy' && candidate.domainId) {
                    await advanceDomainLifecycleForAcquisition({
                        domainId: candidate.domainId,
                        targetState: 'approved',
                        actorId: user.id,
                        actorRole: user.role,
                        reason: parsed.data.decisionReason,
                        metadata: {
                            source: 'acquisition_candidates_bulk_decision',
                            domainResearchId: candidate.id,
                        },
                    }, tx);
                }

                await tx.insert(acquisitionEvents).values({
                    domainResearchId: candidate.id,
                    eventType: eventTypeMap[parsed.data.decision],
                    createdBy: user.id,
                    payload: {
                        domain: candidate.domain,
                        previousDecision: candidate.previousDecision,
                        decision: parsed.data.decision,
                        decisionReason: parsed.data.decisionReason,
                        recommendedMaxBid: candidate.effectiveMaxBid,
                        clearedHardFail: wantsClearHardFail,
                        actorRole: user.role,
                        bulkDecision: true,
                        manualDecision: true,
                    },
                });

                const reviewTaskStatus = await syncDomainBuyReviewTaskDecision({
                    domainResearchId: candidate.id,
                    domainId: candidate.domainId,
                    decision: parsed.data.decision,
                    decisionReason: parsed.data.decisionReason,
                    recommendedMaxBid: candidate.effectiveMaxBid,
                    reviewerId: user.id,
                }, tx);

                let bidPlanQueued = false;
                if (parsed.data.decision === 'buy') {
                    const bidPlanJobId = await queueBidPlanIfMissing(
                        candidate.id, candidate.domain, user.id, tx,
                    );
                    if (bidPlanJobId) {
                        bidPlanQueued = true;
                        bidPlanJobIds.push(bidPlanJobId);
                    }
                }

                updatedResults.set(candidate.id, {
                    id: candidate.id,
                    domain: candidate.domain,
                    status: 'updated',
                    reasonCode: null,
                    reason: null,
                    bidPlanQueued,
                    reviewTaskStatus,
                });
            }
        });

        if (bidPlanJobIds.length > 0) {
            try {
                await requeueContentJobIds(bidPlanJobIds);
            } catch (requeueError) {
                console.error('Bulk decision persisted but failed to notify queue backend:', {
                    jobCount: bidPlanJobIds.length,
                    error: requeueError instanceof Error ? requeueError.message : String(requeueError),
                });
            }
        }

        const results: BulkDecisionResult[] = uniqueIds.map((id) => (
            updatedResults.get(id)
            || failures.get(id)
            || {
                id,
                domain: byId.get(id)?.domain ?? null,
                status: 'failed',
                reasonCode: 'unknown',
                reason: 'Unknown processing state',
                bidPlanQueued: false,
                reviewTaskStatus: null,
            }
        ));

        const updated = results.filter((row) => row.status === 'updated').length;
        const failed = results.length - updated;

        return NextResponse.json({
            success: true,
            decision: parsed.data.decision,
            processed: results.length,
            updated,
            failed,
            bidPlanQueued: results.filter((row) => row.bidPlanQueued).length,
            results,
        });
    } catch (error) {
        console.error('Failed bulk acquisition decision:', error);
        return NextResponse.json(
            { error: 'Failed to apply bulk acquisition decision' },
            { status: 500 },
        );
    }
}
