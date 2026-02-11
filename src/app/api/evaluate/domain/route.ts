import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { evaluateDomain } from '@/lib/evaluation/evaluator';

const evaluateSchema = z.object({
    domain: z.string().min(3).max(253).regex(
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i,
        'Invalid domain format'
    ),
    acquisitionCost: z.number().min(0).optional(),
    niche: z.string().optional(),
    quickMode: z.boolean().optional(),
    forceRefresh: z.boolean().optional(),
});

// POST /api/evaluate/domain — Evaluate a single domain
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: 'Bad Request', message: 'Invalid JSON in request body' },
                { status: 400 }
            );
        }

        const parsed = evaluateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { domain, acquisitionCost, niche, quickMode, forceRefresh } = parsed.data;

        const result = await evaluateDomain(domain.toLowerCase(), {
            acquisitionCost,
            niche,
            quickMode,
            forceRefresh,
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Domain evaluation failed:', error);
        return NextResponse.json(
            { error: 'Evaluation failed', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
