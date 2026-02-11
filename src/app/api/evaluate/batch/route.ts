import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { z } from 'zod';
import { evaluateDomain, type EvaluationResult } from '@/lib/evaluation/evaluator';

/** Delay between full-mode evaluations to avoid rate limits (ms) */
const FULL_MODE_DELAY_MS = 2000;

const batchSchema = z.object({
    domains: z.array(
        z.string().min(3).max(253).regex(
            /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i,
            'Invalid domain format (must start/end alphanumeric, dots separate labels)'
        )
    ).min(1).max(20),
    acquisitionCosts: z.record(z.string(), z.number().min(0)).optional(),
    quickMode: z.boolean().default(false),
    forceRefresh: z.boolean().default(false),
});

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// POST /api/evaluate/batch — Evaluate multiple domains and rank them
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

        const parsed = batchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { domains, acquisitionCosts, quickMode, forceRefresh } = parsed.data;
        const uniqueDomains = [...new Set(domains.map(d => d.toLowerCase()))];

        const results: EvaluationResult[] = [];
        const errors: Array<{ domain: string; error: string }> = [];

        // In quick mode, run all in parallel. In full mode, run sequentially with delay.
        const normalizedCosts = acquisitionCosts
            ? Object.fromEntries(Object.entries(acquisitionCosts).map(([k, v]) => [k.toLowerCase(), v]))
            : {};

        if (quickMode) {
            const settled = await Promise.allSettled(
                uniqueDomains.map(domain =>
                    evaluateDomain(domain, {
                        acquisitionCost: normalizedCosts[domain.toLowerCase()],
                        quickMode: true,
                        forceRefresh,
                    })
                )
            );

            for (let i = 0; i < settled.length; i++) {
                const result = settled[i];
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    errors.push({
                        domain: uniqueDomains[i],
                        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
                    });
                }
            }
        } else {
            for (let i = 0; i < uniqueDomains.length; i++) {
                const domain = uniqueDomains[i];
                try {
                    const result = await evaluateDomain(domain, {
                        acquisitionCost: normalizedCosts[domain.toLowerCase()],
                        quickMode: false,
                        forceRefresh,
                    });
                    results.push(result);
                } catch (err) {
                    errors.push({
                        domain,
                        error: err instanceof Error ? err.message : 'Unknown error',
                    });
                }

                // Rate limiting delay between full evaluations (skip after last)
                if (i < uniqueDomains.length - 1) {
                    await sleep(FULL_MODE_DELAY_MS);
                }
            }
        }

        // Rank by composite score
        const ranked = [...results].sort((a, b) => b.compositeScore - a.compositeScore);

        const totalApiCost = results.reduce((sum, r) => sum + r.apiCost, 0);

        return NextResponse.json({
            results: ranked,
            ranking: ranked.map((r, i) => ({
                rank: i + 1,
                domain: r.domain,
                score: r.compositeScore,
                recommendation: r.recommendation,
            })),
            errors,
            totalApiCost: Math.round(totalApiCost * 1000) / 1000,
            evaluated: results.length,
            failed: errors.length,
        });
    } catch (error) {
        console.error('Batch evaluation failed:', error);
        return NextResponse.json(
            { error: 'Batch evaluation failed', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
