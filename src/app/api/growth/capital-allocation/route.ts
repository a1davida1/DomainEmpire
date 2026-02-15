import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { db, promotionCampaigns } from '@/lib/db';
import { selectCapitalAllocationAutoApplyUpdates } from '@/lib/growth/capital-allocation-policy';
import {
    applyCapitalAllocationUpdates,
    generateCapitalAllocationRecommendations,
    MissingCapitalAllocationCampaignsError,
    type CampaignStatus,
} from '@/lib/growth/capital-allocation-service';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const allocationLimiter = createRateLimiter('growth_capital_allocation', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function parseIntParam(
    value: string | null,
    fallback: number,
    min: number,
    max: number,
): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseFloatParam(
    value: string | null,
    fallback: number,
    min: number,
    max: number,
): number {
    const parsed = Number.parseFloat(value || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseStatuses(value: string | null): CampaignStatus[] {
    if (!value) return ['active', 'paused'];
    const allowed: CampaignStatus[] = ['draft', 'active', 'paused', 'completed', 'cancelled'];
    const requested = value
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is CampaignStatus => allowed.includes(item as CampaignStatus));
    return requested.length > 0 ? [...new Set(requested)] : ['active', 'paused'];
}

const applyUpdateSchema = z.object({
    campaignId: z.string().uuid(),
    recommendedStatus: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']).optional(),
    recommendedBudget: z.number().min(0).max(1_000_000).optional(),
    recommendedDailyCap: z.number().int().min(0).max(500).optional(),
    rationale: z.string().trim().max(1000).optional(),
});

const applyRequestSchema = z.object({
    dryRun: z.boolean().optional().default(false),
    updates: z.array(applyUpdateSchema).min(1).max(100),
});

const autoRecommendationSchema = z.object({
    campaignId: z.string().uuid(),
    metrics: z.object({
        leads: z.number().int().min(0),
        estimatedNet: z.number(),
    }),
    unitEconomics: z.object({
        cacLtvRatio: z.number().nullable(),
    }),
    recommendation: z.object({
        band: z.enum(['scale', 'maintain', 'optimize', 'pause']),
        hardLimited: z.boolean(),
        recommendedStatus: z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']),
        recommendedBudget: z.number().min(0).max(1_000_000),
        recommendedDailyCap: z.number().int().min(0).max(500),
    }),
});

const autoPolicySchema = z.object({
    applyHardLimitedPauses: z.boolean().optional().default(true),
    applyPauseWhenNetLossBelow: z.number().optional().default(-50),
    applyScaleWhenLeadsAtLeast: z.number().int().min(0).optional().default(25),
    applyScaleMaxCacLtvRatio: z.number().min(0).max(10).optional().default(0.9),
});

const autoApplyRequestSchema = z.object({
    dryRun: z.boolean().optional().default(false),
    policy: autoPolicySchema.optional(),
    recommendations: z.array(autoRecommendationSchema).min(1).max(500),
});

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = allocationLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many capital allocation requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const windowDays = parseIntParam(request.nextUrl.searchParams.get('windowDays'), 30, 7, 120);
        const dailyLossLimit = parseFloatParam(request.nextUrl.searchParams.get('dailyLossLimit'), 150, 0, 1_000_000);
        const weeklyLossLimit = parseFloatParam(request.nextUrl.searchParams.get('weeklyLossLimit'), 750, 0, 1_000_000);
        const limit = parseIntParam(request.nextUrl.searchParams.get('limit'), 100, 1, 500);
        const statuses = parseStatuses(request.nextUrl.searchParams.get('statuses'));

        const result = await generateCapitalAllocationRecommendations({
            windowDays,
            dailyLossLimit,
            weeklyLossLimit,
            statuses,
            limit,
        });

        return NextResponse.json({
            windowDays: result.windowDays,
            dailyLossLimit: result.dailyLossLimit,
            weeklyLossLimit: result.weeklyLossLimit,
            count: result.recommendations.length,
            recommendations: result.recommendations,
            summary: result.summary,
            generatedAt: new Date().toISOString(),
        }, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to generate capital allocation recommendations:', error);
        return NextResponse.json(
            { error: 'Failed to generate capital allocation recommendations' },
            { status: 500, headers: rate.headers },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = allocationLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many capital allocation update requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400, headers: rate.headers });
    }

    const manualParsed = applyRequestSchema.safeParse(body);
    const autoParsed = autoApplyRequestSchema.safeParse(body);

    if (!manualParsed.success && !autoParsed.success) {
        return NextResponse.json(
            {
                error: 'Validation failed',
                details: [
                    ...manualParsed.error.issues,
                    ...autoParsed.error.issues,
                ],
            },
            { status: 400, headers: rate.headers },
        );
    }

    const autoData = autoParsed.success ? autoParsed.data : null;
    const dryRun = manualParsed.success ? manualParsed.data.dryRun : autoData!.dryRun;
    const updates = manualParsed.success
        ? manualParsed.data.updates
        : selectCapitalAllocationAutoApplyUpdates({
            recommendations: autoData!.recommendations,
            policy: autoPolicySchema.parse(autoData!.policy ?? {}),
        });

    if (updates.length === 0) {
        return NextResponse.json({
            dryRun,
            count: 0,
            updated: [],
            message: 'No campaigns matched auto-apply policy thresholds.',
        }, { headers: rate.headers });
    }

    try {
        const campaignIds = updates.map((update) => update.campaignId);

        if (dryRun) {
            const campaigns = await db.select({
                id: promotionCampaigns.id,
                status: promotionCampaigns.status,
                budget: promotionCampaigns.budget,
                dailyCap: promotionCampaigns.dailyCap,
            })
                .from(promotionCampaigns)
                .where(inArray(promotionCampaigns.id, campaignIds));
            const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
            const missing = campaignIds.filter((id) => !campaignById.has(id));

            if (missing.length > 0) {
                return NextResponse.json(
                    { error: 'Some campaigns were not found', missingCampaignIds: missing },
                    { status: 404, headers: rate.headers },
                );
            }

            const preview = updates.map((update) => {
                const current = campaignById.get(update.campaignId)!;
                const nextStatus = update.recommendedStatus ?? current.status;
                const nextBudget = update.recommendedBudget ?? Number(current.budget ?? 0);
                const nextDailyCap = update.recommendedDailyCap ?? Number(current.dailyCap ?? 0);

                return {
                    campaignId: current.id,
                    current: {
                        status: current.status,
                        budget: Number(current.budget ?? 0),
                        dailyCap: Number(current.dailyCap ?? 0),
                    },
                    proposed: {
                        status: nextStatus,
                        budget: nextBudget,
                        dailyCap: nextDailyCap,
                    },
                    rationale: update.rationale ?? null,
                };
            });

            return NextResponse.json({
                dryRun: true,
                count: preview.length,
                preview,
            }, { headers: rate.headers });
        }

        const applied = await applyCapitalAllocationUpdates({
            updates,
            appliedBy: userId,
            strict: true,
        });

        return NextResponse.json({
            dryRun: false,
            count: applied.updated.length,
            updated: applied.updated,
        }, { headers: rate.headers });
    } catch (error) {
        if (error instanceof MissingCapitalAllocationCampaignsError) {
            return NextResponse.json(
                {
                    error: error.message,
                    missingCampaignIds: error.missingCampaignIds,
                },
                { status: 404, headers: rate.headers },
            );
        }

        console.error('Failed to apply capital allocation updates:', error);
        return NextResponse.json(
            { error: 'Failed to apply capital allocation updates' },
            { status: 500, headers: rate.headers },
        );
    }
}
