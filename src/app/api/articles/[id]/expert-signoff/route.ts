import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { articles, reviewEvents } from '@/lib/db/schema';
import { requireRole, getRequestUser } from '@/lib/auth';
import { logReviewEvent } from '@/lib/audit/events';
import { eq, and } from 'drizzle-orm';

// POST /api/articles/[id]/expert-signoff — expert attests to content accuracy
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const article = await db.query.articles.findFirst({
        where: eq(articles.id, params.id),
    });

    if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    if (article.status !== 'approved') {
        return NextResponse.json(
            { error: 'Article must be in approved status for expert sign-off' },
            { status: 400 }
        );
    }

    // Check for existing sign-off (idempotency)
    const existingSignoff = await db.query.reviewEvents.findFirst({
        where: and(
            eq(reviewEvents.articleId, params.id),
            eq(reviewEvents.eventType, 'expert_signed'),
            eq(reviewEvents.actorId, user.id)
        )
    });

    if (existingSignoff) {
        return NextResponse.json({ success: true, eventType: 'expert_signed', idempotent: true });
    }

    const body = await request.json().catch(() => ({}));
    const attestation = body.attestation || 'Content reviewed and attested as factually accurate';

    try {
        await db.transaction(async (tx) => {
            // Log the audit event
            await logReviewEvent({
                tx,
                articleId: params.id,
                actorId: user.id,
                actorRole: user.role,
                eventType: 'expert_signed',
                rationale: attestation,
                metadata: {
                    expertName: user.name,
                    expertCredentials: body.credentials || null,
                    signedAt: new Date().toISOString(),
                },
            });

            // Update article's reviewed-by
            await tx.update(articles).set({
                lastReviewedAt: new Date(),
                lastReviewedBy: user.id,
                updatedAt: new Date(),
            }).where(eq(articles.id, params.id));
        });
    } catch (error: unknown) {
        // Handle unique constraint violation (code 23505 in Postgres)
        const dbError = error as { code?: string; message?: string };
        if (dbError.code === '23505' || dbError.message?.includes('unique constraint')) {
            return NextResponse.json({ success: true, eventType: 'expert_signed', idempotent: true });
        }
        throw error;
    }

    return NextResponse.json({ success: true, eventType: 'expert_signed' });
}
