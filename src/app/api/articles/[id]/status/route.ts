import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles } from '@/lib/db/schema';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { logReviewEvent } from '@/lib/audit/events';
import { eq } from 'drizzle-orm';

// Valid status transitions
const TRANSITIONS: Record<string, string[]> = {
    draft: ['review'],
    research: ['draft', 'review'],
    outline: ['draft', 'review'],
    writing: ['draft', 'review'],
    humanizing: ['draft', 'review'],
    seo: ['draft', 'review'],
    review: ['approved', 'draft'],     // reviewer approves or sends back to draft
    approved: ['published', 'review'],  // publish or send back to review
    published: ['archived', 'review'],  // archive or pull back for review
    archived: ['draft'],                // unarchive back to draft
};

// POST /api/articles/[id]/status — transition article status
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);

    try {
        const body = await request.json();
        const { status: newStatus, rationale } = body;

        if (!newStatus) {
            return NextResponse.json({ error: 'Status is required' }, { status: 400 });
        }

        // Look up article
        const article = await db.query.articles.findFirst({
            where: eq(articles.id, params.id),
        });

        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        const currentStatus = article.status || 'draft';
        const allowedTransitions = TRANSITIONS[currentStatus] || [];

        if (!allowedTransitions.includes(newStatus)) {
            return NextResponse.json(
                {
                    error: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
                    allowed: allowedTransitions,
                },
                { status: 400 }
            );
        }

        // Build update
        const updates: Record<string, unknown> = {
            status: newStatus,
            updatedAt: new Date(),
        };

        // Track who approved/published
        if (newStatus === 'approved' || newStatus === 'review') {
            updates.lastReviewedAt = new Date();
            updates.lastReviewedBy = user.id;
        }
        if (newStatus === 'published') {
            updates.publishedBy = user.id;
        }

        await db.update(articles).set(updates).where(eq(articles.id, params.id));

        // Map status transition to event type
        const eventTypeMap: Record<string, string> = {
            review: 'submitted_for_review',
            approved: 'approved',
            published: 'published',
            archived: 'archived',
            draft: currentStatus === 'archived' ? 'reverted' : 'rejected',
        };

        await logReviewEvent({
            articleId: params.id,
            actorId: user.id,
            actorRole: user.role,
            eventType: (eventTypeMap[newStatus] || 'edited') as Parameters<typeof logReviewEvent>[0]['eventType'],
            rationale: rationale || null,
            metadata: { previousStatus: currentStatus, newStatus },
        });

        return NextResponse.json({
            success: true,
            previousStatus: currentStatus,
            newStatus,
            rationale: rationale || null,
        });
    } catch (error) {
        console.error('Failed to transition article status:', error);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }
}
