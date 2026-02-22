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
        .replace(/\[EXTERNAL_LINK[^\]]*\]/g, '')                  // catch-all for any remaining variant formats
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

// ── Word Break Algorithm for Domain Name Segmentation ────────────────────────

const WORD_SET = new Set([
    // Common English (top ~800 words that appear in domain names)
    'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','up','about','into','over','after',
    'is','it','my','me','we','us','our','you','your','he','she','they','its','be','am','are','was','were','been',
    'do','did','does','done','has','have','had','get','got','go','goes','gone','can','will','would','should','could',
    'not','no','all','any','some','each','every','much','many','more','most','such','own','other','another',
    'new','old','big','small','good','bad','best','worst','great','little','long','short','high','low','first','last',
    'right','left','next','real','true','free','full','half','open','easy','hard','fast','slow','safe','sure',
    // Actions
    'find','get','make','take','give','help','start','stop','buy','sell','pay','save','spend','earn','lose','win',
    'check','compare','review','rate','rank','pick','choose','switch','change','cancel','fix','build','plan',
    'search','look','see','watch','read','write','learn','know','think','try','use','need','want','like',
    'call','ask','tell','say','show','work','run','walk','drive','fly','move','send','bring','keep','put',
    // Business/commerce
    'cost','costs','price','prices','value','worth','deal','deals','offer','offers','quote','quotes',
    'budget','cheap','affordable','expensive','premium','basic','standard','pro','plus','elite','ultimate',
    'service','services','product','products','tool','tools','app','software','platform','system','solution',
    'company','business','brand','store','shop','market','agency','firm','group','team','network',
    'guide','guides','blog','article','resource','resources','info','information','data','report','analysis',
    // Finance
    'loan','loans','mortgage','refinance','credit','debit','card','bank','finance','financial','invest',
    'insurance','insure','tax','taxes','debt','equity','rate','rates','interest','payment','payments',
    'salary','income','money','cash','fund','funds','stock','stocks','bond','bonds','retirement','roth',
    'payoff','paydown','apr','apy',
    // Health/medical
    'health','healthy','medical','doctor','therapy','treatment','care','dental','braces','orthodontic','orthodontics',
    'surgery','clinic','hospital','prescription','drug','medicine','vitamin','supplement','diet','weight',
    'loss','fitness','exercise','mental','wellness','ivf','lasik','ketamine','ozempic','mounjaro','wegovy',
    'semaglutide','eliquis',
    // Real estate/home
    'home','house','apartment','condo','property','real','estate','rent','rental','mortgage','realtor',
    'renovation','remodel','remodeling','bathroom','kitchen','roof','roofing','plumbing','hvac','pool',
    'solar','panel','panels','install','installation','window','door','floor','flooring','paint','painting',
    'fence','fencing','garage','basement','attic','landscape','landscaping','garden','yard','patio','deck',
    // Legal
    'law','lawyer','legal','attorney','court','case','claim','sue','lawsuit','settle','settlement',
    'divorce','custody','prenup','prenuptial','eviction','injury','accident','disability','bankruptcy',
    'contract','agreement','license','permit','filing','notary','will','trust',
    // Auto
    'car','cars','auto','automobile','vehicle','truck','suv','sedan','motorcycle','tire','tires',
    'mechanic','dealer','lease','tow','towing','roadside','assistance',
    // Technology
    'tech','digital','online','web','website','internet','cloud','data','cyber','security','ai',
    'software','hardware','mobile','phone','computer','laptop','printer','battery','ev','electric',
    // Travel/location
    'travel','trip','hotel','flight','cruise','vacation','booking','destination','city','state','local',
    'near','nearby','area','region','county','town','north','south','east','west','central',
    // People/life
    'baby','child','children','kid','kids','family','parent','parenting','pet','dog','cat','animal',
    'wedding','marriage','dating','senior','elder','student','college','education','school','university',
    // Industry terms
    'calculator','estimator','planner','tracker','finder','checker','advisor','consultant','contractor',
    'provider','specialist','expert','professional','certified','licensed','insured','verified','trusted',
    'independent','unbiased',
    // Common domain words
    'hub','spot','zone','base','lab','labs','point','source','central','direct','express','prime',
    'smart','quick','rapid','instant','simple','total','complete','ultimate','master','super','mega',
    'top','max','mini','micro','nano','net','web','site','page','link','click',
    // Place names (common US cities/regions that appear in local domains)
    'branson','austin','dallas','houston','phoenix','denver','seattle','portland','nashville','atlanta',
    'miami','tampa','orlando','chicago','boston','detroit','charlotte','raleigh','columbus','indianapolis',
    'springfield','jacksonville','memphis','louisville','richmond','sacramento','oakland','tucson','mesa',
    'omaha','tulsa','cleveland','pittsburgh','cincinnati','kansas','milwaukee','boulder','savannah',
    'charleston','asheville','scottsdale','henderson','chandler','gilbert','glendale','plano','frisco',
    'mckinney','allen','prosper','celina','anna',
    // Misc
    'only','fans','onlyfans','creator','creators','economy','dropship','kingdom','pokemon','reddit','amazon','costco',
    'counter','debate','shadow','ban','thot','pilot','hero','vue','fan','fansly','fanvue',
    'fsbo','llc','corp','inc',
    // Additional common words for domain segmentation
    'this','that','these','those','here','there','where','when','how','what','which','who','why',
    'way','out','back','just','also','even','still','down','between','same','different',
    'very','really','actually','probably','definitely','maybe',
    'day','week','month','year','time','today','now',
    'able','part','place','thing','things','lot','set',
    'surance','makers','make','makes','made',
    // Words found missing from portfolio testing
    'ac','unit','beauty','settled','settled','debate','diabetes','generic','alternative',
    'diminished','negotiat','negotiate','trading','forex','platform','comparison','picker',
    'medicare','advantage','receipt','receipts','ready','refurbished','research','own',
    'regular','reg','hustle','side','mistakes','mistake','suit','settled','trade',
    'whats','wholes','quit','promos','promo','promotion','promotions','chatting','chat',
    'scam','scammed','scams','being','getting','clearance','catcher',
    'appraisal','valuation','formation','tuning','fine','owe',
    'saver','rights','facts','proof','slap','cap','nocap',
    'told','see','settled','versus','dvd','dv',
    // Suffixes/prefixes that help segmentation
    'tion','ment','ness','able','ible','ful','less','ing','ings','ment','ence','ance',
    'ive','ous','ual','ial','ity','ify','ize','ise',
    // Words from second round of portfolio testing
    'replacement','afford','subscription','promote','waste','whole','arm','fixed',
    'buy','it','old','told','reviews','suv','sedan',
    // Words from third round
    'term','regular','tradein','doi','acas','ownresearch',
    // Handle "Xvs" patterns: split before "vs" in preprocessing
    'suvvs','armvs',
    // Common word forms
    'buying','selling','saving','spending','earning','losing','winning','fixing','moving',
    'renting','owning','trading','investing','checking','comparing','reviewing','rating',
    'picking','choosing','switching','changing','canceling','cancelling','building','planning',
    'searching','looking','watching','reading','writing','learning','knowing','thinking',
    'trying','using','needing','wanting','liking','calling','asking','telling','showing',
    'working','running','walking','driving','flying','sending','bringing','keeping',
    'settled','required','needed','wanted','updated','verified','certified','licensed',
    'insured','trusted','rated','ranked','reviewed','compared','recommended',
]);

