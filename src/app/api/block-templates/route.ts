import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { blockTemplates } from '@/lib/db/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/block-templates — List block templates with optional filters
 * Query params: ?blockType=Hero&tag=finance&search=cta&global=true
 */
export async function GET(request: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const blockType = searchParams.get('blockType');
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');
    const globalOnly = searchParams.get('global') === 'true';

    let query = db.select().from(blockTemplates).$dynamic();

    const conditions = [];
    if (blockType) {
        conditions.push(eq(blockTemplates.blockType, blockType));
    }
    if (globalOnly) {
        conditions.push(eq(blockTemplates.isGlobal, true));
    }
    if (tag) {
        conditions.push(sql`${tag} = ANY(${blockTemplates.tags})`);
    }
    if (search) {
        const escapedSearch = search.replace(/([\\%_])/g, '\\$1');
        conditions.push(
            or(
                ilike(blockTemplates.name, `%${escapedSearch}%`),
                ilike(blockTemplates.description, `%${escapedSearch}%`),
            )!,
        );
    }

    if (conditions.length === 1) {
        query = query.where(conditions[0]);
    } else if (conditions.length > 1) {
        query = query.where(sql`${sql.join(conditions, sql` AND `)}`);
    }

    const templates = await query.limit(100);
    return NextResponse.json({ templates });
}

/**
 * POST /api/block-templates — Save a block as a reusable template
 * Body: { name, description?, blockType, variant?, config?, content?, tags?, sourceDomainId?, sourceBlockId?, isGlobal? }
 */
export async function POST(request: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const blockType = typeof body.blockType === 'string' ? body.blockType.trim() : '';

    if (!name) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!blockType) {
        return NextResponse.json({ error: 'blockType is required' }, { status: 400 });
    }

    if (body.isGlobal === true && user.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can create global templates' }, { status: 403 });
    }

    const [created] = await db.insert(blockTemplates).values({
        name,
        description: typeof body.description === 'string' ? body.description : null,
        blockType,
        variant: typeof body.variant === 'string' ? body.variant : null,
        config: typeof body.config === 'object' && body.config !== null ? body.config as Record<string, unknown> : {},
        content: typeof body.content === 'object' && body.content !== null ? body.content as Record<string, unknown> : {},
        tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
        sourceDomainId: typeof body.sourceDomainId === 'string' && UUID_RE.test(body.sourceDomainId) ? body.sourceDomainId : null,
        sourceBlockId: typeof body.sourceBlockId === 'string' && UUID_RE.test(body.sourceBlockId) ? body.sourceBlockId : null,
        isGlobal: body.isGlobal === true,
        createdBy: user.id,
    }).returning();

    return NextResponse.json(created, { status: 201 });
}

/**
 * DELETE /api/block-templates — Delete a template
 * Body: { templateId: string }
 */
export async function DELETE(request: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
    }

    const templateId = typeof body.templateId === 'string' ? body.templateId : '';
    if (!templateId || !UUID_RE.test(templateId)) {
        return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const ownershipCondition = user.role === 'admin'
        ? eq(blockTemplates.id, templateId)
        : and(eq(blockTemplates.id, templateId), eq(blockTemplates.createdBy, user.id));

    const deleted = await db.delete(blockTemplates)
        .where(ownershipCondition)
        .returning({ id: blockTemplates.id });

    if (deleted.length === 0) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: templateId });
}
