/**
 * Site Generator - Creates static site content for deployment
 */

import { db, articles, domains } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

interface SiteConfig {
    domain: string;
    title: string;
    description: string;
    niche: string;
    subNiche?: string;
    template: string;
}

interface GeneratedFile {
    path: string;
    content: string;
}

/**
 * Generate all site files for a domain
 */
export async function generateSiteFiles(domainId: string): Promise<GeneratedFile[]> {
    const domainResult = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (domainResult.length === 0) throw new Error('Domain not found');
    const domain = domainResult[0];

    const publishedArticles = await db
        .select()
        .from(articles)
        .where(and(eq(articles.domainId, domainId), eq(articles.status, 'published')));

    const config: SiteConfig = {
        domain: domain.domain,
        title: domain.domain.split('.')[0].replaceAll(/-/g, ' '),
        description: `Expert guides about ${domain.niche || 'various topics'}`,
        niche: domain.niche || 'general',
        subNiche: domain.subNiche || undefined,
        template: domain.siteTemplate || 'authority',
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
        { path: 'src/styles/global.css', content: generateGlobalStyles() },
        { path: 'public/robots.txt', content: `User-agent: *\nAllow: /\nSitemap: https://${config.domain}/sitemap.xml` },
        { path: 'public/sitemap.xml', content: generateSitemap(config, publishedArticles) },
    ];
}

function generatePackageJson(config: SiteConfig): string {
    return JSON.stringify({
        name: config.domain.replace(/\./g, '-'),
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
</head>
<body><header><nav><a href="/" class="logo">${config.title}</a></nav></header>
<main><slot /></main>
<footer><p>&copy; ${new Date().getFullYear()} ${config.title}</p></footer>
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
    return `---
import Base from '../layouts/Base.astro';
---
<Base title="${article.title}" description="${article.metaDescription || ''}">
  <article><h1>${article.title}</h1>${article.contentHtml || article.contentMarkdown || ''}</article>
</Base>`;
}

function generateGlobalStyles(): string {
    return `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:2rem}header{margin-bottom:2rem;border-bottom:1px solid #eee;padding-bottom:1rem}.logo{font-size:1.5rem;font-weight:bold;text-decoration:none;color:#333}.hero{text-align:center;padding:4rem 0}.hero h1{font-size:2.5rem;margin-bottom:1rem}.articles ul{list-style:none}.articles li{margin-bottom:1rem}.articles a{font-size:1.25rem;color:#0066cc}article h1{font-size:2rem;margin-bottom:2rem}article h2,article h3{margin-top:2rem;margin-bottom:1rem}article p{margin-bottom:1rem}footer{margin-top:4rem;border-top:1px solid #eee;padding-top:1rem;text-align:center;color:#666;font-size:0.875rem}`;
}

function generateSitemap(config: SiteConfig, articleList: typeof articles.$inferSelect[]): string {
    const now = new Date().toISOString().split('T')[0];
    const urls = [
        `<url><loc>https://${config.domain}/</loc><lastmod>${now}</lastmod><priority>1.0</priority></url>`,
        ...articleList.map(a => `<url><loc>https://${config.domain}/${a.slug}</loc><lastmod>${now}</lastmod></url>`),
    ].join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}
