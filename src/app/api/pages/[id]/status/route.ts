import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { reviewEvents } from '@/lib/db/schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TRANSITIONS: Record<string, string[]> = {
    draft: ['review'],
    review: ['approved', 'draft'],
    approved: ['published', 'review', 'draft'],
    published: ['draft'],
};

const ROLE_HIERARCHY: Record<string, number> = {
    editor: 1,
    reviewer: 2,
    expert: 3,
    admin: 4,
};

/**
 * POST /api/pages/[id]/status
 * Transition a page definition through the review workflow.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
    }

    const newStatus = body.status as string;
    if (!newStatus || typeof newStatus !== 'string') {
        return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const rows = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (rows.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    const page = rows[0];
    const currentStatus = page.status;

    // Validate transition
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
        return NextResponse.json(
            { error: `Cannot transition from '${currentStatus}' to '${newStatus}'` },
            { status: 400 },
        );
    }

    // Role checks
    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    if ((newStatus === 'approved' || newStatus === 'published') && userLevel < ROLE_HIERARCHY.reviewer) {
        return NextResponse.json(
            { error: 'Reviewer role or higher required to approve/publish pages' },
            { status: 403 },
        );
    }

    const now = new Date();
    const updates: Record<string, unknown> = {
        status: newStatus,
        updatedAt: now,
    };

    if (newStatus === 'review') {
        updates.reviewRequestedAt = now;
    }
    if (newStatus === 'approved' || newStatus === 'published') {
        updates.lastReviewedAt = now;
        updates.lastReviewedBy = user.id;
    }
    if (newStatus === 'published') {
        updates.isPublished = true;
    }
    if (newStatus === 'draft') {
        updates.isPublished = false;
    }

    // Map to event type
    const eventTypeMap: Record<string, string> = {
        review: 'submitted_for_review',
        approved: 'approved',
        published: 'published',
        draft: currentStatus === 'published' ? 'reverted' : 'rejected',
    };

    type ReviewEventType = typeof reviewEvents.$inferInsert.eventType;

    const rationale = typeof body.rationale === 'string' ? body.rationale : null;

    await db.transaction(async (tx) => {
        await tx.update(pageDefinitions).set(updates).where(eq(pageDefinitions.id, id));

        await tx.insert(reviewEvents).values({
            pageDefinitionId: id,
            actorId: user.id,
            actorRole: user.role,
            eventType: (eventTypeMap[newStatus] || 'edited') as NonNullable<ReviewEventType>,
            rationale,
        });
    });

    const updated = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (updated.length === 0) {
        return NextResponse.json({ error: 'Page not found after update' }, { status: 404 });
    }
    return NextResponse.json(updated[0]);
}
