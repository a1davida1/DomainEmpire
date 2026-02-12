import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createDataset, listDatasets } from '@/lib/datasets';
import { z } from 'zod';

const createDatasetSchema = z.object({
    name: z.string().min(1, 'Name is required').max(255),
    sourceUrl: z.string().url('Must be a valid URL').max(2048).optional(),
    sourceTitle: z.string().max(500).optional(),
    publisher: z.string().max(255).optional(),
    effectiveDate: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    freshnessClass: z.enum(['realtime', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    domainId: z.string().uuid().optional(),
});

// Max data payload ~1MB when serialized
const MAX_DATA_SIZE = 1_000_000;

// GET /api/datasets - List datasets with optional filters and pagination
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const domainId = searchParams.get('domainId') || undefined;
    const staleOnly = searchParams.get('stale') === 'true';

    try {
        const result = await listDatasets({ domainId, staleOnly });

        // Simple offset pagination
        const page = Math.max(1, Number(searchParams.get('page')) || 1);
        const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50));
        const start = (page - 1) * limit;
        const paged = result.slice(start, start + limit);

        return NextResponse.json({
            data: paged,
            pagination: {
                page,
                limit,
                total: result.length,
                totalPages: Math.ceil(result.length / limit),
            },
        });
    } catch (error) {
        console.error('Failed to list datasets:', error);
        return NextResponse.json({ error: 'Failed to list datasets' }, { status: 500 });
    }
}

// POST /api/datasets - Create a new dataset
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = createDatasetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
                { status: 400 },
            );
        }

        // Check data payload size
        if (parsed.data.data && JSON.stringify(parsed.data.data).length > MAX_DATA_SIZE) {
            return NextResponse.json(
                { error: 'Data payload exceeds 1MB limit' },
                { status: 413 },
            );
        }

        const dataset = await createDataset({
            ...parsed.data,
            effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : undefined,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        });

        return NextResponse.json(dataset, { status: 201 });
    } catch (error) {
        console.error('Failed to create dataset:', error);
        return NextResponse.json({ error: 'Failed to create dataset' }, { status: 500 });
    }
}
