import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles, reviewEvents, reviewTasks } from '@/lib/db/schema';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { canTransition, getApprovalPolicy } from '@/lib/review/workflow';
import type { YmylLevel } from '@/lib/review/ymyl';
import { parseStructuredRationale, requiresStructuredRationale } from '@/lib/review/rationale-policy';
import { evaluateQualityGate } from '@/lib/review/quality-gate';
import { ensureContentPublishTask, finalizeContentPublishTask } from '@/lib/review/content-review-tasks';
import { and, desc, eq } from 'drizzle-orm';

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

async function tryAutoPublish(
    articleId: string,
    domainId: string,
    ymylLevel: string,
    user: { id: string; role: string },
    tx?: typeof db
): Promise<boolean> {
    const policy = await getApprovalPolicy({
        domainId,
        ymylLevel: ymylLevel as YmylLevel,
    });

    if (!policy.autoPublish) return false;

    const publishCheck = await canTransition({
        articleId,
        domainId,
        ymylLevel: ymylLevel as YmylLevel,
        targetStatus: 'published',
        userRole: user.role,
    });

    if (!publishCheck.allowed) return false;

    const dbClient = tx || db;

    await dbClient.update(articles).set({
        status: 'published',
        publishedBy: user.id,
        updatedAt: new Date(),
    }).where(eq(articles.id, articleId));

    // Manually insert review event because logReviewEvent doesn't currently support passing a transaction client
    // and the requirement wants them committed together.
    await dbClient.insert(reviewEvents).values({
        articleId,
        actorId: user.id,
        actorRole: user.role,
        eventType: 'published',
        rationale: 'Auto-published per approval policy',
        metadata: { previousStatus: 'approved', newStatus: 'published', autoPublish: true },
    });

    return true;
}

