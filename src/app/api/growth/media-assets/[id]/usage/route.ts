import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaAssets, mediaAssetUsage, promotionCampaigns, promotionJobs } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

const usageSchema = z.object({
    campaignId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
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
        return NextResponse.json({ error: 'Invalid asset id' }, { status: 400 });
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = usageSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const [asset] = await db.select({ id: mediaAssets.id, userId: mediaAssets.userId })
            .from(mediaAssets)
            .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
            .limit(1);
        if (!asset) {
            return NextResponse.json({ error: 'Media asset not found' }, { status: 404 });
        }
        if (asset.userId && asset.userId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const [campaign] = await db.select({ id: promotionCampaigns.id })
            .from(promotionCampaigns)
            .where(eq(promotionCampaigns.id, parsed.data.campaignId))
            .limit(1);
        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        if (parsed.data.jobId) {
            const [promotionJob] = await db.select({ id: promotionJobs.id })
                .from(promotionJobs)
                .where(and(
                    eq(promotionJobs.id, parsed.data.jobId),
                    eq(promotionJobs.campaignId, parsed.data.campaignId),
                ))
                .limit(1);
            if (!promotionJob) {
                return NextResponse.json({ error: 'Promotion job not found for campaign' }, { status: 404 });
            }
        }

        const txResult = await db.transaction(async (tx) => {
            const [usage] = await tx.insert(mediaAssetUsage).values({
                assetId: id,
                campaignId: parsed.data.campaignId,
                jobId: parsed.data.jobId ?? null,
            }).returning({ id: mediaAssetUsage.id });

            if (!usage) {
                throw new Error('Failed to insert media asset usage record');
            }

            const [updated] = await tx.update(mediaAssets).set({
                usageCount: sql`COALESCE(${mediaAssets.usageCount}, 0) + 1`,
            })
                .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletedAt)))
                .returning({ usageCount: mediaAssets.usageCount });

            if (!updated) {
                throw new Error('Failed to update media asset usage count');
            }

            return { usageId: usage.id, usageCount: updated.usageCount };
        });

        return NextResponse.json({
            success: true,
            usageId: txResult.usageId,
            usageCount: txResult.usageCount,
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to track media asset usage:', error);
        return NextResponse.json(
            { error: 'Failed to track media asset usage' },
            { status: 500 },
        );
    }
}
