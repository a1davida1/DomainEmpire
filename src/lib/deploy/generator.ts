/**
 * Site Generator - Creates static site content for deployment.
 * Dispatches to content-type-specific templates for interactive pages.
 */

import { createHash } from 'node:crypto';
import { db, articles, domains, monetizationProfiles, articleDatasets, datasets } from '@/lib/db';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { getMonetizationScripts } from '@/lib/monetization/scripts';
import { getDisclosureConfig } from '@/lib/disclosures';
import {
    escapeHtml,
    escapeAttr,
    renderMarkdownToHtml,
    buildTrustElements,
    buildSchemaJsonLd,
    wrapInHtmlPage,
    generateDataSourcesSection,
    buildOpenGraphTags,
    buildFreshnessBadge,
    buildPrintButton,
    buildWebSiteSchema,
    extractSiteTitle,
    type DisclosureInfo,
    type ArticleDatasetInfo,
    type PageShell,
} from './templates/shared';
import { generateCalculatorPage } from './templates/calculator';
import { generateComparisonPage } from './templates/comparison';
import { generateLeadCapturePage } from './templates/lead-capture';
import { generateFaqPage } from './templates/faq';
import { generateCostGuidePage } from './templates/cost-guide';
import { generateHealthDecisionPage } from './templates/health-decision';
import { generateChecklistPage } from './templates/checklist';
import { generateReviewPage } from './templates/review';
import { generateWizardPage, generateConfiguratorPage, generateQuizPage, generateSurveyPage, generateAssessmentPage } from './templates/wizard';
import { generateInteractiveInfographicPage } from './templates/interactive-infographic';
import { generateInteractiveMapPage } from './templates/interactive-map';
import { generateEmbedPage } from './templates/embed';
import { generateGeoBlocks } from './templates/geo-content';
import { generateScrollCta } from './templates/scroll-cta';
import { generateGlobalStyles, generateV2GlobalStyles, resolveDomainTheme, resolveV2DomainTheme, type BrandingOverrides } from './themes';
import { generateSiteImages, getOgImagePath } from './image-gen';
import { generateAISiteImages } from '@/lib/ai/image-generator';
import { generateFavicon } from './favicon-gen';
import { applyInternalLinking } from './internal-linker';
import { getLayoutConfig, type LayoutConfig } from './layouts';
import { pageDefinitions } from '@/lib/db';
import { assemblePageFromBlocks, type RenderContext } from './blocks/assembler';
import type { BlockEnvelope } from './blocks/schemas';
// Side-effect: register interactive block renderers
import './blocks/renderers-interactive';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

// extractSiteTitle imported from './templates/shared'

interface SiteConfig {
    domainId: string;
    domain: string;
    title: string;
    description: string;
    niche: string;
    subNiche?: string;
    template: string;
    scripts: { head: string; body: string };
    theme?: string;
}

interface GeneratedFile {
    path: string;
    content: string;
    /** When true, content is base64-encoded binary (e.g. AI-generated PNG) */
    isBase64?: boolean;
}

interface GenerateSiteFilesOptions {
    forceV1?: boolean;
}

/**
 * Fetch datasets linked to an article
 */
async function getArticleDatasetInfo(articleId: string): Promise<ArticleDatasetInfo[]> {
    const links = await db.select({
        usage: articleDatasets.usage,
        dataset: datasets,
    })
        .from(articleDatasets)
        .innerJoin(datasets, eq(datasets.id, articleDatasets.datasetId))
        .where(eq(articleDatasets.articleId, articleId));

    return links.map(l => ({ dataset: l.dataset, usage: l.usage }));
}

/**
 * Generate all site files for a domain
 */
