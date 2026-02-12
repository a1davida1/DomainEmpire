import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { linkDatasetToArticle, getArticleDatasets } from '@/lib/datasets';
import { db, articles, articleDatasets } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const linkSchema = z.object({
    datasetId: z.string().uuid('Must be a valid UUID'),
    usage: z.string().max(500).optional(),
});

// GET /api/articles/[id]/datasets - List datasets linked to an article
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const article = await db.query.articles.findFirst({
            where: eq(articles.id, params.id),
        });
        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const linked = await getArticleDatasets(params.id);
        return NextResponse.json(linked);
    } catch (error) {
        console.error('Failed to get article datasets:', error);
        return NextResponse.json({ error: 'Failed to get article datasets' }, { status: 500 });
    }
}

// POST /api/articles/[id]/datasets - Link a dataset to an article
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = linkSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
                { status: 400 },
            );
        }

        const article = await db.query.articles.findFirst({
            where: eq(articles.id, params.id),
        });
        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        await linkDatasetToArticle(params.id, parsed.data.datasetId, parsed.data.usage);
        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error('Failed to link dataset:', error);
        return NextResponse.json({ error: 'Failed to link dataset' }, { status: 500 });
    }
}

// DELETE /api/articles/[id]/datasets - Unlink a dataset from an article
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { searchParams } = request.nextUrl;
        const datasetId = searchParams.get('datasetId');
        if (!datasetId) {
            return NextResponse.json({ error: 'datasetId query parameter is required' }, { status: 400 });
        }

        await db.delete(articleDatasets)
            .where(and(
                eq(articleDatasets.articleId, params.id),
                eq(articleDatasets.datasetId, datasetId),
            ));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to unlink dataset:', error);
        return NextResponse.json({ error: 'Failed to unlink dataset' }, { status: 500 });
    }
}
