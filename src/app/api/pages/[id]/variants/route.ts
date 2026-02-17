import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pageDefinitions, pageVariants } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: string }).code === '23505';
}

async function parseJsonBody(request: NextRequest): Promise<Record<string, unknown> | null> {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

/**
 * GET /api/pages/[id]/variants — List all A/B variants for a page definition
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page ID' }, { status: 400 });
    }

    const page = await db.select({ id: pageDefinitions.id })
        .from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (page.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    const variants = await db.select().from(pageVariants)
        .where(eq(pageVariants.pageId, id));

    return NextResponse.json({ variants });
}

/**
 * POST /api/pages/[id]/variants — Create a new A/B variant
 * Body: { variantKey: string, weight?: number, blocks?: Block[] }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page ID' }, { status: 400 });
    }

    const pageRows = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.id, id)).limit(1);
    if (pageRows.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    const body = await parseJsonBody(request);
    if (!body) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const variantKey = typeof body.variantKey === 'string' ? body.variantKey.trim() : '';
    if (!variantKey) {
        return NextResponse.json({ error: 'variantKey is required' }, { status: 400 });
    }

    const weight = typeof body.weight === 'number' ? Math.max(1, Math.min(100, body.weight)) : 50;
    const blocks = Array.isArray(body.blocks) ? body.blocks : pageRows[0].blocks;

    let created: typeof pageVariants.$inferSelect;
    try {
        const rows = await db.insert(pageVariants).values({
            pageId: id,
            variantKey,
            weight,
            blocks,
        }).returning();
        if (!rows[0]) {
            return NextResponse.json({ error: 'Insert succeeded but returned no row' }, { status: 500 });
        }
        created = rows[0];
    } catch (error) {
        if (isUniqueViolation(error)) {
            return NextResponse.json({ error: `Variant '${variantKey}' already exists` }, { status: 409 });
        }
        throw error;
    }

    return NextResponse.json(created, { status: 201 });
}

/**
 * PATCH /api/pages/[id]/variants — Update variant weights/blocks/active state
 * Body: { variantId: string, weight?: number, blocks?: Block[], isActive?: boolean }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page ID' }, { status: 400 });
    }

    const body = await parseJsonBody(request);
    if (!body) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const variantId = typeof body.variantId === 'string' ? body.variantId : '';
    if (!variantId || !UUID_RE.test(variantId)) {
        return NextResponse.json({ error: 'variantId is required' }, { status: 400 });
    }

    const existing = await db.select().from(pageVariants)
        .where(and(eq(pageVariants.id, variantId), eq(pageVariants.pageId, id)))
        .limit(1);
    if (existing.length === 0) {
        return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.weight === 'number') {
        updates.weight = Math.max(1, Math.min(100, body.weight));
    }
    if (Array.isArray(body.blocks)) {
        updates.blocks = body.blocks;
    }
    if (typeof body.isActive === 'boolean') {
        updates.isActive = body.isActive;
    }

    await db.update(pageVariants).set(updates)
        .where(eq(pageVariants.id, variantId));

    const updated = await db.select().from(pageVariants)
        .where(eq(pageVariants.id, variantId)).limit(1);
    return NextResponse.json(updated[0]);
}

/**
 * DELETE /api/pages/[id]/variants — Delete a variant
 * Body: { variantId: string }
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page ID' }, { status: 400 });
    }

    const body = await parseJsonBody(request);
    if (!body) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const variantId = typeof body.variantId === 'string' ? body.variantId : '';
    if (!variantId || !UUID_RE.test(variantId)) {
        return NextResponse.json({ error: 'variantId is required' }, { status: 400 });
    }

    const deleted = await db.delete(pageVariants)
        .where(and(eq(pageVariants.id, variantId), eq(pageVariants.pageId, id)))
        .returning({ id: pageVariants.id });

    if (deleted.length === 0) {
        return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: variantId });
}
