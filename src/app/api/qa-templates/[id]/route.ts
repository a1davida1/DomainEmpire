import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { qaChecklistTemplates } from '@/lib/db/schema';
import { requireRole } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// PATCH /api/qa-templates/[id] — update a template (admin only)
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    let body;
    try {
        body = await request.json();
    } catch (error_) {
        console.error('QA template JSON parse error:', error_);
        return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.name !== undefined) updates.name = body.name;
    if (body.contentType !== undefined) updates.contentType = body.contentType;
    if (body.ymylLevel !== undefined) updates.ymylLevel = body.ymylLevel;
    if (body.items !== undefined) {
        if (!Array.isArray(body.items)) {
            return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
        }
        updates.items = body.items;
    }

    const [updated] = await db.update(qaChecklistTemplates)
        .set(updates)
        .where(eq(qaChecklistTemplates.id, params.id))
        .returning();

    if (!updated) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json(updated);
}
