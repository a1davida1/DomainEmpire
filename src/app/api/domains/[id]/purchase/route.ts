import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { purchaseDomain } from '@/lib/domain/purchase';
import { z } from 'zod';

const purchaseSchema = z.object({
    domain: z.string().min(3).max(253),
    maxPrice: z.number().min(0).max(1000).optional(),
    period: z.number().min(1).max(10).optional(),
    privacy: z.boolean().optional(),
});

// POST /api/domains/[id]/purchase — Purchase a domain
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = purchaseSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        const result = await purchaseDomain(parsed.data.domain, {
            maxPrice: parsed.data.maxPrice,
            period: parsed.data.period,
            privacy: parsed.data.privacy,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error, price: result.price }, { status: 400 });
        }

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Purchase failed', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
