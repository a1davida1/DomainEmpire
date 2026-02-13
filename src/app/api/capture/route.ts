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
    // Honeypot field — must be empty
    lead_hp_field: z.string().max(0).optional(),
});

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

        const subscriber = await captureSubscriber({
            domainId: parsed.data.domainId,
            email: parsed.data.email,
            name: parsed.data.name,
            phone: parsed.data.phone,
            source: parsed.data.source,
            formData: parsed.data.formData as Record<string, string> | undefined,
            articleId: parsed.data.articleId,
            ipAddress: ip !== 'unknown' ? ip : undefined,
            userAgent: request.headers.get('user-agent') ?? undefined,
            referrer: request.headers.get('referer') ?? undefined,
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
