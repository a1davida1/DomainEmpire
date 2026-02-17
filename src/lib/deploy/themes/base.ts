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
a{color:var(--color-link,#2563eb);text-decoration:none;transition:color var(--transition-speed,.2s)}
a:hover{color:var(--color-link-hover,#1d4ed8)}

/* Headings */
h1,h2,h3,h4,h5,h6{font-family:var(--font-heading,var(--font-body,system-ui,sans-serif));color:var(--color-text,#1e293b);line-height:1.25;font-weight:700}
h1{font-size:clamp(1.75rem,4vw,2.5rem);letter-spacing:-0.025em}
h2{font-size:clamp(1.35rem,3vw,1.75rem);letter-spacing:-0.02em;margin-top:2.5rem;margin-bottom:1rem}
h3{font-size:clamp(1.1rem,2.5vw,1.35rem);margin-top:2rem;margin-bottom:0.75rem}

/* Article body */
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
article img{border-radius:var(--radius-md,.5rem);margin:1.5rem 0}
.article-featured-img{width:100%;height:auto;border-radius:var(--radius-lg,.75rem);margin:0 0 2rem 0;box-shadow:var(--shadow-md,0 4px 6px -1px rgba(0,0,0,.1));display:block}
article table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:0.925rem}
article table th{text-align:left;padding:0.75rem;border-bottom:2px solid var(--color-border-strong,#cbd5e1);font-weight:700;color:var(--color-text-muted,#64748b);text-transform:uppercase;font-size:0.8rem;letter-spacing:0.04em}
article table td{padding:0.75rem;border-bottom:1px solid var(--color-border,#e2e8f0)}
article table tr:hover{background:var(--color-bg-surface,#f8fafc)}
article hr{border:none;height:1px;background:var(--color-border,#e2e8f0);margin:2.5rem 0}

/* Container */
.site-container{max-width:var(--container-max,1100px);margin:0 auto;padding:0 1.5rem}

/* Main content area */
main{padding:2.5rem 0;min-height:60vh}

/* Images */
img{max-width:100%;height:auto;display:block}

/* Selection */
::selection{background:var(--color-accent,#2563eb);color:#fff}

/* Focus visible */
:focus-visible{outline:2px solid var(--color-accent,#2563eb);outline-offset:2px;border-radius:var(--radius-sm,.375rem)}

/* Utility: section spacing */
section + section{margin-top:var(--spacing-unit,1.6rem)}

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

/* Reading progress indicator */
.reading-progress{position:fixed;top:0;left:0;height:3px;background:var(--color-accent,#2563eb);z-index:9999;transition:width .1s linear;width:0}

/* Back-to-top button */
.back-to-top{position:fixed;bottom:2rem;right:2rem;width:2.75rem;height:2.75rem;border-radius:var(--radius-full,999px);background:var(--color-accent,#2563eb);color:#fff;border:none;cursor:pointer;font-size:1.25rem;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.15));opacity:0;transform:translateY(1rem);transition:opacity .3s,transform .3s;z-index:999;pointer-events:none}
.back-to-top.visible{opacity:1;transform:translateY(0);pointer-events:auto}
.back-to-top:hover{background:var(--color-accent-hover,#1d4ed8);transform:translateY(-2px)}

/* Separator decorations */
.separator{width:60px;height:3px;background:var(--color-accent,#2563eb);margin:1.5rem 0;border-radius:999px}
.separator--center{margin:1.5rem auto}

/* Print media query */
@media print{
  body{background:#fff;color:#000;font-size:12pt}
  .header,.footer,.scroll-cta,.print-btn,.cta-section,.lead-section,nav,button[type="submit"]{display:none!important}
  main{padding:0}
  .site-container{max-width:100%;padding:0}
  a{color:#000;text-decoration:underline}
  a[href]::after{content:' (' attr(href) ')';font-size:0.8em;color:#666}
  article{max-width:100%}
  section{break-inside:avoid}
  h1,h2,h3{break-after:avoid}
  .hero{background:none!important;color:#000!important;padding:1rem 0}
}
`;