export async function generateSiteFiles(
    domainId: string,
    options: GenerateSiteFilesOptions = {},
): Promise<GeneratedFile[]> {
    const domainResult = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (domainResult.length === 0) throw new Error('Domain not found');
    const domain = domainResult[0];

    const monProfile = await db.select().from(monetizationProfiles).where(eq(monetizationProfiles.domainId, domainId)).limit(1);
    const scripts = getMonetizationScripts({
        adNetwork: monProfile[0]?.adNetwork || 'none',
        adNetworkId: monProfile[0]?.adNetworkId,
    });

    const publishedArticles = await db
        .select()
        .from(articles)
        .where(and(eq(articles.domainId, domainId), eq(articles.status, 'published'), isNull(articles.deletedAt)));

    // Batch-load all article-dataset links to avoid N+1 queries
    const allArticleIds = publishedArticles.map(a => a.id);
    const allDatasetLinks = allArticleIds.length > 0
        ? await db.select({ articleId: articleDatasets.articleId, usage: articleDatasets.usage, dataset: datasets })
            .from(articleDatasets)
            .innerJoin(datasets, eq(datasets.id, articleDatasets.datasetId))
            .where(inArray(articleDatasets.articleId, allArticleIds))
        : [];
    const datasetsByArticle = new Map<string, ArticleDatasetInfo[]>();
    for (const link of allDatasetLinks) {
        const list = datasetsByArticle.get(link.articleId) ?? [];
        list.push({ dataset: link.dataset, usage: link.usage });
        datasetsByArticle.set(link.articleId, list);
    }

    // ---- v2 block-based path ----
    // If the domain has published page_definitions, use the block assembler.
    const pageDefs = await db.select().from(pageDefinitions)
        .where(and(eq(pageDefinitions.domainId, domainId), eq(pageDefinitions.isPublished, true)));

    if (!options?.forceV1 && pageDefs.length > 0) {
        return generateV2SiteFiles(domain, pageDefs, publishedArticles, scripts, datasetsByArticle);
    }

    // ---- v1 template-based path (unchanged) ----
    const resolvedTheme = resolveDomainTheme({
        themeStyle: domain.themeStyle,
        vertical: domain.vertical,
        niche: domain.niche,
    });
    if (domain.themeStyle && resolvedTheme.source !== 'explicit') {
        console.warn(`[deploy] Unknown theme "${domain.themeStyle}" for ${domain.domain}; using "${resolvedTheme.theme}"`);
    }

    const config: SiteConfig = {
        domainId,
        domain: domain.domain,
        title: extractSiteTitle(domain.domain),
        description: `Expert guides about ${domain.niche || 'various topics'}`,
        niche: domain.niche || 'general',
        subNiche: domain.subNiche || undefined,
        template: domain.siteTemplate || 'authority',
        theme: resolvedTheme.theme,
        scripts,
    };

    // Load disclosure config for trust elements
    const disclosure = await getDisclosureConfig(domainId);

    const layoutConfig = getLayoutConfig(config.template);

    // Build the page shell (header, footer, sidebar) for all pages
    const pageShell = buildPageShell(config, disclosure, layoutConfig, publishedArticles);

    const files: GeneratedFile[] = [
        { path: 'index.html', content: generateIndexPage(config, publishedArticles, layoutConfig, pageShell) },
        ...await Promise.all(publishedArticles
            .filter(a => {
                // Validate slug is a safe filesystem path (no traversal, no special chars)
                const slug = a.slug || '';
                return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes('..');
            })
            .map(async a => ({
                path: `${a.slug}/index.html`,
                content: await generateArticlePage(config, a, disclosure, datasetsByArticle, pageShell),
            }))
        ),
        { path: 'styles.css', content: generateGlobalStyles(config.theme, config.template, config.domain) },
        { path: '404.html', content: generate404Page(pageShell) },
        { path: 'robots.txt', content: generateRobotsTxt(config.domain) },
        { path: 'favicon.svg', content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${config.niche === 'health' ? '\u2695' : '\u{1F310}'}</text></svg>` },
        { path: '_headers', content: generateHeaders() },
        {
            path: 'sitemap.xml', content: generateSitemap(config, publishedArticles, [
                ...(disclosure.aboutPage ? ['about'] : []),
                ...(disclosure.editorialPolicyPage ? ['editorial-policy'] : []),
                ...(disclosure.howWeMoneyPage ? ['how-we-make-money'] : []),
            ])
        },
    ];

    // Embed pages for calculator/wizard articles
    for (const article of publishedArticles) {
        const slug = article.slug || '';
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
        const embedHtml = generateEmbedPage(article, config.domain);
        if (embedHtml) {
            files.push({ path: `embed/${slug}.html`, content: embedHtml });
        }
    }

    // Trust pages
    if (disclosure.aboutPage) {
        files.push({ path: 'about/index.html', content: await generateTrustPage('About', disclosure.aboutPage, config.domain, 'about', pageShell) });
    }
    if (disclosure.editorialPolicyPage) {
        files.push({ path: 'editorial-policy/index.html', content: await generateTrustPage('Editorial Policy', disclosure.editorialPolicyPage, config.domain, 'editorial-policy', pageShell) });
    }
    if (disclosure.howWeMoneyPage) {
        files.push({ path: 'how-we-make-money/index.html', content: await generateTrustPage('How We Make Money', disclosure.howWeMoneyPage, config.domain, 'how-we-make-money', pageShell) });
    }

    return files;
}

// ============================================================
// v2 Block-based site generation
// ============================================================

type PageDefinitionRow = typeof pageDefinitions.$inferSelect;

/**
 * Generate all site files using the v2 block assembler.
 * Each published page_definition row becomes an HTML file.
 * The CSS uses the token-based theme + skin system.
 */
async function generateV2SiteFiles(
    domain: typeof domains.$inferSelect,
    pageDefs: PageDefinitionRow[],
    publishedArticles: (typeof articles.$inferSelect)[],
    scripts: { head: string; body: string },
    _datasetsByArticle: Map<string, ArticleDatasetInfo[]>,
): Promise<GeneratedFile[]> {
    const siteTitle = extractSiteTitle(domain.domain);

    // Resolve v2 theme + skin with policy-based fallback for vertical/niche
    const homeDef = pageDefs.find(p => p.route === '/') || pageDefs[0];
    const v2Resolution = resolveV2DomainTheme({
        theme: homeDef.theme,
        skin: homeDef.skin || domain.skin,
        themeStyle: domain.themeStyle,
        vertical: domain.vertical,
        niche: domain.niche,
    });
    const themeName = v2Resolution.theme;
    const skinName = v2Resolution.skin;
    const branding: BrandingOverrides | undefined = domain.contentConfig?.branding;

    const files: GeneratedFile[] = [];
    const niche = domain.niche || 'general';

    // Generate site images: AI first (Gemini via OpenRouter), SVG fallback for failures
    const pageList = pageDefs.map(pd => ({ route: pd.route, title: pd.title || siteTitle }));
    const aiImagePaths = new Set<string>();
    /** Tracks actual deployed image paths (may be .png from AI or .svg from fallback) */
    const deployedImagePaths = new Set<string>();

    // Attempt AI image generation (hero + featured images)
    const useAIImages = process.env.ENABLE_AI_IMAGES !== 'false';
    if (useAIImages) {
        try {
            const aiQuality = (process.env.AI_IMAGE_QUALITY === 'quality' ? 'quality' : 'fast') as 'fast' | 'quality';
            const aiImages = await generateAISiteImages({
                domain: domain.domain,
                siteTitle,
                niche,
                skin: skinName,
                quality: aiQuality,
                pages: pageList,
            });
            for (const img of aiImages) {
                if (img.isBinary) {
                    // Binary images stored as base64 — Cloudflare direct upload handles decoding
                    files.push({ path: img.path, content: img.content, isBase64: true });
                } else {
                    files.push({ path: img.path, content: img.content });
                }
                deployedImagePaths.add(img.path);
                aiImagePaths.add(img.path.replace(/\.png$/, '.svg'));
            }
        } catch (err) {
            console.error('[Deploy] AI image generation failed, falling back to SVG:', err instanceof Error ? err.message : err);
        }
    }

    // SVG fallback for any images not generated by AI
    const svgImages = generateSiteImages({
        domain: domain.domain,
        siteTitle,
        niche,
        skin: skinName,
        pages: pageList,
    });
    for (const img of svgImages) {
        if (!aiImagePaths.has(img.path)) {
            files.push({ path: img.path, content: img.content });
            deployedImagePaths.add(img.path);
        }
    }

    // Generate CSS first so we can compute a cache-busting hash for HTML references
    const cssContent = generateV2GlobalStyles(themeName, skinName, domain.siteTemplate || 'authority', domain.domain, branding);
    files.push({ path: 'styles.css', content: cssContent });

    const cssHash = createHash('md5').update(cssContent).digest('hex').slice(0, 8);
    const cssHref = `/styles.css?v=${cssHash}`;

    // Generate HTML for each page definition
    for (const pageDef of pageDefs) {
        const ctx: RenderContext = {
            domain: domain.domain,
            siteTitle,
            route: pageDef.route,
            theme: pageDef.theme || themeName,
            skin: pageDef.skin || skinName,
            pageTitle: pageDef.title || undefined,
            pageDescription: pageDef.metaDescription || undefined,
            publishedAt: pageDef.createdAt ? new Date(pageDef.createdAt).toISOString() : undefined,
            updatedAt: pageDef.updatedAt ? new Date(pageDef.updatedAt).toISOString() : undefined,
            ogImagePath: getOgImagePath(pageDef.route),
            headScripts: scripts.head,
            bodyScripts: scripts.body,
            collectUrl: process.env.NEXT_PUBLIC_APP_URL
                ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/collect`
                : undefined,
            niche: niche !== 'general' ? niche : undefined,
        };

        const blocks = (pageDef.blocks || []) as BlockEnvelope[];
        let html = assemblePageFromBlocks(blocks, ctx, cssHref);

        // Resolve image paths: swap .svg → .png where AI images were generated
        if (deployedImagePaths.size > 0) {
            html = html.replace(/\/images\/[a-z0-9/_-]+\.svg/gi, (svgPath) => {
                const clean = svgPath.startsWith('/') ? svgPath.slice(1) : svgPath;
                const pngPath = clean.replace(/\.svg$/, '.png');
                return deployedImagePaths.has(pngPath) ? `/${pngPath}` : svgPath;
            });
        }

        // Determine file path from route
        const route = pageDef.route || '/';
        const filePath = route === '/'
            ? 'index.html'
            : `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`;

        files.push({ path: filePath, content: html });
    }

    // Auto-inject trust pages from disclosure config.
    // Skip if a block-based page_definition already covers that route —
    // the user's custom page blocks take priority over auto-generated trust pages.
    const disclosure = await getDisclosureConfig(domain.id);
    const trustPageSlugs: string[] = [];
    const existingRoutes = new Set(pageDefs.map(p => p.route.replace(/\/$/, '') || '/'));

    if (disclosure.aboutPage && !existingRoutes.has('/about')) {
        files.push({ path: 'about/index.html', content: await generateV2TrustPage('About', disclosure.aboutPage, domain.domain, 'about', themeName, skinName, siteTitle) });
        trustPageSlugs.push('about');
    }
    if (disclosure.editorialPolicyPage && !existingRoutes.has('/editorial-policy')) {
        files.push({ path: 'editorial-policy/index.html', content: await generateV2TrustPage('Editorial Policy', disclosure.editorialPolicyPage, domain.domain, 'editorial-policy', themeName, skinName, siteTitle) });
        trustPageSlugs.push('editorial-policy');
    }
    if (disclosure.howWeMoneyPage && !existingRoutes.has('/how-we-make-money')) {
        files.push({ path: 'how-we-make-money/index.html', content: await generateV2TrustPage('How We Make Money', disclosure.howWeMoneyPage, domain.domain, 'how-we-make-money', themeName, skinName, siteTitle) });
        trustPageSlugs.push('how-we-make-money');
    }

    // Static files (same as v1)
    files.push(
        { path: '404.html', content: generateV2ErrorPage(siteTitle, themeName, skinName) },
        { path: 'robots.txt', content: generateV2RobotsTxt(domain.domain, pageDefs) },
        { path: 'favicon.svg', content: generateFavicon({ domain: domain.domain, skin: skinName, niche }) },
        { path: '_headers', content: generateHeaders() },
        {
            path: 'sitemap.xml',
            content: generateV2Sitemap(domain.domain, pageDefs, { trustPageSlugs, deployedImagePaths }),
        },
    );

    // Post-assembly internal linking pass
    applyInternalLinking(files, pageList, domain.domain);

    return files;
}

