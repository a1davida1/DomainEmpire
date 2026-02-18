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
import {
    registerBlockRenderer as _registerBlockRenderer,
    getBlockRenderer,
} from './renderer-registry';
import { randomizeHTML } from '../themes/class-randomizer';
import { skins } from '../themes/skin-definitions';

// Side-effect import: registers all interactive block renderers
// (ComparisonTable, QuoteCalculator, CostBreakdown, LeadForm, StatGrid, etc.)
// Safe now because renderers-interactive imports from renderer-registry, not assembler.
import './renderers-interactive';

import { resolveTypographyPreset } from '../themes/typography-presets';

// Fallback Google Fonts URLs for each base theme (used when no domain context)
const THEME_FONT_URLS: Record<string, string> = {
    clean: 'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
    editorial: 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
    bold: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600;700&display=swap',
    minimal: '',
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
    /** Dashboard /api/collect URL for form submission data collection */
    collectUrl?: string;
}

// ============================================================
// Block Renderer Registry
// ============================================================

// Re-export for backward compatibility — other modules can still import from assembler
export const registerBlockRenderer = _registerBlockRenderer;

/**
 * Render a single block. Returns empty string if no renderer is registered.
 */
export function renderBlock(block: BlockEnvelope, ctx: RenderContext): string {
    const renderer = getBlockRenderer(block.type as BlockType);
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

  /* TOC scroll-spy — highlight current heading in Table of Contents */
  var tocLinks=document.querySelectorAll('.toc-item a');
  if(tocLinks.length>0){
    var headingEls=[];
    tocLinks.forEach(function(a){
      var id=a.getAttribute('href');
      if(id&&id.charAt(0)==='#'){
        var el=document.getElementById(id.slice(1));
        if(el)headingEls.push({el:el,link:a});
      }
    });
    if(headingEls.length>0){
      function updateTocSpy(){
        var scrollY=window.scrollY+120;
        var current=headingEls[0];
        for(var i=0;i<headingEls.length;i++){
          if(headingEls[i].el.offsetTop<=scrollY)current=headingEls[i];
        }
        tocLinks.forEach(function(a){a.classList.remove('toc-active')});
        if(current)current.link.classList.add('toc-active');
      }
      window.addEventListener('scroll',updateTocSpy,{passive:true});
      updateTocSpy();
    }
  }

  /* Smooth scroll for anchor links with sticky header offset */
  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click',function(e){
      var id=a.getAttribute('href');
      if(!id||id.length<2)return;
      var target=document.getElementById(id.slice(1));
      if(target){
        e.preventDefault();
        var hdr=document.querySelector('.header');
        var offset=hdr?hdr.offsetHeight+16:16;
        var y=target.getBoundingClientRect().top+window.pageYOffset-offset;
        window.scrollTo({top:y,behavior:'smooth'});
        history.pushState(null,null,id);
      }
    });
  });

  /* Dropdown nav menus */
  document.querySelectorAll('.nav-dropdown-trigger').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var menu=btn.nextElementSibling;
      if(menu)menu.classList.toggle('nav-dropdown-open');
    });
  });

  /* Close dropdown when clicking outside */
  document.addEventListener('click',function(e){
    document.querySelectorAll('.nav-dropdown-menu.nav-dropdown-open').forEach(function(menu){
      if(!menu.parentElement.contains(e.target)){menu.classList.remove('nav-dropdown-open')}
    });
  });

  /* Sticky header shadow on scroll */
  var header=document.querySelector('.header');
  if(header){
    window.addEventListener('scroll',function(){
      header.classList.toggle('header-scrolled',window.scrollY>10);
    },{passive:true});
  }

  /* Cookie consent */
  var cookieBar=document.querySelector('.cookie-consent');
  if(cookieBar&&!localStorage.getItem('cookie-ok')){
    cookieBar.style.display='';
    var okBtn=cookieBar.querySelector('.cookie-ok');
    if(okBtn)okBtn.addEventListener('click',function(){
      localStorage.setItem('cookie-ok','1');
      cookieBar.style.display='none';
    });
  }

  /* Scroll-reveal: fade-up sections on scroll */
  if('IntersectionObserver' in window&&!window.matchMedia('(prefers-reduced-motion:reduce)').matches){
    var revealObs=new IntersectionObserver(function(entries){
      entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');revealObs.unobserve(e.target)}});
    },{threshold:0.08,rootMargin:'0px 0px -40px 0px'});
    document.querySelectorAll('.cost-section,.comparison-section,.vs-card,.testimonial-section,.pricing-section,.ranking-section,.faq-section,.data-sources,.infographic-shell,.data-table-section,.author-bio,.pdf-download').forEach(function(el){
      el.classList.add('reveal');revealObs.observe(el);
    });
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

function buildStructuredData(ctx: RenderContext, canonicalUrl: string, blocks: BlockEnvelope[] = []): string {
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
    if (ctx.ogImagePath) {
        pageSchema.image = {
            '@type': 'ImageObject',
            url: `https://${ctx.domain}${ctx.ogImagePath}`,
            width: 1200,
            height: 630,
        };
    }
    // Estimate word count from ArticleBody blocks
    const articleBlocks = blocks.filter(b => b.type === 'ArticleBody');
    if (articleBlocks.length > 0) {
        let totalWords = 0;
        for (const ab of articleBlocks) {
            const c = (ab.content || {}) as Record<string, unknown>;
            const md = (c.markdown as string) || (c.body as string) || '';
            totalWords += md.split(/\s+/).filter(Boolean).length;
        }
        if (totalWords > 0) pageSchema.wordCount = totalWords;
    }
    scripts.push(`<script type="application/ld+json">${JSON.stringify(pageSchema)}</script>`);

    // BreadcrumbList
    const breadcrumbItems: Array<Record<string, unknown>> = [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `https://${ctx.domain}/` },
    ];
    if (!isHomepage) {
        const segments = ctx.route.replace(/^\//, '').replace(/\/$/, '').split('/');
        let segPath = '';
        for (let i = 0; i < segments.length; i++) {
            segPath += '/' + segments[i];
            const label = ROUTE_LABELS[segments[i]] || segments[i].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            breadcrumbItems.push({
                '@type': 'ListItem',
                position: i + 2,
                name: label,
                item: `https://${ctx.domain}${segPath}`,
            });
        }
    }
    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbItems,
    };
    scripts.push(`<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`);

    // NOTE: FAQPage JSON-LD is emitted by the FAQ block renderer itself
    // (when emitJsonLd !== false), so we don't duplicate it here.

    // HowTo schema — extract from StepByStep/Checklist blocks
    const howToBlocks = blocks.filter(b => b.type === 'StepByStep' || b.type === 'Checklist');
    for (const hb of howToBlocks) {
        const c = (hb.content || {}) as Record<string, unknown>;
        const heading = (c.heading as string) || (c.title as string) || '';
        const steps = (c.steps as Array<{ title?: string; text?: string; label?: string }>) || [];
        if (heading && steps.length > 0) {
            const howToSchema = {
                '@context': 'https://schema.org',
                '@type': 'HowTo',
                name: heading,
                step: steps.map((s, i) => ({
                    '@type': 'HowToStep',
                    position: i + 1,
                    name: s.title || s.label || `Step ${i + 1}`,
                    text: s.text || s.title || s.label || '',
                })),
            };
            scripts.push(`<script type="application/ld+json">${JSON.stringify(howToSchema)}</script>`);
        }
    }

    // Organization + WebSite schema on homepage
    if (isHomepage) {
        const orgSchema = {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: ctx.siteTitle,
            url: `https://${ctx.domain}`,
            logo: `https://${ctx.domain}/favicon.svg`,
        };
        scripts.push(`<script type="application/ld+json">${JSON.stringify(orgSchema)}</script>`);

        const webSiteSchema = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: ctx.siteTitle,
            url: `https://${ctx.domain}`,
            potentialAction: {
                '@type': 'SearchAction',
                target: `https://${ctx.domain}/?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
            },
        };
        scripts.push(`<script type="application/ld+json">${JSON.stringify(webSiteSchema)}</script>`);
    }

    // ItemList schema for RankingList blocks (enables numbered list rich results)
    const rankingBlocks = blocks.filter(b => b.type === 'RankingList');
    for (const rb of rankingBlocks) {
        const c = (rb.content || {}) as Record<string, unknown>;
        const items = (c.items as Array<{ name: string; rank?: number; url?: string; description?: string }>) || [];
        if (items.length > 0) {
            const itemListSchema = {
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: (c.title as string) || ctx.pageTitle || 'Rankings',
                itemListElement: items.map((item, i) => ({
                    '@type': 'ListItem',
                    position: item.rank ?? i + 1,
                    name: item.name,
                    ...(item.url ? { url: item.url } : {}),
                    ...(item.description ? { description: item.description } : {}),
                })),
            };
            scripts.push(`<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>`);
        }
    }

    // SoftwareApplication schema for Calculator/Wizard blocks
    const toolBlocks = blocks.filter(b => b.type === 'QuoteCalculator' || b.type === 'CostBreakdown' || b.type === 'Wizard');
    if (toolBlocks.length > 0) {
        const toolSchema = {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: ctx.pageTitle || `${ctx.siteTitle} Calculator`,
            url: canonicalUrl,
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        };
        scripts.push(`<script type="application/ld+json">${JSON.stringify(toolSchema)}</script>`);
    }

    // Review/AggregateRating for ProsConsCard blocks
    const reviewBlocks = blocks.filter(b => b.type === 'ProsConsCard');
    for (const rb of reviewBlocks) {
        const c = (rb.content || {}) as Record<string, unknown>;
        const name = (c.name as string) || '';
        const rating = c.rating as number | undefined;
        if (name && typeof rating === 'number') {
            const reviewSchema = {
                '@context': 'https://schema.org',
                '@type': 'Review',
                itemReviewed: { '@type': 'Thing', name },
                reviewRating: {
                    '@type': 'Rating',
                    ratingValue: rating,
                    bestRating: 10,
                    worstRating: 1,
                },
                author: { '@type': 'Organization', name: ctx.domain },
            };
            scripts.push(`<script type="application/ld+json">${JSON.stringify(reviewSchema)}</script>`);
        }
    }

    return scripts.join('\n  ');
}

// ============================================================
// Breadcrumb Builder
// ============================================================

const ROUTE_LABELS: Record<string, string> = {
    guides: 'Guides', calculator: 'Calculator', compare: 'Compare',
    reviews: 'Reviews', faq: 'FAQ', about: 'About', contact: 'Contact',
    privacy: 'Privacy', terms: 'Terms', blog: 'Blog', resources: 'Resources',
    pricing: 'Pricing', 'complete-guide': 'Complete Guide',
    'save-money': 'Save Money', 'common-mistakes': 'Common Mistakes',
};

function buildBreadcrumbHtml(ctx: RenderContext): string {
    if (ctx.route === '/') return '';

    const segments = ctx.route.replace(/^\//, '').replace(/\/$/, '').split('/');
    const crumbs: Array<{ label: string; href: string }> = [{ label: 'Home', href: '/' }];

    let path = '';
    for (let i = 0; i < segments.length; i++) {
        path += '/' + segments[i];
        const label = ROUTE_LABELS[segments[i]] || segments[i].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        crumbs.push({ label, href: path });
    }

    const items = crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return isLast
            ? `<span class="breadcrumb-current" aria-current="page">${escapeHtml(c.label)}</span>`
            : `<a href="${escapeAttr(c.href)}" class="breadcrumb-link">${escapeHtml(c.label)}</a>`;
    }).join('<span class="breadcrumb-sep" aria-hidden="true">/</span>');

    return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items}</nav>`;
}

// ============================================================
// Related Pages Builder
// ============================================================

const RELATED_PAGES: Array<{ route: string; label: string; description: string; icon: string }> = [
    { route: '/guides', label: 'Guides Hub', description: 'Expert how-to guides and tutorials', icon: '📚' },
    { route: '/guides/complete-guide', label: 'Complete Guide', description: 'Everything you need to know', icon: '📖' },
    { route: '/guides/save-money', label: 'Save Money', description: 'Tips to reduce your costs', icon: '💰' },
    { route: '/guides/common-mistakes', label: 'Common Mistakes', description: 'Avoid costly errors', icon: '⚠️' },
    { route: '/calculator', label: 'Cost Calculator', description: 'Estimate your costs instantly', icon: '🧮' },
    { route: '/compare', label: 'Comparisons', description: 'Side-by-side options analysis', icon: '⚖️' },
    { route: '/reviews', label: 'Reviews', description: 'Honest ratings and reviews', icon: '⭐' },
    { route: '/faq', label: 'FAQ', description: 'Frequently asked questions', icon: '❓' },
    { route: '/blog', label: 'Blog', description: 'Latest articles and news', icon: '✍️' },
    { route: '/resources', label: 'Resources', description: 'Tools and downloadable resources', icon: '🔧' },
    { route: '/pricing', label: 'Pricing Guide', description: 'Understand costs and pricing', icon: '💲' },
];

function buildRelatedPagesHtml(ctx: RenderContext): string {
    if (ctx.route === '/') return '';

    const current = ctx.route.replace(/\/$/, '');
    const related = RELATED_PAGES.filter(p => p.route !== current).slice(0, 6);
    if (related.length === 0) return '';

    const cards = related.map(p =>
        `<a href="${escapeAttr(p.route)}" class="related-card">
  <span class="related-icon">${p.icon}</span>
  <div class="related-info">
    <strong>${escapeHtml(p.label)}</strong>
    <span>${escapeHtml(p.description)}</span>
  </div>
</a>`
    ).join('\n');

    return `<nav class="related-pages" aria-label="Related pages">
  <h2 class="related-heading">Explore More</h2>
  <div class="related-grid">${cards}</div>
</nav>`;
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
    // Separate structural blocks from content blocks.
    // Full-width blocks (Hero, ResourceGrid, LatestArticles) render outside the
    // sidebar grid so they aren't cramped into a narrow column.
    let headerHtml = '';
    let footerHtml = '';
    let sidebarHtml = '';
    const preGridBlocks: string[] = [];   // Hero — full-width above sidebar grid
    const contentBlocks: string[] = [];   // Inside sidebar grid's page-main column
    const postGridBlocks: string[] = [];  // ResourceGrid, LatestArticles — full-width below grid

    const FULL_WIDTH_PRE = new Set(['Hero']);
    const FULL_WIDTH_POST = new Set(['ResourceGrid', 'LatestArticles']);

    for (const block of blocks) {
        const html = renderBlock(block, ctx);
        const wrapped = `<section data-block-id="${escapeAttr(block.id)}" data-block-type="${escapeAttr(block.type)}"${block.variant ? ` data-block-variant="${escapeAttr(block.variant)}"` : ''} data-animate>${html}</section>`;
        if (block.type === 'Header') {
            headerHtml = `<div data-block-id="${escapeAttr(block.id)}" data-block-type="Header">${html}</div>`;
        } else if (block.type === 'Footer') {
            footerHtml = `<div data-block-id="${escapeAttr(block.id)}" data-block-type="Footer">${html}</div>`;
        } else if (block.type === 'Sidebar') {
            sidebarHtml = `<aside data-block-id="${escapeAttr(block.id)}" data-block-type="Sidebar" class="page-sidebar">${html}</aside>`;
        } else if (FULL_WIDTH_PRE.has(block.type)) {
            preGridBlocks.push(wrapped);
        } else if (FULL_WIDTH_POST.has(block.type)) {
            postGridBlocks.push(wrapped);
        } else {
            contentBlocks.push(wrapped);
        }
    }

    const hasArticleBody = blocks.some(b => b.type === 'ArticleBody');
    const isNonHomePage = ctx.route !== '/';
    const featuredSlug = ctx.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    const preloadFeatured = hasArticleBody && isNonHomePage;

    const title = ctx.pageTitle || ctx.siteTitle;
    const description = ctx.pageDescription || '';
    const fullTitle = ctx.pageTitle && ctx.pageTitle !== ctx.siteTitle
        ? `${escapeHtml(title)} | ${escapeHtml(ctx.siteTitle)}`
        : escapeHtml(title);

    const typoPreset = resolveTypographyPreset(ctx.domain);
    const fontUrl = typoPreset.googleFontsUrl || THEME_FONT_URLS[ctx.theme] || THEME_FONT_URLS.clean;
    const fontLinks = fontUrl
        ? `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${escapeAttr(fontUrl)}">`
        : '';

    const pageUrl = `https://${ctx.domain}${ctx.route === '/' ? '' : ctx.route}`;
    const canonicalUrl = `https://${ctx.domain}${ctx.route}`;

    // OpenGraph + Twitter meta tags
    const ogMeta = buildOpenGraphMeta(ctx, pageUrl);

    // Structured data: Article/WebPage JSON-LD + BreadcrumbList + FAQ/HowTo
    const structuredData = buildStructuredData(ctx, canonicalUrl, blocks);

    // Breadcrumbs for sub-pages
    const breadcrumbHtml = buildBreadcrumbHtml(ctx);

    // Related pages nav for sub-pages
    const relatedHtml = buildRelatedPagesHtml(ctx);

    // Sidebar layout: wrap content in a grid when sidebar is present.
    // Full-width blocks (Hero, ResourceGrid, LatestArticles) render outside the
    // grid so they aren't constrained to the narrow page-main column.
    const hasSidebar = sidebarHtml.length > 0;
    const mainContent = hasSidebar
        ? `${preGridBlocks.join('\n')}
<div class="page-layout">
  ${sidebarHtml}
  <div class="page-main">
    ${breadcrumbHtml}
${contentBlocks.join('\n')}
${relatedHtml}
  </div>
</div>
${postGridBlocks.join('\n')}`
        : `${preGridBlocks.join('\n')}
${breadcrumbHtml}
${contentBlocks.join('\n')}
${postGridBlocks.join('\n')}
${relatedHtml}`;

    const hasHero = blocks.some(b => b.type === 'Hero');
    const heroPreload = hasHero
        ? `<link rel="preload" href="/images/hero-bg.svg" as="image" fetchpriority="high">`
        : '';

    const raw = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeAttr(description)}">
  <meta name="robots" content="index, follow">
  <meta name="generator" content="DomainEmpire v2">
  <meta name="theme-color" content="${(skins[ctx.skin] || skins.slate).accent}">
  <title>${fullTitle}</title>
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  <link rel="alternate" hreflang="en" href="${escapeAttr(canonicalUrl)}">
  <link rel="alternate" hreflang="x-default" href="${escapeAttr(canonicalUrl)}">
  <link rel="preload" href="${escapeAttr(cssHref)}" as="style">
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">
  ${heroPreload}
  ${ogMeta}
  ${fontLinks}
  <link rel="stylesheet" href="${escapeAttr(cssHref)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  ${preloadFeatured ? `<link rel="preload" href="/images/featured/${escapeAttr(featuredSlug)}.svg" as="image" fetchpriority="high">` : ''}
  ${structuredData}
  ${ctx.headScripts}
  <noscript><style>section[data-animate]{opacity:1!important}.reveal{opacity:1!important;transform:none!important}.scroll-cta{display:none!important}.reading-progress{display:none!important}</style></noscript>
</head>
<body data-theme="${escapeAttr(ctx.theme)}" data-skin="${escapeAttr(ctx.skin)}"${hasSidebar ? ' class="has-sidebar"' : ''}>
<a href="#main-content" class="skip-nav">Skip to content</a>
${headerHtml}
<div class="site-container">
  <main id="main-content" tabindex="-1">
${mainContent}
  </main>
</div>
${footerHtml}
<div class="reading-progress" aria-hidden="true"></div>
<button class="back-to-top" aria-label="Back to top">&uarr;</button>
${getEnhancementScript()}
${ctx.bodyScripts}
</body>
</html>`;

    return randomizeHTML(raw, ctx.domain);
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
    const phone = (content.phone as string) || '';
    const navLinks = (content.navLinks as Array<{
        label: string;
        href: string;
        children?: Array<{ label: string; href: string }>;
    }>) || [];

    const currentRoute = ctx.route.replace(/\/$/, '') || '/';

    let navItems = '';
    for (const link of navLinks) {
        if (link.children && link.children.length > 0) {
            const childActive = link.children.some(c => currentRoute === c.href || currentRoute.startsWith(c.href + '/'));
            const dropdownItems = link.children.map(c => {
                const isActive = currentRoute === c.href || currentRoute.startsWith(c.href + '/');
                return `<a href="${escapeAttr(c.href)}"${isActive ? ' class="nav-active" aria-current="page"' : ''}>${escapeHtml(c.label)}</a>`;
            }).join('');
            navItems += `<div class="nav-dropdown${childActive ? ' nav-dropdown--active' : ''}">
  <button class="nav-dropdown-trigger${childActive ? ' nav-active' : ''}">${escapeHtml(link.label)} <span class="nav-arrow">▾</span></button>
  <div class="nav-dropdown-menu">${dropdownItems}</div>
</div>`;
        } else {
            const isActive = link.href === '/' ? currentRoute === '/' : (currentRoute === link.href || currentRoute.startsWith(link.href + '/'));
            navItems += `<a href="${escapeAttr(link.href)}"${isActive ? ' class="nav-active" aria-current="page"' : ''}>${escapeHtml(link.label)}</a>`;
        }
    }

    const phoneHtml = phone
        ? `<a href="tel:${escapeAttr(phone.replace(/[^\d+]/g, ''))}" class="header-phone">
  <span class="header-phone-icon">📞</span> ${escapeHtml(phone)}
</a>`
        : '';

    const nav = navLinks.length > 0
        ? `<nav class="header-nav" aria-label="Main navigation">${navItems}</nav>`
        : '';

    const hamburger = navLinks.length > 0
        ? `<button class="hamburger" aria-label="Menu" onclick="this.closest('.header').querySelector('.header-nav').classList.toggle('nav-open');this.classList.toggle('hamburger-active')">
  <span></span><span></span><span></span>
</button>`
        : '';

    return `<header class="header header--${escapeAttr(String(variant))}" role="banner"${sticky}>
  <div class="site-container">
    <a href="/" class="logo">${escapeHtml(siteName)}</a>
    ${phoneHtml}
    ${nav}
    ${hamburger}
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
    const socialLinks = (content.socialLinks as Array<{ platform: string; url: string }>) || [];
    const showCookieConsent = config.showCookieConsent !== false;

    // Link columns — render for any variant that has them
    let columnsHtml = '';
    if (columns.length > 0) {
        const cols = columns.map(col => {
            const links = col.links.map(l =>
                `<li><a href="${escapeAttr(l.href)}">${escapeHtml(l.label)}</a></li>`
            ).join('');
            return `<div class="footer-col"><h4>${escapeHtml(col.title)}</h4><ul>${links}</ul></div>`;
        }).join('');
        columnsHtml = `<div class="footer-columns">${cols}</div>`;
    }

    // Newsletter (for newsletter variant)
    let newsletterHtml = '';
    if (variant === 'newsletter') {
        const endpoint = (content.newsletterEndpoint as string) || '';
        const headline = (content.newsletterHeadline as string) || 'Stay updated';
        if (endpoint) {
            const collectUrl = ctx.collectUrl || '';
            const collectScript = collectUrl
                ? `<script>(function(){var f=document.querySelector('.newsletter-form');if(!f)return;f.addEventListener('submit',function(){try{var e=f.querySelector('input[name=email]');var payload=JSON.stringify({formType:'newsletter',route:location.pathname,domain:location.hostname,email:e?e.value:null,data:{}});if(navigator.sendBeacon){navigator.sendBeacon(${JSON.stringify(collectUrl)},new Blob([payload],{type:'application/json'}))}else{fetch(${JSON.stringify(collectUrl)},{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true})}}catch(x){}})})()</script>`
                : '';
            newsletterHtml = `<div class="footer-newsletter">
  <h4>${escapeHtml(headline)}</h4>
  <form action="${escapeAttr(endpoint)}" method="POST" class="newsletter-form" aria-label="Newsletter signup">
    <input type="email" name="email" placeholder="your@email.com" required autocomplete="email" inputmode="email" aria-label="Email address">
    <button type="submit">Subscribe</button>
  </form>
  ${collectScript}
</div>`;
        }
    }

    // Social icons row
    const socialIconMap: Record<string, string> = {
        facebook: 'f', twitter: 'X', instagram: '📷', pinterest: 'P',
        youtube: '▶', linkedin: 'in', tiktok: '♪', rss: '☰',
    };
    let socialHtml = '';
    if (socialLinks.length > 0) {
        const icons = socialLinks.map(s => {
            const icon = socialIconMap[s.platform.toLowerCase()] || s.platform.charAt(0).toUpperCase();
            return `<a href="${escapeAttr(s.url)}" class="footer-social-icon" aria-label="${escapeAttr(s.platform)}" target="_blank" rel="noopener noreferrer">${icon}</a>`;
        }).join('');
        socialHtml = `<div class="footer-social">${icons}</div>`;
    }

    const disclaimerHtml = disclaimer
        ? `<div class="footer-disclaimer">${escapeHtml(disclaimer)}</div>`
        : '';

    // Cookie consent bar — hidden by default, shown by enhancement script if not dismissed
    const cookieHtml = showCookieConsent ? `<div class="cookie-consent" id="cookie-consent" role="dialog" aria-label="Cookie consent" style="display:none">
  <p>We use cookies to improve your experience. By continuing to browse, you agree to our <a href="/privacy">privacy policy</a>. <button class="cookie-ok" type="button">Accept</button></p>
</div>` : '';

    // Bottom bar with copyright + configurable legal links
    const legalLinks = (content.legalLinks as Array<{ label: string; href: string }>) || [];
    const defaultLegalLinks = [
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
    ];
    const activeLegalLinks = legalLinks.length > 0 ? legalLinks : defaultLegalLinks;
    const legalLinksHtml = activeLegalLinks
        .filter(l => l.href && l.label)
        .map(l => `<a href="${escapeAttr(l.href)}">${escapeHtml(l.label)}</a>`)
        .join('');
    const bottomBar = `<div class="footer-bottom">
  <p>&copy; ${year} ${escapeHtml(siteName)}. All rights reserved.</p>
  ${legalLinksHtml ? `<div class="footer-legal">${legalLinksHtml}</div>` : ''}
</div>`;

    return `<footer class="footer footer--${escapeAttr(String(variant))}" role="contentinfo">
  <div class="site-container">
    ${columnsHtml}
    ${newsletterHtml}
    ${socialHtml}
    ${disclaimerHtml}
    ${bottomBar}
  </div>
</footer>
${cookieHtml}`;
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
    const secondaryCta = (content.secondaryCtaText as string) || '';
    const secondaryCtaUrl = (content.secondaryCtaUrl as string) || '';
    const trustItems = (content.trustIndicators as string[]) || [];
    const rating = content.rating as number | undefined;

    const badgeHtml = badge ? `<span class="hero-badge">${escapeHtml(badge)}</span>` : '';
    const subHtml = subheading ? `<p class="hero-sub">${escapeHtml(subheading)}</p>` : '';

    // CTA buttons row
    let ctaRow = '';
    const primaryCta = ctaText && ctaUrl
        ? `<a href="${escapeAttr(ctaUrl)}" class="cta-button hero-cta">${escapeHtml(ctaText)}</a>`
        : '';
    const secondBtn = secondaryCta && secondaryCtaUrl
        ? `<a href="${escapeAttr(secondaryCtaUrl)}" class="cta-button hero-cta--secondary">${escapeHtml(secondaryCta)}</a>`
        : '';
    if (primaryCta || secondBtn) {
        ctaRow = `<div class="hero-cta-row">${primaryCta}${secondBtn}</div>`;
    }

    // Trust indicators (e.g. "✓ Free Calculator", "✓ No Sign-up Required")
    const trustHtml = trustItems.length > 0
        ? `<div class="hero-trust">${trustItems.map(t => `<span class="hero-trust-item">✓ ${escapeHtml(t)}</span>`).join('')}</div>`
        : '';

    // Star rating (clamped to 0–5)
    const clamped = rating ? Math.max(0, Math.min(5, rating)) : 0;
    const ratingHtml = clamped > 0
        ? `<div class="hero-rating"><span class="hero-stars">${'★'.repeat(Math.round(clamped))}${'☆'.repeat(5 - Math.round(clamped))}</span> <span class="hero-rating-text">${clamped.toFixed(1)} / 5</span></div>`
        : '';

    return `<section class="hero hero--${escapeAttr(String(variant))}">
  <div class="site-container">
    ${badgeHtml}
    <h1>${escapeHtml(heading)}</h1>
    ${subHtml}
    ${ratingHtml}
    ${ctaRow}
    ${trustHtml}
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
    let parsedHtml = (marked.parse(markdown, { async: false }) as string) || '';

    // Auto-generate heading IDs and Table of Contents
    const tocItems: Array<{ id: string; text: string; level: number }> = [];
    const idCounts: Record<string, number> = {};
    parsedHtml = parsedHtml.replace(/<h([23])>(.*?)<\/h\1>/gi, (_match, level, text) => {
        const clean = text.replace(/<[^>]+>/g, '').trim();
        let id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        // Ensure unique IDs for duplicate headings
        if (idCounts[id] !== undefined) {
            idCounts[id]++;
            id = `${id}-${idCounts[id]}`;
        } else {
            idCounts[id] = 1;
        }
        tocItems.push({ id, text: clean, level: parseInt(level) });
        return `<h${level} id="${id}">${text}</h${level}>`;
    });

    const tocHtml = tocItems.length >= 3 ? `<nav class="toc" aria-label="Table of Contents">
  <details class="toc-details" open>
    <summary class="toc-title">On This Page</summary>
    <ul class="toc-list">${tocItems.map(t =>
        `<li class="toc-item toc-item--h${t.level}"><a href="#${escapeAttr(t.id)}">${escapeHtml(t.text)}</a></li>`
    ).join('')}</ul>
  </details>
</nav>` : '';

    const slug = ctx.route.replace(/^\//, '').replace(/\/$/, '').replace(/\//g, '-');
    const featuredImg = isArticlePage
        ? `<img class="article-featured-img" src="/images/featured/${escapeAttr(slug)}.svg" alt="${escapeAttr(title || ctx.pageTitle || '')}" width="1200" height="400" loading="eager" decoding="async" fetchpriority="high">`
        : '';

    // Add loading="lazy" and decoding="async" to body images that don't already have them
    const lazyBody = sanitizeArticleHtml(parsedHtml)
        .replace(/<img(?![^>]*loading=)/gi, '<img loading="lazy"')
        .replace(/<img(?![^>]*decoding=)/gi, '<img decoding="async"');

    return `<article class="article-body">
  ${featuredImg}
  ${titleHtml}
  ${printBtn}
  ${tocHtml}
  ${lazyBody}
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

    const subtext = (content.subtext as string) || '';
    const icon = (content.icon as string) || '';
    const iconHtml = icon ? `<span class="cta-icon">${escapeHtml(icon)}</span> ` : '';
    const subtextHtml = subtext ? `<p class="cta-subtext">${escapeHtml(subtext)}</p>` : '';

    return `<section class="cta-section cta-section--${escapeAttr(style)}">
  <div class="site-container">
    <div class="cta-content">
      <p class="cta-text">${iconHtml}${escapeHtml(text)}</p>
      ${subtextHtml}
    </div>
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

    const items = sources.map((s, i) => {
        const linkTag = s.url
            ? `<a href="${escapeAttr(s.url)}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtml(s.title)} <span class="citation-ext">↗</span></a>`
            : `<span>${escapeHtml(s.title)}</span>`;
        const publisher = s.publisher ? `<span class="citation-publisher">${escapeHtml(s.publisher)}</span>` : '';
        const retrieved = s.retrievedAt ? `<span class="citation-date">Retrieved ${escapeHtml(s.retrievedAt)}</span>` : '';
        const usage = s.usage ? `<span class="data-usage">${escapeHtml(s.usage)}</span>` : '';
        return `<li class="data-source-item"><span class="citation-num">[${i + 1}]</span><div class="citation-detail">${linkTag}${publisher}${retrieved}${usage}</div></li>`;
    }).join('\n');

    return `<section class="data-sources" role="doc-endnotes">
  <h2>Sources &amp; References</h2>
  <ol class="citation-list">${items}</ol>
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
    const badges = (content.badges as Array<{ label: string; icon?: string; description?: string }>) || [];

    if (badges.length === 0) return '';

    const items = badges.map(b => {
        const icon = b.icon || '🛡️';
        const desc = b.description ? `<p class="trust-badge-desc">${escapeHtml(b.description)}</p>` : '';
        const tooltip = b.description ? ` title="${escapeAttr(b.description)}"` : '';
        return `<div class="trust-badge"${tooltip}><span class="trust-badge-icon">${escapeHtml(icon)}</span><strong>${escapeHtml(b.label)}</strong>${desc}</div>`;
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
    const credentials = (content.credentials as string[]) || [];
    const socialLinks = (content.socialLinks as Array<{ platform: string; url: string }>) || [];

    if (!name) return '';

    const initials = name.split(' ').map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('');
    const titleHtml = title ? `<span class="author-title">${escapeHtml(title)}</span>` : '';

    const credHtml = credentials.length > 0
        ? `<div class="author-credentials">${credentials.map(c => `<span class="author-credential">${escapeHtml(c)}</span>`).join('')}</div>`
        : '';

    const socialIcons: Record<string, string> = { twitter: '𝕏', linkedin: 'in', facebook: 'f', youtube: '▶', instagram: '📷', website: '🌐' };
    const socialHtml = socialLinks.length > 0
        ? `<div class="author-social">${socialLinks.map(s =>
            `<a href="${escapeAttr(s.url)}" class="author-social-link" target="_blank" rel="noopener noreferrer" title="${escapeAttr(s.platform)}">${socialIcons[s.platform.toLowerCase()] || '🔗'}</a>`
        ).join('')}</div>`
        : '';

    return `<aside class="author-bio">
  <div class="author-avatar">${initials}</div>
  <div class="author-info">
    <h3>${escapeHtml(name)}</h3>
    ${titleHtml}
    ${credHtml}
    <p>${escapeHtml(bio)}</p>
    ${socialHtml}
  </div>