/**
 * Dynamic programming word break: finds the segmentation that uses the fewest
 * words (preferring longer words) to cover the input string.
 * Returns the space-separated result.
 */
function wordBreakSegment(input: string): string {
    const n = input.length;
    if (n === 0) return input;

    // dp[i] = best segmentation for input[0..i-1], or null if impossible
    const dp: Array<string[] | null> = new Array(n + 1).fill(null);
    dp[0] = [];

    for (let i = 1; i <= n; i++) {
        for (let j = Math.max(0, i - 20); j < i; j++) {
            if (dp[j] === null) continue;
            const word = input.slice(j, i);
            if (WORD_SET.has(word)) {
                const candidate = [...dp[j]!, word];
                if (dp[i] === null || candidate.length < dp[i]!.length) {
                    dp[i] = candidate;
                }
            }
        }
    }

    if (dp[n]) return dp[n]!.join(' ');

    // Fallback: greedy longest match with single-char skip for uncovered portions
    const words: string[] = [];
    let pos = 0;
    while (pos < n) {
        let bestLen = 0;
        for (let len = Math.min(20, n - pos); len >= 2; len--) {
            if (WORD_SET.has(input.slice(pos, pos + len))) {
                bestLen = len;
                break;
            }
        }
        if (bestLen > 0) {
            words.push(input.slice(pos, pos + bestLen));
            pos += bestLen;
        } else {
            if (words.length > 0 && words[words.length - 1].length < 4) {
                words[words.length - 1] += input[pos];
            } else {
                words.push(input[pos]);
            }
            pos++;
        }
    }
    return words.join(' ');
}

/**
 * Extract a human-readable site title from a domain name.
 *
 * Uses dynamic programming (word break) with a comprehensive dictionary
 * to find the optimal segmentation. Falls back to camelCase splitting
 * and single-char-advance if no segmentation covers the full string.
 */
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
            // Preprocess: split on known compound patterns before DP
            const preprocessed = spaced.toLowerCase()
                .replace(/vs(?=[a-z])/g, 'vs ')    // "suvvssedan" → "suvvs sedan" → "suv vs sedan"
                .replace(/(?<=[a-z])vs/g, ' vs')    // "armvsfixed" → "arm vsfixed" → "arm vs fixed"
                .replace(/tradein/g, 'trade in')
                .replace(/helpme/g, 'help me');
            // Run word break on each pre-split segment
            spaced = preprocessed.split(' ').map(seg => seg.trim()).filter(Boolean)
                .map(seg => WORD_SET.has(seg) ? seg : wordBreakSegment(seg))
                .join(' ');
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