/** Simple 404 page for v2 block-based sites */
function generateV2ErrorPage(siteTitle: string, theme: string, skin: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Page Not Found | ${escapeHtml(siteTitle)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body data-theme="${escapeAttr(theme)}" data-skin="${escapeAttr(skin)}">
  <div class="site-container" style="text-align:center;padding:4rem 0">
    <h1>404</h1>
    <p>The page you're looking for doesn't exist.</p>
    <a href="/" class="cta-button" style="display:inline-block;margin-top:1rem">Go Home</a>
  </div>
</body>
</html>`;
}

/**
 * Build the page shell (header, footer, sidebar) and return it.
 * Explicitly passed to generators to avoid shared state race conditions.
 */
function buildPageShell(
    config: SiteConfig,
    disclosure: { aboutPage?: string | null; editorialPolicyPage?: string | null; howWeMoneyPage?: string | null } | undefined,
    layout: LayoutConfig,
    articleList: typeof articles.$inferSelect[],
): PageShell {
    // --- Nav links ---
    const navLinks: string[] = [];
    if (disclosure?.aboutPage) navLinks.push('<a href="/about">About</a>');
    if (disclosure?.editorialPolicyPage) navLinks.push('<a href="/editorial-policy">Editorial Policy</a>');
    if (disclosure?.howWeMoneyPage) navLinks.push('<a href="/how-we-make-money">How We Make Money</a>');
    const navLinksHtml = navLinks.length > 0
        ? `<div class="nav-links">${navLinks.join('\n      ')}</div>`
        : '';

    const footerLinksHtml = navLinks.length > 0
        ? `<nav class="footer-links">${navLinks.join(' ')}</nav>`
        : '';

    // --- Sidebar ---
    let sidebarHtml = '';
    if (layout.grid === 'sidebar-right' || layout.grid === 'sidebar-left') {
        const recentItems = articleList.slice(0, 5).map(a =>
            `<li><a href="/${escapeAttr(a.slug || '')}">${escapeHtml(a.title)}</a></li>`
        ).join('\n          ');
        sidebarHtml = `
      <aside class="sidebar">
        <div class="sidebar-section">
            <h3>Recent</h3>
            <ul>${recentItems || '<li>No articles yet</li>'}</ul>
        </div>
        <div class="sidebar-section">
            <h3>About</h3>
            <p style="font-size:0.875rem;color:#64748b">${escapeHtml(config.description)}</p>
        </div>
      </aside>`;
    }

    // --- Footer variants ---
    let footerContent: string;
    switch (layout.footer) {
        case 'cta-bar':
            footerContent = `<footer>
  <div class="footer-cta">
    <h3>Ready to get started?</h3>
    <p>Explore our guides and tools to make informed decisions.</p>
    <a href="/">Browse All Guides</a>
  </div>
  <div class="footer-bottom">${footerLinksHtml}<p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.title)}</p></div>
