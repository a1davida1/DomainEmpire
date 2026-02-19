/**
 * Shared template utilities for static site generation.
 * Extracted from generator.ts to be reused across content-type templates.
 */

import { db, citations, users, domains } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { Article, Dataset } from '@/lib/db/schema';
import { isPortfolioCrossDomainLinkBlockingEnabled } from '@/lib/content/link-policy';

// Re-export types used by templates
export type { Article };

export interface DisclosureInfo {
    affiliateDisclosure?: string | null;
    adDisclosure?: string | null;
    notAdviceDisclaimer?: string | null;
    showReviewedBy?: boolean;
    showLastUpdated?: boolean;
    showChangeLog?: boolean;
    showMethodology?: boolean;
}

export interface ArticleDatasetInfo {
    dataset: Dataset;
    usage: string | null;
}

// ==============================
// HTML Escaping
// ==============================

export function escapeHtml(unsafe: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return (unsafe ?? '').replace(/[&<>"']/g, (m) => map[m]);
}

export function escapeAttr(unsafe: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;',
    };
    return (unsafe ?? '').replace(/[&"'<>]/g, (m) => map[m]);
}

// ==============================
// Markdown → HTML Rendering
// ==============================

type RenderMarkdownOptions = {
    currentDomain?: string;
};

type PortfolioDomainCache = {
    fetchedAt: number;
    domains: string[];
};

const PORTFOLIO_DOMAIN_CACHE_TTL_MS = 5 * 60 * 1000;
let portfolioDomainCache: PortfolioDomainCache | null = null;

function normalizeHost(host: string): string {
    return host.replace(/^www\./i, '').trim().toLowerCase();
}

async function getPortfolioDomains(): Promise<string[]> {
    const now = Date.now();
    if (portfolioDomainCache && now - portfolioDomainCache.fetchedAt < PORTFOLIO_DOMAIN_CACHE_TTL_MS) {
        return portfolioDomainCache.domains;
    }

    if (!process.env.DATABASE_URL) {
        return [];
    }

    try {
        const rows = await db
            .select({ domain: domains.domain })
            .from(domains)
            .where(isNull(domains.deletedAt));

        const unique = [...new Set(rows
            .map((row) => normalizeHost(row.domain))
            .filter((domain) => domain.length > 0))];

        portfolioDomainCache = {
            fetchedAt: now,
            domains: unique,
        };
        return unique;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[deploy] Portfolio domain list unavailable for cross-link policy: ${message}`);
        return [];
    }
}

function stripPortfolioCrossDomainLinks(
    html: string,
    portfolioDomains: string[],
    currentDomain?: string,
): string {
    if (portfolioDomains.length === 0) {
        return html;
    }

    const blocked = new Set(portfolioDomains);
    if (currentDomain) {
        blocked.delete(normalizeHost(currentDomain));
    }

    if (blocked.size === 0) {
        return html;
    }

    return html.replace(/<a\b([^>]*?)href=(['"])(.*?)\2([^>]*?)>([\s\S]*?)<\/a>/gi, (full, _pre, _quote, href, _post, text) => {
        let parsed: URL | null = null;
        try {
            parsed = new URL(href);
        } catch {
            return full; // relative or invalid URL; leave unchanged
        }

        const host = normalizeHost(parsed.hostname);
        if (!blocked.has(host)) {
            return full;
        }

        // Keep visible text but remove portfolio cross-domain href.
        return `<span class="portfolio-link-blocked">${text}</span>`;
    });
}

/**
 * Add rel="nofollow noopener noreferrer" and target="_blank" to external
 * (absolute http/https) links.  Internal/relative links are left alone.
 */
export function addExternalLinkAttributes(html: string): string {
    return html.replace(
        /<a\s([^>]*?)href="(https?:\/\/[^"]+)"([^>]*)>/gi,
        (_full, before: string, href: string, after: string) => {
            const rest = before + after;
            const hasRel = /\brel\s*=/i.test(rest);
            const hasTarget = /\btarget\s*=/i.test(rest);
            let extra = '';
            if (!hasRel) extra += ' rel="nofollow noopener noreferrer"';
            if (!hasTarget) extra += ' target="_blank"';
            return `<a ${before}href="${href}"${after}${extra}>`;
        },
    );
}

export async function renderMarkdownToHtml(markdown: string, options: RenderMarkdownOptions = {}): Promise<string> {
    const cleaned = markdown
        .replace(/\[INTERNAL_LINK.*?\]/g, '')
        .replace(/\[EXTERNAL_LINK:\s*(.+?)\s*\|[^\]]*\]/g, '$1')  // preserve anchor text from unresolved leftovers
        .replace(/\[IMAGE.*?\]/g, '');

    const result = marked.parse(cleaned, { async: false });
    const html = typeof result === 'string' ? result : await result;
    const withExtAttrs = addExternalLinkAttributes(html);
    const sanitized = sanitizeArticleHtml(withExtAttrs);

    if (!isPortfolioCrossDomainLinkBlockingEnabled()) {
        return sanitized;
    }

    const portfolioDomains = await getPortfolioDomains();
    return stripPortfolioCrossDomainLinks(sanitized, portfolioDomains, options.currentDomain);
}

// ==============================
// HTML Sanitization
// ==============================

const EXTENDED_ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'figure', 'figcaption',
    'details', 'summary', 'mark', 'abbr', 'time', 'del', 'ins',
    // Interactive form elements for calculator/lead-gen pages
    'form', 'input', 'select', 'button', 'label', 'textarea',
    'output', 'fieldset', 'legend', 'option', 'optgroup',
    // Table enhancements
    'th', 'td', 'thead', 'tbody', 'tfoot', 'caption', 'colgroup', 'col',
]);

const EXTENDED_ALLOWED_ATTRIBUTES = {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    a: ['href', 'title', 'rel', 'target'],
    time: ['datetime'],
    abbr: ['title'],
    input: ['type', 'name', 'id', 'value', 'placeholder', 'min', 'max', 'step', 'required', 'class', 'aria-label'],
    select: ['name', 'id', 'class', 'required', 'aria-label'],
    option: ['value', 'selected'],
    button: ['type', 'class', 'id', 'disabled'],
    label: ['for', 'class'],
    textarea: ['name', 'id', 'rows', 'cols', 'placeholder', 'class'],
    output: ['name', 'id', 'for', 'class'],
    form: ['id', 'class', 'action', 'method'],
    fieldset: ['class'],
    legend: ['class'],
    th: ['scope', 'data-sort-key', 'class'],
    td: ['data-value', 'class'],
    details: ['open', 'class'],
    summary: ['class'],
    div: ['class', 'id', 'role'],
    span: ['class', 'id'],
    section: ['class', 'id'],
};

export function sanitizeArticleHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: EXTENDED_ALLOWED_TAGS,
        allowedAttributes: EXTENDED_ALLOWED_ATTRIBUTES,
        allowedSchemes: ['http', 'https', 'mailto'],
    });
}

// ==============================
// Trust Elements Builder
// ==============================

export async function buildTrustElements(
    article: Article,
    disclosure: DisclosureInfo | null | undefined,
): Promise<{ disclaimerHtml: string; trustHtml: string }> {
    const ymylLevel = article.ymylLevel || 'none';
    const sections: string[] = [];

    // YMYL disclaimer
    let disclaimerHtml = '';
    if ((ymylLevel === 'high' || ymylLevel === 'medium') && disclosure?.notAdviceDisclaimer) {
        disclaimerHtml = `<div class="disclaimer">${escapeHtml(disclosure.notAdviceDisclaimer)}</div>`;
    }

    // Affiliate disclosure
    if (disclosure?.affiliateDisclosure) {
        sections.push(`<div class="disclosure affiliate-disclosure"><small>${escapeHtml(disclosure.affiliateDisclosure)}</small></div>`);
    }

    const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
    let articleCitations: Array<typeof citations.$inferSelect> = [];
    let reviewer: { name: string; credentials: string | null } | undefined;

    if (hasDatabase) {
        try {
            articleCitations = await db.select()
                .from(citations)
                .where(eq(citations.articleId, article.id))
                .orderBy(citations.position);

            if (disclosure?.showReviewedBy && article.lastReviewedBy) {
                [reviewer] = await db.select({ name: users.name, credentials: users.credentials })
                    .from(users).where(eq(users.id, article.lastReviewedBy)).limit(1);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[deploy] Trust metadata query failed for article ${article.id}; continuing without DB-backed sections: ${message}`);
        }
    }

    // Citations / Sources
    if (articleCitations.length > 0) {
        const sourceItems = articleCitations.map((c, i) => {
            const index = i + 1;
            const title = escapeHtml(c.sourceTitle || c.sourceUrl);
            const url = escapeAttr(c.sourceUrl);
            const retrieved = c.retrievedAt
                ? ` <small>(Retrieved ${new Date(c.retrievedAt).toLocaleDateString()})</small>`
                : '';
            return `<li>[${index}] <a href="${url}" rel="nofollow noopener" target="_blank">${title}</a>${retrieved}</li>`;
        }).join('\n');
        sections.push(`<section class="sources"><h2>Sources</h2><ol>${sourceItems}</ol></section>`);
    }

    // Reviewed by attribution
    if (reviewer) {
        const creds = reviewer.credentials ? `, ${escapeHtml(reviewer.credentials)}` : '';
        sections.push(`<div class="reviewed-by"><small>Reviewed by ${escapeHtml(reviewer.name)}${creds}</small></div>`);
    }

    // Last updated
    if (disclosure?.showLastUpdated && article.updatedAt) {
        sections.push(`<div class="last-updated"><small>Last updated: ${new Date(article.updatedAt).toLocaleDateString()}</small></div>`);
    }

    return { disclaimerHtml, trustHtml: sections.join('\n') };
}

// ==============================
// Schema.org JSON-LD Builder
// ==============================

export function buildSchemaJsonLd(
    article: Article,
    domain: string,
    type: 'Article' | 'WebApplication' | 'ItemList' | 'FAQPage',
    extra?: Record<string, unknown>,
): string {
    const base: Record<string, unknown> = {
        '@context': 'https://schema.org',
    };

    switch (type) {
        case 'Article':
            Object.assign(base, {
                '@type': 'Article',
                headline: article.title,
                description: article.metaDescription || '',
                url: `https://${domain}/${article.slug}`,
                mainEntityOfPage: { '@type': 'WebPage', '@id': `https://${domain}/${article.slug}` },
                dateModified: article.updatedAt
                    ? new Date(article.updatedAt).toISOString()
                    : (article.publishedAt ? new Date(article.publishedAt).toISOString() : undefined),
                datePublished: article.publishedAt ? new Date(article.publishedAt).toISOString() : undefined,
                inLanguage: 'en',
                wordCount: article.contentMarkdown ? article.contentMarkdown.split(/\s+/).length : undefined,
                author: { '@type': 'Organization', name: domain },
                publisher: { '@type': 'Organization', name: domain },
            });
            break;
        case 'WebApplication':
            Object.assign(base, {
                '@type': 'WebApplication',
                name: article.title,
                description: article.metaDescription || '',
                url: `https://${domain}/${article.slug}`,
                applicationCategory: 'FinanceApplication',
                operatingSystem: 'Any',
                ...extra,
            });
            break;
        case 'ItemList':
            Object.assign(base, {
                '@type': 'ItemList',
                name: article.title,
                description: article.metaDescription || '',
                url: `https://${domain}/${article.slug}`,
                ...extra,
            });
            break;
        case 'FAQPage':
            Object.assign(base, {
                '@type': 'FAQPage',
                name: article.title,
                url: `https://${domain}/${article.slug}`,
                ...extra,
            });
            break;
    }

    return `<script type="application/ld+json">${JSON.stringify(base)}</script>`;
}

// ==============================
// WebSite Schema (for index page)
// ==============================

export function buildWebSiteSchema(domain: string, siteTitle: string, description: string): string {
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteTitle,
        url: `https://${domain}/`,
        description,
        publisher: { '@type': 'Organization', name: siteTitle },
    };
    return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

// ==============================
// OpenGraph / Twitter Cards + Canonical + Breadcrumbs
// ==============================

export function buildOpenGraphTags(article: Article, domain: string): string {
    const url = `https://${domain}/${article.slug}`;
    const title = escapeAttr(article.title);
    const description = escapeAttr(article.metaDescription || '');
    const tags = [
        `<link rel="canonical" href="${url}">`,
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:type" content="article">`,
        `<meta property="og:site_name" content="${escapeAttr(domain)}">`,
        `<meta property="og:locale" content="en_US">`,
        `<meta name="twitter:card" content="summary">`,
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
    ];
    if (article.publishedAt) {
        tags.push(`<meta property="article:published_time" content="${new Date(article.publishedAt).toISOString()}">`);
    }
    if (article.updatedAt) {
        tags.push(`<meta property="article:modified_time" content="${new Date(article.updatedAt).toISOString()}">`);
    }
    // Breadcrumb structured data
    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${domain}/` },
            { '@type': 'ListItem', position: 2, name: article.title, item: url },
        ],
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`);
    return tags.join('\n  ');
}

