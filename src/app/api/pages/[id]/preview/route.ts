import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, pageDefinitions, domains, previewBuilds } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { assemblePageFromBlocks, type RenderContext } from '@/lib/deploy/blocks/assembler';
import type { BlockEnvelope } from '@/lib/deploy/blocks/schemas';
// Side-effect: register interactive block renderers
import '@/lib/deploy/blocks/renderers-interactive';
import { generateV2GlobalStyles } from '@/lib/deploy/themes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractSiteTitle(domain: string): string {
    const ccTlds = ['.co.uk', '.com.au', '.co.nz', '.co.za', '.com.br', '.co.in', '.org.uk', '.net.au'];
    let sld = domain;
    for (const ccTld of ccTlds) {
        if (domain.endsWith(ccTld)) {
            sld = domain.slice(0, -ccTld.length);
            break;
        }
    }
    if (sld === domain) {
        const lastDot = domain.lastIndexOf('.');
        sld = lastDot > 0 ? domain.slice(0, lastDot) : domain;
    }
    return sld.replaceAll('-', ' ').replaceAll(/\b\w/g, c => c.toUpperCase());
}

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
        headScripts: '',
        bodyScripts: '',
    };

    const blocks = (pageDef.blocks || []) as BlockEnvelope[];
    const html = assemblePageFromBlocks(blocks, ctx);
    const css = generateV2GlobalStyles(themeName, skinName, domain.siteTemplate || 'authority', domain.domain);

    // Inject CSS inline for self-contained preview
    const previewHtml = html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        `<style>${css}</style>`,
    );

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
 * POST /api/pages/[id]/preview — Create a persistent preview build record.
 * Stores the rendered HTML and returns a preview build ID that can be shared.
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
    const previewUrl = `/api/pages/${id}/preview?format=html`;

    try {
        const [build] = await db.insert(previewBuilds).values({
            domainId: pageDef.domainId,
            previewUrl,
            buildStatus: 'ready',
            expiresAt,
            metadata: {
                pageDefinitionId: id,
                route: pageDef.route,
                theme: themeName,
                skin: skinName,
                blockCount: blocks.length,
                version: pageDef.version,
                htmlLength: previewHtml.length,
                generatedAt: new Date().toISOString(),
            },
        }).returning();

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