// POST /api/articles/[id]/status — transition article status
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const newStatus = typeof body.status === 'string' ? body.status : '';
        const rationale = typeof body.rationale === 'string' ? body.rationale : null;
        const rationaleDetails = body.rationaleDetails;

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

        // Prevent double-decisions: if a pending content_publish review task is assigned to
        // another reviewer, only that reviewer (or admin) may approve/send-back.
        if (currentStatus === 'review' && (newStatus === 'approved' || newStatus === 'draft')) {
            const taskRows = await db.select({
                id: reviewTasks.id,
                reviewerId: reviewTasks.reviewerId,
            })
                .from(reviewTasks)
                .where(and(
                    eq(reviewTasks.taskType, 'content_publish'),
                    eq(reviewTasks.status, 'pending'),
                    eq(reviewTasks.articleId, params.id),
                ))
                .orderBy(desc(reviewTasks.createdAt))
                .limit(1);

            const task = taskRows[0] || null;
            if (task?.reviewerId && task.reviewerId !== user.id && user.role !== 'admin') {
                return NextResponse.json(
                    { error: 'This review task is assigned to another reviewer' },
                    { status: 403 },
                );
            }
        }

        const rationaleValidation = parseStructuredRationale({
            contentType: article.contentType,
            rationale,
            rationaleDetails,
            fromStatus: currentStatus,
            toStatus: newStatus,
        });

        if (!rationaleValidation.ok) {
            return NextResponse.json(
                {
                    error: rationaleValidation.error,
                    details: rationaleValidation.details || null,
                },
                { status: 400 },
            );
        }

        // Enforce role requirements for reviewer decisions (approve/send-back/publish)
        if (requiresStructuredRationale(currentStatus, newStatus)) {
            const policy = await getApprovalPolicy({
                domainId: article.domainId,
                ymylLevel: (article.ymylLevel || 'none') as YmylLevel,
            });

            const ROLE_HIERARCHY: Record<string, number> = { editor: 1, reviewer: 2, expert: 3, admin: 4 };
            const userLevel = ROLE_HIERARCHY[user.role] || 0;
            const requiredLevel = ROLE_HIERARCHY[policy.requiredRole] || 0;
            if (userLevel < requiredLevel) {
                return NextResponse.json(
                    { error: `Requires ${policy.requiredRole} role or higher (you are ${user.role})` },
                    { status: 403 },
                );
            }
        }

        // Enforce approval policies (role, QA checklist, expert sign-off)
        const policyCheck = await canTransition({
            articleId: params.id,
            domainId: article.domainId,
            ymylLevel: (article.ymylLevel || 'none') as YmylLevel,
            targetStatus: newStatus,
            userRole: user.role,
        });

        if (!policyCheck.allowed) {
            return NextResponse.json(
                { error: policyCheck.reason || 'Transition blocked by approval policy' },
                { status: 403 }
            );
        }

        if (newStatus === 'approved' || newStatus === 'published') {
            const evaluation = evaluateQualityGate({
                contentType: article.contentType,
                ymylLevel: article.ymylLevel,
                contentMarkdown: article.contentMarkdown,
                contentHtml: article.contentHtml,
            });

            if (!evaluation.passed) {
                return NextResponse.json(
                    {
                        error: 'Content quality gate failed. Improve content before approving/publishing.',
                        details: evaluation.failures,
                        qualityGate: evaluation.gate,
                        quality: {
                            score: evaluation.quality.qualityScore,
                            status: evaluation.quality.status,
                            metrics: evaluation.quality.metrics,
                            recommendations: evaluation.quality.recommendations,
                        },
                    },
                    { status: 403 },
                );
            }
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
        if (newStatus === 'review') {
            updates.reviewRequestedAt = new Date();
        }
        if (newStatus === 'published') {
            updates.publishedBy = user.id;
        }

        // Map status transition to event type
        const eventTypeMap: Record<string, string> = {
            review: 'submitted_for_review',
            approved: 'approved',
            published: 'published',
            archived: 'archived',
            draft: currentStatus === 'archived' ? 'reverted' : 'rejected',
        };

        type ReviewEventType = typeof reviewEvents.$inferInsert.eventType;
        const eventType = (eventTypeMap[newStatus] || 'edited') as NonNullable<ReviewEventType>;

        let autoPublished = false;
        let reviewTaskId: string | null = null;

        // Perform status update and event logging atomically in a transaction
        await db.transaction(async (tx) => {
            await tx.update(articles).set(updates).where(eq(articles.id, params.id));

            await tx.insert(reviewEvents).values({
                articleId: params.id,
                actorId: user.id,
                actorRole: user.role,
                eventType: eventType,
                rationale: rationale || null,
                metadata: {
                    previousStatus: currentStatus,
                    newStatus,
                    rationaleSchemaVersion: Object.keys(rationaleValidation.parsed || {}).length > 0
                        ? 'review_rationale_v1'
                        : null,
                    rationaleDetails: Object.keys(rationaleValidation.parsed || {}).length > 0
                        ? rationaleValidation.parsed
                        : null,
                },
            });

            if (newStatus === 'review') {
                reviewTaskId = await ensureContentPublishTask(tx, {
                    articleId: params.id,
                    domainId: article.domainId,
                    createdBy: user.id,
                });
            }
            if (newStatus === 'approved') {
                const finalized = await finalizeContentPublishTask(tx, {
                    articleId: params.id,
                    status: 'approved',
                    reviewerId: user.id,
                    reviewNotes: (rationale || 'Approved').trim(),
                });
                reviewTaskId = finalized.taskId;
            }
            if (newStatus === 'draft' && currentStatus === 'review') {
                const finalized = await finalizeContentPublishTask(tx, {
                    articleId: params.id,
                    status: 'rejected',
                    reviewerId: user.id,
                    reviewNotes: (rationale || 'Sent back to draft').trim(),
                });
                reviewTaskId = finalized.taskId;
            }

            // If approving, attempt auto-publish within the same transaction if possible
            if (newStatus === 'approved') {
                autoPublished = await tryAutoPublish(params.id, article.domainId, article.ymylLevel || 'none', user, tx);
            }
        });

        return NextResponse.json({
            success: true,
            previousStatus: currentStatus,
            newStatus: autoPublished ? 'published' : newStatus,
            autoPublished,
            reviewTaskId,
            rationale: rationale || null,
            rationaleDetails: Object.keys(rationaleValidation.parsed || {}).length > 0
                ? rationaleValidation.parsed
                : null,
        });
    } catch (error) {
        console.error('Failed to transition article status:', error);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }
}
