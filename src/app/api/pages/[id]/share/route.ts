import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, pageDefinitions, domains, previewBuilds } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    assemblePageFromBlocks,
    type RenderContext,
} from '@/lib/deploy/blocks/assembler';
import type { BlockEnvelope } from '@/lib/deploy/blocks/schemas';
import '@/lib/deploy/blocks/renderers-interactive';
import { generateV2GlobalStyles, resolveV2DomainTheme, type BrandingOverrides } from '@/lib/deploy/themes';
import { extractSiteTitle } from '@/lib/deploy/templates/shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/pages/[id]/share — Create a shareable preview link.
 * Renders the page, stores it as a preview build with a share token,
 * and returns a public URL that doesn't require authentication.
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
    const v2Res = resolveV2DomainTheme({
        theme: pageDef.theme,
        skin: pageDef.skin || domain.skin,
        themeStyle: domain.themeStyle,
        vertical: domain.vertical,
        niche: domain.niche,
    });
    const themeName = v2Res.theme;
    const skinName = v2Res.skin;
    const branding: BrandingOverrides | undefined = (domain.contentConfig as Record<string, unknown> | null)?.branding as BrandingOverrides | undefined;

    const ctx: RenderContext = {
        domain: domain.domain,
        siteTitle,
        niche: domain.niche || undefined,
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
    const css = generateV2GlobalStyles(themeName, skinName, domain.siteTemplate || 'authority', domain.domain, branding);

    const previewHtml = html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        `<style>${css}</style>`,
    );

    // Generate a share token (URL-safe, shorter than UUID for nicer URLs)
    const shareToken = randomUUID().replace(/-/g, '').slice(0, 16);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const previewBuildId = randomUUID();

    try {
        await db.insert(previewBuilds).values({
            id: previewBuildId,
            domainId: pageDef.domainId,
            previewUrl: `/share/${shareToken}`,
            buildStatus: 'ready',
            buildLog: previewHtml,
            expiresAt,
            metadata: {
                pageDefinitionId: id,
                shareToken,
                route: pageDef.route,
                theme: themeName,
                skin: skinName,
                blockCount: blocks.length,
                snapshotVersion: pageDef.version,
                htmlLength: previewHtml.length,
                generatedAt: new Date().toISOString(),
                isShareable: true,
            },
        });

        const origin = request.nextUrl.origin;
        const shareUrl = `${origin}/share/${shareToken}`;

        return NextResponse.json({
            success: true,
            shareUrl,
            shareToken,
            expiresAt: expiresAt.toISOString(),
        }, { status: 201 });
    } catch (error) {
        console.error('[api/pages/share] Failed to create share link:', error);
        return NextResponse.json(
            { error: 'Failed to create share link' },
            { status: 500 },
        );
    }
}
