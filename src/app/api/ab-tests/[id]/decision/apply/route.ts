import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abTests } from '@/lib/db/schema';
import { evaluateExperimentDecision, type ExperimentDecisionConfig } from '@/lib/ab-testing/decision-gates';

const variantSchema = z.object({
    id: z.string().trim().min(1),
    value: z.string().trim().min(1),
    impressions: z.coerce.number().finite().min(0),
    clicks: z.coerce.number().finite().min(0),
    conversions: z.coerce.number().finite().min(0),
    allocationPct: z.coerce.number().finite().min(0).max(100).optional(),
});

const variantListSchema = z.array(variantSchema).min(2);

const configSchema = z.object({
    holdoutVariantId: z.string().trim().min(1).nullable().optional(),
    minTotalImpressions: z.coerce.number().finite().min(1).max(1_000_000).optional(),
    minVariantImpressions: z.coerce.number().finite().min(1).max(1_000_000).optional(),
    minConfidencePct: z.coerce.number().finite().min(50).max(99.99).optional(),
    minLiftPct: z.coerce.number().finite().min(0).max(1000).optional(),
    maxLossPct: z.coerce.number().finite().min(0).max(1000).optional(),
    maxDurationDays: z.coerce.number().finite().min(1).max(365).optional(),
    minHoldoutSharePct: z.coerce.number().finite().min(0).max(50).optional(),
});

const bodySchema = z.object({
    dryRun: z.boolean().optional(),
    config: configSchema.optional(),
});

type ParsedVariant = z.infer<typeof variantSchema>;

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

function round4(value: number): number {
    return Number(value.toFixed(4));
}

function buildAllocationMap(entries: Array<[string, number]>): Map<string, number> {
    const normalized = new Map<string, number>();
    const cleaned = entries
        .map(([id, share]) => [id, Number.isFinite(share) && share > 0 ? share : 0] as const)
        .filter(([, share]) => share > 0);

    if (cleaned.length === 0) {
        return normalized;
    }

    const total = cleaned.reduce((sum, [, share]) => sum + share, 0);
    if (total <= 0) {
        return normalized;
    }

    const scaled = cleaned.map(([id, share]) => [id, (share / total) * 100] as const);
    let running = 0;
    for (let index = 0; index < scaled.length; index += 1) {
        const [id, share] = scaled[index]!;
        const isLast = index === scaled.length - 1;
        const rounded = isLast ? round4(100 - running) : round4(share);
        running += rounded;
        normalized.set(id, rounded);
    }

    return normalized;
}

function withAllocations(
    variants: ParsedVariant[],
    allocations: Map<string, number>,
): ParsedVariant[] {
    return variants.map((variant) => ({
        ...variant,
        allocationPct: allocations.get(variant.id) ?? 0,
    }));
}

function sanitizeConfig(input?: z.infer<typeof configSchema>): Partial<ExperimentDecisionConfig> {
    if (!input) return {};
    const config: Partial<ExperimentDecisionConfig> = {};
    if (typeof input.holdoutVariantId !== 'undefined') config.holdoutVariantId = input.holdoutVariantId;
    if (typeof input.minTotalImpressions !== 'undefined') config.minTotalImpressions = input.minTotalImpressions;
    if (typeof input.minVariantImpressions !== 'undefined') config.minVariantImpressions = input.minVariantImpressions;
    if (typeof input.minConfidencePct !== 'undefined') config.minConfidencePct = input.minConfidencePct;
    if (typeof input.minLiftPct !== 'undefined') config.minLiftPct = input.minLiftPct;
    if (typeof input.maxLossPct !== 'undefined') config.maxLossPct = input.maxLossPct;
    if (typeof input.maxDurationDays !== 'undefined') config.maxDurationDays = input.maxDurationDays;
    if (typeof input.minHoldoutSharePct !== 'undefined') config.minHoldoutSharePct = input.minHoldoutSharePct;
    return config;
}

type UpdateShape = {
    status?: 'active' | 'completed' | 'cancelled';
    winnerId?: string | null;
    confidenceLevel?: number | null;
    completedAt?: Date | null;
    variants?: ParsedVariant[];
};

