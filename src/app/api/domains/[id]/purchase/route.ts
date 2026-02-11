import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkAvailability, purchaseDomain } from '@/lib/domain/purchase';
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
});

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

        const result = await purchaseDomain(parsed.data.domain, {
            maxPrice: parsed.data.maxPrice,
            period: parsed.data.period,
            privacy: parsed.data.privacy,
            confirmed: parsed.data.confirmed,
        });

        if (!result.success) {
            console.error(`Purchase failed for research ${id} (${parsed.data.domain}):`, result.error);
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        console.error('API Error in domains/[id]/purchase:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'An unexpected error occurred during purchase' },
            { status: 500 }
        );
    }
}