</aside>`;
});

// --- Sidebar ---
registerBlockRenderer('Sidebar', (block, _ctx) => {
    const content = (block.content || {}) as Record<string, unknown>;
    const config = (block.config || {}) as Record<string, unknown>;
    const sections = (content.sections as Array<{ title: string; html: string }>) || [];
    const categories = (content.categories as Array<{
        icon: string; label: string; href: string; active?: boolean;
    }>) || [];
    const heading = (content.heading as string) || '';
    const showSearch = config.showSearch !== false;

    // OmniCalculator-style category sidebar
    if (categories.length > 0) {
        const searchHtml = showSearch ? `<div class="sidebar-search">
  <input type="text" id="sidebar-search" class="sidebar-search-input" placeholder="Search categories..." aria-label="Search categories">
</div>` : '';

        const catItems = categories.map(c => {
            const activeClass = c.active ? ' sidebar-cat--active' : '';
            return `<a href="${escapeAttr(c.href)}" class="sidebar-cat${activeClass}">
  <span class="sidebar-cat-icon">${escapeHtml(c.icon)}</span>
  <span class="sidebar-cat-label">${escapeHtml(c.label)}</span>
</a>`;
        }).join('\n');

        const headingHtml = heading ? `<h3 class="sidebar-heading">${escapeHtml(heading)}</h3>` : '';

        const searchScript = showSearch ? `<script>
(function(){
  var input=document.getElementById('sidebar-search');
  if(!input)return;
  input.addEventListener('input',function(){
    var q=this.value.toLowerCase();
    var cats=document.querySelectorAll('.sidebar-cat');
    cats.forEach(function(c){
      var label=c.querySelector('.sidebar-cat-label');
      if(!label)return;
      c.style.display=label.textContent.toLowerCase().indexOf(q)>=0?'':'none';
    });
  });
})();
</script>` : '';

        return `<aside class="sidebar sidebar--categories">
  ${headingHtml}
  ${searchHtml}
  <nav class="sidebar-cat-nav">${catItems}</nav>
  ${searchScript}
</aside>`;
    }

    // Fallback: section-based sidebar
    if (sections.length === 0) return '';

    const inner = sections.map(s =>
        `<div class="sidebar-section"><h4>${escapeHtml(s.title)}</h4>${sanitizeArticleHtml(s.html)}</div>`
    ).join('');

    return `<aside class="sidebar">${inner}</aside>`;
});