</footer>`;
            break;
        case 'newsletter': {
            const baseUrl = process.env.CAPTURE_API_URL || (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/api/capture` : null);
            if (!baseUrl) {
                console.warn('[deploy] CAPTURE_API_URL or NEXTAUTH_URL not set — newsletter form disabled');
                footerContent = `<footer>
  <div class="footer-newsletter">
    <h3>Stay Updated</h3>
    <p>Subscribe to get notified when new content is published.</p>
  </div>
  <div class="footer-bottom">${footerLinksHtml}<p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.title)}</p></div>
</footer>`;
            } else {
                const captureUrl = baseUrl;
                footerContent = `<footer>
  <div class="footer-newsletter">
    <h3>Stay Updated</h3>
    <p>Get the latest guides delivered to your inbox.</p>
    <form id="newsletter-form"><input type="email" id="newsletter-email" placeholder="your@email.com" required><button type="submit">Subscribe</button></form>
    <p id="newsletter-msg" style="display:none;margin-top:0.5rem;font-weight:600;color:#16a34a"></p>
  </div>
  <div class="footer-bottom">${footerLinksHtml}<p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.title)}</p></div>
<script>
(function(){
  var form=document.getElementById('newsletter-form');
  var msg=document.getElementById('newsletter-msg');
  if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var email=document.getElementById('newsletter-email').value;
    if(!email)return;
    var btn=form.querySelector('button');
    btn.disabled=true;
    btn.textContent='Sending...';
    fetch(${JSON.stringify(captureUrl)},{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({domainId:${JSON.stringify(config.domainId)},email:email,source:'newsletter'})
    }).then(function(r){
      if(r.ok){
        msg.textContent='Thanks! You\\'ll hear from us soon.';
        msg.style.display='';
        form.querySelector('input').value='';
      } else { throw new Error('fail'); }
    }).catch(function(){
      msg.textContent='Something went wrong. Please try again.';
      msg.style.color='#dc2626';
      msg.style.display='';
    }).finally(function(){
      btn.disabled=false;
      btn.textContent='Subscribe';
      setTimeout(function(){msg.style.display='none';msg.style.color='#16a34a'},4000);
    });
  });
})();
</script>
</footer>`;
            }
            break;
        }
        default: // minimal or multi-column
            footerContent = `<footer>
  ${footerLinksHtml}
  <p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.title)}</p>
</footer>`;
            break;
    }

    const headerHtml = `<header>
  <nav>
    <a href="/" class="logo">${escapeHtml(config.title)}</a>
    ${navLinksHtml}
  </nav>
</header>`;

    return {
        siteTitle: config.title,
        headScripts: config.scripts.head,
        bodyScripts: config.scripts.body,
        headerHtml,
        footerHtml: footerContent,
        sidebarHtml,
        hasSidebar: layout.grid !== 'single',
    };
}

