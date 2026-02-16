import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, pageDefinitions, domains, previewBuilds } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { assemblePageFromBlocks, type RenderContext } from '@/lib/deploy/blocks/assembler';
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
    let previewHtml = html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        `<style>${css}</style>`,
    );

    // When loaded inside the Visual Configurator, inject a bridge script
    // that enables click-to-select and hover-highlight on blocks.
    const isConfigurator = request.nextUrl.searchParams.get('configurator') === 'true';
    if (isConfigurator) {
        const bridgeScript = `<script>
(function(){
  var selected=null;
  var highlighted=null;
  var OUTLINE='2px solid #3b82f6';
  var HOVER_OUTLINE='2px dashed #93c5fd';

  function clearHighlight(){
    if(highlighted){highlighted.style.outline='';highlighted=null;}
  }
  function clearSelection(){
    if(selected){selected.style.outline='';selected=null;}
  }

  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-block-id]');
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
    selected=el;
    el.style.outline=OUTLINE;
    parent.postMessage({type:'block-select',blockId:el.getAttribute('data-block-id'),blockType:el.getAttribute('data-block-type')},location.origin);
  },true);

  document.addEventListener('mouseover',function(e){
    var el=e.target.closest('[data-block-id]');
    if(!el||el===selected)return;
    clearHighlight();
    highlighted=el;
    el.style.outline=HOVER_OUTLINE;
  });
  document.addEventListener('mouseout',function(e){
    var el=e.target.closest('[data-block-id]');
    if(el&&el===highlighted)clearHighlight();
  });

  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='block-highlight')return;
    var bid=String(e.data.blockId||'').replace(/[^a-zA-Z0-9_\-]/g,'');
    if(!bid)return;
    clearSelection();
    var target=document.querySelector('[data-block-id="'+bid+'"]');
    if(!target)return;
    selected=target;
    target.style.outline=OUTLINE;
    target.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();
</script>`;
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
