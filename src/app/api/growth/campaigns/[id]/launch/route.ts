import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, contentQueue, domainResearch, promotionCampaigns, promotionJobs, reviewTasks } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
    emitGrowthLaunchFreezeIncident,
    evaluateGrowthLaunchFreeze,
    shouldBlockGrowthLaunchForScope,
} from '@/lib/growth/launch-freeze';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';

const launchBodySchema = z.object({
    priority: z.number().int().min(0).max(100).optional(),
    force: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
        return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 });
    }

    try {
        let body: unknown = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const parsedBody = launchBodySchema.safeParse(body);
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsedBody.error.issues },
                { status: 400 },
            );
        }

        const [campaign] = await db.select({
            id: promotionCampaigns.id,
            status: promotionCampaigns.status,
            domainResearchId: promotionCampaigns.domainResearchId,
            domainId: domainResearch.domainId,
            channels: promotionCampaigns.channels,
            metrics: promotionCampaigns.metrics,
        })
            .from(promotionCampaigns)
            .leftJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
            .where(eq(promotionCampaigns.id, id))
            .limit(1);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const campaignOwner = (campaign.metrics as Record<string, unknown> | null)?.createdBy;
        if (campaignOwner && campaignOwner !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const force = parsedBody.data.force ?? false;
        if (!force && (campaign.status === 'cancelled' || campaign.status === 'completed')) {
            return NextResponse.json({
                error: `Campaign is ${campaign.status} and cannot be launched`,
            }, { status: 409 });
        }

        if (!force) {
            const campaignMetrics = campaign.metrics as Record<string, unknown> | null;
            const campaignChannels = Array.isArray(campaign.channels)
                ? campaign.channels
                    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
                    .filter((value): value is 'pinterest' | 'youtube_shorts' => (
                        value === 'pinterest' || value === 'youtube_shorts'
                    ))
                : [];
            const campaignAction = typeof campaignMetrics?.action === 'string'
                ? campaignMetrics.action
                : null;
            const launchFreeze = await evaluateGrowthLaunchFreeze();
            if (shouldBlockGrowthLaunchForScope({
                state: launchFreeze,
                scope: {
                    channels: campaignChannels,
                    action: campaignAction,
                },
            })) {
                await emitGrowthLaunchFreezeIncident({
                    state: launchFreeze,
                    actorUserId: user.id,
                    context: 'campaign_launch_api',
                    campaignId: id,
                });
                return NextResponse.json({
                    error: 'Campaign launch is temporarily frozen due to SLO error-budget burn',
                    freeze: {
                        level: launchFreeze.level,
                        rawActive: launchFreeze.rawActive,
                        recoveryHoldActive: launchFreeze.recoveryHoldActive,
                        recoveryHealthyWindows: launchFreeze.recoveryHealthyWindows,
                        recoveryHealthyWindowsRequired: launchFreeze.recoveryHealthyWindowsRequired,
                        reasonCodes: launchFreeze.reasonCodes,
                        windowHours: launchFreeze.windowSummaries.map((summary) => summary.windowHours),
                    },
                }, { status: 409 });
            }
        }

        const previewGateEnabled = isFeatureEnabled('preview_gate_v1', { userId: user.id });
        if (previewGateEnabled && !force) {
            const [approvedReviewTask] = await db.select({
                id: reviewTasks.id,
            })
                .from(reviewTasks)
                .where(and(
                    eq(reviewTasks.taskType, 'campaign_launch'),
                    eq(reviewTasks.entityId, id),
                    eq(reviewTasks.status, 'approved'),
                ))
                .orderBy(desc(reviewTasks.reviewedAt))
                .limit(1);

            if (!approvedReviewTask) {
                const [pendingReviewTask] = await db.select({
                    id: reviewTasks.id,
                })
                    .from(reviewTasks)
                    .where(and(
                        eq(reviewTasks.taskType, 'campaign_launch'),
                        eq(reviewTasks.entityId, id),
                        eq(reviewTasks.status, 'pending'),
                    ))
                    .orderBy(desc(reviewTasks.createdAt))
                    .limit(1);

                let reviewTaskId = pendingReviewTask?.id ?? null;
                if (!reviewTaskId) {
                    const [createdReviewTask] = await db.insert(reviewTasks).values({
                        taskType: 'campaign_launch',
                        entityId: id,
                        domainResearchId: campaign.domainResearchId ?? null,
                        checklistJson: {
                            campaignId: id,
                            channels: campaign.channels,
                            requestedBy: user.id,
                        },
                        status: 'pending',
                        reviewNotes: 'Awaiting reviewer approval before campaign launch',
                        createdBy: user.id,
                    }).returning({ id: reviewTasks.id });
                    reviewTaskId = createdReviewTask?.id ?? null;
                }

                return NextResponse.json({
                    error: 'Campaign launch blocked: campaign_launch review task is not approved',
                    reviewTaskId,
                }, { status: 403 });
            }
        }

        const promotionJobPayload = {
            launchedBy: user.id,
            force,
            metadata: parsedBody.data.metadata ?? {},
            requestedAt: new Date().toISOString(),
        };

        const txResult = await db.transaction(async (tx) => {
            // Advisory lock keyed on campaign id to prevent TOCTOU races
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);

            const existingQueueRows = await tx.select({
                id: contentQueue.id,
            })
                .from(contentQueue)
                .where(and(
                    eq(contentQueue.jobType, 'create_promotion_plan'),
                    inArray(contentQueue.status, ['pending', 'processing']),
                    sql`${contentQueue.payload} ->> 'campaignId' = ${id}`,
                ))
                .limit(1);

            if (existingQueueRows.length > 0) {
                return {
                    deduped: true as const,
                    jobId: existingQueueRows[0].id,
                    promotionJobId: null as string | null,
                };
            }

            const [promotionJob] = await tx.insert(promotionJobs).values({
                campaignId: id,
                jobType: 'create_promotion_plan',
                status: 'pending',
                payload: promotionJobPayload,
            }).returning({ id: promotionJobs.id });

            if (!promotionJob) {
                throw new Error('Failed to create launch promotion job');
            }

            const queuePayload = {
                campaignId: id,
                promotionJobId: promotionJob.id,
                launchedBy: user.id,
                force,
                metadata: parsedBody.data.metadata ?? {},
            };

            const queueJobId = await enqueueContentJob({
                jobType: 'create_promotion_plan',
                status: 'pending',
                priority: parsedBody.data.priority ?? 3,
                payload: queuePayload,
            }, tx);

            await tx.update(promotionJobs).set({
                payload: {
                    ...promotionJobPayload,
                    contentQueueJobId: queueJobId,
                },
            }).where(eq(promotionJobs.id, promotionJob.id));

            return {
                deduped: false as const,
                jobId: queueJobId,
                promotionJobId: promotionJob.id as string | null,
            };
        });

        const campaignMetrics = campaign.metrics as Record<string, unknown> | null;
        const campaignDomainId = campaign.domainId
            ?? (typeof campaignMetrics?.domainId === 'string' ? campaignMetrics.domainId : null);
        if (campaignDomainId) {
            try {
                await advanceDomainLifecycleForAcquisition({
                    domainId: campaignDomainId,
                    targetState: 'growth',
                    actorId: user.id,
                    actorRole: user.role,
                    reason: 'Campaign launch queued',
                    metadata: {
                        source: 'growth_campaign_launch',
                        campaignId: id,
                        contentQueueJobId: txResult.jobId,
                        deduped: txResult.deduped,
                    },
                });
            } catch (lifecycleError) {
                console.error('Failed to auto-advance lifecycle to growth on campaign launch:', {
                    campaignId: id,
                    domainId: campaignDomainId,
                    error: lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError),
                });
            }
        }

        return NextResponse.json({
            queued: true,
            deduped: txResult.deduped,
            jobId: txResult.jobId,
            ...(txResult.promotionJobId ? { promotionJobId: txResult.promotionJobId } : {}),
        }, { status: 202 });
    } catch (error) {
        console.error('Failed to launch growth campaign:', error);
        return NextResponse.json(
            { error: 'Failed to launch growth campaign' },
            { status: 500 },
        );
    }
}