function generateIndexPage(config: SiteConfig, articleList: typeof articles.$inferSelect[], layout: LayoutConfig, pageShell: PageShell): string {
    const links = articleList.map(a => `<li><a href="/${escapeAttr(a.slug || '')}">${escapeHtml(a.title)}</a></li>`).join('\n    ');

    const heroHtml = layout.hero !== 'none'
        ? `<section class="hero"><h1>${escapeHtml(config.title)}</h1><p>${escapeHtml(config.description)}</p></section>`
        : `<h1 style="margin:1.5rem 0 0.5rem">${escapeHtml(config.title)}</h1><p style="color:#64748b;margin-bottom:2rem">${escapeHtml(config.description)}</p>`;

    const articlesHtml = layout.listing !== 'none'
        ? `<section class="articles"><h2>Latest Guides</h2><ul>${links || '<li>No articles yet</li>'}</ul></section>`
        : '';

    const indexHead = [
        `<link rel="canonical" href="https://${config.domain}/">`,
        buildWebSiteSchema(config.domain, config.title, config.description),
    ].join('\n  ');

    return wrapInHtmlPage('Home', config.description, `${heroHtml}\n  ${articlesHtml}`, pageShell, indexHead);
}

/**
 * Content-type dispatcher: routes to the appropriate template generator
 */
