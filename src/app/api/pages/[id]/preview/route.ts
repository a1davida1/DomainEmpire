import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, pageDefinitions, domains, previewBuilds } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    assemblePageFromBlocks,
    getConfiguratorBridgeScript,
    type RenderContext,
} from '@/lib/deploy/blocks/assembler';
import { deriveAllowedParentOrigin } from '@/lib/deploy/allowed-parent-origin';
import type { BlockEnvelope } from '@/lib/deploy/blocks/schemas';
// Side-effect: register interactive block renderers
import '@/lib/deploy/blocks/renderers-interactive';
import { generateV2GlobalStyles } from '@/lib/deploy/themes';
import { extractSiteTitle } from '@/lib/deploy/templates/shared';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// extractSiteTitle imported from '@/lib/deploy/templates/shared'

/**
 * GET /api/pages/[id]/preview — Render a v2 page definition to HTML and return it inline.
 * Used for iframe-based preview in the dashboard.
 *
 * Query params:
 *   ?format=html  (default) returns raw HTML with Content-Type text/html
 *   ?format=json  returns { html, css, meta } as JSON
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID' }, { status: 400 });
    }

    const buildId = request.nextUrl.searchParams.get('buildId');
    if (buildId) {
        if (!UUID_RE.test(buildId)) {
            return NextResponse.json({ error: 'Invalid build ID' }, { status: 400 });
        }

        const builds = await db.select().from(previewBuilds).where(eq(previewBuilds.id, buildId)).limit(1);
        if (builds.length === 0 || !builds[0].buildLog) {
            return NextResponse.json({ error: 'Preview build not found' }, { status: 404 });
        }

        const build = builds[0];
        const metadata = (build.metadata ?? {}) as Record<string, unknown>;
        if (metadata.pageDefinitionId !== id) {
            return NextResponse.json({ error: 'Preview build not found for page' }, { status: 404 });
        }

        return new NextResponse(build.buildLog, {
            status: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'private, max-age=300, stale-while-revalidate=60',
                'X-Frame-Options': 'SAMEORIGIN',
            },
        });
    }

    const pageDefs = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (pageDefs.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    const pageDef = pageDefs[0];

    const domainRows = await db.select().from(domains).where(eq(domains.id, pageDef.domainId)).limit(1);
    if (domainRows.length === 0) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const domain = domainRows[0];
    const siteTitle = extractSiteTitle(domain.domain);
    const themeName = pageDef.theme || 'clean';
    const skinName = pageDef.skin || domain.skin || 'slate';

    const ctx: RenderContext = {
        domain: domain.domain,
        siteTitle,
        route: pageDef.route,
        theme: themeName,
        skin: skinName,
        pageTitle: pageDef.title || undefined,
        pageDescription: pageDef.metaDescription || undefined,
        publishedAt: pageDef.createdAt ? new Date(pageDef.createdAt).toISOString() : undefined,
        updatedAt: pageDef.updatedAt ? new Date(pageDef.updatedAt).toISOString() : undefined,
        headScripts: '',
        bodyScripts: '',
    };

    const blocks = (pageDef.blocks || []) as BlockEnvelope[];
    const html = assemblePageFromBlocks(blocks, ctx);
    const css = generateV2GlobalStyles(themeName, skinName, domain.siteTemplate || 'authority', domain.domain);

    // Inject CSS inline for self-contained preview
    let previewHtml = html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        `<style>${css}</style>`,
    );

    // When loaded inside the Visual Configurator, inject a bridge script
    // that enables click-to-select and hover-highlight on blocks.
    const isConfigurator = request.nextUrl.searchParams.get('configurator') === 'true';
    if (isConfigurator) {
        const bridgeScript = getConfiguratorBridgeScript(deriveAllowedParentOrigin(request));
        previewHtml = previewHtml.replace('</body>', bridgeScript + '</body>');
    }

    const format = request.nextUrl.searchParams.get('format') || 'html';

    if (format === 'json') {
        return NextResponse.json({
            html: previewHtml,
            css,
            meta: {
                route: pageDef.route,
                theme: themeName,
                skin: skinName,
                title: pageDef.title,
                blockCount: blocks.length,
                version: pageDef.version,
            },
        });
    }

    // Return raw HTML for iframe embedding
    return new NextResponse(previewHtml, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Frame-Options': 'SAMEORIGIN',
        },
    });
}

/**
 * POST /api/pages/[id]/preview — Create a persistent preview build snapshot.
 * Renders the page at its current version, stores the HTML in buildLog,
 * and returns a preview build ID. The snapshot is immutable — if the page
 * changes, a new POST creates a new snapshot.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID' }, { status: 400 });
    }

    const pageDefs = await db.select().from(pageDefinitions).where(eq(pageDefinitions.id, id)).limit(1);
    if (pageDefs.length === 0) {
        return NextResponse.json({ error: 'Page definition not found' }, { status: 404 });
    }

    const pageDef = pageDefs[0];

    const domainRows = await db.select().from(domains).where(eq(domains.id, pageDef.domainId)).limit(1);
    if (domainRows.length === 0) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const domain = domainRows[0];
    const siteTitle = extractSiteTitle(domain.domain);
    const themeName = pageDef.theme || 'clean';
    const skinName = pageDef.skin || domain.skin || 'slate';

    const ctx: RenderContext = {
        domain: domain.domain,
        siteTitle,
        route: pageDef.route,
        theme: themeName,
        skin: skinName,
        pageTitle: pageDef.title || undefined,
        pageDescription: pageDef.metaDescription || undefined,
        publishedAt: pageDef.createdAt ? new Date(pageDef.createdAt).toISOString() : undefined,
        updatedAt: pageDef.updatedAt ? new Date(pageDef.updatedAt).toISOString() : undefined,
        headScripts: '',
        bodyScripts: '',
    };

    const blocks = (pageDef.blocks || []) as BlockEnvelope[];
    const html = assemblePageFromBlocks(blocks, ctx);
    const css = generateV2GlobalStyles(themeName, skinName, domain.siteTemplate || 'authority', domain.domain);

    const previewHtml = html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        `<style>${css}</style>`,
    );

    // Create preview build record
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const previewBuildId = randomUUID();
    const previewUrl = `/api/pages/${id}/preview?format=html&buildId=${previewBuildId}`;

    try {
        const buildRows = await db.insert(previewBuilds).values({
            id: previewBuildId,
            domainId: pageDef.domainId,
            previewUrl,
            buildStatus: 'ready',
            buildLog: previewHtml,
            expiresAt,
            metadata: {
                pageDefinitionId: id,
                route: pageDef.route,
                theme: themeName,
                skin: skinName,
                blockCount: blocks.length,
                snapshotVersion: pageDef.version,
                htmlLength: previewHtml.length,
                generatedAt: new Date().toISOString(),
            },
        }).returning();
        const build = buildRows[0];

        if (!build) {
            return NextResponse.json({ error: 'Insert returned no row' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            previewBuild: {
                id: build.id,
                previewUrl,
                expiresAt: build.expiresAt,
                buildStatus: build.buildStatus,
            },
        }, { status: 201 });
    } catch (error) {
        console.error('[api/pages/preview] Failed to create preview build:', error);
        return NextResponse.json(
            { error: 'Failed to create preview build' },
            { status: 500 },
        );
    }
}