// ==============================
// HTML Page Shell (replaces Astro layout)
// ==============================

export interface PageShell {
    siteTitle: string;
    headScripts: string;
    bodyScripts: string;
    headerHtml: string;
    footerHtml: string;
    sidebarHtml: string;
    hasSidebar: boolean;
}

/**
 * Wrap page body content in a full HTML document using the site shell.
 * Replaces the old Astro layout wrapper — generates complete, self-contained HTML.
 */
export function wrapInHtmlPage(
    pageTitle: string,
    pageDescription: string,
    bodyHtml: string,
    pageShell: PageShell,
    extraHead?: string,
): string {
    const shell = pageShell;
    if (!shell) throw new Error('Page shell missing');

    const mainContent = shell.hasSidebar
        ? `<div class="site-container"><div class="layout-wrap"><main>${bodyHtml}</main>${shell.sidebarHtml}</div></div>`
        : `<div class="site-container"><main>${bodyHtml}</main></div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeAttr(pageDescription)}">
  <meta name="robots" content="index, follow">
  <title>${escapeHtml(pageTitle)} | ${escapeHtml(shell.siteTitle)}</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  ${shell.headScripts}
  ${extraHead || ''}
</head>
<body>
${shell.headerHtml}
${mainContent}
${shell.footerHtml}
${shell.bodyScripts}
</body>
</html>`;
}

