/**
 * Base CSS styles shared by all themes.
 * Wires up the CSS custom-property tokens emitted by theme-tokens.ts and skin-definitions.ts.
 * Layout-specific styles (width, grid, header/hero/footer variants) are in layouts/.
 */
export const baseStyles = `/* === Base reset & token-driven typography === */
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{
  color-scheme:light;
  font-family:var(--font-body,system-ui,-apple-system,sans-serif);
  font-size:var(--font-size-base,1rem);
  line-height:var(--line-height,1.7);
  color:var(--color-text,#1e293b);
  background:var(--color-bg,#fff);
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  transition:background var(--transition-speed,.2s),color var(--transition-speed,.2s);
}

/* Links */
a{color:var(--color-link,#2563eb);text-decoration:none;transition:color var(--transition-speed,.2s);text-decoration-skip-ink:auto;text-underline-offset:0.15em}
a:hover{color:var(--color-link-hover,#1d4ed8)}

/* Headings */
h1,h2,h3,h4,h5,h6{font-family:var(--font-heading,var(--font-body,system-ui,sans-serif));color:var(--color-text,#1e293b);line-height:1.25;font-weight:700;text-wrap:balance}
h1{font-size:clamp(1.75rem,4vw,2.5rem);letter-spacing:-0.025em}
h2{font-size:clamp(1.35rem,3vw,1.75rem);letter-spacing:-0.02em;margin-top:2.5rem;margin-bottom:1rem}
h3{font-size:clamp(1.1rem,2.5vw,1.35rem);margin-top:2rem;margin-bottom:0.75rem}

/* Article body */
h1,h2,h3,h4,h5,h6,[id]{scroll-margin-top:5rem}
article h1{font-size:clamp(1.75rem,4vw,2.25rem);margin-bottom:1.5rem}
article h2{margin-top:2.5rem;margin-bottom:1rem;padding-left:1rem;border-left:4px solid var(--color-accent,#2563eb);border-bottom:none}
article h3{margin-top:2rem;margin-bottom:0.75rem}
article p{margin-bottom:1.25rem;max-width:72ch}
article ul,article ol{margin-bottom:1.25rem;padding-left:1.75rem}
article li{margin-bottom:0.5rem}
article blockquote{margin:1.5rem 0;padding:1rem 1.5rem;border-left:4px solid var(--color-accent,#2563eb);background:var(--color-bg-surface,#f8fafc);border-radius:0 var(--radius-sm,.375rem) var(--radius-sm,.375rem) 0;font-style:italic;color:var(--color-text-muted,#64748b)}
article code{font-family:var(--font-mono,ui-monospace,monospace);background:var(--color-bg-surface,#f8fafc);padding:0.15em 0.4em;border-radius:var(--radius-sm,.375rem);font-size:0.88em;border:1px solid var(--color-border,#e2e8f0)}
article pre{margin:1.5rem 0;padding:1.25rem;background:var(--color-bg-surface,#f8fafc);border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);overflow-x:auto}
article pre code{background:none;border:none;padding:0}
article img{border-radius:var(--radius-md,.5rem);margin:1.5rem 0;max-width:100%;height:auto;aspect-ratio:auto}
.article-featured-img{width:100%;height:auto;border-radius:var(--radius-lg,.75rem);margin:0 0 2rem 0;box-shadow:var(--shadow-md,0 4px 6px -1px rgba(0,0,0,.1));display:block;aspect-ratio:16/9;object-fit:cover}
article table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:0.925rem}
article table th{text-align:left;padding:0.75rem;border-bottom:2px solid var(--color-border-strong,#cbd5e1);font-weight:700;color:var(--color-text-muted,#64748b);text-transform:uppercase;font-size:0.8rem;letter-spacing:0.04em}
article table td{padding:0.75rem;border-bottom:1px solid var(--color-border,#e2e8f0)}
article table tr:hover{background:var(--color-bg-surface,#f8fafc)}
article hr{border:none;height:1px;background:var(--color-border,#e2e8f0);margin:2.5rem 0}
article a{text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--color-link,#2563eb) 30%,transparent);transition:text-decoration-color .15s}
article a:hover{text-decoration-color:var(--color-link,#2563eb)}

/* Container */
.site-container{max-width:var(--container-max,1100px);margin:0 auto;padding:0 2rem}

/* Main content area — generous breathing room */
main{padding:var(--sp-4,2rem) 0;min-height:60vh}

/* Images */
img{max-width:100%;height:auto;display:block}

/* Selection */
::selection{background:var(--color-accent,#2563eb);color:#fff}

/* Focus visible */
:focus-visible{outline:2px solid var(--color-accent,#2563eb);outline-offset:2px;border-radius:var(--radius-sm,.375rem)}

/* Utility: section spacing — premium feel */
section{padding-top:var(--section-padding,3.5rem);padding-bottom:var(--section-padding,3.5rem)}
section + section{margin-top:0}

/* Content-visibility for rendering performance — defer off-screen sections */
section[data-block-type]:nth-child(n+3){content-visibility:auto;contain-intrinsic-size:auto 500px}
/* Ensure anchor-targetable sections are not deferred (prevents scroll jumps on TOC/#id nav) */
section[data-block-type][id]{content-visibility:visible;contain-intrinsic-size:none}
section[data-block-type]:target{content-visibility:visible;contain-intrinsic-size:none}

/* Badge utility */
.badge{display:inline-flex;align-items:center;gap:0.375rem;font-size:0.78rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:var(--radius-full,999px);background:var(--color-badge-bg,#1e293b);color:var(--color-badge-text,#fff)}

/* Print button */
.print-btn{display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;font-size:0.875rem;font-weight:500;border:1px solid var(--color-border,#e2e8f0);background:var(--color-bg-surface,#f8fafc);color:var(--color-text-muted,#64748b);border-radius:var(--radius-md,.5rem);cursor:pointer;transition:all .15s ease}
.print-btn:hover{background:var(--color-bg,#fff);color:var(--color-text,#1e293b);border-color:var(--color-border-strong,#cbd5e1)}
.print-btn::before{content:'\\1F5A8'}

/* Smooth transitions for interactive elements */
button,a,.cta-button,[role="button"]{transition:all .15s ease}

/* Card base transitions + hover lift */
.review-card,.pricing-card,.testimonial-card,.ranking-item,.trust-badge,.faq-item,.factor-card,.cost-range,.vs-side,.stat-item,.comparison-verdict,.calc-form,.lead-form{transition:transform .2s ease,box-shadow .2s ease}
.review-card:hover,.pricing-card:hover,.testimonial-card:hover,.ranking-item:hover,.stat-item:hover{box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.08))}
.vs-side:hover,.factor-card:hover,.cost-range:hover{box-shadow:var(--shadow-sm,0 2px 6px rgba(0,0,0,.06))}

/* Button press effect */
.cta-button:active,.hero-cta:active,.lead-form button[type="submit"]:active,.wizard-next:active,.scroll-cta-btn:active{transform:scale(0.97)}

/* Scroll-triggered fade-in animation */
@keyframes fadeInUp{
  from{opacity:0;transform:translateY(24px)}
  to{opacity:1;transform:translateY(0)}
}
@keyframes fadeIn{
  from{opacity:0}
  to{opacity:1}
}
section[data-animate]{opacity:0}
section[data-animate].is-visible{animation:fadeInUp .5s ease forwards}
@media(prefers-reduced-motion:reduce){
  section[data-animate]{opacity:1}
  section[data-animate].is-visible{animation:none}
}

/* Staggered child animations */
section.is-visible .review-card,section.is-visible .pricing-card,section.is-visible .testimonial-card,section.is-visible .stat-item,section.is-visible .ranking-item,section.is-visible .faq-item{
  opacity:0;animation:fadeInUp .4s ease forwards
}
section.is-visible .review-card:nth-child(1),section.is-visible .pricing-card:nth-child(1),section.is-visible .stat-item:nth-child(1){animation-delay:.05s}
section.is-visible .review-card:nth-child(2),section.is-visible .pricing-card:nth-child(2),section.is-visible .stat-item:nth-child(2){animation-delay:.1s}
section.is-visible .review-card:nth-child(3),section.is-visible .pricing-card:nth-child(3),section.is-visible .stat-item:nth-child(3){animation-delay:.15s}
section.is-visible .review-card:nth-child(4),section.is-visible .pricing-card:nth-child(4),section.is-visible .stat-item:nth-child(4){animation-delay:.2s}

/* Gradient accent text utility */
.gradient-text{background:linear-gradient(135deg,var(--color-accent,#2563eb),var(--color-secondary,#7c3aed));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}

/* Decorative top-border accent for cards */
.accent-top{border-top:3px solid var(--color-accent,#2563eb)}

/* Subtle background pattern for hero sections */
.hero::after{content:'';position:absolute;inset:0;opacity:0.03;background-image:radial-gradient(circle at 1px 1px,var(--color-text,#1e293b) 1px,transparent 0);background-size:32px 32px;pointer-events:none;z-index:0}

/* Skip-to-content accessibility link */
.skip-nav{position:absolute;top:-100%;left:50%;transform:translateX(-50%);background:var(--color-accent,#2563eb);color:#fff;padding:0.75rem 1.5rem;border-radius:0 0 var(--radius-md,.5rem) var(--radius-md,.5rem);font-weight:600;font-size:0.9rem;z-index:10000;text-decoration:none;transition:top .2s}
.skip-nav:focus{top:0}

/* Reading progress indicator */
.reading-progress{position:fixed;top:0;left:0;height:3px;background:var(--color-accent,#2563eb);z-index:9999;transition:width .1s linear;width:0}

/* Back-to-top button */
.back-to-top{position:fixed;bottom:2rem;right:2rem;width:2.75rem;height:2.75rem;border-radius:var(--radius-full,999px);background:var(--color-accent,#2563eb);color:#fff;border:none;cursor:pointer;font-size:1.25rem;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.15));opacity:0;transform:translateY(1rem);transition:opacity .3s,transform .3s;z-index:999;pointer-events:none}
.back-to-top.btt-visible{opacity:1;transform:translateY(0);pointer-events:auto}
.back-to-top:hover{background:var(--color-accent-hover,#1d4ed8);transform:translateY(-2px)}

/* Scroll-reveal animations */
.reveal{opacity:0;transform:translateY(24px);transition:opacity .5s ease,transform .5s ease}
.reveal.is-visible{opacity:1;transform:translateY(0)}
@media(prefers-reduced-motion:reduce){
  .reveal{opacity:1;transform:none;transition:none}
  .back-to-top{transition:none}
  .reading-progress{transition:none}
  .skip-nav{transition:none}
  .testimonial-card,.review-card,.ranking-item,.trust-badge,.pricing-card{transition:none!important}
}

/* Separator decorations */
.separator{width:60px;height:3px;background:var(--color-accent,#2563eb);margin:1.5rem 0;border-radius:999px}
.separator--center{margin:1.5rem auto}

/* === Sticky header scroll effect === */
.header-scrolled{box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.08));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:color-mix(in srgb,var(--color-bg,#fff) 92%,transparent)}

/* === Hero enhancements === */
.hero-cta-row{display:flex;align-items:center;gap:0.75rem;margin-top:1.5rem;flex-wrap:wrap}
.hero--centered-text .hero-cta-row,.hero--full-width-dark .hero-cta-row,.hero--card .hero-cta-row{justify-content:center}
.hero-cta--secondary{display:inline-block;background:transparent;color:var(--color-accent,#2563eb);padding:0.75rem 2rem;border-radius:var(--radius-md,.5rem);font-weight:600;font-size:1rem;border:2px solid var(--color-accent,#2563eb);transition:all .15s}
.hero-cta--secondary:hover{background:var(--color-accent,#2563eb);color:#fff}
.hero--gradient-split .hero-cta--secondary,.hero--full-width-dark .hero-cta--secondary{border-color:rgba(255,255,255,.5);color:rgba(255,255,255,.9)}
.hero--gradient-split .hero-cta--secondary:hover,.hero--full-width-dark .hero-cta--secondary:hover{background:rgba(255,255,255,.15);border-color:#fff;color:#fff}
.hero-trust{display:flex;align-items:center;gap:1.25rem;margin-top:1.25rem;flex-wrap:wrap;font-size:0.85rem;color:var(--color-text-muted,#64748b)}
.hero--centered-text .hero-trust,.hero--full-width-dark .hero-trust,.hero--card .hero-trust{justify-content:center}
.hero--gradient-split .hero-trust,.hero--full-width-dark .hero-trust{color:rgba(255,255,255,.7)}
.hero-trust-item{display:inline-flex;align-items:center;gap:0.25rem;white-space:nowrap;font-weight:500}
.hero-rating{margin-top:0.75rem;display:flex;align-items:center;gap:0.5rem}
.hero--centered-text .hero-rating,.hero--full-width-dark .hero-rating,.hero--card .hero-rating{justify-content:center}
.hero-stars{color:var(--color-warning,#f59e0b);font-size:1.1rem;letter-spacing:0.05em}
.hero-rating-text{font-size:0.85rem;font-weight:600;color:var(--color-text-muted,#64748b)}
.hero--gradient-split .hero-rating-text,.hero--full-width-dark .hero-rating-text{color:rgba(255,255,255,.7)}

/* === Mobile nav === */
.hamburger{display:none;background:none;border:none;cursor:pointer;padding:0.5rem;flex-direction:column;gap:5px}
.hamburger span{display:block;width:22px;height:2px;background:var(--color-text,#1e293b);border-radius:2px;transition:all .2s}
.hamburger-active span:nth-child(1){transform:rotate(45deg) translate(5px,5px)}
.hamburger-active span:nth-child(2){opacity:0}
.hamburger-active span:nth-child(3){transform:rotate(-45deg) translate(5px,-5px)}
@media(max-width:768px){
  .hamburger{display:flex}
  .header-nav{display:none;position:absolute;top:100%;left:0;right:0;background:var(--color-bg,#fff);border-bottom:1px solid var(--color-border,#e2e8f0);padding:1rem;flex-direction:column;gap:0;box-shadow:var(--shadow-lg,0 8px 24px rgba(0,0,0,.12));z-index:40}
  .header-nav.nav-open{display:flex}
  .header-nav a,.nav-dropdown-trigger{display:block;padding:0.75rem 1rem;border-radius:var(--radius-sm,.25rem);font-size:0.95rem}
  .header-nav a:hover{background:var(--color-bg-surface,#f8fafc)}
  .nav-dropdown-menu{position:static;box-shadow:none;border:none;padding-left:1rem}
  .hero h1{font-size:clamp(1.5rem,6vw,2rem)}
  .hero-cta-row{flex-direction:column;align-items:stretch}
  .hero-trust{justify-content:center}
}

/* === Breadcrumbs === */
.breadcrumbs{display:flex;align-items:center;flex-wrap:wrap;gap:0.25rem;font-size:0.85rem;margin-bottom:1.5rem;padding:0.75rem 0;color:var(--color-text-muted,#64748b)}
.breadcrumb-link{color:var(--color-text-muted,#64748b);text-decoration:none;font-weight:500;transition:color .15s}
.breadcrumb-link:hover{color:var(--color-accent,#2563eb)}
.breadcrumb-sep{margin:0 0.375rem;color:var(--color-border-strong,#cbd5e1);font-size:0.75rem}
.breadcrumb-current{color:var(--color-text,#1e293b);font-weight:600}

/* === Table of Contents === */
.toc{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1.25rem 1.5rem;margin-bottom:2rem}
.toc-title{font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--color-text-muted,#64748b);margin:0 0 0.75rem;padding:0}
.toc-list{list-style:none;padding:0;margin:0}
.toc-item{margin-bottom:0.375rem}
.toc-item a{display:block;padding:0.25rem 0;font-size:0.875rem;color:var(--color-text-muted,#64748b);text-decoration:none;border-left:2px solid transparent;padding-left:0.75rem;transition:all .15s}
.toc-item a:hover{color:var(--color-accent,#2563eb);border-left-color:var(--color-accent,#2563eb)}
.toc-item--h3{padding-left:1rem}
.toc-item--h3 a{font-size:0.825rem;padding-left:1.5rem}
.toc-item a.toc-active{color:var(--color-accent,#2563eb);border-left-color:var(--color-accent,#2563eb);font-weight:600}

/* === Active nav highlighting === */
.header-nav a.nav-active,.nav-dropdown-trigger.nav-active{color:var(--color-accent,#2563eb);font-weight:600}
.header-nav > a.nav-active{border-bottom:2px solid var(--color-accent,#2563eb);padding-bottom:0.25rem}
.nav-dropdown-menu a.nav-active{background:var(--color-bg-surface,#f8fafc);color:var(--color-accent,#2563eb);font-weight:600}

/* === Nav dropdown menus === */
.nav-dropdown{position:relative}
.nav-dropdown-trigger{background:none;border:none;cursor:pointer;font:inherit;color:inherit;display:inline-flex;align-items:center;gap:0.25rem;padding:0.5rem 0}
.nav-arrow{font-size:0.7rem;transition:transform .2s}
.nav-dropdown-menu{display:none;position:absolute;top:100%;left:0;min-width:200px;background:var(--color-bg,#fff);border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);box-shadow:var(--shadow-lg,0 8px 24px rgba(0,0,0,.12));padding:0.5rem 0;z-index:50}
.nav-dropdown-menu.nav-dropdown-open{display:block}
.nav-dropdown-menu a{display:block;padding:0.5rem 1rem;font-size:0.9rem;color:var(--color-text,#1e293b);white-space:nowrap}
.nav-dropdown-menu a:hover{background:var(--color-bg-surface,#f8fafc);color:var(--color-accent,#2563eb)}

/* === Sidebar + Main Layout Grid === */
.page-layout{display:grid;grid-template-columns:260px 1fr;gap:2.5rem;align-items:start}
.page-sidebar{position:sticky;top:5rem;max-height:calc(100vh - 6rem);overflow-y:auto;flex-shrink:0}
.page-main{min-width:0;overflow:hidden}
@media(max-width:900px){
  .page-layout{grid-template-columns:1fr;gap:1.5rem}
  .page-sidebar{position:static;max-height:none;order:-1}
}

/* === Enhanced shadow system === */
:root{--shadow-xs:0 1px 2px rgba(0,0,0,.04);--shadow-sm:0 2px 4px rgba(0,0,0,.06);--shadow-md:0 4px 12px rgba(0,0,0,.08);--shadow-lg:0 8px 24px rgba(0,0,0,.12);--shadow-xl:0 16px 48px rgba(0,0,0,.16)}

/* === Section alternating backgrounds === */
main > section:nth-child(even),
.page-main > section:nth-child(even){background:var(--color-bg-surface,#f8fafc);margin-left:-2rem;margin-right:-2rem;padding:2.5rem 2rem;border-radius:0}
main > section:nth-child(even):first-child{margin-top:-1rem}

/* === Divider between sections === */
main > section + section::before,
.page-main > section + section::before{content:'';display:block;width:60px;height:3px;background:linear-gradient(90deg,var(--color-accent,#2563eb),transparent);margin:0 0 2rem;border-radius:999px;opacity:0.4}
main > section:nth-child(even) + section::before,
.page-main > section:nth-child(even) + section::before{margin-top:0}

/* === Card base improvements === */
.calc-form,.lead-form,.author-bio,.faq-item,.cost-range,.wizard-step,.toc,.checklist-item,.pricing-plan,.comparison-verdict{box-shadow:var(--shadow-xs)}
.calc-form:hover,.lead-form:hover,.author-bio:hover{box-shadow:var(--shadow-sm)}

/* === Related Pages === */
.related-pages{margin:3rem 0 1rem;padding-top:2rem;border-top:var(--border-width,1px) solid var(--color-border,#e2e8f0)}
.related-heading{font-size:1.25rem;font-weight:700;margin-bottom:1.25rem;color:var(--color-text,#1e293b)}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem}
.related-card{display:flex;align-items:flex-start;gap:0.75rem;padding:1rem;border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);text-decoration:none;color:var(--color-text,#1e293b);transition:all .15s;background:var(--color-bg,#fff)}
.related-card:hover{border-color:var(--color-accent,#2563eb);box-shadow:var(--shadow-sm,0 2px 4px rgba(0,0,0,.06));transform:translateY(-1px)}
.related-icon{font-size:1.5rem;flex-shrink:0;line-height:1}
.related-info{display:flex;flex-direction:column;gap:0.15rem}
.related-info strong{font-size:0.9rem;font-weight:600;color:var(--color-text,#1e293b)}
.related-info span{font-size:0.8rem;color:var(--color-text-muted,#64748b);line-height:1.4}
.related-card:hover .related-info strong{color:var(--color-accent,#2563eb)}

/* === Section headings utility === */
.section-heading{font-size:clamp(1.5rem,3vw,2rem);font-weight:700;color:var(--color-text,#1e293b);margin-bottom:0.5rem}
.section-subheading{color:var(--color-text-muted,#64748b);font-size:1rem;margin-bottom:1.5rem;max-width:600px;line-height:1.6}

/* === Cookie consent bar === */
.cookie-consent{position:fixed;bottom:0;left:0;right:0;background:var(--color-primary,#1e293b);color:#fff;padding:0.75rem 1.5rem;z-index:9998;font-size:0.85rem}
.cookie-consent p{margin:0;display:flex;align-items:center;justify-content:center;gap:0.75rem;flex-wrap:wrap}
.cookie-consent a{color:var(--color-accent-hover,#93c5fd);text-decoration:underline}
.cookie-ok{background:#fff;color:var(--color-primary,#1e293b);border:none;padding:0.375rem 1rem;border-radius:var(--radius-sm,.25rem);font-weight:600;cursor:pointer;font-size:0.8rem}

/* Print media query */
@media print{
  body{background:#fff;color:#000;font-size:12pt}
  .header,.footer,.scroll-cta,.print-btn,.cta-section,.lead-section,.cookie-consent,.back-to-top,.reading-progress,.related-pages,nav,button[type="submit"]{display:none!important}
  .reveal{opacity:1!important;transform:none!important}
  main{padding:0}
  .site-container{max-width:100%;padding:0}
  a{color:#000;text-decoration:underline}
  a[href]::after{content:' (' attr(href) ')';font-size:0.8em;color:#666}
  a[href^="/"]::after,a[href^="#"]::after{content:none}
  article{max-width:100%}
  section{break-inside:avoid}
  p,li{orphans:3;widows:3}
  img{max-width:100%!important;page-break-inside:avoid}
  .comparison-table,.data-table{font-size:10pt}
  .comparison-table th,.data-table th{background:#f0f0f0!important}
  .cost-bar-fill{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1,h2,h3{break-after:avoid}
  .hero{background:none!important;color:#000!important;padding:1rem 0}
  .article-featured-img{box-shadow:none!important;border-radius:0!important}
  blockquote{border-left:2px solid #999;padding-left:1rem;color:#333}
}
`;
