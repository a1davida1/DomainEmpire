import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, contentQueue, promotionCampaigns, promotionJobs, reviewTasks } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { enqueueContentJob } from '@/lib/queue/content-queue';

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
            channels: promotionCampaigns.channels,
        })
            .from(promotionCampaigns)
            .where(eq(promotionCampaigns.id, id))
            .limit(1);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const force = parsedBody.data.force ?? false;
        if (!force && (campaign.status === 'cancelled' || campaign.status === 'completed')) {
            return NextResponse.json({
                error: `Campaign is ${campaign.status} and cannot be launched`,
            }, { status: 409 });
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

        const existingQueueRows = await db.select({
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
            return NextResponse.json({
                queued: true,
                deduped: true,
                jobId: existingQueueRows[0].id,
            }, { status: 202 });
        }

        const promotionJobPayload = {
            launchedBy: user.id,
            force,
            metadata: parsedBody.data.metadata ?? {},
            requestedAt: new Date().toISOString(),
        };

        const [promotionJob] = await db.insert(promotionJobs).values({
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
        });

        await db.update(promotionJobs).set({
            payload: {
                ...promotionJobPayload,
                contentQueueJobId: queueJobId,
            },
        }).where(eq(promotionJobs.id, promotionJob.id));

        return NextResponse.json({
            queued: true,
            deduped: false,
            jobId: queueJobId,
            promotionJobId: promotionJob.id,
        }, { status: 202 });
    } catch (error) {
        console.error('Failed to launch growth campaign:', error);
        return NextResponse.json(
            { error: 'Failed to launch growth campaign' },
            { status: 500 },
        );
    }
}
