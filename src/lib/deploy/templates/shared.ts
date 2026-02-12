/**
 * Shared template utilities for static site generation.
 * Extracted from generator.ts to be reused across content-type templates.
 */

import { db, citations, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import type { Article, Dataset } from '@/lib/db/schema';

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
    return unsafe.replace(/[&<>"']/g, (m) => map[m]);
}

export function escapeAttr(unsafe: string): string {
    const map: Record<string, string> = {
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;',
        '<': '&lt;',
        '>': '&gt;',
    };
    return unsafe.replace(/[&"'<>]/g, (m) => map[m]);
}

// ==============================
// Markdown → HTML Rendering
// ==============================

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
    const cleaned = markdown
        .replace(/\[INTERNAL_LINK.*?\]/g, '')
        .replace(/\[EXTERNAL_LINK.*?\]/g, '')
        .replace(/\[IMAGE.*?\]/g, '');

    const result = marked.parse(cleaned, { async: false });
    const html = typeof result === 'string' ? result : await result;
    return sanitizeArticleHtml(html);
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

    // Citations / Sources
    const articleCitations = await db.select()
        .from(citations)
        .where(eq(citations.articleId, article.id))
        .orderBy(citations.position);

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
    if (disclosure?.showReviewedBy && article.lastReviewedBy) {
        const [reviewer] = await db.select({ name: users.name, credentials: users.credentials })
            .from(users).where(eq(users.id, article.lastReviewedBy)).limit(1);
        if (reviewer) {
            const creds = reviewer.credentials ? `, ${escapeHtml(reviewer.credentials)}` : '';
            sections.push(`<div class="reviewed-by"><small>Reviewed by ${escapeHtml(reviewer.name)}${creds}</small></div>`);
        }
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
                dateModified: article.updatedAt ? new Date(article.updatedAt).toISOString() : undefined,
                datePublished: article.publishedAt ? new Date(article.publishedAt).toISOString() : undefined,
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
// OpenGraph / Twitter Cards
// ==============================

export function buildOpenGraphTags(article: Article, domain: string): string {
    const url = `https://${domain}/${article.slug}`;
    const title = escapeAttr(article.title);
    const description = escapeAttr(article.metaDescription || '');
    return [
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:url" content="${url}">`,
        `<meta property="og:type" content="article">`,
        `<meta property="og:site_name" content="${escapeAttr(domain)}">`,
        `<meta name="twitter:card" content="summary">`,
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
    ].join('\n  ');
}

// ==============================
// Astro Layout Wrapper
// ==============================

export function wrapInAstroLayout(
    titleAttr: string,
    descAttr: string,
    bodyHtml: string,
    extraHead?: string,
): string {
    const headSlot = extraHead ? `\n  ${extraHead}` : '';
    return `---
import Base from '../layouts/Base.astro';
---
<Base title="${escapeAttr(titleAttr)}" description="${escapeAttr(descAttr)}">
  ${bodyHtml}${headSlot}
</Base>`;
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
    const printableTypes = ['cost_guide', 'comparison', 'checklist', 'faq', 'review'];
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