// ==============================
// Freshness Badge
// ==============================

export function buildFreshnessBadge(
    article: Article,
    datasets: ArticleDatasetInfo[],
): string {
    if (datasets.length === 0 && !article.updatedAt) return '';

    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    // Check dataset freshness
    let allFresh = true;
    let anyExpired = false;
    for (const { dataset } of datasets) {
        if (dataset.expiresAt && new Date(dataset.expiresAt).getTime() < now) {
            anyExpired = true;
            allFresh = false;
        }
    }

    // Check article freshness
    const articleAge = article.updatedAt ? now - new Date(article.updatedAt).getTime() : Infinity;
    if (articleAge > ninetyDays) allFresh = false;

    let badgeClass: string;
    let badgeText: string;

    if (anyExpired) {
        badgeClass = 'freshness-red';
        badgeText = 'Needs update';
    } else if (allFresh && articleAge < thirtyDays) {
        badgeClass = 'freshness-green';
        const date = article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : 'recently';
        badgeText = `Verified ${date}`;
    } else {
        badgeClass = 'freshness-yellow';
        badgeText = 'Review pending';
    }

    return `<div class="freshness-badge ${badgeClass}"><span class="freshness-dot"></span>${escapeHtml(badgeText)}</div>`;
}

// ==============================
// Print Button
// ==============================

