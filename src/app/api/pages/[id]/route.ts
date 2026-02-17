import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, pageDefinitions } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_THEMES = new Set(['clean', 'editorial', 'bold', 'minimal']);
const VALID_SKINS = new Set(['slate', 'ocean', 'forest', 'ember', 'midnight', 'coral']);

// GET /api/pages/[id] — Fetch a single page definition with its blocks
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID' }, { status: 400 });
    }

    const rows = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (rows.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
}

// PATCH /api/pages/[id] — Update a page definition (blocks, theme, skin, publish state, etc.)
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID' }, { status: 400 });
    }

    const existing = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (existing.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    try {
        const body = await request.json();
        const updates: Record<string, unknown> = {};

        if (body.title !== undefined) updates.title = body.title;
        if (body.metaDescription !== undefined) updates.metaDescription = body.metaDescription;
        if (body.theme !== undefined) {
            if (typeof body.theme !== 'string' || !VALID_THEMES.has(body.theme)) {
                return NextResponse.json({ error: `Invalid theme. Must be one of: ${[...VALID_THEMES].join(', ')}` }, { status: 400 });
            }
            updates.theme = body.theme;
        }
        if (body.skin !== undefined) {
            if (typeof body.skin !== 'string' || !VALID_SKINS.has(body.skin)) {
                return NextResponse.json({ error: `Invalid skin. Must be one of: ${[...VALID_SKINS].join(', ')}` }, { status: 400 });
            }
            updates.skin = body.skin;
        }
        if (body.route !== undefined) {
            if (body.route !== existing[0].route) {
                const conflict = await db.select({ id: pageDefinitions.id }).from(pageDefinitions)
                    .where(and(
                        eq(pageDefinitions.domainId, existing[0].domainId),
                        eq(pageDefinitions.route, body.route),
                    ))
                    .limit(1);
                if (conflict.length > 0) {
                    return NextResponse.json(
                        { error: `Route "${body.route}" already exists for this domain`, existingId: conflict[0].id },
                        { status: 409 },
                    );
                }
            }
            updates.route = body.route;
        }
        if (body.isPublished !== undefined) updates.isPublished = body.isPublished;
        if (body.blocks !== undefined) {
            if (!Array.isArray(body.blocks)) {
                return NextResponse.json({ error: 'blocks must be an array' }, { status: 400 });
            }
            updates.blocks = body.blocks;
            updates.version = existing[0].version + 1;
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
        }

        updates.updatedAt = new Date();

        await db.update(pageDefinitions).set(updates).where(eq(pageDefinitions.id, id));

        const updated = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
        if (updated.length === 0) {
            return NextResponse.json({ error: 'Page not found after update' }, { status: 404 });
        }
        return NextResponse.json(updated[0]);
    } catch (error) {
        console.error('[api/pages] Update failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to update page definition' },
            { status: 500 },
        );
    }
}

// DELETE /api/pages/[id] — Delete a page definition
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID' }, { status: 400 });
    }

    const existing = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (existing.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    await db.delete(pageDefinitions).where(eq(pageDefinitions.id, id));

    return NextResponse.json({ success: true, deleted: id });
}