async function generateArticlePage(
    config: SiteConfig,
    article: typeof articles.$inferSelect,
    disclosure?: Awaited<ReturnType<typeof getDisclosureConfig>>,
    datasetsByArticle?: Map<string, ArticleDatasetInfo[]>,
    pageShell?: PageShell,
): Promise<string> {
    if (!pageShell) throw new Error('PageShell required');
    const contentType = String(article.contentType || 'article');
    const articleDatasetInfo = datasetsByArticle?.get(article.id) ?? await getArticleDatasetInfo(article.id);

    switch (contentType) {
        case 'calculator':
            return generateCalculatorPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'comparison':
            return generateComparisonPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'lead_capture':
            return generateLeadCapturePage(article, config.domain, disclosure, articleDatasetInfo, pageShell, config.domainId);
        case 'faq':
            return generateFaqPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'cost_guide':
            return generateCostGuidePage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'health_decision':
            return generateHealthDecisionPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'checklist':
            return generateChecklistPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'review':
            return generateReviewPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'wizard':
            return generateWizardPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'configurator':
            return generateConfiguratorPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'quiz':
            return generateQuizPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'survey':
            return generateSurveyPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'assessment':
            return generateAssessmentPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'interactive_infographic':
            return generateInteractiveInfographicPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        case 'interactive_map':
            return generateInteractiveMapPage(article, config.domain, disclosure, articleDatasetInfo, pageShell);
        default:
            return generateStandardArticlePage(config, article, disclosure, articleDatasetInfo, pageShell);
    }
}

/**
 * Standard article page (default template)
 */
