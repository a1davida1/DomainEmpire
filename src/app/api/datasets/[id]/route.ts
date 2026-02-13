import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatasetById, deleteDataset } from '@/lib/datasets';
import { db, datasets } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateDatasetSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    sourceUrl: z.string().url().max(2048).nullable().optional(),
    sourceTitle: z.string().max(500).nullable().optional(),
    publisher: z.string().max(255).nullable().optional(),
    effectiveDate: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    freshnessClass: z.enum(['realtime', 'weekly', 'monthly', 'quarterly', 'annual']).optional(),
}).strict();

// GET /api/datasets/[id] - Get single dataset
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const dataset = await getDatasetById(params.id);
        if (!dataset) {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }
        return NextResponse.json(dataset);
    } catch (error) {
        console.error('Failed to get dataset:', error);
        return NextResponse.json({ error: 'Failed to get dataset' }, { status: 500 });
    }
}

// PATCH /api/datasets/[id] - Update dataset metadata
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body;
        try {
            body = await request.json();
        } catch (_e) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const parsed = updateDatasetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
                { status: 400 },
            );
        }

        const existing = await getDatasetById(params.id);
        if (!existing) {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        const d = parsed.data;
        if (d.name !== undefined) updateData.name = d.name;
        if (d.sourceUrl !== undefined) updateData.sourceUrl = d.sourceUrl;
        if (d.sourceTitle !== undefined) updateData.sourceTitle = d.sourceTitle;
        if (d.publisher !== undefined) updateData.publisher = d.publisher;
        if (d.effectiveDate !== undefined) updateData.effectiveDate = d.effectiveDate ? new Date(d.effectiveDate) : null;
        if (d.expiresAt !== undefined) updateData.expiresAt = d.expiresAt ? new Date(d.expiresAt) : null;
        if (d.freshnessClass !== undefined) updateData.freshnessClass = d.freshnessClass;

        await db.update(datasets).set(updateData).where(eq(datasets.id, params.id));

        const updated = await getDatasetById(params.id);
        return NextResponse.json(updated);
    } catch (error) {
        console.error('Failed to update dataset:', error);
        return NextResponse.json({ error: 'Failed to update dataset' }, { status: 500 });
    }
}

// DELETE /api/datasets/[id] - Delete dataset
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const existing = await getDatasetById(params.id);
        if (!existing) {
            return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
        }

        await deleteDataset(params.id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete dataset:', error);
        return NextResponse.json({ error: 'Failed to delete dataset' }, { status: 500 });
    }
}