function buildDecisionUpdate(args: {
    action: ReturnType<typeof evaluateExperimentDecision>['action'];
    decision: ReturnType<typeof evaluateExperimentDecision>;
    variants: ParsedVariant[];
    config: Partial<ExperimentDecisionConfig>;
    now: Date;
}): UpdateShape | null {
    const { action, decision, variants, config, now } = args;
    const holdoutShare = Math.max(0, Math.min(50, config.minHoldoutSharePct ?? 10));
    const controlId = decision.controlVariantId;
    const selectedId = decision.selectedVariantId;
    const treatmentIds = variants.map((variant) => variant.id).filter((id) => id !== controlId);

    switch (action) {
        case 'scale_winner': {
            const winnerShare = 100 - holdoutShare;
            const allocations = buildAllocationMap([
                [controlId, holdoutShare],
                [selectedId, winnerShare],
            ]);
            return {
                status: 'completed',
                winnerId: selectedId,
                confidenceLevel: Number(decision.confidencePct.toFixed(2)),
                completedAt: now,
                variants: withAllocations(variants, allocations),
            };
        }
        case 'stop_loser': {
            const allocations = buildAllocationMap([[controlId, 100]]);
            return {
                status: 'completed',
                winnerId: controlId,
                confidenceLevel: Number(decision.confidencePct.toFixed(2)),
                completedAt: now,
                variants: withAllocations(variants, allocations),
            };
        }
        case 'stop_no_signal':
            return {
                status: 'completed',
                winnerId: null,
                confidenceLevel: Number(decision.confidencePct.toFixed(2)),
                completedAt: now,
            };
        case 'rebalance_holdout': {
            if (treatmentIds.length === 0) {
                const allocations = buildAllocationMap([[controlId, 100]]);
                return {
                    variants: withAllocations(variants, allocations),
                };
            }
            const treatmentShare = 100 - holdoutShare;
            const selectedBoostShare = treatmentIds.length > 1 ? treatmentShare * 0.7 : treatmentShare;
            const remainingShare = Math.max(0, treatmentShare - selectedBoostShare);
            const nonSelectedIds = treatmentIds.filter((id) => id !== selectedId);
            const eachNonSelectedShare = nonSelectedIds.length > 0
                ? remainingShare / nonSelectedIds.length
                : 0;

            const allocationEntries: Array<[string, number]> = [
                [controlId, holdoutShare],
                [selectedId, selectedBoostShare],
            ];
            for (const id of nonSelectedIds) {
                allocationEntries.push([id, eachNonSelectedShare]);
            }
            const allocations = buildAllocationMap(allocationEntries);
            return {
                variants: withAllocations(variants, allocations),
            };
        }
        case 'continue_collecting':
            return null;
        default:
            return null;
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        let rawBody: unknown = {};
        try {
            rawBody = await request.json();
        } catch {
            rawBody = {};
        }

        const parsedBody = bodySchema.safeParse(rawBody);
        if (!parsedBody.success) {
            return NextResponse.json(
                { error: 'Invalid apply payload', details: parsedBody.error.issues },
                { status: 400 },
            );
        }

        const [test] = await db.select().from(abTests).where(eq(abTests.id, id)).limit(1);
        if (!test) {
            return NextResponse.json({ error: 'Test not found' }, { status: 404 });
        }

        const parsedVariants = variantListSchema.safeParse(test.variants);
        if (!parsedVariants.success) {
            return NextResponse.json(
                { error: 'Test variants are invalid', details: parsedVariants.error.issues },
                { status: 422 },
            );
        }

        const startedAt = parseStartedAt(test.startedAt) ?? parseStartedAt(test.createdAt);
        if (!startedAt) {
            return NextResponse.json(
                { error: 'Test is missing a valid start timestamp' },
                { status: 422 },
            );
        }

        const config = sanitizeConfig(parsedBody.data.config);
        const decision = evaluateExperimentDecision({
            variants: parsedVariants.data.map((variant) => ({
                id: variant.id,
                value: variant.value,
                impressions: Math.trunc(variant.impressions),
                clicks: Math.trunc(variant.clicks),
                conversions: Math.trunc(variant.conversions),
            })),
            startedAt,
            config,
        });

        const now = new Date();
        const update = buildDecisionUpdate({
            action: decision.action,
            decision,
            variants: parsedVariants.data,
            config,
            now,
        });

        const dryRun = parsedBody.data.dryRun ?? true;
        let updatedTest = test;
        let applied = false;

        if (!dryRun && update && test.status === 'active') {
            const [result] = await db
                .update(abTests)
                .set(update)
                .where(eq(abTests.id, test.id))
                .returning();
            if (result) {
                updatedTest = result;
                applied = true;
            }
        }

        return NextResponse.json({
            testId: test.id,
            dryRun,
            applied,
            previousStatus: test.status,
            currentStatus: updatedTest.status,
            decision,
            config,
            updatePreview: update,
            test: updatedTest,
            evaluatedAt: now.toISOString(),
        });
    } catch (error) {
        console.error('A/B decision apply error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