async function generateStandardArticlePage(
    config: SiteConfig,
    article: typeof articles.$inferSelect,
    disclosure: DisclosureInfo | null | undefined,
    articleDatasetInfo: ArticleDatasetInfo[],
    pageShell: PageShell,
): Promise<string> {
    const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '', { currentDomain: config.domain });
    const { disclaimerHtml, trustHtml } = await buildTrustElements(article, disclosure);
    const dataSourcesHtml = generateDataSourcesSection(articleDatasetInfo);
    const schemaLd = buildSchemaJsonLd(article, config.domain, 'Article');
    const ogTags = buildOpenGraphTags(article, config.domain);
    const freshnessBadge = buildFreshnessBadge(article, articleDatasetInfo);
    const printBtn = buildPrintButton(article.contentType || 'article');
    const geoHtml = generateGeoBlocks(article.geoData as Parameters<typeof generateGeoBlocks>[0]);
    const scrollCtaHtml = generateScrollCta(article.ctaConfig as Parameters<typeof generateScrollCta>[0], article.slug || '');

    const titleHtml = escapeHtml(article.title);

    const body = `${disclaimerHtml}
  ${schemaLd}
  ${freshnessBadge}${printBtn}
  <article><h1>${titleHtml}</h1>${contentHtml}</article>
  ${geoHtml}
  ${dataSourcesHtml}
  ${trustHtml}
  ${scrollCtaHtml}`;

    return wrapInHtmlPage(article.title, article.metaDescription || '', body, pageShell, ogTags);
}

async function generateTrustPage(title: string, markdownContent: string, domain: string, slug: string, pageShell: PageShell): Promise<string> {
    const result = marked.parse(markdownContent);
    const htmlContent = typeof result === 'string' ? result : await result;
    const sanitized = sanitizeHtml(htmlContent, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
    });
    const canonical = `<link rel="canonical" href="https://${domain}/${slug}">`;
    return wrapInHtmlPage(title, '', `<article>${sanitized}</article>`, pageShell, canonical);
}

function generate404Page(pageShell: PageShell): string {
    return wrapInHtmlPage('Page Not Found', '', `
  <section style="text-align:center;padding:4rem 0">
    <h1>404</h1>
    <p>The page you're looking for doesn't exist.</p>
    <a href="/" style="display:inline-block;margin-top:1rem;padding:0.5rem 1.5rem;background:#2563eb;color:white;border-radius:0.375rem;text-decoration:none">Go Home</a>
  </section>`, pageShell, '<meta name="robots" content="noindex">');
}

/** Generate robots.txt for v1 sites */
function generateRobotsTxt(domain: string): string {
    return [
        'User-agent: *',
        'Allow: /',
        'Disallow: /contact',
        '',
        `Sitemap: https://${domain}/sitemap.xml`,
        `Host: https://${domain}`,
    ].join('\n');
}

/** Generate robots.txt for v2 block-based sites with per-route awareness */
function generateV2RobotsTxt(domain: string, pageDefs: PageDefinitionRow[]): string {
    const lines: string[] = [
        'User-agent: *',
        'Allow: /',
    ];

    // Explicitly allow all content page routes
    for (const pd of pageDefs) {
        if (pd.route !== '/') {
            lines.push(`Allow: ${pd.route}`);
        }
    }

    // Disallow thin/no-ranking-value pages
    lines.push('Disallow: /contact');

    lines.push('');
    lines.push(`Sitemap: https://${domain}/sitemap.xml`);
    lines.push(`Host: https://${domain}`);

    return lines.join('\n');
}

