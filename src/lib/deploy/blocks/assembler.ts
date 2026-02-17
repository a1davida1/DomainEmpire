/**
 * Block Assembler — renders a PageDefinition (block sequence) into complete HTML.
 *
 * This is the v2 equivalent of generator.ts's per-template dispatch.
 * It iterates the block sequence, delegates to per-block renderers,
 * and wraps the result in a complete HTML document.
 */

import type { BlockEnvelope, BlockType } from './schemas';
import {
    escapeHtml,
    escapeAttr,
    sanitizeArticleHtml,
} from '../templates/shared';
import { marked } from 'marked';

// Google Fonts URLs for each theme
const THEME_FONT_URLS: Record<string, string> = {
    clean: 'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
    editorial: 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
    bold: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600;700&display=swap',
    minimal: '', // uses system fonts
};

// ============================================================
// Render Context — passed to every block renderer
// ============================================================

export interface RenderContext {
    domain: string;
    siteTitle: string;
    route: string;
    theme: string;
    skin: string;
    pageTitle?: string;
    pageDescription?: string;
    publishedAt?: string;
    updatedAt?: string;
    ogImagePath?: string;
    headScripts: string;
    bodyScripts: string;
}

// ============================================================
// Block Renderer Registry
// ============================================================

type BlockRenderer = (block: BlockEnvelope, ctx: RenderContext) => string;

const renderers: Partial<Record<BlockType, BlockRenderer>> = {};

/**
 * Register a renderer for a block type. Called by renderer modules at import time.
 */
export function registerBlockRenderer(type: BlockType, renderer: BlockRenderer): void {
    renderers[type] = renderer;
}

/**
 * Render a single block. Returns empty string if no renderer is registered.
 */
