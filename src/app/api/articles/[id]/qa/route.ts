import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles } from '@/lib/db/schema';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { getChecklistForArticle, submitChecklist, getLatestQaResult } from '@/lib/review/qa';
import { logReviewEvent } from '@/lib/audit/events';
import { eq } from 'drizzle-orm';

// GET /api/articles/[id]/qa — get QA checklist + latest result
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const article = await db.query.articles.findFirst({
        where: eq(articles.id, params.id),
        columns: { ymylLevel: true, status: true },
    });

    if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const checklist = await getChecklistForArticle({
        ymylLevel: (article.ymylLevel as 'none' | 'low' | 'medium' | 'high') || 'none',
    });

    const latestResult = await getLatestQaResult(params.id);

    return NextResponse.json({ checklist, latestResult });
}

// POST /api/articles/[id]/qa — submit QA checklist results
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);

    try {
        const body = await request.json();
        const { results, templateId } = body;

        if (!results || typeof results !== 'object') {
            return NextResponse.json({ error: 'Results object is required' }, { status: 400 });
        }

        const { id, allPassed } = await submitChecklist({
            articleId: params.id,
            templateId: templateId || null,
            reviewerId: user.id,
            results,
        });

        await logReviewEvent({
            articleId: params.id,
            actorId: user.id,
            actorRole: user.role,
            eventType: 'qa_completed',
            metadata: { allPassed, templateId },
        });

        return NextResponse.json({ id, allPassed });
    } catch (error) {
        console.error('Failed to submit QA checklist:', error);
        return NextResponse.json({ error: 'Failed to submit checklist' }, { status: 500 });
    }
}
