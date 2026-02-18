import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, domains, articles, pageDefinitions } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import {
    assemblePageFromBlocks,
    type RenderContext,
} from '@/lib/deploy/blocks/assembler';
import type { BlockEnvelope } from '@/lib/deploy/blocks/schemas';
// Side-effect: register interactive block renderers
import '@/lib/deploy/blocks/renderers-interactive';
import { generateV2GlobalStyles, resolveV2DomainTheme, type BrandingOverrides } from '@/lib/deploy/themes';
import { extractSiteTitle, escapeHtml } from '@/lib/deploy/templates/shared';

interface PageProps {
    params: Promise<{ id: string }>;
}

function previewHtmlHeaders(): HeadersInit {
    return {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "sandbox allow-scripts allow-forms",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
    };
}

/**
 * Build an article-preview block sequence: Header + ArticleBody + Footer,
 * using the same theme/skin as the homepage page definition.
 */
function buildArticleBlocks(
    siteTitle: string,
    article: { title: string; contentMarkdown: string | null; status: string | null; targetKeyword: string | null; wordCount: number | null; contentType: string | null },
    backHref: string,
): BlockEnvelope[] {
    const content = article.contentMarkdown || '';

    const statusLabel = (article.status || 'draft').toUpperCase();
    const metaParts: string[] = [];
    if (article.targetKeyword) metaParts.push(`Keyword: **${article.targetKeyword}**`);
    if (article.wordCount) metaParts.push(`${article.wordCount.toLocaleString()} words`);
    if (article.contentType) metaParts.push(`Type: ${article.contentType}`);
    const metaLine = metaParts.length > 0 ? `\n\n*${metaParts.join(' · ')}*` : '';

    const markdown = `# ${article.title} <span class="status-badge" style="display:inline-block;font-size:0.55em;padding:0.15rem 0.5rem;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;vertical-align:middle;background:var(--color-accent-hover,#1d4ed8);color:#fff">${statusLabel}</span>${metaLine}\n\n${content}`;

    return [
        {
            id: 'preview-header',
            type: 'Header',
            variant: 'topbar',
            config: { sticky: true },
            content: {
                siteName: siteTitle,
                navLinks: [{ label: '← Back', href: backHref }],
            },
        },
        {
            id: 'preview-article',
            type: 'ArticleBody',
            variant: 'default',
            config: {},
            content: { title: '', markdown },
        },
        {
            id: 'preview-footer',
            type: 'Footer',
            variant: 'minimal',
            config: {},
            content: {
                siteName: siteTitle,
                copyright: `© ${new Date().getFullYear()} ${siteTitle} · Preview Mode`,
            },
        },
    ] as BlockEnvelope[];
}

/**
 * Build a homepage block sequence that includes the article listing,
 * used when no page_definition exists yet.
 */
function buildHomepageBlocks(
    siteTitle: string,
    niche: string,
    allArticles: { id: string; title: string; status: string | null; targetKeyword: string | null; wordCount: number | null; contentType: string | null }[],
    domainId: string,
): BlockEnvelope[] {
    const articleListMarkdown = allArticles.length > 0
        ? allArticles.map(a => {
            const meta: string[] = [];
            if (a.targetKeyword) meta.push(a.targetKeyword);
            if (a.wordCount) meta.push(`${a.wordCount.toLocaleString()} words`);
            meta.push(a.contentType || 'article');
            return `- [${a.title}](/api/domains/${domainId}/preview?articleId=${a.id}) — *${(a.status || 'draft').toUpperCase()}* · ${meta.join(' · ')}`;
        }).join('\n')
        : '*No articles yet. Generate content from the pipeline card.*';

    return [
        {
            id: 'home-header',
            type: 'Header',
            variant: 'topbar',
            config: { sticky: true },
            content: { siteName: siteTitle, navLinks: [] },
        },
        {
            id: 'home-hero',
            type: 'Hero',
            variant: 'centered-text',
            config: {},
            content: {
                heading: siteTitle,
                subheading: `Expert guides about ${niche}`,
                badge: 'PREVIEW',
                ctaText: '',
                ctaUrl: '',
            },
        },
        {
            id: 'home-articles',
            type: 'ArticleBody',
            variant: 'default',
            config: {},
            content: {
                title: '',
                markdown: `## Articles (${allArticles.length})\n\n${articleListMarkdown}`,
            },
        },
        {
            id: 'home-footer',
            type: 'Footer',
            variant: 'minimal',
            config: {},
            content: {
                siteName: siteTitle,
                copyright: `© ${new Date().getFullYear()} ${siteTitle} · Preview Mode`,
            },
        },
    ] as BlockEnvelope[];
}

/**
 * Render blocks through the v2 assembler with inline CSS.
 */
