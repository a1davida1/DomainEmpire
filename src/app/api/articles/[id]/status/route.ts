import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles, reviewEvents } from '@/lib/db/schema';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { canTransition, getApprovalPolicy } from '@/lib/review/workflow';
import type { YmylLevel } from '@/lib/review/ymyl';
import { parseStructuredRationale } from '@/lib/review/rationale-policy';
import { analyzeContentQuality, toPlainText } from '@/lib/review/content-quality';
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

const MIN_REVIEW_QUALITY_SCORE = 70;
const MIN_REVIEW_WORD_COUNT = 900;

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
            const plainText = toPlainText(article.contentMarkdown, article.contentHtml);
            const quality = analyzeContentQuality(plainText);
            const qualityFailures: string[] = [];

            if (quality.qualityScore < MIN_REVIEW_QUALITY_SCORE) {
                qualityFailures.push(
                    `Quality score ${quality.qualityScore} is below required ${MIN_REVIEW_QUALITY_SCORE}`,
                );
            }

            if (quality.metrics.wordCount < MIN_REVIEW_WORD_COUNT) {
                qualityFailures.push(
                    `Word count ${quality.metrics.wordCount} is below required ${MIN_REVIEW_WORD_COUNT}`,
                );
            }

            if (qualityFailures.length > 0) {
                return NextResponse.json(
                    {
                        error: 'Content quality gate failed. Improve content before approving/publishing.',
                        details: qualityFailures,
                        quality: {
                            score: quality.qualityScore,
                            status: quality.status,
                            metrics: quality.metrics,
                            recommendations: quality.recommendations,
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

        type ReviewEventType = typeof reviewEvents.$inferInsert.eventType;
        const eventType = (eventTypeMap[newStatus] || 'edited') as NonNullable<ReviewEventType>;

        let autoPublished = false;

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
