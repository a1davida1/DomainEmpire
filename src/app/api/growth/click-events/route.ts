import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, gte, sql, type SQL } from 'drizzle-orm';
import { db, clickEvents, domainResearch, promotionCampaigns } from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { evaluateClickIntegrity } from '@/lib/growth/click-integrity';
import { createNotification } from '@/lib/notifications';

const clickLimiter = createRateLimiter('growth-click-events', {
    maxRequests: 60,
    windowMs: 60 * 1000,
});

const clickSchema = z.object({
    campaignId: z.string().uuid().optional(),
    visitorId: z.string().max(255).optional(),
    fullUrl: z.string().url().max(4096),
    utmSource: z.string().max(255).optional(),
    utmMedium: z.string().max(255).optional(),
    utmCampaign: z.string().max(255).optional(),
    utmTerm: z.string().max(255).optional(),
    utmContent: z.string().max(255).optional(),
    referrer: z.string().max(4096).optional(),
    userAgent: z.string().max(512).optional(),
    ipHash: z.string().max(255).optional(),
});

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

function extractUtmFromUrl(fullUrl: string): Record<string, string> {
    try {
        const parsed = new URL(fullUrl);
        const utm: Record<string, string> = {};
        for (const key of UTM_KEYS) {
            const value = parsed.searchParams.get(key);
            if (value && value.trim().length > 0) {
                utm[key] = value.trim();
            }
        }
        return utm;
    } catch {
        return {};
    }
}

function toUuid(value: string | undefined): string | undefined {
    if (!value) return undefined;
    return z.string().uuid().safeParse(value).success ? value : undefined;
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

async function countRecentClicks(
    whereConditions: SQL[],
): Promise<number> {
    const [result] = await db.select({
        count: sql<number>`count(*)::int`,
    })
        .from(clickEvents)
        .where(and(...whereConditions));
    return result?.count ?? 0;
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
    const ip = getClientIp(request);
    const limit = clickLimiter(ip);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { ...corsHeaders(), ...limit.headers } },
        );
    }

    try {
        const body = await request.json().catch(() => null);
        const parsed = clickSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.issues },
                { status: 400, headers: corsHeaders() },
            );
        }

        const payload = parsed.data;
        const extractedUtm = extractUtmFromUrl(payload.fullUrl);
        const utmCampaign = payload.utmCampaign ?? extractedUtm.utm_campaign;
        const campaignId = payload.campaignId ?? toUuid(utmCampaign);
        const windowStart = new Date(Date.now() - 10 * 60 * 1000);

        const ipConditions: SQL[] = [gte(clickEvents.occurredAt, windowStart)];
        if (payload.ipHash) {
            ipConditions.push(eq(clickEvents.ipHash, payload.ipHash));
        }
        if (campaignId) {
            ipConditions.push(eq(clickEvents.campaignId, campaignId));
        }

        const visitorConditions: SQL[] = [gte(clickEvents.occurredAt, windowStart)];
        if (payload.visitorId) {
            visitorConditions.push(eq(clickEvents.visitorId, payload.visitorId));
        }
        if (campaignId) {
            visitorConditions.push(eq(clickEvents.campaignId, campaignId));
        }

        const campaignConditions: SQL[] = [gte(clickEvents.occurredAt, windowStart)];
        if (campaignId) {
            campaignConditions.push(eq(clickEvents.campaignId, campaignId));
        }

        const recentIpClicks = payload.ipHash ? await countRecentClicks(ipConditions) : 0;
        const recentVisitorClicks = payload.visitorId ? await countRecentClicks(visitorConditions) : 0;
        const recentCampaignClicks = campaignId ? await countRecentClicks(campaignConditions) : 0;
        const integrity = evaluateClickIntegrity({
            fullUrl: payload.fullUrl,
            userAgent: payload.userAgent ?? request.headers.get('user-agent'),
            referrer: payload.referrer ?? request.headers.get('referer'),
            utmSource: payload.utmSource ?? extractedUtm.utm_source ?? null,
            utmMedium: payload.utmMedium ?? extractedUtm.utm_medium ?? null,
            ipHash: payload.ipHash ?? null,
            visitorId: payload.visitorId ?? null,
            recentIpClicks,
            recentVisitorClicks,
            recentCampaignClicks,
        });

        const [event] = await db.insert(clickEvents).values({
            campaignId: campaignId ?? null,
            visitorId: payload.visitorId ?? null,
            fullUrl: payload.fullUrl,
            utmSource: payload.utmSource ?? extractedUtm.utm_source ?? null,
            utmMedium: payload.utmMedium ?? extractedUtm.utm_medium ?? null,
            utmCampaign: utmCampaign ?? null,
            utmTerm: payload.utmTerm ?? extractedUtm.utm_term ?? null,
            utmContent: payload.utmContent ?? extractedUtm.utm_content ?? null,
            referrer: payload.referrer ?? request.headers.get('referer') ?? null,
            userAgent: payload.userAgent ?? request.headers.get('user-agent') ?? null,
            ipHash: payload.ipHash ?? null,
        }).returning({ id: clickEvents.id, campaignId: clickEvents.campaignId });

        if (!event) {
            return NextResponse.json(
                { success: false, error: 'Click event was not persisted' },
                { status: 502, headers: { ...corsHeaders(), ...limit.headers } },
            );
        }

        if (campaignId && integrity.riskScore >= 70) {
            try {
                const [campaign] = await db.select({
                    domain: domainResearch.domain,
                    domainId: domainResearch.domainId,
                })
                    .from(promotionCampaigns)
                    .innerJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
                    .where(eq(promotionCampaigns.id, campaignId))
                    .limit(1);

                await createNotification({
                    type: 'info',
                    severity: integrity.severity === 'critical' ? 'critical' : 'warning',
                    title: `Suspicious click traffic detected (${campaignId.slice(0, 8)})`,
                    message: `Risk score ${integrity.riskScore}. Signals: ${integrity.signals.join(', ') || 'none'}`,
                    domainId: campaign?.domainId ?? undefined,
                    actionUrl: '/dashboard/growth',
                    metadata: {
                        campaignId,
                        domain: campaign?.domain ?? null,
                        clickId: event.id,
                        riskScore: integrity.riskScore,
                        riskSignals: integrity.signals,
                        recentIpClicks,
                        recentVisitorClicks,
                        recentCampaignClicks,
                    },
                });
            } catch (integrityNotificationError) {
                console.error('Failed to create suspicious click notification:', integrityNotificationError);
            }
        }

        return NextResponse.json({
            success: true,
            clickId: event.id,
            campaignId: event.campaignId ?? null,
            integrity: {
                riskScore: integrity.riskScore,
                severity: integrity.severity,
            },
        }, { status: 201, headers: { ...corsHeaders(), ...limit.headers } });
    } catch (error) {
        console.error('Failed to capture click event:', error);
        return NextResponse.json(
            { error: 'Failed to capture click event' },
            { status: 500, headers: corsHeaders() },
        );
    }
}
