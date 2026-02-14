import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { checkAvailability, purchaseDomain } from '@/lib/domain/purchase';
import { db, acquisitionEvents, domainResearch, reviewTasks } from '@/lib/db';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

const checkSchema = z.object({
    domain: z.string().min(3).max(253),
});

const purchaseSchema = z.object({
    domain: z.string().min(3).max(253),
    maxPrice: z.number().min(0).max(10000).optional(),
    period: z.number().min(1).max(10).optional(),
    privacy: z.boolean().optional(),
    confirmed: z.boolean(),
    overrideUnderwriting: z.boolean().optional(),
    overrideReason: z.string().min(8).max(500).optional(),
}).superRefine((value, ctx) => {
    if (value.overrideUnderwriting && !value.overrideReason) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['overrideReason'],
            message: 'overrideReason is required when overrideUnderwriting=true',
        });
    }
});

function normalizeDomain(value: string): string {
    return value.trim().toLowerCase();
}

// GET /api/domains/[id]/purchase?domain=example.com — Check availability and price
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const parsed = checkSchema.safeParse({ domain });
    if (!parsed.success) {
        return NextResponse.json({ error: 'Valid domain parameter is required' }, { status: 400 });
    }

    try {
        const result = await checkAvailability(parsed.data.domain);
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Availability check failed' },
            { status: 500 }
        );
    }
}

// POST /api/domains/[id]/purchase — Purchase a domain (requires confirmed=true)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);

    const { id } = await params;

    try {
        const body = await request.json();
        const parsed = purchaseSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        if (!parsed.data.confirmed) {
            return NextResponse.json(
                { error: 'Purchase requires confirmed=true. Use GET to check price first.' },
                { status: 400 }
            );
        }

        const [research] = await db
            .select({
                id: domainResearch.id,
                domain: domainResearch.domain,
                decision: domainResearch.decision,
                decisionReason: domainResearch.decisionReason,
                hardFailReason: domainResearch.hardFailReason,
                recommendedMaxBid: domainResearch.recommendedMaxBid,
            })
            .from(domainResearch)
            .where(eq(domainResearch.id, id))
            .limit(1);

        if (!research) {
            return NextResponse.json({ error: 'Domain research record not found' }, { status: 404 });
        }

        const requestedDomain = normalizeDomain(parsed.data.domain);
        const researchDomain = normalizeDomain(research.domain);
        if (requestedDomain !== researchDomain) {
            return NextResponse.json(
                { error: 'Purchase domain does not match the selected research record' },
                { status: 400 },
            );
        }

        const isAdmin = user.role === 'admin';
        const wantsOverride = parsed.data.overrideUnderwriting === true;
        if (wantsOverride && !isAdmin) {
            return NextResponse.json(
                { error: 'Only admins can override underwriting gates' },
                { status: 403 },
            );
        }

        const recommendedMaxBid = typeof research.recommendedMaxBid === 'number'
            ? research.recommendedMaxBid
            : null;
        const effectiveMaxPrice = parsed.data.maxPrice
            ?? (recommendedMaxBid && recommendedMaxBid > 0 ? recommendedMaxBid : undefined);

        const underwritingErrors: string[] = [];
        if (research.decision !== 'buy') {
            underwritingErrors.push(`Research decision is "${research.decision}" (must be "buy")`);
        }
        if (research.hardFailReason) {
            underwritingErrors.push(`Hard fail present: ${research.hardFailReason}`);
        }
        if (
            typeof recommendedMaxBid === 'number'
            && typeof effectiveMaxPrice === 'number'
            && effectiveMaxPrice > recommendedMaxBid
        ) {
            underwritingErrors.push(`Requested maxPrice $${effectiveMaxPrice} exceeds recommendedMaxBid $${recommendedMaxBid}`);
        }

        if (underwritingErrors.length > 0 && !wantsOverride) {
            return NextResponse.json({
                error: 'Purchase blocked by underwriting gate',
                details: underwritingErrors,
                recommendation: {
                    decision: research.decision,
                    decisionReason: research.decisionReason,
                    recommendedMaxBid,
                },
            }, { status: 403 });
        }

        const [approvedReviewTask] = await db
            .select({
                id: reviewTasks.id,
                reviewerId: reviewTasks.reviewerId,
                reviewedAt: reviewTasks.reviewedAt,
            })
            .from(reviewTasks)
            .where(and(
                eq(reviewTasks.taskType, 'domain_buy'),
                eq(reviewTasks.domainResearchId, research.id),
                eq(reviewTasks.status, 'approved'),
            ))
            .orderBy(desc(reviewTasks.reviewedAt))
            .limit(1);

        if (!approvedReviewTask && !wantsOverride) {
            return NextResponse.json({
                error: 'Purchase blocked: domain_buy review task is not approved',
                recommendation: {
                    decision: research.decision,
                    decisionReason: research.decisionReason,
                    recommendedMaxBid,
                },
            }, { status: 403 });
        }

        const result = await purchaseDomain(parsed.data.domain, {
            maxPrice: effectiveMaxPrice,
            period: parsed.data.period,
            privacy: parsed.data.privacy,
            confirmed: parsed.data.confirmed,
        });

        if (!result.success) {
            console.error(`Purchase failed for research ${id} (${parsed.data.domain}):`, result.error);
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        await db.insert(acquisitionEvents).values({
            domainResearchId: research.id,
            eventType: 'bought',
            createdBy: user.id,
            payload: {
                domain: result.domain,
                orderId: result.orderId ?? null,
                price: result.price ?? null,
                currency: result.currency ?? null,
                overrideUnderwriting: wantsOverride,
                overrideReason: parsed.data.overrideReason ?? null,
                purchaseByRole: user.role,
                reviewTaskId: approvedReviewTask?.id ?? null,
                reviewApproved: Boolean(approvedReviewTask),
            },
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error('API Error in domains/[id]/purchase:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'An unexpected error occurred during purchase' },
            { status: 500 }
        );
    }
}