export function renderBlock(block: BlockEnvelope, ctx: RenderContext): string {
    const renderer = renderers[block.type as BlockType];
    if (!renderer) {
        console.warn(`[assembler] No renderer registered for block type: ${block.type}`);
        return `<!-- unknown block: ${escapeHtml(block.type)} -->`;
    }
    try {
        return renderer(block, ctx);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[assembler] Error rendering block ${block.id} (${block.type}): ${msg}`);
        return `<!-- render error: ${escapeHtml(block.type)} -->`;
    }
}

export function getConfiguratorBridgeScript(allowedParentOrigin: string): string {
    const serializedAllowedOrigin = JSON.stringify(allowedParentOrigin);
    return `<script>
(function(){
  var ALLOWED_PARENT_ORIGIN=${serializedAllowedOrigin};
  var parentOrigin=typeof ALLOWED_PARENT_ORIGIN==='string'?ALLOWED_PARENT_ORIGIN:'';
  var selected=null;
  var highlighted=null;
  var OUTLINE='2px solid #3b82f6';
  var HOVER_OUTLINE='2px dashed #93c5fd';

  function isTrustedParentOrigin(origin){
    return !!origin&&origin===ALLOWED_PARENT_ORIGIN;
  }

  function clearHighlight(){
    if(highlighted){highlighted.style.outline='';highlighted=null;}
  }
  function clearSelection(){
    if(selected){selected.style.outline='';selected=null;}
  }

  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-block-id]');
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    if(!isTrustedParentOrigin(parentOrigin))return;
    clearSelection();
    selected=el;
    el.style.outline=OUTLINE;
    parent.postMessage({type:'block-select',blockId:el.getAttribute('data-block-id'),blockType:el.getAttribute('data-block-type')},parentOrigin);
  },true);

  document.addEventListener('mouseover',function(e){
    var el=e.target.closest('[data-block-id]');
    if(!el||el===selected)return;
    clearHighlight();
    highlighted=el;
    el.style.outline=HOVER_OUTLINE;
  });
  document.addEventListener('mouseout',function(e){
    var el=e.target.closest('[data-block-id]');
    if(el&&el===highlighted)clearHighlight();
  });

  window.addEventListener('message',function(e){
    if(!isTrustedParentOrigin(parentOrigin))return;
    if(e.origin!==parentOrigin)return;
    if(!e.data||e.data.type!=='block-highlight')return;
    var bid=String(e.data.blockId||'').replace(/[^a-zA-Z0-9_\-]/g,'');
    if(!bid)return;
    clearSelection();
    var target=document.querySelector('[data-block-id="'+bid+'"]');
    if(!target)return;
    selected=target;
    target.style.outline=OUTLINE;
    target.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();
</script>`;
}

// ============================================================
// Enhancement Script (scroll animations, reading progress, back-to-top)
// ============================================================

function getEnhancementScript(): string {
    return `<script>
(function(){
  /* Scroll-triggered fade-in via IntersectionObserver */
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}
      });
    },{threshold:0.08,rootMargin:'0px 0px -40px 0px'});
    document.querySelectorAll('section[data-animate]').forEach(function(s){io.observe(s)});
  }else{
    document.querySelectorAll('section[data-animate]').forEach(function(s){s.classList.add('is-visible')});
  }

  /* Reading progress bar */
  var bar=document.querySelector('.reading-progress');
  if(bar){
    window.addEventListener('scroll',function(){
      var h=document.documentElement;
      var pct=h.scrollTop/(h.scrollHeight-h.clientHeight)*100;
      bar.style.width=Math.min(pct,100)+'%';
    },{passive:true});
  }

  /* Back-to-top button */
  var btn=document.querySelector('.back-to-top');
  if(btn){
    window.addEventListener('scroll',function(){
      btn.classList.toggle('visible',window.scrollY>400);
    },{passive:true});
    btn.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'})});
  }

  /* Animated number counters for stat values */
  if('IntersectionObserver' in window){
    var cio=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(!e.isIntersecting)return;
        cio.unobserve(e.target);
        var target=parseInt(e.target.getAttribute('data-count')||'0',10);
        if(!target)return;
        var start=0;var dur=800;var t0=null;
        function step(ts){
          if(!t0)t0=ts;
          var p=Math.min((ts-t0)/dur,1);
          var ease=1-Math.pow(1-p,3);
          e.target.textContent=Math.round(start+(target-start)*ease)+(e.target.getAttribute('data-suffix')||'');
          if(p<1)requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    },{threshold:0.3});
    document.querySelectorAll('[data-count]').forEach(function(el){cio.observe(el)});
  }

  /* Parallax scroll on hero */
  var hero=document.querySelector('.hero');
  if(hero&&!window.matchMedia('(prefers-reduced-motion:reduce)').matches){
    window.addEventListener('scroll',function(){
      var y=window.scrollY;
      if(y<hero.offsetHeight*1.5){
        hero.style.backgroundPositionY=Math.round(y*0.3)+'px';
      }
    },{passive:true});
  }
})();
</script>`;
}

// ============================================================
// SEO Helpers
// ============================================================

function buildOpenGraphMeta(ctx: RenderContext, pageUrl: string): string {
    const title = escapeAttr(ctx.pageTitle || ctx.siteTitle);
    const description = escapeAttr(ctx.pageDescription || '');
    const domain = escapeAttr(ctx.domain);
    const isHomepage = ctx.route === '/';

    const ogImageUrl = ctx.ogImagePath ? `https://${ctx.domain}${ctx.ogImagePath}` : '';

    const tags = [
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:url" content="${escapeAttr(pageUrl)}">`,
        `<meta property="og:type" content="${isHomepage ? 'website' : 'article'}">`,
        `<meta property="og:site_name" content="${domain}">`,
        `<meta property="og:locale" content="en_US">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
    ];

    if (ogImageUrl) {
        tags.push(`<meta property="og:image" content="${escapeAttr(ogImageUrl)}">`);
        tags.push(`<meta property="og:image:width" content="1200">`);
        tags.push(`<meta property="og:image:height" content="630">`);
        tags.push(`<meta name="twitter:image" content="${escapeAttr(ogImageUrl)}">`);
    }

    if (ctx.publishedAt) {
        tags.push(`<meta property="article:published_time" content="${escapeAttr(ctx.publishedAt)}">`);
    }
    if (ctx.updatedAt) {
        tags.push(`<meta property="article:modified_time" content="${escapeAttr(ctx.updatedAt)}">`);
    }

    return tags.join('\n  ');
}

function buildStructuredData(ctx: RenderContext, canonicalUrl: string): string {
    const scripts: string[] = [];
    const isHomepage = ctx.route === '/';

    // WebPage or Article schema
    const pageSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': isHomepage ? 'WebPage' : 'Article',
        name: ctx.pageTitle || ctx.siteTitle,
        headline: ctx.pageTitle || ctx.siteTitle,
        description: ctx.pageDescription || '',
        url: canonicalUrl,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
        inLanguage: 'en',
        author: { '@type': 'Organization', name: ctx.domain },
        publisher: { '@type': 'Organization', name: ctx.domain },
    };
    if (ctx.publishedAt) pageSchema.datePublished = ctx.publishedAt;
    if (ctx.updatedAt) pageSchema.dateModified = ctx.updatedAt;
    scripts.push(`<script type="application/ld+json">${JSON.stringify(pageSchema)}</script>`);

    // BreadcrumbList
    const breadcrumbItems: Array<Record<string, unknown>> = [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${ctx.domain}/` },
    ];
    if (!isHomepage) {
        breadcrumbItems.push({
            '@type': 'ListItem',
            position: 2,
            name: ctx.pageTitle || ctx.route,
            item: canonicalUrl,
        });
    }
    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
    };
    scripts.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`);

    return scripts.join('\n  ');
}

// ============================================================
// Page Assembly
// ============================================================

/**
 * Assemble a complete HTML page from a block sequence.
 *
 * The block sequence is rendered in order. Header and Footer blocks
 * are special-cased to wrap the main content, matching the v1 PageShell pattern.
 */
export function assemblePageFromBlocks(
    blocks: BlockEnvelope[],
    ctx: RenderContext,
    cssHref: string = '/styles.css',
): string {
    // Separate structural blocks from content blocks
    let headerHtml = '';
    let footerHtml = '';
    const contentBlocks: string[] = [];

    for (const block of blocks) {
        const html = renderBlock(block, ctx);
        if (block.type === 'Header') {
            headerHtml = `<div data-block-id="${escapeAttr(block.id)}" data-block-type="Header">${html}</div>`;
        } else if (block.type === 'Footer') {
            footerHtml = `<div data-block-id="${escapeAttr(block.id)}" data-block-type="Footer">${html}</div>`;
        } else {
            contentBlocks.push(
                `<section data-block-id="${escapeAttr(block.id)}" data-block-type="${escapeAttr(block.type)}"${block.variant ? ` data-block-variant="${escapeAttr(block.variant)}"` : ''} data-animate>${html}</section>`,
            );
        }
    }

    const title = ctx.pageTitle || ctx.siteTitle;
    const description = ctx.pageDescription || '';
    const fullTitle = ctx.pageTitle && ctx.pageTitle !== ctx.siteTitle
        ? `${escapeHtml(title)} | ${escapeHtml(ctx.siteTitle)}`
        : escapeHtml(title);

    const fontUrl = THEME_FONT_URLS[ctx.theme] ?? THEME_FONT_URLS.clean;
    const fontLinks = fontUrl
        ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${escapeAttr(fontUrl)}">`
        : '';

    const pageUrl = `https://${ctx.domain}${ctx.route === '/' ? '' : ctx.route}`;
    const canonicalUrl = `https://${ctx.domain}${ctx.route}`;

    // OpenGraph + Twitter meta tags
    const ogMeta = buildOpenGraphMeta(ctx, pageUrl);

    // Structured data: Article/WebPage JSON-LD + BreadcrumbList
    const structuredData = buildStructuredData(ctx, canonicalUrl);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeAttr(description)}">
  <meta name="robots" content="index, follow">
  <title>${fullTitle}</title>
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  ${ogMeta}
  ${fontLinks}
  <link rel="stylesheet" href="${escapeAttr(cssHref)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  ${structuredData}
  ${ctx.headScripts}
