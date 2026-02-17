/**
 * Block Variant CSS — styles for block-level variant classes.
 *
 * The block renderers emit classes like `hero--centered`, `hero--split`,
 * `header--topbar`, `footer--multi-column`, etc. This module provides
 * the CSS that makes those variants look distinct and polished.
 *
 * These styles layer ON TOP of the base/component/layout CSS and use
 * the same CSS custom property tokens from themes and skins.
 */

export const blockVariantStyles = `
/* ================================================================
   HERO VARIANTS
   ================================================================ */

/* Shared hero base */
.hero{
  padding:4rem 0;
  position:relative;
  overflow:hidden;
}
.hero .site-container{position:relative;z-index:1}
.hero h1{
  font-size:clamp(2rem,5vw,3rem);
  font-weight:800;
  letter-spacing:-0.03em;
  line-height:1.15;
  margin-bottom:0.75rem;
}
.hero-sub{
  font-size:1.15rem;
  line-height:1.65;
  max-width:640px;
  margin-bottom:1.5rem;
}
.hero-badge{
  display:inline-block;
  padding:0.3rem 0.9rem;
  border-radius:var(--radius-full,999px);
  font-size:0.8rem;
  font-weight:600;
  margin-bottom:1.25rem;
}
.hero-cta{
  display:inline-block;
  padding:0.75rem 2rem;
  border-radius:var(--radius-md,.5rem);
  font-weight:600;
  font-size:1rem;
  text-decoration:none;
  transition:transform 0.15s,box-shadow 0.15s;
}
.hero-cta:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg)}

/* --- Centered variant --- */
.hero--centered{
  text-align:center;
  background:var(--color-hero-bg,var(--color-bg-surface));
  color:var(--color-hero-text,var(--color-text));
  padding:5rem 1.5rem;
  border-bottom:var(--border-width,1px) solid var(--color-border);
}
.hero--centered h1{color:var(--color-hero-text,var(--color-text))}
.hero--centered .hero-sub{margin-left:auto;margin-right:auto;color:var(--color-text-muted)}
.hero--centered .hero-badge{background:var(--color-badge-bg);color:var(--color-badge-text)}
.hero--centered .hero-cta{background:var(--color-accent);color:#fff}
.hero--centered .hero-cta:hover{color:#fff}

/* --- Split variant --- */
.hero--split{
  background:var(--color-bg-surface);
  padding:4rem 1.5rem;
  border-bottom:var(--border-width,1px) solid var(--color-border);
}
.hero--split .site-container{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:3rem;
  align-items:center;
}
.hero--split h1{color:var(--color-text)}
.hero--split .hero-sub{color:var(--color-text-muted)}
.hero--split .hero-badge{background:var(--color-accent);color:#fff}
.hero--split .hero-cta{background:var(--color-accent);color:#fff}
.hero--split .hero-cta:hover{color:#fff}
@media(max-width:768px){
  .hero--split .site-container{grid-template-columns:1fr}
}

/* --- Minimal variant --- */
.hero--minimal{
  background:var(--color-bg);
  padding:3rem 0 2rem;
  border-bottom:var(--border-width,1px) solid var(--color-border);
}
.hero--minimal h1{font-size:clamp(1.75rem,4vw,2.25rem);color:var(--color-text)}
.hero--minimal .hero-sub{color:var(--color-text-muted);font-size:1.05rem}
.hero--minimal .hero-badge{background:var(--color-bg-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
.hero--minimal .hero-cta{background:var(--color-text);color:var(--color-bg)}
.hero--minimal .hero-cta:hover{color:var(--color-bg)}

/* --- Gradient variant --- */
.hero--gradient{
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent,var(--color-primary-hover)));
  color:#fff;
  padding:5rem 2rem;
  border-radius:0;
}
.hero--gradient h1{color:#fff}
.hero--gradient .hero-sub{color:rgba(255,255,255,.8)}
.hero--gradient .hero-badge{background:rgba(255,255,255,.15);color:#fff;backdrop-filter:blur(4px)}
.hero--gradient .hero-cta{background:#fff;color:var(--color-primary)}
.hero--gradient .hero-cta:hover{color:var(--color-primary);box-shadow:0 8px 24px rgba(0,0,0,.2)}

/* --- Image variant (dark overlay, would need bg-image in production) --- */
.hero--image{
  background:var(--color-primary);
  color:#fff;
  padding:6rem 2rem;
  text-align:center;
  position:relative;
}
.hero--image::before{
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.6));
  z-index:0;
}
.hero--image h1{color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3)}
.hero--image .hero-sub{color:rgba(255,255,255,.85);margin-left:auto;margin-right:auto}
.hero--image .hero-badge{background:rgba(255,255,255,.2);color:#fff;backdrop-filter:blur(4px)}
.hero--image .hero-cta{background:#fff;color:var(--color-primary)}
.hero--image .hero-cta:hover{color:var(--color-primary)}

/* ================================================================
   HEADER VARIANTS
   ================================================================ */

/* --- Topbar variant --- */
.header--topbar{
  background:var(--color-primary,#1e293b);
  color:var(--color-badge-text,#f8fafc);
  border-bottom:2px solid var(--color-header-border,transparent);
}
.header--topbar .site-container{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding-top:0.875rem;
  padding-bottom:0.875rem;
  max-width:1200px;
}
.header--topbar .logo{
  font-family:var(--font-heading);
  font-size:1.25rem;
  font-weight:700;
  color:var(--color-badge-text,#f8fafc);
  text-decoration:none;
}
.header--topbar nav{display:flex;gap:1.25rem}
.header--topbar nav a{color:rgba(255,255,255,.7);text-decoration:none;font-size:0.875rem;font-weight:500;transition:color .15s}
.header--topbar nav a:hover{color:#fff}

/* --- Centered header variant --- */
.header--centered{
  padding:1.5rem 0;
  text-align:center;
  border-bottom:var(--border-width,1px) solid var(--color-border);
  background:var(--color-bg);
}
.header--centered .site-container{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:0.75rem;
}
.header--centered .logo{
  font-family:var(--font-heading);
  font-size:1.5rem;
  font-weight:800;
  color:var(--color-text);
  text-decoration:none;
  letter-spacing:-0.025em;
}
.header--centered nav{display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center}
.header--centered nav a{color:var(--color-text-muted);text-decoration:none;font-size:0.875rem;font-weight:500;transition:color .2s}
.header--centered nav a:hover{color:var(--color-text)}

/* --- Minimal header variant --- */
.header--minimal{
  padding:1rem 0;
  border-bottom:var(--border-width,1px) solid var(--color-border);
  background:var(--color-bg);
}
.header--minimal .site-container{
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.header--minimal .logo{
  font-family:var(--font-heading);
  font-size:1.125rem;
  font-weight:700;
  color:var(--color-text);
  text-decoration:none;
}
.header--minimal nav{display:flex;gap:1rem}
.header--minimal nav a{color:var(--color-text-muted);font-size:0.85rem;text-decoration:none;transition:color .2s}
.header--minimal nav a:hover{color:var(--color-text)}

/* --- Split header variant --- */
.header--split{
  padding:1rem 0;
  border-bottom:2px solid var(--color-accent);
  background:var(--color-bg);
}
.header--split .site-container{
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.header--split .logo{
  font-family:var(--font-heading);
  font-size:1.25rem;
  font-weight:700;
  color:var(--color-text);
  text-decoration:none;
}
.header--split nav{display:flex;gap:1rem;background:var(--color-bg-surface);padding:0.375rem 1rem;border-radius:var(--radius-full,999px)}
.header--split nav a{color:var(--color-text-muted);font-size:0.85rem;font-weight:500;text-decoration:none;transition:color .2s}
.header--split nav a:hover{color:var(--color-accent)}

/* Header responsive */
@media(max-width:640px){
  .header--topbar .site-container,
  .header--split .site-container{flex-direction:column;gap:0.5rem;text-align:center}
  .header--topbar nav,
  .header--split nav,
  .header--centered nav{flex-wrap:wrap;justify-content:center}
}

/* ================================================================
   FOOTER VARIANTS
   ================================================================ */

/* --- Multi-column footer --- */
.footer--multi-column{
  background:var(--color-footer-bg,#1e293b);
  color:var(--color-footer-text,#cbd5e1);
  padding:3rem 0 1.5rem;
  margin-top:3rem;
}
.footer--multi-column p{text-align:center;font-size:0.8rem;color:var(--color-footer-text,#64748b);opacity:.7}
.footer--multi-column a{color:var(--color-footer-text,#94a3b8);text-decoration:none;transition:opacity .2s}
.footer--multi-column a:hover{opacity:1;color:#fff}
.footer--multi-column .footer-columns{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:2rem;
  margin-bottom:2rem;
  padding-bottom:2rem;
  border-bottom:1px solid rgba(255,255,255,.1);
}
.footer--multi-column .footer-col h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem;color:rgba(255,255,255,.5)}
.footer--multi-column .footer-col ul{list-style:none}
.footer--multi-column .footer-col li{margin-bottom:0.375rem}
.footer--multi-column .footer-col a{font-size:0.875rem}

/* --- Newsletter footer --- */
.footer--newsletter{
  padding:0;
  margin-top:3rem;
  border-top:2px solid var(--color-border);
}
.footer--newsletter .footer-newsletter{
  background:var(--color-bg-surface,#f8fafc);
  padding:2.5rem;
  text-align:center;
}
.footer--newsletter .footer-newsletter h4{font-size:1.125rem;font-weight:700;margin-bottom:0.25rem}
.footer--newsletter .newsletter-form{
  display:flex;
  gap:0.5rem;
  max-width:420px;
  margin:1rem auto 0;
}
.footer--newsletter .newsletter-form input[type="email"]{
  flex:1;
  padding:0.625rem 0.875rem;
  border:var(--border-width,1px) solid var(--color-border-strong);
  border-radius:var(--radius-md,.375rem);
  font-size:0.95rem;
  background:var(--color-bg);
}
.footer--newsletter .newsletter-form button{
  background:var(--color-accent,#2563eb);
  color:#fff;
  padding:0.625rem 1.5rem;
  border:none;
  border-radius:var(--radius-md,.375rem);
  font-weight:600;
  cursor:pointer;
}
.footer--newsletter p{text-align:center;color:var(--color-text-muted);font-size:0.8rem;padding:1.5rem}

/* --- Minimal footer --- */
.footer--minimal{
  padding:2.5rem 0;
  border-top:var(--border-width,1px) solid var(--color-border);
  text-align:center;
  color:var(--color-text-muted);
  font-size:0.85rem;
  margin-top:3rem;
}
.footer--minimal a{color:var(--color-text-muted);text-decoration:none;font-size:0.85rem}
.footer--minimal a:hover{color:var(--color-text)}

/* --- Legal footer --- */
.footer--legal{
  padding:2.5rem 0;
  border-top:2px solid var(--color-border);
  text-align:center;
  color:var(--color-text-muted);
  font-size:0.85rem;
  margin-top:3rem;
  background:var(--color-bg-surface);
}
.footer--legal .footer-disclaimer{
  font-size:0.78rem;
  max-width:600px;
  margin:0 auto 1rem;
  line-height:1.55;
  color:var(--color-text-muted);
}
.footer--legal a{color:var(--color-text-muted);text-decoration:none}
.footer--legal a:hover{color:var(--color-text)}

/* ================================================================
   CTA SECTION VARIANTS
   ================================================================ */

.cta-section{
  padding:3rem 0;
  text-align:center;
}
.cta-section .cta-text{
  font-size:1.15rem;
  font-weight:500;
  margin-bottom:1.25rem;
  color:var(--color-text);
}

/* --- Bar CTA --- */
.cta-section--bar{
  background:var(--color-primary,#1e293b);
  color:var(--color-badge-text,#f8fafc);
}
.cta-section--bar .cta-text{color:var(--color-badge-text,#f8fafc)}
.cta-section--bar .cta-button{background:#fff;color:var(--color-primary)}
.cta-section--bar .cta-button:hover{color:var(--color-primary)}

/* --- Card CTA --- */
.cta-section--card{
  background:var(--color-bg);
}
.cta-section--card .site-container{
  background:var(--color-bg-surface);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,1rem);
  padding:3rem 2rem;
}

/* --- Banner CTA --- */
.cta-section--banner{
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent,var(--color-primary-hover)));
  color:#fff;
  padding:4rem 0;
}
.cta-section--banner .cta-text{color:#fff;font-size:1.25rem}
.cta-section--banner .cta-button{background:#fff;color:var(--color-primary)}
.cta-section--banner .cta-button:hover{color:var(--color-primary)}

/* ================================================================
   ENHANCED SECTION SPACING & VISUAL QUALITY
   ================================================================ */

/* More breathing room between sections */
section + section{margin-top:calc(var(--spacing-unit,1.6rem) * 2)}

/* Subtle section dividers for content blocks */
.faq-section,
.trust-badges,
.data-sources,
.author-bio,
.checklist-section,
.pricing-section{
  padding:2.5rem 0;
}

/* CTA buttons global polish */
.cta-button{
  display:inline-block;
  background:var(--color-accent);
  color:#fff;
  padding:0.75rem 2rem;
  border-radius:var(--radius-md,.5rem);
  text-decoration:none;
  font-size:0.95rem;
  font-weight:600;
  letter-spacing:0.01em;
  transition:transform 0.15s,box-shadow 0.15s,background 0.15s;
  box-shadow:var(--shadow-sm);
}
.cta-button:hover{
  transform:translateY(-2px);
  box-shadow:var(--shadow-md);
  color:#fff;
}

/* Testimonial grid polish */
.testimonial-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:1.25rem;
  margin:2rem 0;
}
.testimonial-card{
  background:var(--color-bg-surface,#f8fafc);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.5rem;
  transition:box-shadow .15s,transform .15s;
}
.testimonial-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}
.testimonial-quote{font-style:italic;color:var(--color-text);line-height:1.6;margin-bottom:1rem;font-size:0.95rem}
.testimonial-author{font-weight:600;color:var(--color-text);font-size:0.9rem}
.testimonial-role{color:var(--color-text-muted);font-size:0.82rem}
.testimonial-stars{color:var(--color-warning,#f59e0b);margin-bottom:0.5rem;font-size:0.9rem}

/* Comparison card variant */
.comparison-cards{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:1.25rem;
  margin:2rem 0;
}

/* Vs card polish */
.vs-card{
  display:grid;
  grid-template-columns:1fr auto 1fr;
  gap:1.5rem;
  align-items:start;
  margin:2rem 0;
  background:var(--color-bg-surface);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:2rem;
}
.vs-side h3{font-size:1.1rem;margin-bottom:0.75rem}
.vs-points{list-style:none;padding:0}
.vs-points li{padding:0.375rem 0;font-size:0.9rem;color:var(--color-text-muted)}
.vs-divider{
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:1.5rem;
  font-weight:800;
  color:var(--color-text-muted);
  padding:0 0.5rem;
}
.vs-verdict{
  grid-column:1/-1;
  background:var(--color-bg);
  border:var(--border-width,1px) solid var(--color-success);
  border-radius:var(--radius-md);
  padding:1rem;
  font-size:0.9rem;
  color:var(--color-text);
}
@media(max-width:640px){
  .vs-card{grid-template-columns:1fr;text-align:center}
  .vs-divider{padding:0.5rem 0}
}

/* Ranking list polish */
.ranking-list{margin:2rem 0}
.ranking-item{
  display:flex;
  align-items:flex-start;
  gap:1rem;
  padding:1.25rem;
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-md);
  margin-bottom:0.75rem;
  background:var(--color-bg);
  transition:box-shadow .15s;
}
.ranking-item:hover{box-shadow:var(--shadow-sm)}
.ranking-number{
  display:flex;
  align-items:center;
  justify-content:center;
  width:2.5rem;
  height:2.5rem;
  border-radius:50%;
  background:var(--color-accent);
  color:#fff;
  font-weight:800;
  font-size:1rem;
  flex-shrink:0;
}
.ranking-content h3{font-size:1rem;margin-bottom:0.25rem}
.ranking-content p{font-size:0.9rem;color:var(--color-text-muted);margin:0}
.ranking-score{
  margin-left:auto;
  font-weight:700;
  color:var(--color-accent);
  font-size:1.1rem;
  white-space:nowrap;
}

/* Pros/Cons polish */
.proscons{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:1.5rem;
  margin:2rem 0;
}
.proscons-title{grid-column:1/-1;font-size:1.25rem;margin-bottom:0.25rem}
.pros-list,.cons-list{
  background:var(--color-bg-surface);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.5rem;
}
.pros-list h4{color:var(--color-success);margin-bottom:0.75rem}
.cons-list h4{color:var(--color-error);margin-bottom:0.75rem}
.pros-list ul,.cons-list ul{list-style:none;padding:0}
.pros-list li,.cons-list li{padding:0.375rem 0;font-size:0.9rem;color:var(--color-text-muted)}
.pros-list li::before{content:'✓ ';color:var(--color-success);font-weight:700}
.cons-list li::before{content:'✗ ';color:var(--color-error);font-weight:700}
@media(max-width:640px){.proscons{grid-template-columns:1fr}}

/* PDF Download */
.pdf-download{
  background:var(--color-bg-surface);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.5rem;
  margin:2rem 0;
  display:flex;
  align-items:center;
  gap:1rem;
}
.pdf-download h3{font-size:1rem;margin-bottom:0.25rem}
.pdf-download p{font-size:0.9rem;color:var(--color-text-muted);margin:0}
.pdf-download a{margin-left:auto}

/* Data table enhanced */
.data-table-wrapper{overflow-x:auto;margin:2rem 0}
.data-table{
  width:100%;
  border-collapse:collapse;
  font-size:0.9rem;
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-md);
  overflow:hidden;
}
.data-table th{
  background:var(--color-bg-surface);
  padding:0.75rem 1rem;
  text-align:left;
  font-weight:700;
  font-size:0.8rem;
  text-transform:uppercase;
  letter-spacing:0.04em;
  color:var(--color-text-muted);
  border-bottom:2px solid var(--color-border);
}
.data-table td{
  padding:0.75rem 1rem;
  border-bottom:1px solid var(--color-border);
}
.data-table tr:hover{background:var(--color-bg-surface)}

/* ================================================================
   REVIEW / PROS-CONS CARD (from ProsConsCard renderer)
   ================================================================ */

.review-card{
  background:var(--color-bg-surface);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.5rem;
  margin:1.5rem 0;
}
.review-card h3{font-size:1.15rem;margin-bottom:0.5rem}
.review-stars{color:var(--color-warning,#f59e0b);font-size:0.9rem;display:inline-block;margin-bottom:0.5rem}
.review-summary{color:var(--color-text-muted);font-size:0.9rem;margin-bottom:1rem;line-height:1.6}
.pros-cons{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:1rem 0}
.pros-cons .pros,.pros-cons .cons{padding:0}
.pros-cons h4{font-size:0.9rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem}
.pros-cons .pros h4{color:var(--color-success)}
.pros-cons .cons h4{color:var(--color-error)}
.pros-cons ul{list-style:none;padding:0;margin:0}
.pros-cons li{padding:0.3rem 0;font-size:0.88rem;color:var(--color-text-muted)}
.pros-cons .pros li::before{content:'✓ ';color:var(--color-success);font-weight:700}
.pros-cons .cons li::before{content:'✗ ';color:var(--color-error);font-weight:700}
@media(max-width:640px){.pros-cons{grid-template-columns:1fr}}

/* ================================================================
   VS GRID (from VsCard renderer)
   ================================================================ */

.vs-grid{
  display:grid;
  grid-template-columns:1fr auto 1fr;
  gap:1.5rem;
  align-items:start;
}
.vs-side h3{font-size:1.1rem;margin-bottom:0.5rem}
.vs-side p{color:var(--color-text-muted);font-size:0.9rem;margin-bottom:0.75rem}
.vs-pros,.vs-cons{list-style:none;padding:0;margin:0}
.vs-pros li,.vs-cons li{padding:0.25rem 0;font-size:0.88rem;color:var(--color-text-muted)}
@media(max-width:640px){
  .vs-grid{grid-template-columns:1fr}
  .vs-divider{padding:0.5rem 0}
}

/* ================================================================
   TESTIMONIAL SECTION (from TestimonialGrid renderer)
   ================================================================ */

.testimonial-section{margin:2rem 0;padding:2rem 0}
.testimonial-rating{color:var(--color-warning,#f59e0b);font-size:0.9rem;margin-bottom:0.5rem}
.testimonial-card blockquote{
  font-style:italic;
  color:var(--color-text);
  line-height:1.6;
  margin:0 0 1rem;
  font-size:0.95rem;
  border:none;
  padding:0;
  background:none;
}
.testimonial-card cite{
  display:block;
  font-style:normal;
  font-weight:600;
  color:var(--color-text);
  font-size:0.9rem;
}
.testimonial-title{
  display:block;
  font-weight:400;
  color:var(--color-text-muted);
  font-size:0.82rem;
  margin-top:0.15rem;
}

/* ================================================================
   PRICING CARDS (from PricingTable renderer)
   ================================================================ */

.pricing-card{
  background:var(--color-bg);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:2rem 1.5rem;
  text-align:center;
  transition:box-shadow .15s,transform .15s;
  position:relative;
}
.pricing-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}
.pricing-highlighted{
  border-color:var(--color-accent);
  box-shadow:var(--shadow-md);
  transform:scale(1.02);
}
.pricing-badge{
  position:absolute;
  top:-0.75rem;
  left:50%;
  transform:translateX(-50%);
  background:var(--color-accent);
  color:#fff;
  padding:0.25rem 1rem;
  border-radius:var(--radius-full,999px);
  font-size:0.75rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:0.04em;
}
.pricing-card h3{font-size:1.15rem;margin-bottom:0.5rem}
.pricing-price{font-size:2.25rem;font-weight:800;color:var(--color-accent);margin-bottom:0.25rem}
.pricing-period{font-size:0.9rem;font-weight:400;color:var(--color-text-muted)}
.pricing-card .pricing-features{
  list-style:none;
  padding:0;
  margin:1.25rem 0;
  text-align:left;
}
.pricing-card .pricing-features li{
  padding:0.5rem 0;
  border-bottom:1px solid var(--color-border);
  font-size:0.9rem;
  color:var(--color-text-muted);
}
.pricing-card .pricing-features li:last-child{border-bottom:none}

/* ================================================================
   RANKING SECTION (from RankingList renderer)
   ================================================================ */

.ranking-section{margin:2rem 0;padding:2rem 0}
.ranking-section h2{margin-bottom:1.25rem}
.ranking-list{list-style:none;padding:0;margin:0}

/* ================================================================
   COMPARISON SECTION enhancements
   ================================================================ */

.comparison-section{margin:2rem 0;padding:1rem 0}

/* ================================================================
   PDF DOWNLOAD (button, gate form, etc.)
   ================================================================ */

.pdf-download-btn{
  display:inline-block;
  background:var(--color-accent);
  color:#fff;
  padding:0.625rem 1.5rem;
  border-radius:var(--radius-md,.375rem);
  font-weight:600;
  text-decoration:none;
  transition:transform .15s;
}
.pdf-download-btn:hover{transform:translateY(-1px);color:#fff}
.pdf-gate-text{font-weight:600;margin-bottom:0.5rem}
.pdf-gate-form{display:flex;gap:0.5rem}
.pdf-gate-form input{
  flex:1;
  padding:0.5rem 0.75rem;
  border:var(--border-width,1px) solid var(--color-border-strong);
  border-radius:var(--radius-md,.375rem);
  font-size:0.95rem;
}
.pdf-gate-form button{
  background:var(--color-accent);
  color:#fff;
  border:none;
  padding:0.5rem 1.25rem;
  border-radius:var(--radius-md,.375rem);
  font-weight:600;
  cursor:pointer;
}
`;
