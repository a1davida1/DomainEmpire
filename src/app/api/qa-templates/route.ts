import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { qaChecklistTemplates } from '@/lib/db/schema';
import { requireAuth, requireRole } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/qa-templates — list all QA checklist templates
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const templates = await db.select().from(qaChecklistTemplates).orderBy(qaChecklistTemplates.createdAt);
    return NextResponse.json(templates);
}

// POST /api/qa-templates — create a new QA template (admin only)
export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    let body;
    try {
        body = await request.json();
    } catch (error_) {
        console.error('QA template creation JSON parse error:', error_);
        return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
    }
    const { name, contentType, ymylLevel, items } = body;

    if (!name || !items || !Array.isArray(items)) {
        return NextResponse.json({ error: 'name and items[] are required' }, { status: 400 });
    }

    for (const item of items) {
        if (!item.id || !item.label || !item.category) {
            return NextResponse.json(
                { error: 'Each item must have id, label, and category' },
                { status: 400 }
            );
        }
    }

    const rows = await db.insert(qaChecklistTemplates).values({
        name,
        contentType: contentType || null,
        ymylLevel: ymylLevel || 'none',
        items,
    }).returning();
    const template = rows[0];

    if (!template) {
        return NextResponse.json({ error: 'Insert returned no row' }, { status: 500 });
    }

    return NextResponse.json(template, { status: 201 });
}

// DELETE /api/qa-templates?id=xxx — delete a template (admin only)
export async function DELETE(request: NextRequest) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    await db.delete(qaChecklistTemplates).where(eq(qaChecklistTemplates.id, id));
    return NextResponse.json({ success: true });
}
