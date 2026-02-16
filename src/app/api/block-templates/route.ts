import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { blockTemplates } from '@/lib/db/schema';
import { eq, or, ilike, sql } from 'drizzle-orm';

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
        conditions.push(
            or(
                ilike(blockTemplates.name, `%${search}%`),
                ilike(blockTemplates.description, `%${search}%`),
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

    const body = await request.json();
    const name = (body.name || '').trim();
    const blockType = (body.blockType || '').trim();

    if (!name) {
        return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!blockType) {
        return NextResponse.json({ error: 'blockType is required' }, { status: 400 });
    }

    const [created] = await db.insert(blockTemplates).values({
        name,
        description: body.description || null,
        blockType,
        variant: body.variant || null,
        config: body.config || {},
        content: body.content || {},
        tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
        sourceDomainId: body.sourceDomainId && UUID_RE.test(body.sourceDomainId) ? body.sourceDomainId : null,
        sourceBlockId: body.sourceBlockId || null,
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

    const body = await request.json();
    const templateId = body.templateId;
    if (!templateId || !UUID_RE.test(templateId)) {
        return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const deleted = await db.delete(blockTemplates)
        .where(eq(blockTemplates.id, templateId))
        .returning({ id: blockTemplates.id });

    if (deleted.length === 0) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: templateId });
}
