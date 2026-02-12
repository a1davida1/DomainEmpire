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

    try {
        const { searchParams } = request.nextUrl;
        const domainId = searchParams.get('domainId') || undefined;

        if (domainId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
            return NextResponse.json({ error: 'Invalid domainId format' }, { status: 400 });
        }

        const staleOnly = searchParams.get('stale') === 'true';
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
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to list datasets' }, { status: 500 });
    }
}

// POST /api/datasets - Create a new dataset
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    // Enforce MAX_DATA_SIZE while reading the stream
    const reader = request.body?.getReader();
    if (!reader) {
        return NextResponse.json({ error: 'Missing request body' }, { status: 400 });
    }

    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            receivedLength += value.length;
            if (receivedLength > MAX_DATA_SIZE) {
                return NextResponse.json(
                    { error: 'Payload too large', message: `Data exceeds ${MAX_DATA_SIZE / 1_000_000}MB limit` },
                    { status: 413 }
                );
            }
            chunks.push(value);
        }
    } catch (err) {
        console.error('Error reading request stream:', err);
        return NextResponse.json({ error: 'Error reading request body' }, { status: 500 });
    } finally {
        reader.releaseLock();
    }

    const fullBody = new Uint8Array(receivedLength);
    let offset = 0;
    for (const chunk of chunks) {
        fullBody.set(chunk, offset);
        offset += chunk.length;
    }

    try {
        const bodyText = new TextDecoder().decode(fullBody);
        const body = JSON.parse(bodyText);

        const parsed = createDatasetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
                { status: 400 },
            );
        }

        // Secondary check on actual data field (byte-accurate)
        if (parsed.data.data) {
            const serializedData = JSON.stringify(parsed.data.data);
            if (Buffer.byteLength(serializedData, 'utf8') > MAX_DATA_SIZE) {
                return NextResponse.json(
                    { error: 'Payload too large', message: 'Data field exceeds 1MB limit' },
                    { status: 413 },
                );
            }
        }

        const dataset = await createDataset({
            ...parsed.data,
            effectiveDate: parsed.data.effectiveDate ? new Date(parsed.data.effectiveDate) : undefined,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
        });

        return NextResponse.json(dataset, { status: 201 });
    } catch (error) {
        console.error('Failed to create dataset:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to create dataset' }, { status: 500 });
    }
}