export function buildPrintButton(contentType: string): string {
    const printableTypes = ['cost_guide', 'comparison', 'checklist', 'faq', 'review', 'interactive_infographic', 'interactive_map'];
    if (!printableTypes.includes(contentType)) return '';
    return `<button class="print-btn" onclick="window.print()" type="button">Save as PDF</button>`;
}

// ==============================
// Data Sources Section
// ==============================

export function generateDataSourcesSection(datasets: ArticleDatasetInfo[]): string {
    if (datasets.length === 0) return '';

    const items = datasets.map(({ dataset, usage }) => {
        const title = escapeHtml(dataset.sourceTitle || dataset.name);
        const url = dataset.sourceUrl ? ` href="${escapeAttr(dataset.sourceUrl)}" rel="nofollow noopener" target="_blank"` : '';
        const retrieved = dataset.retrievedAt
            ? ` <small>(Retrieved ${new Date(dataset.retrievedAt).toLocaleDateString()})</small>`
            : '';
        const publisher = dataset.publisher ? ` — ${escapeHtml(dataset.publisher)}` : '';
        const usageNote = usage ? ` <span class="data-usage">${escapeHtml(usage)}</span>` : '';
        return `<li class="data-source-item"><a${url}>${title}</a>${publisher}${retrieved}${usageNote}</li>`;
    }).join('\n');

    return `<section class="data-sources"><h2>Data Sources</h2><ul>${items}</ul></section>`;
}

