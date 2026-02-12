import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { refreshDataset, getDatasetById } from '@/lib/datasets';

const MAX_DATA_SIZE = 1_000_000;

// POST /api/datasets/[id]/refresh - Refresh dataset with new data
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params;

    const authError = await requireAuth(request);
    if (authError) return authError;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid dataset ID format' }, { status: 400 });
    }

    // Early size check via header
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_DATA_SIZE) {
        return NextResponse.json({ error: 'Payload too large', message: 'Data exceeds 1MB limit' }, { status: 413 });
    }

    try {
        const existing = await getDatasetById(id);
        if (!existing) {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
            return NextResponse.json({ error: 'Invalid body', message: 'data field is required and must be an object' }, { status: 400 });
        }

        const { data } = body;

        // Secondary size check on actual data (byte-accurate)
        const serialized = JSON.stringify(data);
        if (Buffer.byteLength(serialized, 'utf8') > MAX_DATA_SIZE) {
            return NextResponse.json({ error: 'Payload too large', message: 'Data exceeds 1MB limit' }, { status: 413 });
        }

        const result = await refreshDataset(id, data);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to refresh dataset:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to refresh dataset' }, { status: 500 });
    }
}
