import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, pageDefinitions } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getHomepagePreset, getArticlePagePreset } from '@/lib/deploy/blocks/presets';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/pages?domainId=xxx — List page definitions for a domain
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const domainId = request.nextUrl.searchParams.get('domainId');
    if (!domainId || !UUID_RE.test(domainId)) {
        return NextResponse.json({ error: 'domainId query param required (UUID)' }, { status: 400 });
    }

    const rows = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, domainId));

    return NextResponse.json({ pages: rows });
}

// POST /api/pages — Create a new page definition (optionally from a preset)
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const { domainId, route, title, metaDescription, theme, skin, blocks, preset, contentType } = body;

        const domainIdValue = typeof domainId === 'string' ? domainId : '';
        if (!domainIdValue || !UUID_RE.test(domainIdValue)) {
            return NextResponse.json({ error: 'domainId is required (UUID)' }, { status: 400 });
        }

        const routeValue = typeof route === 'string' ? route : '';
        if (!routeValue) {
            return NextResponse.json({ error: 'route is required (e.g., "/" or "/about")' }, { status: 400 });
        }

        const titleValue = typeof title === 'string' ? title : null;
        const metaDescriptionValue = typeof metaDescription === 'string' ? metaDescription : null;
        const themeValue = typeof theme === 'string' ? theme : 'clean';
        const skinValue = typeof skin === 'string' ? skin : 'slate';
        const presetValue = typeof preset === 'string' ? preset : null;
        const contentTypeValue = typeof contentType === 'string' ? contentType : null;

        // Check for duplicate route
        const existing = await db.select({ id: pageDefinitions.id }).from(pageDefinitions)
            .where(and(eq(pageDefinitions.domainId, domainIdValue), eq(pageDefinitions.route, routeValue)))
            .limit(1);

        if (existing.length > 0) {
            return NextResponse.json(
                { error: `Page definition already exists for route "${route}" on this domain`, existingId: existing[0].id },
                { status: 409 },
            );
        }

        // Resolve blocks from preset or direct input
        let resolvedBlocks = blocks;
        if (!resolvedBlocks && presetValue) {
            if (routeValue === '/' || presetValue.startsWith('homepage:')) {
                const presetKey = presetValue.replace('homepage:', '');
                resolvedBlocks = getHomepagePreset(presetKey);
            } else {
                const presetKey = contentTypeValue || presetValue.replace('article:', '');
                resolvedBlocks = getArticlePagePreset(presetKey);
            }
        }

        if (!resolvedBlocks || !Array.isArray(resolvedBlocks)) {
            return NextResponse.json(
                { error: 'Either blocks array or preset name is required' },
                { status: 400 },
            );
        }

        const rows = await db.insert(pageDefinitions).values({
            domainId: domainIdValue,
            route: routeValue,
            title: titleValue,
            metaDescription: metaDescriptionValue,
            theme: themeValue,
            skin: skinValue,
            blocks: resolvedBlocks,
            isPublished: false,
            version: 1,
        }).returning();
        const inserted = rows[0];

        if (!inserted) {
            return NextResponse.json({ error: 'Insert succeeded but returned no row' }, { status: 500 });
        }

        return NextResponse.json(inserted, { status: 201 });
    } catch (error) {
        console.error('[api/pages] Create failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to create page definition' },
            { status: 500 },
        );
    }
}