/** Extract a human-readable site title from a domain name. Handles ccTLDs like example.co.uk. */
export function extractSiteTitle(domain: string): string {
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
    let spaced = sld.replaceAll('-', ' ').replaceAll('_', ' ');
    if (!spaced.includes(' ')) {
        spaced = spaced
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/([a-z])(\d)/g, '$1 $2')
            .replace(/(\d)([a-z])/gi, '$1 $2');
        if (!spaced.includes(' ')) {
            const DICTIONARY = ['bathroom','renovation','cost','costs','kitchen','remodel','price','pool',
                'installation','hvac','unit','install','replacement','credit','card','payoff',
                'insurance','compare','auto','pet','switch','medicare','whole','term','extended',
                'warranty','guide','ozempic','mounjaro','semaglutide','wegovy','therapy','braces',
                'ivf','lasik','surgery','prescription','ketamine','refinance','loan','student',
                'equity','salary','roth','debt','free','tax','filing','deduction','claim',
                'home','value','rent','realtor','fsbo','trade','diminished','divorce','disability',
                'injury','eviction','contractor','scam','prenup','supplement','beauty','sneaker',
                'valuation','tool','pokemon','appraisal','wedding','planner','zone','fine','tuning',
                'dropship','kingdom','clearance','catcher','travel','deal','spot','forum',
                'affordable','generic','weight','loss','findings','analysis','today','facts',
                'settled','refurbished','cancel','subscription','negotiate','bill','amazon','costco',
                'arm','fixed','worth','fix','quit','rent','own','research','creator','onlyfans',
                'fansly','review','shadow','ban','reddit','promotion','chatting','expert',
                'car','accident','my','file','suit','settle','total','not','should','what','how',
                'much','do','have','case','is','or','vs','the','a','an','of','for','your','can',
                'am','being','scammed','big','independent','no','printer',
                'start','formation','calc','in','i','eliquis','alternative','payday','pro','renting','waste',
                'write','off','wash','sale','rule','afford','check','ev','battery',
                'suv','sedan','debates','over','counter','safe','take',
                'rate','timing','pay','save','best','state','find',
                'thot','pilot','info','help','hero','offers','service',
                'fan','vue','shadowban'];
            DICTIONARY.sort((a, b) => b.length - a.length);
            const lower = spaced.toLowerCase();
            const breaks = new Set<number>();
            let pos = 0;
            while (pos < lower.length) {
                let matched = false;
                for (const word of DICTIONARY) {
                    if (lower.startsWith(word, pos)) {
                        breaks.add(pos);
                        pos += word.length;
                        matched = true;
                        break;
                    }
                }
                if (!matched) pos++;
            }
            if (breaks.size > 1) {
                let result = '';
                for (let i = 0; i < spaced.length; i++) {
                    if (breaks.has(i) && i > 0) result += ' ';
                    result += spaced[i];
                }
                spaced = result;
            }
        }
    }
    let titled = spaced.replaceAll(/\b\w/g, c => c.toUpperCase()).trim();
    const BRAND_NAMES: Record<string, string> = {
        'Onlyfans': 'OnlyFans', 'Fansly': 'Fansly', 'Fanvue': 'Fanvue',
        'Ozempic': 'Ozempic', 'Mounjaro': 'Mounjaro', 'Wegovy': 'Wegovy',
        'Semaglutide': 'Semaglutide', 'Eliquis': 'Eliquis', 'Invisalign': 'Invisalign',
        'Fsbo': 'FSBO', 'Llc': 'LLC', 'Ivf': 'IVF', 'Hvac': 'HVAC',
        'Roi': 'ROI', 'Ev': 'EV', 'Suv': 'SUV', 'Apr': 'APR',
        'Vs': 'vs', 'Or': 'or',
    };
    for (const [from, to] of Object.entries(BRAND_NAMES)) {
        titled = titled.replaceAll(new RegExp(`\\b${from}\\b`, 'g'), to);
    }
    return titled;
}
