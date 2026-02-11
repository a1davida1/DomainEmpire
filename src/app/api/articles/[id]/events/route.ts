import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getArticleEvents } from '@/lib/audit/events';

// GET /api/articles/[id]/events — list audit events for an article
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const events = await getArticleEvents(params.id);
    return NextResponse.json(events);
}
