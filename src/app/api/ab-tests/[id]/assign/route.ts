import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { abTests } from '@/lib/db/schema';
import { assignVariantBySubject } from '@/lib/ab-testing/assignment';
import { recordImpression } from '@/lib/ab-testing';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const assignLimiter = createRateLimiter('ab-assign', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

const requestSchema = z.object({
    subjectKey: z.string().trim().min(1).max(300).optional(),
    holdoutVariantId: z.string().trim().min(1).max(64).optional(),
    minHoldoutSharePct: z.coerce.number().finite().min(0).max(50).optional(),
    autoTrackImpression: z.boolean().optional(),
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

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-AB-Subject',
};

function resolveSubjectKey(request: NextRequest, bodySubjectKey?: string): string {
    const explicit = bodySubjectKey?.trim()
        || request.headers.get('x-ab-subject')?.trim();
    if (explicit) {
        return explicit;
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') ?? 'unknown';
    return `ip:${ip}|ua:${userAgent.slice(0, 140)}`;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const ip = getClientIp(request);
    const { allowed } = assignLimiter(ip);
    if (!allowed) {
        return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: corsHeaders });
    }

    const { id } = await params;

    try {
        let rawBody: unknown = {};
        try {
            rawBody = await request.json();
        } catch {
            rawBody = {};
        }

        const parsedBody = requestSchema.safeParse(rawBody);
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: 'Invalid assignment payload', details: parsedBody.error.issues },
                { status: 400, headers: corsHeaders },
            );
        }

        const [test] = await db.select().from(abTests).where(eq(abTests.id, id)).limit(1);
        if (!test) {
            return NextResponse.json({ error: 'Test not found' }, { status: 404, headers: corsHeaders });
        }

        const parsedVariants = variantsSchema.safeParse(test.variants);
        if (!parsedVariants.success) {
            return NextResponse.json(
                { error: 'Test variants are invalid', details: parsedVariants.error.issues },
                { status: 422, headers: corsHeaders },
            );
        }

        const subjectKey = resolveSubjectKey(request, parsedBody.data.subjectKey);
        const variants = parsedVariants.data;

        if (test.status !== 'active') {
            const fallbackVariant = variants.find((variant) => variant.id === test.winnerId) ?? variants[0];
            if (parsedBody.data.autoTrackImpression && fallbackVariant) {
                await recordImpression(test.id, fallbackVariant.id);
            }

            return NextResponse.json(
                {
                    testId: test.id,
                    status: test.status,
                    assignment: {
                        variantId: fallbackVariant?.id ?? null,
                        controlVariantId: variants[0]?.id ?? null,
                        holdoutSharePct: parsedBody.data.minHoldoutSharePct ?? 10,
                        assignedSharePct: fallbackVariant?.allocationPct ?? null,
                        assignmentBucketPct: null,
                        isHoldout: fallbackVariant?.id === variants[0]?.id,
                        reason: 'inactive_test',
                    },
                    variant: fallbackVariant ?? null,
                },
                { headers: corsHeaders },
            );
        }

        const assignment = assignVariantBySubject({
            testId: test.id,
            subjectKey,
            variants,
            holdoutVariantId: parsedBody.data.holdoutVariantId ?? null,
            minHoldoutSharePct: parsedBody.data.minHoldoutSharePct,
        });
        const assignedVariant = variants.find((variant) => variant.id === assignment.variantId) ?? null;

        if (parsedBody.data.autoTrackImpression && assignedVariant) {
            await recordImpression(test.id, assignedVariant.id);
        }

        return NextResponse.json(
            {
                testId: test.id,
                status: test.status,
                assignment,
                variant: assignedVariant,
            },
            { headers: corsHeaders },
        );
    } catch (error) {
        console.error('A/B assign error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders },
        );
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders,
    });
}