function renderV2Preview(
    blocks: BlockEnvelope[],
    ctx: RenderContext,
    themeName: string,
    skinName: string,
    siteTemplate: string,
    domainName: string,
    branding?: BrandingOverrides,
): string {
    const html = assemblePageFromBlocks(blocks, ctx);
    const css = generateV2GlobalStyles(themeName, skinName, siteTemplate, domainName, branding);
    return html.replace(
        '<link rel="stylesheet" href="/styles.css">',
        `<style>${css}</style>`,
    );
}

/**
 * GET /api/domains/[id]/preview
 * Returns a full HTML page previewing the site using the v2 block system.
 * Query params:
 *   ?articleId=xxx — preview a single article
 *   (no params) — preview the homepage
 */
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const url = new URL(request.url);
    const articleId = url.searchParams.get('articleId');

    const [domainRow] = await db.select().from(domains)
        .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
        .limit(1);

    if (!domainRow) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const siteTitle = extractSiteTitle(domainRow.domain);
    const siteTemplate = domainRow.siteTemplate || 'authority';

    // Fetch articles — include all non-archived for preview purposes
    const allArticles = await db.select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        contentMarkdown: articles.contentMarkdown,
        metaDescription: articles.metaDescription,
        wordCount: articles.wordCount,
        targetKeyword: articles.targetKeyword,
        contentType: articles.contentType,
        createdAt: articles.createdAt,
    })
        .from(articles)
        .where(and(eq(articles.domainId, id), isNull(articles.deletedAt)));

    // Look up the homepage page_definition for theme/skin resolution
    const homepageDefs = await db.select().from(pageDefinitions)
        .where(and(eq(pageDefinitions.domainId, id), eq(pageDefinitions.route, '/')))
        .limit(1);
    const homepageDef = homepageDefs[0] ?? null;

    const v2Resolution = resolveV2DomainTheme({
        theme: homepageDef?.theme,
        skin: homepageDef?.skin || (domainRow as Record<string, unknown>).skin as string,
        themeStyle: domainRow.themeStyle,
        vertical: domainRow.vertical,
        niche: domainRow.niche,
    });
    const themeName = v2Resolution.theme;
    const skinName = v2Resolution.skin;
    const domainBranding: BrandingOverrides | undefined = (domainRow.contentConfig as Record<string, unknown> | null)?.branding as BrandingOverrides | undefined;

    if (articleId) {
        // ---------- Single article preview ----------
        const article = allArticles.find(a => a.id === articleId);
        if (!article) {
            return new NextResponse('Article not found', { status: 404 });
        }

        const content = article.contentMarkdown || '';
        const isFullHtmlDocument = /^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(content);

        // For full HTML documents (calculators, interactive types), serve directly
        // with a small preview banner injected
        if (isFullHtmlDocument) {
            const backLink = `/api/domains/${id}/preview`;
            const banner = `<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#7c3aed;color:white;padding:6px 16px;font:600 12px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between">
                <span>PREVIEW · ${escapeHtml(article.title)}</span>
                <a href="${backLink}" target="_self" style="color:white;text-decoration:underline;font-weight:400">← Back</a>
            </div><div style="height:32px"></div>`;
            const injected = content.replace(/(<body[^>]*>)/i, `$1${banner}`);
            return new NextResponse(injected, {
                headers: previewHtmlHeaders(),
            });
        }

        // Build article preview using v2 block system
        const blocks = buildArticleBlocks(
            siteTitle,
            article,
            `/api/domains/${id}/preview`,
        );

        const ctx: RenderContext = {
            domain: domainRow.domain,
            siteTitle,
            route: `/${article.slug || 'preview'}`,
            theme: themeName,
            skin: skinName,
            pageTitle: article.title,
            pageDescription: article.metaDescription || undefined,
            headScripts: '',
            bodyScripts: '',
        };

        const previewHtml = renderV2Preview(blocks, ctx, themeName, skinName, siteTemplate, domainRow.domain, domainBranding);
        return new NextResponse(previewHtml, { headers: previewHtmlHeaders() });
    }

    // ---------- Homepage preview ----------
    let blocks: BlockEnvelope[];

    if (homepageDef && Array.isArray(homepageDef.blocks) && (homepageDef.blocks as unknown[]).length > 0) {
        // Use the actual page definition blocks
        blocks = homepageDef.blocks as BlockEnvelope[];
    } else {
        // No page definition or empty blocks — build a synthetic homepage
        blocks = buildHomepageBlocks(siteTitle, domainRow.niche || 'various topics', allArticles, id);
    }

    const ctx: RenderContext = {
        domain: domainRow.domain,
        siteTitle,
        route: '/',
        theme: themeName,
        skin: skinName,
        pageTitle: homepageDef?.title || siteTitle,
        pageDescription: homepageDef?.metaDescription || `Expert guides about ${domainRow.niche || 'various topics'}`,
        headScripts: '',
        bodyScripts: '',
    };

    const previewHtml = renderV2Preview(blocks, ctx, themeName, skinName, siteTemplate, domainRow.domain, domainBranding);
    return new NextResponse(previewHtml, { headers: previewHtmlHeaders() });
}
