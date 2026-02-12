import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { refreshDataset, getDatasetById } from '@/lib/datasets';

const MAX_DATA_SIZE = 1_000_000;

// POST /api/datasets/[id]/refresh - Refresh dataset with new data
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const existing = await getDatasetById(params.id);
        if (!existing) {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { data } = body;
        const isPlainObject = typeof data === 'object' && data !== null && !Array.isArray(data);

        if (!data || !isPlainObject) {
            return NextResponse.json({ error: 'data field is required and must be an object' }, { status: 400 });
        }

        if (JSON.stringify(data).length > MAX_DATA_SIZE) {
            return NextResponse.json({ error: 'Data payload exceeds 1MB limit' }, { status: 413 });
        }

        const result = await refreshDataset(params.id, data);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Failed to refresh dataset:', error);
        return NextResponse.json({ error: 'Failed to refresh dataset' }, { status: 500 });
    }
}
