/**
 * Public email capture endpoint.
 * No auth required — deployed sites POST here.
 * Rate-limited, honeypot-protected, CORS-enabled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { captureSubscriber } from '@/lib/subscribers';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const captureLimiter = createRateLimiter('capture', {
    maxRequests: 5,
    windowMs: 60 * 1000, // 5 captures per minute per IP
});

const captureSchema = z.object({
    domainId: z.string().uuid(),
    email: z.string().email().max(320),
    name: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    source: z.enum(['lead_form', 'newsletter', 'wizard', 'popup', 'scroll_cta']).optional(),
    formData: z.record(z.string(), z.string()).optional(),
    articleId: z.string().uuid().optional(),
    sourceCampaignId: z.string().uuid().optional(),
    sourceClickId: z.string().uuid().optional(),
    originalUtm: z.record(z.string(), z.string()).optional(),
    // Honeypot field — must be empty
    lead_hp_field: z.string().max(200).optional(),
});

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

function extractUtmFromUrl(urlRaw: string | null): Record<string, string> {
    if (!urlRaw) return {};
    try {
        const parsed = new URL(urlRaw);
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

function extractUtmFromFormData(formData?: Record<string, string>): Record<string, string> {
    if (!formData) return {};
    const utm: Record<string, string> = {};
    for (const key of UTM_KEYS) {
        const value = formData[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            utm[key] = value.trim();
        }
    }
    return utm;
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
    const limit = captureLimiter(ip);

    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { ...corsHeaders(), ...limit.headers } }
        );
    }

    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON' },
                { status: 400, headers: corsHeaders() }
            );
        }
        const parsed = captureSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
                { status: 400, headers: corsHeaders() }
            );
        }

        // Honeypot triggered — silently succeed
        if (parsed.data.lead_hp_field) {
            return NextResponse.json({ success: true }, { status: 201, headers: corsHeaders() });
        }

        const referrer = request.headers.get('referer') ?? undefined;
        const referrerUtm = extractUtmFromUrl(referrer ?? null);
        const formDataUtm = extractUtmFromFormData(parsed.data.formData as Record<string, string> | undefined);
        const mergedUtm = {
            ...referrerUtm,
            ...formDataUtm,
            ...(parsed.data.originalUtm ?? {}),
        };
        const sourceCampaignId = parsed.data.sourceCampaignId
            ?? toUuid(mergedUtm.utm_campaign);

        const subscriber = await captureSubscriber({
            domainId: parsed.data.domainId,
            email: parsed.data.email,
            name: parsed.data.name,
            phone: parsed.data.phone,
            source: parsed.data.source,
            formData: parsed.data.formData as Record<string, string> | undefined,
            articleId: parsed.data.articleId,
            sourceCampaignId,
            sourceClickId: parsed.data.sourceClickId,
            originalUtm: mergedUtm,
            ipAddress: ip !== 'unknown' ? ip : undefined,
            userAgent: request.headers.get('user-agent') ?? undefined,
            referrer,
        });

        return NextResponse.json(
            { success: true, id: subscriber.id },
            { status: 201, headers: { ...corsHeaders(), ...limit.headers } }
        );
    } catch (error) {
        console.error('Capture error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders() }
        );
    }
}
