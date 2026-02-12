import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { createRevision } from '@/lib/audit/revisions';
import { logReviewEvent } from '@/lib/audit/events';
import { eq, and, ne } from 'drizzle-orm';
import { z } from 'zod';

import { calculatorConfigSchema, comparisonDataSchema, leadGenConfigSchema } from '@/lib/validation/articles';

const VALID_CONTENT_TYPES = ['article', 'comparison', 'calculator', 'cost_guide', 'lead_capture', 'health_decision', 'checklist', 'faq', 'review'];

const jsonbSchemas: Record<string, z.ZodType> = {
    calculatorConfig: calculatorConfigSchema,
    comparisonData: comparisonDataSchema,
    leadGenConfig: leadGenConfigSchema,
};

/** Validate optional JSONB fields, returning a 400 response on failure or null on success. */
function validateJsonbFields(
    body: Record<string, unknown>,
    updateData: Record<string, unknown>,
): NextResponse | null {
    for (const [field, schema] of Object.entries(jsonbSchemas)) {
        if (body[field] === undefined) continue;
        if (body[field] === null) { updateData[field] = null; continue; }
        const parsed = schema.safeParse(body[field]);
        if (!parsed.success) {
            return NextResponse.json(
                { error: `Invalid ${field}`, details: (parsed.error as z.ZodError).flatten().fieldErrors },
                { status: 400 },
            );
        }
        updateData[field] = body[field];
    }
    return null;
}

// PATCH /api/articles/[id] - Update article content
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;

    try {
        const body = await request.json();
        const { title, slug, content, targetKeyword, metaDescription, contentType } = body;

        // Basic validation
        if (!title || !slug) {
            return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
        }

        if (contentType && !VALID_CONTENT_TYPES.includes(contentType)) {
            return NextResponse.json({ error: `Invalid contentType. Must be one of: ${VALID_CONTENT_TYPES.join(', ')}` }, { status: 400 });
        }

        const existingDefault = await db.query.articles.findFirst({
            where: eq(articles.id, id),
        });

        if (!existingDefault) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        // Check for duplicate slug (another article with same slug)
        const duplicateSlug = await db.query.articles.findFirst({
            where: and(
                eq(articles.slug, slug),
                ne(articles.id, id)
            ),
        });

        if (duplicateSlug) {
            return NextResponse.json(
                { error: 'Slug already exists. Please choose a different slug.' },
                { status: 409 }
            );
        }

        // Update article
        const updateData: Record<string, unknown> = {
            title,
            slug,
            contentMarkdown: content,
            targetKeyword,
            metaDescription,
            updatedAt: new Date(),
        };
        if (contentType !== undefined) updateData.contentType = contentType;

        const jsonbError = validateJsonbFields(body, updateData);
        if (jsonbError) return jsonbError;

        await db.update(articles)
            .set(updateData)
            .where(eq(articles.id, id));

        // Create revision snapshot + audit event
        const user = getRequestUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const revisionId = await createRevision({
            articleId: id,
            title,
            contentMarkdown: content,
            metaDescription: metaDescription || null,
            changeType: 'manual_edit',
            changeSummary: body.changeSummary || 'Manual edit via dashboard',
            createdById: user.id || null,
        });

        if (user.id) {
            await logReviewEvent({
                articleId: id,
                revisionId,
                actorId: user.id,
                actorRole: user.role,
                eventType: 'edited',
                metadata: { fields: Object.keys(body) },
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Failed to update article:', error);
        return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
    }
}