</head>
<body data-theme="${escapeAttr(ctx.theme)}" data-skin="${escapeAttr(ctx.skin)}">
${headerHtml}
<div class="site-container">
  <main>
${contentBlocks.join('\n')}
  </main>
</div>
${footerHtml}
<div class="reading-progress" aria-hidden="true"></div>
<button class="back-to-top" aria-label="Back to top">&uarr;</button>
${getEnhancementScript()}
${ctx.bodyScripts}
</body>
</html>`;
}

// ============================================================
// Built-in Renderers (structural blocks)
// ============================================================

// --- Header ---
registerBlockRenderer('Header', (block, ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const variant = block.variant || config.variant || 'topbar';
    const sticky = config.sticky ? ' style="position:sticky;top:0;z-index:50"' : '';
    const siteName = (content.siteName as string) || ctx.siteTitle;
    const navLinks = (content.navLinks as Array<{ label: string; href: string }>) || [];

    const nav = navLinks.length > 0
        ? `<nav>${navLinks.map(l => `<a href="${escapeAttr(l.href)}">${escapeHtml(l.label)}</a>`).join(' ')}</nav>`
        : '';

    return `<header class="header header--${escapeAttr(String(variant))}"${sticky}>
  <div class="site-container">
    <a href="/" class="logo">${escapeHtml(siteName)}</a>
    ${nav}
  </div>
