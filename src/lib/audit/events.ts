import { db } from '@/lib/db';
import { reviewEvents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export type ReviewEventType =
    | 'created'
    | 'edited'
    | 'submitted_for_review'
    | 'approved'
    | 'rejected'
    | 'published'
    | 'archived'
    | 'reverted'
    | 'comment'
    | 'qa_completed'
    | 'expert_signed';

export async function logReviewEvent(opts: {
    articleId: string;
    revisionId?: string | null;
    actorId: string;
    actorRole: string;
    eventType: ReviewEventType;
    reasonCode?: string | null;
    rationale?: string | null;
    metadata?: Record<string, unknown> | null;
    tx?: typeof db;
}): Promise<string> {
    const dbClient = opts.tx || db;
    const [event] = await dbClient.insert(reviewEvents).values({
        articleId: opts.articleId,
        revisionId: opts.revisionId || null,
        actorId: opts.actorId,
        actorRole: opts.actorRole,
        eventType: opts.eventType,
        reasonCode: opts.reasonCode || null,
        rationale: opts.rationale || null,
        metadata: opts.metadata || null,
    }).returning({ id: reviewEvents.id });

    return event.id;
}

export async function getArticleEvents(articleId: string, limit = 100) {
    return db.select()
        .from(reviewEvents)
        .where(eq(reviewEvents.articleId, articleId))
        .orderBy(desc(reviewEvents.createdAt))
        .limit(limit);
}

export async function getRecentEvents(limit = 50) {
    return db.select()
        .from(reviewEvents)
        .orderBy(desc(reviewEvents.createdAt))
        .limit(limit);
}
