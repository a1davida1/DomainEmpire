import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getArticleEvents } from '@/lib/audit/events';

// GET /api/articles/[id]/events — list audit events for an article
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const events = await getArticleEvents(params.id);
    const total = events.length;
    const paginated = events.slice(offset, offset + limit);
    return NextResponse.json({ data: paginated, total, limit, offset });
}
