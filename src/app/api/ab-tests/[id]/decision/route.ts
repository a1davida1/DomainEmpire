import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abTests } from '@/lib/db/schema';
import { evaluateExperimentDecision, type ExperimentDecisionConfig } from '@/lib/ab-testing/decision-gates';

const variantMetricsSchema = z.object({
    id: z.string().trim().min(1),
    value: z.string().trim().min(1),
    impressions: z.coerce.number().finite().min(0),
    clicks: z.coerce.number().finite().min(0),
    conversions: z.coerce.number().finite().min(0),
    allocationPct: z.coerce.number().finite().min(0).max(100).optional(),
});

const variantMetricsListSchema = z.array(variantMetricsSchema).min(2);

function parseStartedAt(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) {
            return parsed;
        }
    }
    return null;
}

function parseNumberParam(
    value: string | null,
    fallback: number,
    min: number,
    max: number,
): number {
    if (!value) return fallback;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseOptionalString(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        const [test] = await db.select().from(abTests).where(eq(abTests.id, id)).limit(1);
        if (!test) {
            return NextResponse.json({ error: 'Test not found' }, { status: 404 });
        }

        const parsedVariants = variantMetricsListSchema.safeParse(test.variants);
        if (!parsedVariants.success) {
            return NextResponse.json(
                {
                    error: 'Test requires at least two valid variants with numeric metrics for decision evaluation',
                    details: parsedVariants.error.issues,
                },
                { status: 400 },
            );
        }

        const startedAt = parseStartedAt(test.startedAt) ?? parseStartedAt(test.createdAt);
        if (!startedAt) {
            return NextResponse.json(
                { error: 'Test is missing a valid createdAt/start timestamp' },
                { status: 422 },
            );
        }

        const variants = parsedVariants.data.map((variant) => ({
            id: variant.id,
            value: variant.value,
            impressions: Math.trunc(variant.impressions),
            clicks: Math.trunc(variant.clicks),
            conversions: Math.trunc(variant.conversions),
        }));

        const config: Partial<ExperimentDecisionConfig> = {
            holdoutVariantId: parseOptionalString(request.nextUrl.searchParams.get('holdoutVariantId')),
            minTotalImpressions: parseNumberParam(request.nextUrl.searchParams.get('minTotalImpressions'), 1000, 1, 1_000_000),
            minVariantImpressions: parseNumberParam(request.nextUrl.searchParams.get('minVariantImpressions'), 200, 1, 1_000_000),
            minConfidencePct: parseNumberParam(request.nextUrl.searchParams.get('minConfidencePct'), 95, 50, 99.99),
            minLiftPct: parseNumberParam(request.nextUrl.searchParams.get('minLiftPct'), 5, 0, 1000),
            maxLossPct: parseNumberParam(request.nextUrl.searchParams.get('maxLossPct'), 5, 0, 1000),
            maxDurationDays: parseNumberParam(request.nextUrl.searchParams.get('maxDurationDays'), 21, 1, 365),
            minHoldoutSharePct: parseNumberParam(request.nextUrl.searchParams.get('minHoldoutSharePct'), 10, 0, 50),
        };

        const decision = evaluateExperimentDecision({
            variants,
            startedAt,
            config,
        });

        return NextResponse.json({
            testId: test.id,
            status: test.status,
            winnerId: test.winnerId,
            confidenceLevel: test.confidenceLevel,
            decision,
            config,
            evaluatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('A/B decision gate evaluation error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
