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
    const thresholdStr = searchParams.get('threshold') || '0.6';
    const threshold = Number.parseFloat(thresholdStr);

    if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
        return NextResponse.json({ error: 'Invalid threshold parameter' }, { status: 400 });
    }

    try {
        const stale = await detectStaleArticles(threshold);
        return NextResponse.json({ staleArticles: stale, count: stale.length });
    } catch (error) {
        console.error('Failed to detect stale articles:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to detect stale articles' },
            { status: 500 }
        );
    }
}

// POST /api/content/refresh — Queue a content refresh
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    let body: any;
    try {
        body = await request.json();
        const parsed = refreshSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        const jobId = await queueContentRefresh(parsed.data.articleId);
        return NextResponse.json({ jobId }, { status: 201 });
    } catch (error) {
        console.error(`Failed to queue refresh for ${body?.articleId || 'unknown'}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to queue refresh' },
            { status: 500 }
        );
    }
}
