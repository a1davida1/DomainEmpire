import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, clickEvents } from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

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

        return NextResponse.json({
            success: true,
            clickId: event.id,
            campaignId: event.campaignId ?? null,
        }, { status: 201, headers: { ...corsHeaders(), ...limit.headers } });
    } catch (error) {
        console.error('Failed to capture click event:', error);
        return NextResponse.json(
            { error: 'Failed to capture click event' },
            { status: 500, headers: corsHeaders() },
        );
    }
}