</header>`;
});

// --- Footer ---
registerBlockRenderer('Footer', (block, ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const variant = block.variant || config.variant || 'minimal';
    const siteName = (content.siteName as string) || ctx.siteTitle;
    const year = (content.copyrightYear as number) || new Date().getFullYear();
    const disclaimer = (content.disclaimerText as string) || '';
    const columns = (content.columns as Array<{ title: string; links: Array<{ label: string; href: string }> }>) || [];

    let inner = '';

    if (variant === 'multi-column' && columns.length > 0) {
        const cols = columns.map(col => {
            const links = col.links.map(l =>
                `<li><a href="${escapeAttr(l.href)}">${escapeHtml(l.label)}</a></li>`
            ).join('');
            return `<div class="footer-col"><h4>${escapeHtml(col.title)}</h4><ul>${links}</ul></div>`;
        }).join('');
        inner = `<div class="footer-columns">${cols}</div>`;
    }

    if (variant === 'newsletter') {
        const endpoint = (content.newsletterEndpoint as string) || '';
        const headline = (content.newsletterHeadline as string) || 'Stay updated';
        if (endpoint) {
            inner += `<div class="footer-newsletter">
  <h4>${escapeHtml(headline)}</h4>
  <form action="${escapeAttr(endpoint)}" method="POST" class="newsletter-form">
    <input type="email" name="email" placeholder="your@email.com" required>
    <button type="submit">Subscribe</button>
  </form>
</div>`;
        }
    }

    const disclaimerHtml = disclaimer
        ? `<div class="footer-disclaimer">${escapeHtml(disclaimer)}</div>`
        : '';

    return `<footer class="footer footer--${escapeAttr(String(variant))}">
  <div class="site-container">
    ${inner}
    ${disclaimerHtml}
    <p>&copy; ${year} ${escapeHtml(siteName)}. All rights reserved.</p>
  </div>
</footer>`;
});

// --- Hero ---
registerBlockRenderer('Hero', (block, ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const variant = block.variant || config.variant || 'centered';
    const heading = (content.heading as string) || ctx.siteTitle;
    const subheading = (content.subheading as string) || '';
    const ctaText = (content.ctaText as string) || '';
    const ctaUrl = (content.ctaUrl as string) || '';
    const badge = (content.badge as string) || '';

    const badgeHtml = badge ? `<span class="hero-badge">${escapeHtml(badge)}</span>` : '';
    const subHtml = subheading ? `<p class="hero-sub">${escapeHtml(subheading)}</p>` : '';
    const ctaHtml = ctaText && ctaUrl
        ? `<a href="${escapeAttr(ctaUrl)}" class="cta-button hero-cta">${escapeHtml(ctaText)}</a>`
        : '';

    return `<section class="hero hero--${escapeAttr(String(variant))}">
  <div class="site-container">
    ${badgeHtml}
    <h1>${escapeHtml(heading)}</h1>
    ${subHtml}
    ${ctaHtml}
  </div>
</section>`;
});

// --- ArticleBody ---
registerBlockRenderer('ArticleBody', (block, ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const markdown = (content.markdown as string) || '';
    const title = (content.title as string) || '';
    const isArticlePage = ctx.route !== '/';

    // Sanitize HTML content to prevent XSS
    const titleHtml = title ? `<h1>${escapeHtml(title)}</h1>` : '';
    const printBtn = isArticlePage
        ? '<button type="button" class="print-btn" onclick="window.print()">Print</button>'
        : '';

    // Convert Markdown to HTML, then sanitize
    const parsedHtml = marked.parse(markdown, { async: false }) as string;

    const slug = ctx.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    const featuredImg = isArticlePage
        ? `<img class="article-featured-img" src="/images/featured/${escapeAttr(slug)}.svg" alt="${escapeAttr(title || ctx.pageTitle || '')}" width="1200" height="400" loading="eager">`
        : '';

    return `<article class="article-body">
  ${featuredImg}
  ${titleHtml}
  ${printBtn}
  ${sanitizeArticleHtml(parsedHtml)}
</article>`;
});

// --- FAQ ---
registerBlockRenderer('FAQ', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const items = (content.items as Array<{ question: string; answer: string }>) || [];

    if (items.length === 0) return '';

    const openFirst = config.openFirst === true;
    const emitJsonLd = config.emitJsonLd !== false;

    const faqHtml = items.map((item, i) => {
        const open = i === 0 && openFirst ? ' open' : '';
        return `<details class="faq-item"${open}>
  <summary class="faq-question">${escapeHtml(item.question)}</summary>
  <div class="faq-answer">${sanitizeArticleHtml(item.answer)}</div>
