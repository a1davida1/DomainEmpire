/**
 * Public A/B test tracking endpoint.
 * Deployed sites POST impressions/clicks here. No auth required.
 */

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordImpression, recordClick, recordConversion } from '@/lib/ab-testing';
import { assignVariantBySubject } from '@/lib/ab-testing/assignment';
import { db } from '@/lib/db';
import { abTests } from '@/lib/db/schema';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const trackLimiter = createRateLimiter('ab-track', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const requestSchema = z.object({
    testId: z.string().trim().min(1),
    variantId: z.string().trim().min(1).optional(),
    event: z.enum(['impression', 'click', 'conversion']),
    subjectKey: z.string().trim().min(1).max(300).optional(),
    holdoutVariantId: z.string().trim().min(1).max(64).optional(),
    minHoldoutSharePct: z.coerce.number().finite().min(0).max(50).optional(),
});

const variantSchema = z.object({
    id: z.string().trim().min(1),
    value: z.string().trim().min(1),
    impressions: z.coerce.number().finite().min(0),
    clicks: z.coerce.number().finite().min(0),
    conversions: z.coerce.number().finite().min(0),
    allocationPct: z.coerce.number().finite().min(0).max(100).optional(),
});

const variantsSchema = z.array(variantSchema).min(2);

function resolveSubjectKey(request: NextRequest, explicit?: string): string {
    const bodySubject = explicit?.trim();
    const headerSubject = request.headers.get('x-ab-subject')?.trim();
    if (bodySubject) return bodySubject;
    if (headerSubject) return headerSubject;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') ?? 'unknown';
    return `ip:${ip}|ua:${userAgent.slice(0, 140)}`;
}

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
        let rawBody: unknown;
        try {
            rawBody = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
        }

        const parsedBody = requestSchema.safeParse(rawBody);
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: 'Invalid tracking payload', details: parsedBody.error.issues },
                { status: 400, headers: corsHeaders },
            );
        }
        const payload = parsedBody.data;
        let resolvedVariantId = payload.variantId ?? null;
        let assignment: ReturnType<typeof assignVariantBySubject> | null = null;

        if (!resolvedVariantId || payload.subjectKey) {
            const [test] = await db.select().from(abTests).where(eq(abTests.id, payload.testId)).limit(1);
            if (!test) {
                return NextResponse.json(
                    { error: 'Test not found' },
                    { status: 404, headers: corsHeaders },
                );
            }

            const parsedVariants = variantsSchema.safeParse(test.variants);
            if (!parsedVariants.success) {
                return NextResponse.json(
                    { error: 'Test variants are invalid', details: parsedVariants.error.issues },
                    { status: 422, headers: corsHeaders },
                );
            }

            const subjectKey = resolveSubjectKey(request, payload.subjectKey);
            assignment = assignVariantBySubject({
                testId: payload.testId,
                subjectKey,
                variants: parsedVariants.data,
                holdoutVariantId: payload.holdoutVariantId ?? null,
                minHoldoutSharePct: payload.minHoldoutSharePct,
            });

            if (!resolvedVariantId) {
                resolvedVariantId = assignment.variantId;
            } else if (resolvedVariantId !== assignment.variantId) {
                return NextResponse.json(
                    {
                        error: 'Variant does not match enforced holdout assignment',
                        expectedVariantId: assignment.variantId,
                        receivedVariantId: resolvedVariantId,
                        assignment,
                    },
                    { status: 409, headers: corsHeaders },
                );
            }
        }

        if (!resolvedVariantId) {
            return NextResponse.json(
                { error: 'variantId is required when assignment cannot be resolved' },
                { status: 400, headers: corsHeaders },
            );
        }

        let result = null;
        switch (payload.event) {
            case 'impression':
                result = await recordImpression(payload.testId, resolvedVariantId);
                break;
            case 'click':
                result = await recordClick(payload.testId, resolvedVariantId);
                break;
            case 'conversion':
                result = await recordConversion(payload.testId, resolvedVariantId);
                break;
        }

        return NextResponse.json(
            {
                tracked: result !== null,
                variantId: resolvedVariantId,
                assignment,
            },
            { headers: corsHeaders },
        );
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
