import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { classifyAndUpdateDomain, classifyUncategorizedDomains } from '@/lib/ai/classify-domain';

/**
 * POST /api/domains/classify
 *
 * Body options:
 *   { domainId: string }           — classify a single domain
 *   { all: true, limit?: number }  — classify all uncategorized domains
 */

const singleSchema = z.object({ domainId: z.string().uuid() });
const bulkSchema = z.object({ all: z.literal(true), limit: z.number().int().min(1).max(50).optional() });
const bodySchema = z.union([singleSchema, bulkSchema]);

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.issues },
                { status: 400 },
            );
        }

        const data = parsed.data;

        if ('domainId' in data) {
            const result = await classifyAndUpdateDomain(data.domainId);
            if (!result) {
                return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
            }
            return NextResponse.json({
                success: true,
                domain: result.domain,
                classification: result.classification,
            });
        }

        // Bulk classify
        const limit = data.limit ?? 20;
        const result = await classifyUncategorizedDomains(limit);
        return NextResponse.json({
            success: true,
            classified: result.classified.length,
            errors: result.errors.length,
            details: result,
        });
    } catch (error) {
        console.error('Domain classification failed:', error);
        return NextResponse.json(
            { error: 'Classification failed' },
            { status: 500 },
        );
    }
}
