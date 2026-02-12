/**
 * Site Generator - Creates static site content for deployment.
 * Dispatches to content-type-specific templates for interactive pages.
 */

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
    wrapInAstroLayout,
    generateDataSourcesSection,
    buildOpenGraphTags,
    buildFreshnessBadge,
    buildPrintButton,
    type DisclosureInfo,
    type ArticleDatasetInfo,
} from './templates/shared';
import { generateCalculatorPage } from './templates/calculator';
import { generateComparisonPage } from './templates/comparison';
import { generateLeadCapturePage } from './templates/lead-capture';
import { generateFaqPage } from './templates/faq';
import { generateCostGuidePage } from './templates/cost-guide';
import { generateHealthDecisionPage } from './templates/health-decision';
import { generateChecklistPage } from './templates/checklist';
import { generateReviewPage } from './templates/review';
import { generateWizardPage } from './templates/wizard';
import { generateEmbedPage } from './templates/embed';
import { generateGeoBlocks } from './templates/geo-content';
import { generateScrollCta } from './templates/scroll-cta';
import { generateGlobalStyles } from './themes';
import { getLayoutConfig, type LayoutConfig } from './layouts';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** Extract a human-readable site title from a domain name. Handles ccTLDs like example.co.uk. */
function extractSiteTitle(domain: string): string {
    // Remove known ccTLD suffixes first, then take the SLD
    const ccTlds = ['.co.uk', '.com.au', '.co.nz', '.co.za', '.com.br', '.co.in', '.org.uk', '.net.au'];
    let sld = domain;
    for (const ccTld of ccTlds) {
        if (domain.endsWith(ccTld)) {
            sld = domain.slice(0, -ccTld.length);
            break;
        }
    }
    // If no ccTLD matched, strip the last TLD segment
    if (sld === domain) {
        const lastDot = domain.lastIndexOf('.');
        sld = lastDot > 0 ? domain.slice(0, lastDot) : domain;
    }
    // Convert hyphens to spaces and title-case
    return sld.replaceAll('-', ' ').replaceAll(/\b\w/g, c => c.toUpperCase());
}

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
export async function generateSiteFiles(domainId: string): Promise<GeneratedFile[]> {
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

    const config: SiteConfig = {
        domainId,
        domain: domain.domain,
        title: extractSiteTitle(domain.domain),
        description: `Expert guides about ${domain.niche || 'various topics'}`,
        niche: domain.niche || 'general',
        subNiche: domain.subNiche || undefined,
        template: domain.siteTemplate || 'authority',
        theme: domain.themeStyle || 'default',
        scripts,
    };

    // Load disclosure config for trust elements
    const disclosure = await getDisclosureConfig(domainId);

    const layoutConfig = getLayoutConfig(config.template);

    const files: GeneratedFile[] = [
        { path: 'package.json', content: generatePackageJson(config) },
        { path: 'astro.config.mjs', content: generateAstroConfig(config) },
        { path: 'src/layouts/Base.astro', content: generateBaseLayout(config, disclosure, layoutConfig, publishedArticles) },
        { path: 'src/pages/index.astro', content: generateIndexPage(config, publishedArticles, layoutConfig) },
        ...await Promise.all(publishedArticles
            .filter(a => {
                // Validate slug is a safe filesystem path (no traversal, no special chars)
                const slug = a.slug || '';
                return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes('..');
            })
            .map(async a => ({
                path: `src/pages/${a.slug}.astro`,
                content: await generateArticlePage(config, a, disclosure, datasetsByArticle),
            }))
        ),
        { path: 'src/styles/global.css', content: generateGlobalStyles(config.theme, config.template) },
        { path: 'src/pages/404.astro', content: generate404Page() },
        { path: 'public/robots.txt', content: `User-agent: *\nAllow: /\nSitemap: https://${config.domain}/sitemap.xml` },
        {
            path: 'public/sitemap.xml', content: generateSitemap(config, publishedArticles, [
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
            files.push({ path: `public/embed/${slug}.html`, content: embedHtml });
        }
    }

    // Trust pages
    if (disclosure.aboutPage) {
        files.push({ path: 'src/pages/about.astro', content: await generateTrustPage(config, 'About', disclosure.aboutPage) });
    }
    if (disclosure.editorialPolicyPage) {
        files.push({ path: 'src/pages/editorial-policy.astro', content: await generateTrustPage(config, 'Editorial Policy', disclosure.editorialPolicyPage) });
    }
    if (disclosure.howWeMoneyPage) {
        files.push({ path: 'src/pages/how-we-make-money.astro', content: await generateTrustPage(config, 'How We Make Money', disclosure.howWeMoneyPage) });
    }

    return files;
}

function generatePackageJson(config: SiteConfig): string {
    return JSON.stringify({
        name: config.domain.replaceAll('.', '-'),
        type: 'module',
        version: '1.0.0',
        scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
        dependencies: { astro: '^4.0.0' },
    }, null, 2);
}

function generateAstroConfig(config: SiteConfig): string {
    return `import { defineConfig } from 'astro/config';
export default defineConfig({ site: 'https://${config.domain}', output: 'static' });`;
}

function generateBaseLayout(
    config: SiteConfig,
    disclosure: { aboutPage?: string | null; editorialPolicyPage?: string | null; howWeMoneyPage?: string | null } | undefined,
    layout: LayoutConfig,
    articleList: typeof articles.$inferSelect[],
): string {
    // --- Nav links ---
    const navLinks: string[] = [];
    if (disclosure?.aboutPage) navLinks.push('<a href="/about">About</a>');
    if (disclosure?.editorialPolicyPage) navLinks.push('<a href="/editorial-policy">Editorial Policy</a>');
    if (disclosure?.howWeMoneyPage) navLinks.push('<a href="/how-we-make-money">How We Make Money</a>');
    const navLinksHtml = navLinks.length > 0
        ? `<div class="nav-links">${navLinks.join('\n      ')}</div>`
        : '';

    // --- Footer links (same links reused) ---
    const footerLinksHtml = navLinks.length > 0
        ? `<nav class="footer-links">${navLinks.join(' ')}</nav>`
        : '';

    // --- Sidebar content (for sidebar layouts) ---
    let sidebarHtml = '';
    if (layout.grid === 'sidebar-right' || layout.grid === 'sidebar-left') {
        const recentItems = articleList.slice(0, 5).map(a =>
            `<li><a href="/${escapeAttr(a.slug || '')}">${escapeHtml(a.title)}</a></li>`
        ).join('\n          ');
        sidebarHtml = `
      <aside class="sidebar">
        <div class="sidebar-section">
          <h3>Recent</h3>
          <ul>${recentItems || '<li>Coming soon</li>'}</ul>
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
            const captureUrl = process.env.CAPTURE_API_URL || `https://${config.domain}/api/capture`;
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
            break;
        }
        case 'multi-column':
            footerContent = `<footer>
  ${footerLinksHtml}
  <p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.title)}</p>
</footer>`;
            break;
        default: // minimal
            footerContent = `<footer>
  ${footerLinksHtml}
  <p>&copy; ${new Date().getFullYear()} ${escapeHtml(config.title)}</p>
</footer>`;
            break;
    }

    // --- Body structure ---
    const hasSidebar = layout.grid !== 'single';
    const mainContent = hasSidebar
        ? `<div class="site-container"><div class="layout-wrap"><main><slot /></main>${sidebarHtml}</div></div>`
        : `<div class="site-container"><main><slot /></main></div>`;

    return `---
interface Props { title: string; description?: string; }
const { title, description = "${escapeAttr(config.description)}" } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content={description}>
  <title>{title} | ${escapeHtml(config.title)}</title>
  <link rel="stylesheet" href="/src/styles/global.css">
  <Fragment set:html={${JSON.stringify(config.scripts.head)}} />
</head>
<body>
<header>
  <nav>
    <a href="/" class="logo">${escapeHtml(config.title)}</a>
    ${navLinksHtml}
  </nav>
</header>
${mainContent}
${footerContent}
<Fragment set:html={${JSON.stringify(config.scripts.body)}} />
</body>
</html>`;
}

function generateIndexPage(config: SiteConfig, articleList: typeof articles.$inferSelect[], layout: LayoutConfig): string {
    const links = articleList.map(a => `<li><a href="/${escapeAttr(a.slug || '')}">${escapeHtml(a.title)}</a></li>`).join('\n    ');

    // Hero section
    const heroHtml = layout.hero !== 'none'
        ? `<section class="hero"><h1>${escapeHtml(config.title)}</h1><p>${escapeHtml(config.description)}</p></section>`
        : `<h1 style="margin:1.5rem 0 0.5rem">${escapeHtml(config.title)}</h1><p style="color:#64748b;margin-bottom:2rem">${escapeHtml(config.description)}</p>`;

    // Articles section
    const articlesHtml = layout.listing !== 'none'
        ? `<section class="articles"><h2>Latest Guides</h2><ul>${links || '<li>No articles yet</li>'}</ul></section>`
        : '';

    return `---
import Base from '../layouts/Base.astro';
---
<Base title="Home">
  ${heroHtml}
  ${articlesHtml}
</Base>`;
}

/**
 * Content-type dispatcher: routes to the appropriate template generator
 */
async function generateArticlePage(
    config: SiteConfig,
    article: typeof articles.$inferSelect,
    disclosure?: Awaited<ReturnType<typeof getDisclosureConfig>>,
    datasetsByArticle?: Map<string, ArticleDatasetInfo[]>,
): Promise<string> {
    const contentType = article.contentType || 'article';
    const articleDatasetInfo = datasetsByArticle?.get(article.id) ?? await getArticleDatasetInfo(article.id);

    switch (contentType) {
        case 'calculator':
            return generateCalculatorPage(article, config.domain, disclosure, articleDatasetInfo);
        case 'comparison':
            return generateComparisonPage(article, config.domain, disclosure, articleDatasetInfo);
        case 'lead_capture':
            return generateLeadCapturePage(article, config.domain, disclosure, articleDatasetInfo, config.domainId);
        case 'faq':
            return generateFaqPage(article, config.domain, disclosure, articleDatasetInfo);
        case 'cost_guide':
            return generateCostGuidePage(article, config.domain, disclosure, articleDatasetInfo);
        case 'health_decision':
            return generateHealthDecisionPage(article, config.domain, disclosure, articleDatasetInfo);
        case 'checklist':
            return generateChecklistPage(article, config.domain, disclosure, articleDatasetInfo);
        case 'review':
            return generateReviewPage(article, config.domain, disclosure, articleDatasetInfo);
        case 'wizard':
            return generateWizardPage(article, config.domain, disclosure, articleDatasetInfo);
        default:
            return generateStandardArticlePage(config, article, disclosure, articleDatasetInfo);
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
): Promise<string> {
    const contentHtml = await renderMarkdownToHtml(article.contentMarkdown || '');
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
  <article><h1>${titleHtml}</h1><Fragment set:html={${JSON.stringify(contentHtml)}} /></article>
  ${geoHtml}
  ${dataSourcesHtml}
  ${trustHtml}
  ${scrollCtaHtml}`;

    return wrapInAstroLayout(article.title, article.metaDescription || '', body, ogTags);
}

async function generateTrustPage(config: SiteConfig, title: string, markdownContent: string): Promise<string> {
    const result = marked.parse(markdownContent);
    const htmlContent = typeof result === 'string' ? result : await result;
    const sanitized = sanitizeHtml(htmlContent, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
    });

    return wrapInAstroLayout(title, '', `<article><Fragment set:html={${JSON.stringify(sanitized)}} /></article>`);
}


function generate404Page(): string {
    return `---
import Base from '../layouts/Base.astro';
---
<Base title="Page Not Found">
  <section style="text-align:center;padding:4rem 0">
    <h1>404</h1>
    <p>The page you're looking for doesn't exist.</p>
    <a href="/" style="display:inline-block;margin-top:1rem;padding:0.5rem 1.5rem;background:#2563eb;color:white;border-radius:0.375rem;text-decoration:none">Go Home</a>
  </section>
</Base>`;
}

function generateSitemap(config: SiteConfig, articleList: typeof articles.$inferSelect[], trustPages?: string[]): string {
    const now = new Date().toISOString().split('T')[0];
    const urls = [
        `<url><loc>https://${config.domain}/</loc><lastmod>${now}</lastmod><priority>1.0</priority></url>`,
        ...articleList.map(a =>
            `<url><loc>https://${config.domain}/${a.slug}</loc><lastmod>${a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : now}</lastmod><priority>0.8</priority></url>`
        ),
        ...(trustPages || []).map(p =>
            `<url><loc>https://${config.domain}/${p}</loc><lastmod>${now}</lastmod><priority>0.3</priority></url>`
        ),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}
