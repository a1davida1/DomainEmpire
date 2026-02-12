/**
 * Site Generator - Creates static site content for deployment.
 * Dispatches to content-type-specific templates for interactive pages.
 */

import { db, articles, domains, monetizationProfiles, articleDatasets, datasets } from '@/lib/db';
import { eq, and, inArray } from 'drizzle-orm';
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
    sanitizeArticleHtml,
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
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

interface SiteConfig {
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
        .where(and(eq(articles.domainId, domainId), eq(articles.status, 'published')));

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
        domain: domain.domain,
        title: domain.domain.split('.')[0].replaceAll('-', ' '),
        description: `Expert guides about ${domain.niche || 'various topics'}`,
        niche: domain.niche || 'general',
        subNiche: domain.subNiche || undefined,
        template: domain.siteTemplate || 'authority',
        theme: domain.themeStyle || 'default',
        scripts,
    };

    // Load disclosure config for trust elements
    const disclosure = await getDisclosureConfig(domainId);

    const files: GeneratedFile[] = [
        { path: 'package.json', content: generatePackageJson(config) },
        { path: 'astro.config.mjs', content: generateAstroConfig(config) },
        { path: 'src/layouts/Base.astro', content: generateBaseLayout(config, disclosure) },
        { path: 'src/pages/index.astro', content: generateIndexPage(config, publishedArticles) },
        ...await Promise.all(publishedArticles.map(async a => ({
            path: `src/pages/${a.slug}.astro`,
            content: await generateArticlePage(config, a, disclosure, datasetsByArticle),
        }))),
        { path: 'src/styles/global.css', content: generateGlobalStyles(config.theme) },
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

function generateBaseLayout(config: SiteConfig, disclosure?: { aboutPage?: string | null; editorialPolicyPage?: string | null; howWeMoneyPage?: string | null }): string {
    const footerLinks: string[] = [];
    if (disclosure?.aboutPage) footerLinks.push('<a href="/about">About</a>');
    if (disclosure?.editorialPolicyPage) footerLinks.push('<a href="/editorial-policy">Editorial Policy</a>');
    if (disclosure?.howWeMoneyPage) footerLinks.push('<a href="/how-we-make-money">How We Make Money</a>');
    const footerLinksHtml = footerLinks.length > 0
        ? `<nav class="footer-links">${footerLinks.join(' | ')}</nav>`
        : '';

    return `---
interface Props { title: string; description?: string; }
const { title, description = "${config.description}" } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content={description}><title>{title} | ${config.title}</title>
  <link rel="stylesheet" href="/src/styles/global.css">
  <Fragment set:html={${JSON.stringify(config.scripts.head)}} />
</head>
<body><header><nav><a href="/" class="logo">${config.title}</a></nav></header>
<main><slot /></main>
<footer>${footerLinksHtml}<p>&copy; ${new Date().getFullYear()} ${config.title}</p></footer>
<Fragment set:html={${JSON.stringify(config.scripts.body)}} />
</body></html>`;
}

function generateIndexPage(config: SiteConfig, articleList: typeof articles.$inferSelect[]): string {
    const links = articleList.map(a => `<li><a href="/${a.slug}">${a.title}</a></li>`).join('\n');
    return `---
import Base from '../layouts/Base.astro';
---
<Base title="Home">
  <section class="hero"><h1>${config.title}</h1><p>${config.description}</p></section>
  <section class="articles"><h2>Latest</h2><ul>${links || '<li>No articles yet</li>'}</ul></section>
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
            return generateLeadCapturePage(article, config.domain, disclosure, articleDatasetInfo);
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

    const titleHtml = escapeHtml(article.title);

    const body = `${disclaimerHtml}
  ${schemaLd}
  <article><h1>${titleHtml}</h1><Fragment set:html={${JSON.stringify(contentHtml)}} /></article>
  ${dataSourcesHtml}
  ${trustHtml}`;

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

// ==============================
// CSS Theme System
// ==============================

function generateGlobalStyles(theme?: string): string {
    // Base styles shared by all themes
    let css = `/* Base */
*{margin:0;padding:0;box-sizing:border-box}
body{line-height:1.6;max-width:800px;margin:0 auto;padding:2rem}
header{margin-bottom:2rem;border-bottom:1px solid #eee;padding-bottom:1rem}
.logo{font-size:1.5rem;font-weight:bold;text-decoration:none;color:#333}
.hero{text-align:center;padding:4rem 0}.hero h1{font-size:2.5rem;margin-bottom:1rem}
.articles ul{list-style:none}.articles li{margin-bottom:1rem}.articles a{font-size:1.25rem;color:#0066cc}
article h1{font-size:2rem;margin-bottom:2rem}article h2,article h3{margin-top:2rem;margin-bottom:1rem}
article p{margin-bottom:1rem}
footer{margin-top:4rem;border-top:1px solid #eee;padding-top:1rem;text-align:center;color:#666;font-size:0.875rem}
.footer-links{margin-bottom:0.5rem}.footer-links a{color:#666;margin:0 0.5rem}
`;

    // Component styles (shared across all themes)
    css += `
/* Trust elements */
.disclaimer{background:#fef3c7;border:1px solid #f59e0b;padding:1rem;border-radius:0.5rem;margin-bottom:1.5rem;font-size:0.9rem}
.disclosure{background:#f1f5f9;padding:0.75rem;border-radius:0.25rem;margin:1rem 0}
.sources{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0}
.sources ol{padding-left:1.5rem}.sources li{margin-bottom:0.5rem;font-size:0.875rem}
.reviewed-by,.last-updated{color:#64748b;font-size:0.875rem;margin-top:0.5rem}

/* Calculator components */
.calc-form{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin:2rem 0}
.calc-field{margin-bottom:1rem}
.calc-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem}
.calc-input{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
.calc-results{background:#eff6ff;border:1px solid #bfdbfe;border-radius:0.5rem;padding:1rem;margin-top:1rem}
.calc-result-item{display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid #dbeafe}
.calc-result-item:last-child{border-bottom:none}
.calc-result-label{font-weight:500}.calc-result-value{font-size:1.25rem;font-weight:700;color:#1d4ed8}
.calc-methodology{margin-top:1.5rem;border:1px solid #e2e8f0;border-radius:0.5rem}
.calc-methodology summary{padding:0.75rem 1rem;cursor:pointer;font-weight:600;background:#f1f5f9}
.calc-methodology ul,.calc-methodology p{padding:1rem}

/* Comparison components */
.comparison-table-wrapper{overflow-x:auto;margin:2rem 0}
.comparison-table{width:100%;border-collapse:collapse;font-size:0.9rem}
.comparison-table th{background:#f1f5f9;padding:0.75rem;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap}
.comparison-table th[data-sort-key]{cursor:pointer;user-select:none}
.comparison-table th[data-sort-key]:hover{background:#e2e8f0}
.sort-indicator{color:#94a3b8;margin-left:0.25rem}
.comparison-table td{padding:0.75rem;border-bottom:1px solid #f1f5f9}
.comparison-table tr:hover{background:#f8fafc}
.comparison-badge{background:#22c55e;color:white;padding:0.125rem 0.5rem;border-radius:1rem;font-size:0.75rem;font-weight:600}
.comparison-verdict{background:#f0fdf4;border:1px solid #86efac;border-radius:0.5rem;padding:1rem;margin:1rem 0}
.cta-button{display:inline-block;background:#2563eb;color:white;padding:0.375rem 1rem;border-radius:0.375rem;text-decoration:none;font-size:0.8rem;font-weight:600}
.cta-button:hover{background:#1d4ed8}

/* Lead form components */
.disclosure-above{background:#fef3c7;border:2px solid #f59e0b;padding:1rem;border-radius:0.5rem;margin-bottom:1.5rem;font-weight:600}
.lead-form{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin:2rem 0}
.lead-field{margin-bottom:1rem}
.lead-field label{display:block;font-weight:600;margin-bottom:0.25rem;font-size:0.9rem}
.lead-field input,.lead-field select{width:100%;padding:0.5rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:1rem}
.consent{margin:1rem 0;font-size:0.875rem}.consent label{display:flex;align-items:flex-start;gap:0.5rem}
.lead-form button[type="submit"]{background:#2563eb;color:white;padding:0.75rem 2rem;border:none;border-radius:0.375rem;font-size:1rem;font-weight:600;cursor:pointer}
.lead-form button[type="submit"]:disabled{opacity:0.5;cursor:not-allowed}
.lead-form button[type="submit"]:hover:not(:disabled){background:#1d4ed8}
.success-msg{color:#16a34a;font-weight:600;margin-top:0.75rem}.error-msg{color:#dc2626;font-weight:600;margin-top:0.75rem}

/* FAQ components */
.faq-list{margin:2rem 0}
.faq-item{border:1px solid #e2e8f0;border-radius:0.5rem;margin-bottom:0.5rem;overflow:hidden}
.faq-item[open]{border-color:#cbd5e1}
.faq-question{padding:1rem;cursor:pointer;font-weight:600;background:#f8fafc;list-style:none}
.faq-question::-webkit-details-marker{display:none}
.faq-question::before{content:'▸';margin-right:0.5rem;transition:transform 0.2s}
.faq-item[open] .faq-question::before{transform:rotate(90deg)}
.faq-answer{padding:1rem;border-top:1px solid #e2e8f0}

/* Cost guide components */
.cost-ranges{margin:2rem 0}
.cost-range{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem}
.cost-range-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;text-align:center;margin-top:1rem}
.cost-low,.cost-avg,.cost-high{padding:1rem;border-radius:0.5rem}
.cost-low{background:#f0fdf4}.cost-avg{background:#eff6ff}.cost-high{background:#fef2f2}
.cost-label{display:block;font-size:0.8rem;color:#64748b;font-weight:600;text-transform:uppercase}
.cost-value{display:block;font-size:1.5rem;font-weight:700;margin-top:0.25rem}
.factors-grid{margin:2rem 0}.factors-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;margin-top:1rem}
.factor-card{padding:1rem;border-radius:0.5rem;border:1px solid #e2e8f0}
.factor-card h4{margin-bottom:0.25rem}.factor-impact{font-size:0.75rem;font-weight:600;text-transform:uppercase}
.impact-high .factor-impact{color:#dc2626}.impact-medium .factor-impact{color:#f59e0b}.impact-low .factor-impact{color:#22c55e}

/* Data sources */
.data-sources{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0}
.data-sources ul{list-style:none;padding:0}.data-source-item{padding:0.375rem 0;font-size:0.875rem}
.data-usage{color:#64748b;font-style:italic}
`;

    // Theme-specific styles
    switch (theme) {
        // Legacy themes
        case 'navy-serif':
            css += `body{font-family:Georgia,serif;background-color:#f4f4f9;color:#0a1929}header{border-bottom:2px solid #0a1929}.logo{color:#0a1929}.hero{background-color:#0a1929;color:white;padding:5rem 0}footer{background-color:#0a1929;color:white;margin-top:0}`;
            break;
        case 'green-modern':
            css += `body{font-family:Inter,system-ui,sans-serif;background-color:#f0fdf4;color:#14532d}.logo{color:#15803d}a{color:#16a34a}`;
            break;
        case 'medical-clean':
            css += `body{font-family:message-box,sans-serif;background-color:#ffffff;color:#334155}.hero{color:#0ea5e9}`;
            break;

        // New niche-bucket themes
        case 'professional-blue':
            css += `body{font-family:Merriweather,Georgia,serif;background:#f8fafc;color:#1e293b;line-height:1.75}header{border-bottom:3px solid #1e3a5f}.logo{color:#1e3a5f;font-family:Merriweather,Georgia,serif}.hero{background:#1e3a5f;color:white;padding:5rem 2rem}a{color:#2563eb}.articles a{color:#1e3a5f}footer{background:#1e3a5f;color:#94a3b8;padding:2rem 1rem}footer a{color:#93c5fd}.disclaimer{background:#fef9c3;border-color:#ca8a04}.cta-button{background:#1e3a5f}.cta-button:hover{background:#0f2541}`;
            break;
        case 'health-clean':
            css += `body{font-family:system-ui,-apple-system,sans-serif;background:#ffffff;color:#334155;line-height:1.8;max-width:640px}header{border-bottom:2px solid #10b981}.logo{color:#047857}a{color:#059669}.hero{background:#f0fdf4;color:#065f46}.disclaimer{background:#fef3c7;border:2px solid #f59e0b;font-size:0.95rem}.sources{font-size:0.85rem}.reviewed-by{background:#f0fdf4;padding:0.5rem 0.75rem;border-radius:0.25rem;border-left:3px solid #10b981}`;
            break;
        case 'consumer-friendly':
            css += `body{font-family:Inter,system-ui,sans-serif;background:#fffbf5;color:#292524;line-height:1.7}header{border-bottom:2px solid #f59e0b}.logo{color:#b45309}a{color:#d97706}.hero{background:linear-gradient(135deg,#fef3c7,#fed7aa);color:#78350f;padding:4rem 2rem;border-radius:1rem;margin-bottom:2rem}.articles li{background:white;padding:1rem;border-radius:0.5rem;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:0.75rem}.comparison-badge{background:#f59e0b;color:#78350f}.cta-button{background:#d97706;border-radius:0.5rem}.cta-button:hover{background:#b45309}`;
            break;
        case 'tech-modern':
            css += `body{font-family:JetBrains Mono,SF Mono,monospace;background:#0f172a;color:#e2e8f0;line-height:1.65}header{border-bottom:1px solid #334155}.logo{color:#38bdf8;font-family:JetBrains Mono,monospace}a{color:#38bdf8}.hero{background:#1e293b;color:#f1f5f9;border:1px solid #334155;border-radius:0.5rem;padding:3rem 2rem}article{background:#1e293b;padding:2rem;border-radius:0.5rem;border:1px solid #334155}.articles a{color:#7dd3fc}footer{color:#64748b;border-top:1px solid #334155}.calc-form,.lead-form{background:#1e293b;border-color:#334155;color:#e2e8f0}.calc-input,.lead-field input,.lead-field select{background:#0f172a;border-color:#475569;color:#e2e8f0}.calc-results{background:#172554;border-color:#1e40af}.comparison-table th{background:#1e293b;border-color:#334155;color:#94a3b8}.comparison-table td{border-color:#1e293b;color:#cbd5e1}.comparison-table tr:hover{background:#1e293b}.faq-question{background:#1e293b;color:#e2e8f0}.faq-item{border-color:#334155}.faq-answer{border-color:#334155;color:#cbd5e1}`;
            break;
        case 'trust-minimal':
            css += `body{font-family:system-ui,-apple-system,sans-serif;background:#ffffff;color:#1f2937;max-width:640px;line-height:1.7}header{border:none;margin-bottom:3rem}.logo{color:#374151;font-size:1.125rem}a{color:#4b5563;text-decoration:underline}article{font-size:1.05rem}article h1{font-size:1.75rem}article h2{font-size:1.35rem;color:#374151}.hero{padding:2rem 0;text-align:left}.hero h1{font-size:2rem}.sources{font-size:0.8rem;color:#6b7280}footer{font-size:0.75rem;color:#9ca3af}.calc-form{border:none;background:#fafafa;padding:1rem}.calc-results{background:#fafafa;border:1px solid #e5e7eb}`;
            break;
        case 'hobby-vibrant':
            css += `body{font-family:Nunito,system-ui,sans-serif;background:#fefce8;color:#422006;line-height:1.7}header{border-bottom:3px solid #eab308}.logo{color:#a16207;font-weight:800}a{color:#ca8a04}.hero{background:linear-gradient(135deg,#fef08a,#fde68a);color:#713f12;padding:4rem 2rem;border-radius:1.5rem}.articles li{background:white;border:2px solid #fde68a;padding:1rem;border-radius:0.75rem;margin-bottom:0.75rem}.articles a{color:#92400e;font-weight:600}.comparison-badge{background:#eab308;color:white}.cta-button{background:#ca8a04;border-radius:0.75rem}.cta-button:hover{background:#a16207}.faq-question{background:#fef9c3}.cost-range{border:2px solid #fde68a}.factor-card{border:2px solid #fde68a}`;
            break;

        default:
            css += `body{font-family:system-ui,sans-serif}`;
            break;
    }

    // Responsive breakpoints
    css += `
/* Tablet */
@media(max-width:768px){
  body{padding:1rem;max-width:100%}
  .hero{padding:2rem 1rem}.hero h1{font-size:1.75rem}
  article h1{font-size:1.5rem}
  .cost-range-bar{grid-template-columns:1fr}
  .factors-cards{grid-template-columns:1fr}
  .comparison-table-wrapper{margin:1rem -1rem;padding:0 1rem}
  .comparison-table{font-size:0.8rem;min-width:600px}
}
/* Mobile */
@media(max-width:480px){
  body{padding:0.75rem;font-size:0.95rem}
  .hero{padding:1.5rem 0.75rem}.hero h1{font-size:1.5rem}
  .calc-form,.lead-form{padding:1rem}
  .calc-input,.lead-field input,.lead-field select{font-size:16px}
  .lead-form button[type="submit"]{width:100%;padding:0.875rem}
  .faq-question{padding:0.75rem}
  .cta-button{display:block;text-align:center;padding:0.5rem}
}
/* Print */
@media print{
  header,footer,.cta-button,.lead-form{display:none}
  body{max-width:100%;padding:0;color:#000}
  .checklist-item{page-break-inside:avoid}
}
`;

    return css;
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
