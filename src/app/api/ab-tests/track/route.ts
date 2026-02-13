/**
 * Public A/B test tracking endpoint.
 * Deployed sites POST impressions/clicks here. No auth required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordImpression, recordClick, recordConversion } from '@/lib/ab-testing';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const trackLimiter = createRateLimiter('ab-track', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

export async function POST(request: NextRequest) {
    const ip = getClientIp(request);
    const { allowed } = trackLimiter(ip);
    if (!allowed) {
        return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
        }
        const { testId, variantId, event } = body;

        if (!testId || !variantId || !event) {
            return NextResponse.json(
                { error: 'testId, variantId, and event required' },
                { status: 400, headers: corsHeaders },
            );
        }

        const validEvents = ['impression', 'click', 'conversion'];
        if (!validEvents.includes(event)) {
            return NextResponse.json(
                { error: `event must be one of: ${validEvents.join(', ')}` },
                { status: 400, headers: corsHeaders },
            );
        }

        let result = null;
        switch (event) {
            case 'impression':
                result = await recordImpression(testId, variantId);
                break;
            case 'click':
                result = await recordClick(testId, variantId);
                break;
            case 'conversion':
                result = await recordConversion(testId, variantId);
                break;
        }

        return NextResponse.json({ tracked: result !== null }, { headers: corsHeaders });
    } catch (error) {
        console.error('A/B track error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
