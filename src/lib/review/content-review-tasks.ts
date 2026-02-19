import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { reviewTasks } from '@/lib/db/schema';

export async function ensureContentPublishTask(tx: DbOrTx, input: {
    articleId: string;
    domainId: string;
    createdBy: string | null;
}): Promise<string> {
    const lockKey = `content_publish:${input.articleId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const existing = await tx
        .select({ id: reviewTasks.id })
        .from(reviewTasks)
        .where(and(
            eq(reviewTasks.taskType, 'content_publish'),
            eq(reviewTasks.articleId, input.articleId),
            eq(reviewTasks.status, 'pending'),
        ))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(1);

    if (existing[0]?.id) {
        return existing[0].id;
    }

    const nowIso = new Date().toISOString();
    const [created] = await tx.insert(reviewTasks).values({
        taskType: 'content_publish',
        status: 'pending',
        entityId: input.articleId,
        articleId: input.articleId,
        domainId: input.domainId,
        createdBy: input.createdBy ?? null,
        slaHours: 24,
        escalateAfterHours: 48,
        checklistJson: {
            _system: {
                createdAt: nowIso,
                createdBy: input.createdBy ?? null,
                source: 'article_status',
                kind: 'submit_for_review',
            },
        },
    }).returning({ id: reviewTasks.id });

    if (!created?.id) {
        throw new Error('Failed to create content_publish review task');
    }

    return created.id;
}

export async function finalizeContentPublishTask(tx: DbOrTx, input: {
    articleId: string;
    status: 'approved' | 'rejected' | 'cancelled';
    reviewerId: string;
    reviewNotes: string;
}): Promise<{ updated: boolean; taskId: string | null }> {
    const lockKey = `content_publish:${input.articleId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const pending = await tx
        .select({ id: reviewTasks.id })
        .from(reviewTasks)
        .where(and(
            eq(reviewTasks.taskType, 'content_publish'),
            eq(reviewTasks.articleId, input.articleId),
            eq(reviewTasks.status, 'pending'),
        ))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(1)
        .for('update');

    const taskId = pending[0]?.id ?? null;
    if (!taskId) {
        return { updated: false, taskId: null };
    }

    const [updated] = await tx.update(reviewTasks).set({
        status: input.status,
        reviewerId: input.reviewerId,
        reviewNotes: input.reviewNotes,
        reviewedAt: new Date(),
        updatedAt: new Date(),
    }).where(eq(reviewTasks.id, taskId)).returning({ id: reviewTasks.id });

    return { updated: Boolean(updated?.id), taskId };
}