function generateHeaders(): string {
    return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: interest-cohort=()

/styles.css
  Cache-Control: public, max-age=31536000, immutable

/favicon.svg
  Cache-Control: public, max-age=604800

/images/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=3600, s-maxage=86400

/robots.txt
  Cache-Control: public, max-age=86400

/sitemap.xml
  Cache-Control: public, max-age=86400
`;
}

/** Escape special XML characters for sitemap content */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Resolve the actual deployed extension for an image path (.png if AI-generated, else .svg) */
function resolveImageExt(basePath: string, deployedPaths: Set<string>): string {
    const pngPath = basePath.replace(/\.svg$/, '.png');
    return deployedPaths.has(pngPath) ? pngPath : basePath;
}

/** Generate sitemap for v2 block-based sites using actual page definition routes */
function generateV2Sitemap(
    domain: string,
    pageDefs: PageDefinitionRow[],
    opts: { trustPageSlugs?: string[]; deployedImagePaths?: Set<string> } = {},
): string {
    const now = new Date().toISOString().split('T')[0];
    const trustPageSlugs = opts.trustPageSlugs ?? [];
    const deployedImagePaths = opts.deployedImagePaths ?? new Set<string>();

    function routePriority(route: string): string {
        if (route === '/') return '1.0';
        const depth = route.replace(/^\//, '').split('/').length;
        if (depth === 1) return '0.8';
        return '0.6';
    }

    function routeChangeFreq(route: string): string {
        if (route === '/') return 'weekly';
        if (route.includes('calculator') || route.includes('compare')) return 'monthly';
        if (route.includes('privacy') || route.includes('terms')) return 'yearly';
        return 'weekly';
    }

    const urls = pageDefs.map(pd => {
        const route = pd.route === '/' ? '' : pd.route.replace(/^\//, '');
        const loc = route ? `https://${domain}/${route}` : `https://${domain}/`;
        const lastmod = pd.updatedAt ? new Date(pd.updatedAt).toISOString().split('T')[0] : now;
        const slug = pd.route === '/' ? 'home' : pd.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
        const pageTitle = escapeXml(pd.title || slug.replace(/-/g, ' '));
        const pageDesc = escapeXml(pd.metaDescription || '');
        const ogPath = resolveImageExt(`images/og/${slug}.svg`, deployedImagePaths);
        const ogImage = `https://${domain}/${ogPath}`;

        const images: string[] = [];
        // OG image with title and caption
        images.push(`<image:image><image:loc>${ogImage}</image:loc><image:title>${pageTitle}</image:title>${pageDesc ? `<image:caption>${pageDesc}</image:caption>` : ''}</image:image>`);
        // Featured image for non-homepage pages
        if (pd.route !== '/') {
            const featPath = resolveImageExt(`images/featured/${slug}.svg`, deployedImagePaths);
            const featuredImage = `https://${domain}/${featPath}`;
            images.push(`<image:image><image:loc>${featuredImage}</image:loc><image:title>${pageTitle}</image:title></image:image>`);
        }

        return `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${routeChangeFreq(pd.route)}</changefreq><priority>${routePriority(pd.route)}</priority>${images.join('')}</url>`;
    });
    for (const slug of trustPageSlugs) {
        urls.push(`<url><loc>https://${domain}/${slug}</loc><lastmod>${now}</lastmod><changefreq>yearly</changefreq><priority>0.4</priority></url>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;
}

/** Generate a trust page (About, Editorial Policy, etc.) styled with v2 theme/skin tokens */
async function generateV2TrustPage(
    title: string,
    markdownContent: string,
    domain: string,
    slug: string,
    theme: string,
    skin: string,
    siteTitle: string,
): Promise<string> {
    const result = marked.parse(markdownContent);
    const htmlContent = typeof result === 'string' ? result : await result;
    const sanitized = sanitizeHtml(htmlContent, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
    });
    const canonicalUrl = `https://${domain}/${slug}`;
    const fullTitle = `${escapeHtml(title)} | ${escapeHtml(siteTitle)}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${fullTitle}</title>
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeAttr(domain)}">
  <link rel="stylesheet" href="/styles.css">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body data-theme="${escapeAttr(theme)}" data-skin="${escapeAttr(skin)}">
<div class="site-container">
  <main>
    <article class="article-body">
      <h1>${escapeHtml(title)}</h1>
      ${sanitized}
    </article>
  </main>
</div>
</body>
</html>`;
}

function generateSitemap(config: SiteConfig, articleList: typeof articles.$inferSelect[], trustPages?: string[]): string {
    const now = new Date().toISOString().split('T')[0];
    const urls = [
        `<url><loc>https://${config.domain}/</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
        ...articleList.map(a =>
            `<url><loc>https://${config.domain}/${a.slug}</loc><lastmod>${a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
        ),
        ...(trustPages || []).map(p =>
            `<url><loc>https://${config.domain}/${p}</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>`
        ),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}
