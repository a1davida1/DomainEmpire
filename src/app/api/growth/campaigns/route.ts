import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, domainResearch, promotionCampaigns } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

const channelEnum = z.enum(['pinterest', 'youtube_shorts']);
const statusEnum = z.enum(['draft', 'active', 'paused', 'completed', 'cancelled']);

const createCampaignSchema = z.object({
    domainResearchId: z.string().uuid(),
    channels: z.array(channelEnum).min(1).max(2),
    budget: z.number().min(0).max(1_000_000).optional(),
    dailyCap: z.number().int().min(1).max(200).optional(),
    status: statusEnum.optional(),
}).superRefine((value, ctx) => {
    if (new Set(value.channels).size !== value.channels.length) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['channels'],
            message: 'channels must be unique',
        });
    }
});

function parseBoolean(value: string | null): boolean {
    if (!value) return false;
    return value.toLowerCase() === 'true' || value === '1';
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        const url = new URL(request.url);
        const limitParam = Number.parseInt(url.searchParams.get('limit') || '50', 10);
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 200)) : 50;
        const offsetParam = Number.parseInt(url.searchParams.get('offset') || '0', 10);
        const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
        const statusRaw = url.searchParams.get('status');
        const domainResearchIdRaw = url.searchParams.get('domainResearchId');
        const includeResearch = parseBoolean(url.searchParams.get('includeResearch'));

        const conditions: Array<ReturnType<typeof eq>> = [];
        if (statusRaw) {
            const parsedStatus = statusEnum.safeParse(statusRaw);
            if (!parsedStatus.success) {
                return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
            }
            conditions.push(eq(promotionCampaigns.status, parsedStatus.data));
        }
        if (domainResearchIdRaw) {
            if (!z.string().uuid().safeParse(domainResearchIdRaw).success) {
                return NextResponse.json({ error: 'Invalid domainResearchId filter' }, { status: 400 });
            }
            conditions.push(eq(promotionCampaigns.domainResearchId, domainResearchIdRaw));
        }

        let query = db.select().from(promotionCampaigns);
        if (conditions.length > 0) {
            query = query.where(and(...conditions)) as typeof query;
        }

        const campaigns = await query
            .orderBy(desc(promotionCampaigns.createdAt))
            .limit(limit)
            .offset(offset);

        if (!includeResearch || campaigns.length === 0) {
            return NextResponse.json({ count: campaigns.length, campaigns });
        }

        const researchIds = [...new Set(campaigns.map((campaign) => campaign.domainResearchId))];
        const researchRows = await db.select({
            id: domainResearch.id,
            domain: domainResearch.domain,
            decision: domainResearch.decision,
            decisionReason: domainResearch.decisionReason,
        })
            .from(domainResearch)
            .where(inArray(domainResearch.id, researchIds));

        const byResearchId = researchRows.reduce<Record<string, typeof researchRows[number]>>((acc, row) => {
            acc[row.id] = row;
            return acc;
        }, {});

        return NextResponse.json({
            count: campaigns.length,
            campaigns: campaigns.map((campaign) => ({
                ...campaign,
                research: byResearchId[campaign.domainResearchId] ?? null,
            })),
        });
    } catch (error) {
        console.error('Failed to list growth campaigns:', error);
        return NextResponse.json(
            { error: 'Failed to list growth campaigns' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        const parsed = createCampaignSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const payload = parsed.data;
        const [research] = await db.select({
            id: domainResearch.id,
            domain: domainResearch.domain,
        })
            .from(domainResearch)
            .where(eq(domainResearch.id, payload.domainResearchId))
            .limit(1);

        if (!research) {
            return NextResponse.json({ error: 'domainResearchId not found' }, { status: 404 });
        }

        const [campaign] = await db.insert(promotionCampaigns).values({
            domainResearchId: payload.domainResearchId,
            channels: payload.channels,
            budget: payload.budget ?? 0,
            dailyCap: payload.dailyCap ?? 1,
            status: payload.status ?? 'draft',
            metrics: {
                createdBy: user.id,
                createdAt: new Date().toISOString(),
            },
        }).returning();

        return NextResponse.json({
            success: true,
            campaign,
            research,
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to create growth campaign:', error);
        return NextResponse.json(
            { error: 'Failed to create growth campaign' },
            { status: 500 },
        );
    }
}
