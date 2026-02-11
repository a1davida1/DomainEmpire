/**
 * Site Generator - Creates static site content for deployment
 */

import { db, articles, domains, monetizationProfiles } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getMonetizationScripts } from '@/lib/monetization/scripts';
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

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;");
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

    return [
        { path: 'package.json', content: generatePackageJson(config) },
        { path: 'astro.config.mjs', content: generateAstroConfig(config) },
        { path: 'src/layouts/Base.astro', content: generateBaseLayout(config) },
        { path: 'src/pages/index.astro', content: generateIndexPage(config, publishedArticles) },
        ...publishedArticles.map(a => ({
            path: `src/pages/${a.slug}.astro`,
            content: generateArticlePage(config, a),
        })),
        { path: 'src/styles/global.css', content: generateGlobalStyles(config.theme) },
        { path: 'public/robots.txt', content: `User-agent: *\nAllow: /\nSitemap: https://${config.domain}/sitemap.xml` },
        { path: 'public/sitemap.xml', content: generateSitemap(config, publishedArticles) },
    ];
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

function generateBaseLayout(config: SiteConfig): string {
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
<footer><p>&copy; ${new Date().getFullYear()} ${config.title}</p></footer>
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

function generateArticlePage(config: SiteConfig, article: typeof articles.$inferSelect): string {
    // Remove leftover AI placeholders from markdown
    const rawMarkdown = (article.contentMarkdown || '')
        .replace(/\[INTERNAL_LINK.*?\]/g, '')
        .replace(/\[EXTERNAL_LINK.*?\]/g, '')
        .replace(/\[IMAGE.*?\]/g, '');

    const rawHtml = article.contentHtml || (rawMarkdown ? marked.parse(rawMarkdown, { async: false }) : '');

    // Sanitize HTML to prevent XSS while keeping safe formatting tags
    const htmlContent = sanitizeHtml(rawHtml as string, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'figure', 'figcaption',
            'details', 'summary', 'mark', 'abbr', 'time', 'del', 'ins',
        ]),
        allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
            a: ['href', 'title', 'rel', 'target'],
            time: ['datetime'],
            abbr: ['title'],
        },
        allowedSchemes: ['http', 'https', 'mailto'],
    });

    const escapedTitleHtml = escapeHtml(article.title);
    const escapedTitleAttr = escapeAttr(article.title);
    const escapedDescAttr = escapeAttr(article.metaDescription || '');

    return `---
import Base from '../layouts/Base.astro';
---
<Base title="${escapedTitleAttr}" description="${escapedDescAttr}">
  <article><h1>${escapedTitleHtml}</h1><Fragment set:html={${JSON.stringify(htmlContent)}} /></article>
</Base>`;
}

function generateGlobalStyles(theme?: string): string {
    let base = `*{margin:0;padding:0;box-sizing:border-box}body{line-height:1.6;max-width:800px;margin:0 auto;padding:2rem}header{margin-bottom:2rem;border-bottom:1px solid #eee;padding-bottom:1rem}.logo{font-size:1.5rem;font-weight:bold;text-decoration:none;color:#333}.hero{text-align:center;padding:4rem 0}.hero h1{font-size:2.5rem;margin-bottom:1rem}.articles ul{list-style:none}.articles li{margin-bottom:1rem}.articles a{font-size:1.25rem;color:#0066cc}article h1{font-size:2rem;margin-bottom:2rem}article h2,article h3{margin-top:2rem;margin-bottom:1rem}article p{margin-bottom:1rem}footer{margin-top:4rem;border-top:1px solid #eee;padding-top:1rem;text-align:center;color:#666;font-size:0.875rem}`;

    if (theme === 'navy-serif') {
        base += `body{font-family:Georgia,serif;background-color:#f4f4f9;color:#0a1929}header{border-bottom:2px solid #0a1929}.logo{color:#0a1929}.hero{background-color:#0a1929;color:white;padding:5rem 0}.hero h1{margin-bottom:1.5rem}footer{background-color:#0a1929;color:white;margin-top:0}`;
    } else if (theme === 'green-modern') {
        base += `body{font-family:Inter,system-ui,sans-serif;background-color:#f0fdf4;color:#14532d}.logo{color:#15803d}a{color:#16a34a}`;
    } else if (theme === 'medical-clean') {
        base += `body{font-family:message-box,sans-serif;background-color:#ffffff;color:#334155}.hero{color:#0ea5e9}`;
    } else {
        base += `body{font-family:system-ui,sans-serif}`;
    }
    return base;
}

function generateSitemap(config: SiteConfig, articleList: typeof articles.$inferSelect[]): string {
    const now = new Date().toISOString().split('T')[0];
    const urls = [
        `<url><loc>https://${config.domain}/</loc><lastmod>${now}</lastmod><priority>1.0</priority></url>`,
        ...articleList.map(a =>
            `<url><loc>https://${config.domain}/${a.slug}</loc><lastmod>${a.updatedAt ? new Date(a.updatedAt).toISOString().split('T')[0] : now}</lastmod><priority>0.8</priority></url>`
        )
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}