</details>`;
    }).join('\n');

    let jsonLd = '';
    if (emitJsonLd) {
        const faqSchema = {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: items.map(item => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: item.answer,
                },
            })),
        };
        jsonLd = `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`;
    }

    return `<section class="faq-section">
  <h2>Frequently Asked Questions</h2>
  <div class="faq-list">
${faqHtml}
  </div>
  ${jsonLd}
</section>`;
});

// --- CTABanner / ScrollCTA ---
registerBlockRenderer('CTABanner', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const text = (content.text as string) || '';
    const buttonLabel = (content.buttonLabel as string) || 'Learn More';
    const buttonUrl = (content.buttonUrl as string) || '#';
    const style = (config.style as string) || 'bar';
    const trigger = (config.trigger as string) || 'immediate';

    if (!text) return '';

    if (trigger === 'scroll') {
        // Delegate to scroll CTA pattern
        return `<div class="scroll-cta-sentinel" aria-hidden="true"></div>
<div class="scroll-cta scroll-cta-${escapeAttr(style)}" id="scroll-cta" role="complementary" aria-label="Call to action" style="display:none">
  <div class="scroll-cta-inner">
    <p class="scroll-cta-text">${escapeHtml(text)}</p>
    <a href="${escapeAttr(buttonUrl)}" class="scroll-cta-btn">${escapeHtml(buttonLabel)}</a>
    <button class="scroll-cta-dismiss" aria-label="Dismiss" type="button">&times;</button>
  </div>
</div>
<script>
(function(){
  var cta=document.getElementById('scroll-cta');
  if(!cta)return;
  var sentinel=document.querySelector('.scroll-cta-sentinel');
  if(!sentinel)return;
  var shown=false;
  var observer=new IntersectionObserver(function(entries){
    if(entries[0].isIntersecting&&!shown){
      shown=true;cta.style.display='';
      requestAnimationFrame(function(){cta.classList.add('scroll-cta-visible')});
      observer.disconnect();
    }
  },{threshold:0.1});
  observer.observe(sentinel);
  cta.querySelector('.scroll-cta-dismiss').addEventListener('click',function(){
    cta.classList.remove('scroll-cta-visible');
    setTimeout(function(){cta.style.display='none'},300);
  });
})();
</script>`;
    }

    return `<section class="cta-section cta-section--${escapeAttr(style)}">
  <div class="site-container">
    <p class="cta-text">${escapeHtml(text)}</p>
    <a href="${escapeAttr(buttonUrl)}" class="cta-button">${escapeHtml(buttonLabel)}</a>
  </div>
</section>`;
});

registerBlockRenderer('ScrollCTA', (block, ctx) => {
    // ScrollCTA is just CTABanner with trigger=scroll
    const merged = { ...block, config: { ...block.config, trigger: 'scroll' } };
    return renderBlock(merged, ctx);
});

// --- CitationBlock ---
registerBlockRenderer('CitationBlock', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const sources = (content.sources as Array<{
        title: string;
        url?: string;
        publisher?: string;
        retrievedAt?: string;
        usage?: string;
    }>) || [];

    if (sources.length === 0) return '';

    const items = sources.map(s => {
        const url = s.url ? ` href="${escapeAttr(s.url)}" rel="nofollow noopener" target="_blank"` : '';
        const publisher = s.publisher ? ` — ${escapeHtml(s.publisher)}` : '';
        const retrieved = s.retrievedAt ? ` <small>(Retrieved ${escapeHtml(s.retrievedAt)})</small>` : '';
        const usage = s.usage ? ` <span class="data-usage">${escapeHtml(s.usage)}</span>` : '';
        return `<li class="data-source-item"><a${url}>${escapeHtml(s.title)}</a>${publisher}${retrieved}${usage}</li>`;
    }).join('\n');

    return `<section class="data-sources">
  <h2>Data Sources</h2>
  <ul>${items}</ul>
