import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { detectStaleArticles, queueContentRefresh } from '@/lib/content/refresh';
import { z } from 'zod';

const refreshSchema = z.object({
    articleId: z.string().uuid(),
});

// GET /api/content/refresh — Get stale articles
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const threshold = parseFloat(searchParams.get('threshold') || '0.6');

    try {
        const stale = await detectStaleArticles(threshold);
        return NextResponse.json({ staleArticles: stale, count: stale.length });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to detect stale articles', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// POST /api/content/refresh — Queue a content refresh
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = refreshSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        const jobId = await queueContentRefresh(parsed.data.articleId);
        return NextResponse.json({ jobId }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to queue refresh', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}