</section>`;
});

// --- LastUpdated ---
registerBlockRenderer('LastUpdated', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const date = (content.date as string) || '';
    const reviewedBy = (content.reviewedBy as string) || '';
    const status = (content.status as string) || 'fresh';

    if (!date) return '';

    const badgeClass = status === 'stale' ? 'freshness-red'
        : status === 'review-pending' ? 'freshness-yellow'
        : 'freshness-green';

    const badgeText = status === 'stale' ? 'Needs update'
        : status === 'review-pending' ? 'Review pending'
        : `Verified ${escapeHtml(date)}`;

    const reviewer = reviewedBy
        ? `<span class="reviewed-by">Reviewed by ${escapeHtml(reviewedBy)}</span>`
        : '';

    return `<div class="freshness-badge ${badgeClass}"><span class="freshness-dot"></span>${badgeText}</div>${reviewer}`;
});

// --- TrustBadges ---
registerBlockRenderer('TrustBadges', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const badges = (content.badges as Array<{ label: string; description?: string }>) || [];

    if (badges.length === 0) return '';

    const items = badges.map(b => {
        const desc = b.description ? `<p>${escapeHtml(b.description)}</p>` : '';
        const tooltip = b.description ? ` data-tooltip="${escapeAttr(b.description)}"` : '';
        return `<div class="trust-badge"${tooltip}><strong>${escapeHtml(b.label)}</strong>${desc}</div>`;
    }).join('');

    return `<section class="trust-badges"><div class="trust-badges-row">${items}</div></section>`;
});

// --- MedicalDisclaimer ---
registerBlockRenderer('MedicalDisclaimer', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const text = (content.disclaimerText as string) ||
        'This content is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider.';
    const showDoctorCta = config.showDoctorCta !== false;

    const disclaimerHtml = `<div class="medical-disclaimer" role="alert">
  <strong>Medical Disclaimer:</strong> ${escapeHtml(text)}
</div>`;

    const ctaHtml = showDoctorCta ? `<div class="cta-doctor">
  <h2>Talk to Your Doctor</h2>
  <p>The information on this page is not a substitute for professional medical guidance. Please consult a qualified healthcare provider before making any health-related decisions.</p>
</div>` : '';

    return disclaimerHtml + ctaHtml;
});

// --- Checklist / StepByStep ---
function renderChecklist(block: BlockEnvelope, _ctx: RenderContext): string {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const steps = (content.steps as Array<{ heading: string; body: string }>) || [];
    const showProgress = config.showProgress !== false;
    const interactive = config.interactive !== false;

    if (steps.length === 0) return '';

    const progressHtml = showProgress
        ? `<div class="checklist-progress" id="checklist-progress">0 of ${steps.length} completed</div>`
        : '';

    const stepsHtml = steps.map((step, i) => {
        const checkboxId = `check-${i}`;
        const checkbox = interactive
            ? `<input type="checkbox" id="${checkboxId}" class="checklist-checkbox">`
            : `<span class="checklist-number">${i + 1}</span>`;
        return `<li class="checklist-item">
  <label for="${checkboxId}">
    ${checkbox}
    <div class="checklist-content">
      <h3>${escapeHtml(step.heading)}</h3>
      <div>${sanitizeArticleHtml(step.body)}</div>
    </div>
  </label>
</li>`;
    }).join('\n');

    const script = interactive ? `<script>
(function(){
  var checks=document.querySelectorAll('.checklist-checkbox');
  var progress=document.getElementById('checklist-progress');
  function update(){
    var done=0;checks.forEach(function(c){if(c.checked)done++});
    if(progress)progress.textContent=done+' of '+checks.length+' completed';
  }
  checks.forEach(function(c){c.addEventListener('change',update)});
})();
</script>` : '';

    return `<section class="checklist-section">
  ${progressHtml}
  <ol class="checklist-list">${stepsHtml}</ol>
  ${script}
</section>`;
}

registerBlockRenderer('Checklist', renderChecklist);
registerBlockRenderer('StepByStep', renderChecklist);

// --- AuthorBio ---
registerBlockRenderer('AuthorBio', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const name = (content.name as string) || '';
    const bio = (content.bio as string) || '';
    const title = (content.title as string) || '';

    if (!name) return '';

    const titleHtml = title ? `<span class="author-title">${escapeHtml(title)}</span>` : '';

    return `<aside class="author-bio">
  <h3>${escapeHtml(name)}</h3>
  ${titleHtml}
  <p>${escapeHtml(bio)}</p>
</aside>`;
});

// --- Sidebar ---
registerBlockRenderer('Sidebar', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const sections = (content.sections as Array<{ title: string; html: string }>) || [];

    if (sections.length === 0) return '';

    const inner = sections.map(s =>
        `<div class="sidebar-section"><h4>${escapeHtml(s.title)}</h4>${sanitizeArticleHtml(s.html)}</div>`
    ).join('');

    return `<aside class="sidebar">${inner}</aside>`;
});
