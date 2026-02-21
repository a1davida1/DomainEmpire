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
  padding:5rem 0;
  position:relative;
  overflow:hidden;
  background-image:url('/images/hero-bg.svg');
  background-size:cover;
  background-position:center;
}
.hero .site-container{position:relative;z-index:1}
.hero h1{
  font-size:clamp(2.25rem,5.5vw,3.5rem);
  font-weight:800;
  letter-spacing:-0.035em;
  line-height:1.1;
  margin-bottom:1rem;
}
.hero-sub{
  font-size:1.2rem;
  line-height:1.7;
  max-width:600px;
  margin-bottom:2rem;
  color:inherit;
  opacity:.85;
}
.hero-badge{
  display:inline-flex;
  align-items:center;
  gap:0.375rem;
  padding:0.4rem 1rem;
  border-radius:var(--radius-full,999px);
  font-size:0.82rem;
  font-weight:600;
  margin-bottom:1.5rem;
  letter-spacing:0.01em;
}
/* Trust indicator row below hero CTA */
.hero-trust{
  display:flex;
  flex-wrap:wrap;
  gap:1.25rem;
  margin-top:2rem;
  justify-content:center;
}
.hero-trust-item{
  display:inline-flex;
  align-items:center;
  gap:0.5rem;
  font-size:0.875rem;
  font-weight:500;
  color:inherit;
  opacity:.75;
}
.hero-trust-item::before{
  content:'✓';
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:1.375rem;
  height:1.375rem;
  border-radius:50%;
  background:var(--color-success,#16a34a);
  color:#fff;
  font-size:0.7rem;
  font-weight:700;
  flex-shrink:0;
}
.hero-cta{
  display:inline-flex;
  align-items:center;
  gap:0.5rem;
  padding:0.875rem 2.25rem;
  border-radius:var(--radius-md,.5rem);
  font-weight:700;
  font-size:1.05rem;
  text-decoration:none;
  letter-spacing:0.01em;
  transition:transform 0.15s,box-shadow 0.2s;
}
.hero-cta::after{content:'→';font-size:1.1em;transition:transform .15s}
.hero-cta:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.15)}
.hero-cta:hover::after{transform:translateX(3px)}

/* --- Centered variant --- */
.hero--centered{
  text-align:center;
  background:var(--color-hero-bg,var(--color-bg-surface));
  color:var(--color-hero-text,var(--color-text));
  padding:5rem 2rem 4rem;
}
.hero--centered h1{color:var(--color-hero-text,var(--color-text));max-width:800px;margin-left:auto;margin-right:auto;text-shadow:0 1px 2px rgba(0,0,0,0.06)}
.hero--centered .hero-sub{margin-left:auto;margin-right:auto;max-width:560px;opacity:0.85;font-size:1.15rem;line-height:1.6}
.hero--centered .hero-badge{background:rgba(255,255,255,0.15);color:inherit;border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.hero--centered .hero-cta{background:var(--color-accent);color:#fff;padding:0.875rem 2.25rem;font-size:1.05rem;font-weight:600;border-radius:var(--radius-md,0.5rem);box-shadow:0 2px 8px rgba(0,0,0,0.15);transition:transform .15s,box-shadow .15s}
.hero--centered .hero-cta:hover{color:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,0.2)}

/* --- Split variant --- */
.hero--split{
  background:var(--color-bg-surface);
  padding:5rem 2rem;
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
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent,var(--color-primary-hover)),var(--color-primary));
  background-size:200% 200%;
  color:#fff;
  padding:6rem 2rem 5rem;
  text-align:center;
}
.hero--gradient h1{color:#fff;max-width:800px;margin-left:auto;margin-right:auto}
.hero--gradient .hero-sub{color:rgba(255,255,255,.85);max-width:560px;margin-left:auto;margin-right:auto}
.hero--gradient .hero-badge{background:rgba(255,255,255,.12);color:#fff;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.15)}
.hero--gradient .hero-cta{background:#fff;color:var(--color-primary);padding:1rem 2.5rem;font-size:1.1rem;box-shadow:0 4px 16px rgba(0,0,0,.15)}
.hero--gradient .hero-cta:hover{color:var(--color-primary);box-shadow:0 12px 32px rgba(0,0,0,.25)}
.hero--gradient .hero-trust-item{color:#fff;opacity:.8}
.hero--gradient .hero-trust-item::before{background:rgba(255,255,255,.2);color:#fff}

/* --- Image variant (dark overlay) --- */
.hero--image{
  background:var(--color-primary);
  color:#fff;
  padding:7rem 2rem 6rem;
  text-align:center;
  position:relative;
}
.hero--image::before{
  content:'';
  position:absolute;
  inset:0;
  background:linear-gradient(180deg,rgba(0,0,0,.2) 0%,rgba(0,0,0,.55) 100%);
  z-index:0;
}
.hero--image h1{color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.3);max-width:800px;margin-left:auto;margin-right:auto}
.hero--image .hero-sub{color:rgba(255,255,255,.9);margin-left:auto;margin-right:auto;max-width:560px}
.hero--image .hero-badge{background:rgba(255,255,255,.15);color:#fff;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.15)}
.hero--image .hero-cta{background:#fff;color:var(--color-primary);padding:1rem 2.5rem;font-size:1.1rem;box-shadow:0 4px 16px rgba(0,0,0,.2)}
.hero--image .hero-cta:hover{color:var(--color-primary);box-shadow:0 12px 32px rgba(0,0,0,.3)}
.hero--image .hero-trust-item{color:#fff}
.hero--image .hero-trust-item::before{background:rgba(255,255,255,.2);color:#fff}

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
.header--minimal nav{display:flex;gap:1rem;align-items:center}
.header--minimal nav a{color:var(--color-text-muted);font-size:0.85rem;text-decoration:none;transition:color .2s}
.header--minimal nav a:hover{color:var(--color-text)}
.header--minimal .nav-dropdown-trigger{font-size:0.85rem;color:var(--color-text-muted)}
.header--minimal .nav-dropdown-trigger:hover{color:var(--color-text)}

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

/* ================================================================
   HEADER: HAMBURGER, DROPDOWNS, PHONE
   ================================================================ */

/* Hamburger button — hidden on desktop, visible on mobile */
.hamburger{
  display:none;
  flex-direction:column;
  gap:5px;
  background:none;
  border:none;
  cursor:pointer;
  padding:6px;
  z-index:60;
}
.hamburger span{
  display:block;
  width:22px;
  height:2px;
  background:currentColor;
  border-radius:2px;
  transition:transform .25s,opacity .25s;
}
.hamburger-active span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.hamburger-active span:nth-child(2){opacity:0}
.hamburger-active span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}

/* Phone number in header */
.header-phone{
  display:inline-flex;
  align-items:center;
  gap:0.375rem;
  font-size:0.85rem;
  font-weight:600;
  text-decoration:none;
  color:inherit;
  opacity:.8;
  transition:opacity .15s;
  margin-left:auto;
  margin-right:1.5rem;
}
.header-phone:hover{opacity:1}
.header-phone-icon{font-size:0.9rem}
.header--topbar .header-phone{color:rgba(255,255,255,.85)}
.header--topbar .header-phone:hover{color:#fff}

/* Dropdown nav */
.nav-dropdown{position:relative}
.nav-dropdown-trigger{
  background:none;
  border:none;
  cursor:pointer;
  font:inherit;
  color:inherit;
  font-size:0.875rem;
  font-weight:500;
  display:inline-flex;
  align-items:center;
  gap:0.25rem;
  padding:0;
  transition:color .15s;
}
.nav-arrow{font-size:0.7em;transition:transform .2s}
.nav-dropdown:hover .nav-arrow{transform:rotate(180deg)}
.nav-dropdown-menu{
  display:none;
  position:absolute;
  top:calc(100% + 0.5rem);
  left:50%;
  transform:translateX(-50%);
  background:var(--color-bg,#fff);
  border:1px solid var(--color-border,#e2e8f0);
  border-radius:var(--radius-md,.5rem);
  box-shadow:0 8px 24px rgba(0,0,0,.12);
  min-width:180px;
  z-index:100;
  padding:0.5rem 0;
}
.nav-dropdown:hover .nav-dropdown-menu,.nav-dropdown:focus-within .nav-dropdown-menu{display:block}
.nav-dropdown-menu a{
  display:block;
  padding:0.5rem 1rem;
  font-size:0.875rem;
  color:var(--color-text,#1e293b);
  text-decoration:none;
  transition:background .1s;
  white-space:nowrap;
}
.nav-dropdown-menu a:hover{background:var(--color-bg-surface,#f8fafc)}

/* Topbar dropdown overrides */
.header--topbar .nav-dropdown-trigger{color:rgba(255,255,255,.7)}
.header--topbar .nav-dropdown:hover .nav-dropdown-trigger{color:#fff}
.header--topbar .nav-dropdown-menu{background:var(--color-primary,#1e293b);border-color:rgba(255,255,255,.1)}
.header--topbar .nav-dropdown-menu a{color:rgba(255,255,255,.7)}
.header--topbar .nav-dropdown-menu a:hover{color:#fff;background:rgba(255,255,255,.08)}

/* Mobile responsive */
@media(max-width:768px){
  .hamburger{display:flex}

  .header-nav{
    display:none;
    position:absolute;
    top:100%;
    left:0;
    right:0;
    background:var(--color-bg,#fff);
    border-bottom:2px solid var(--color-border,#e2e8f0);
    box-shadow:0 8px 24px rgba(0,0,0,.1);
    padding:1rem;
    z-index:50;
    flex-direction:column;
    gap:0;
  }
  .header-nav.nav-open{display:flex}

  .header-nav > a,
  .header-nav .nav-dropdown-trigger{
    display:block;
    padding:0.75rem 1rem;
    font-size:0.95rem;
    color:var(--color-text,#1e293b);
    border-bottom:1px solid var(--color-border,#e2e8f0);
    width:100%;
    text-align:left;
  }
  .header-nav > a:last-child{border-bottom:none}
  .header-nav > a:hover,
  .header-nav .nav-dropdown-trigger:hover{background:var(--color-bg-surface,#f8fafc)}

  /* Mobile dropdown — inline, no positioning */
  .nav-dropdown-menu{
    position:static;
    transform:none;
    box-shadow:none;
    border:none;
    border-radius:0;
    min-width:0;
    padding:0;
    display:none;
    background:var(--color-bg-surface,#f8fafc);
  }
  .nav-dropdown:hover .nav-dropdown-menu,
  .nav-dropdown.open .nav-dropdown-menu{display:block}
  .nav-dropdown-menu a{padding:0.625rem 1rem 0.625rem 2rem;font-size:0.9rem}

  /* Topbar mobile colors */
  .header--topbar .header-nav{background:var(--color-primary,#1e293b)}
  .header--topbar .header-nav > a{color:rgba(255,255,255,.85);border-color:rgba(255,255,255,.1)}
  .header--topbar .header-nav > a:hover{background:rgba(255,255,255,.08)}
  .header--topbar .nav-dropdown-menu{background:rgba(255,255,255,.05)}

  .header-phone{margin-right:1rem;font-size:0;width:1.5rem;height:1.5rem;overflow:hidden}
  .header-phone-icon{font-size:1.1rem}

  .header--topbar .site-container,
  .header--split .site-container{flex-wrap:nowrap}
  .header--centered .site-container{flex-direction:row;flex-wrap:wrap;justify-content:space-between}
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

/* --- Shared footer elements (all variants) --- */

/* Link columns for minimal/legal/newsletter variants */
.footer--minimal .footer-columns,
.footer--legal .footer-columns,
.footer--newsletter .footer-columns{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:2rem;
  margin-bottom:2rem;
  padding-bottom:2rem;
  border-bottom:1px solid var(--color-border);
  text-align:left;
}
.footer--minimal .footer-col h4,
.footer--legal .footer-col h4,
.footer--newsletter .footer-col h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem;color:var(--color-text-muted);font-weight:700}
.footer--minimal .footer-col ul,
.footer--legal .footer-col ul,
.footer--newsletter .footer-col ul{list-style:none;padding:0;margin:0}
.footer--minimal .footer-col li,
.footer--legal .footer-col li,
.footer--newsletter .footer-col li{margin-bottom:0.375rem}
.footer--minimal .footer-col a,
.footer--legal .footer-col a,
.footer--newsletter .footer-col a{font-size:0.875rem}

/* Social icons row */
.footer-social{display:flex;gap:0.75rem;justify-content:center;margin:1.5rem 0}
.footer-social-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:2.25rem;
  height:2.25rem;
  border-radius:50%;
  background:rgba(255,255,255,.1);
  color:rgba(255,255,255,.7);
  text-decoration:none;
  font-size:0.85rem;
  font-weight:700;
  transition:background .15s,color .15s,transform .15s;
}
.footer-social-icon:hover{background:var(--color-accent);color:#fff;transform:translateY(-2px)}
/* Light footer social overrides */
.footer--minimal .footer-social-icon,
.footer--legal .footer-social-icon{background:var(--color-bg-surface);color:var(--color-text-muted);border:1px solid var(--color-border)}
.footer--minimal .footer-social-icon:hover,
.footer--legal .footer-social-icon:hover{background:var(--color-accent);color:#fff;border-color:var(--color-accent)}

/* Footer bottom bar — copyright + legal links */
.footer-bottom{
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:0.75rem;
  padding-top:1.5rem;
  margin-top:1rem;
  border-top:1px solid rgba(255,255,255,.08);
}
.footer-bottom p{margin:0;font-size:0.8rem;opacity:.7}
.footer-legal{display:flex;gap:1.25rem}
.footer-legal a{font-size:0.8rem;opacity:.6;transition:opacity .15s}
.footer-legal a:hover{opacity:1}
/* Light footer bottom overrides */
.footer--minimal .footer-bottom,
.footer--legal .footer-bottom{border-top-color:var(--color-border)}
.footer--minimal .footer-bottom p,
.footer--legal .footer-bottom p{color:var(--color-text-muted)}
.footer--minimal .footer-legal a,
.footer--legal .footer-legal a{color:var(--color-text-muted)}

/* Cookie consent bar */
.cookie-consent{
  position:fixed;
  bottom:0;
  left:0;
  right:0;
  background:var(--color-primary,#1e293b);
  color:rgba(255,255,255,.85);
  padding:0.75rem 1.5rem;
  font-size:0.8rem;
  z-index:9999;
  display:flex;
  align-items:center;
  justify-content:center;
  box-shadow:0 -2px 12px rgba(0,0,0,.15);
}
.cookie-consent p{margin:0;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;justify-content:center}
.cookie-consent a{color:var(--color-accent,#60a5fa);text-decoration:underline}
.cookie-ok{background:transparent;border:1px solid rgba(255,255,255,.3);color:#fff;padding:0.25rem 0.75rem;border-radius:var(--radius-sm,.25rem);font-size:0.8rem;font-weight:600;cursor:pointer;transition:background .15s}
.cookie-ok:hover{background:rgba(255,255,255,.15)}

@media(max-width:640px){
  .footer-bottom{flex-direction:column;text-align:center}
  .footer-legal{justify-content:center}
  .footer-columns{grid-template-columns:1fr 1fr !important}
}
@media(max-width:400px){.footer-columns{grid-template-columns:1fr !important}}

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

/* Generous section spacing — premium sites use 4-6rem between sections */
section + section{margin-top:calc(var(--spacing-unit,1.6rem) * 2.5)}

/* Content sections get ample breathing room */
.faq-section,
.trust-badges,
.data-sources,
.author-bio,
.checklist-section,
.pricing-section{
  padding:3.5rem 0;
}

/* Constrain text content for readability (like MoneyWell/NerdWallet) */
.article-body .site-container,
.faq-section .site-container{
  max-width:800px;
}

/* CTA buttons global polish — bold, confident, MoneyWell-style */
.cta-button{
  display:inline-flex;
  align-items:center;
  gap:0.5rem;
  background:var(--color-accent);
  color:#fff;
  padding:0.875rem 2.25rem;
  border-radius:var(--radius-md,.5rem);
  text-decoration:none;
  font-size:1rem;
  font-weight:700;
  letter-spacing:0.01em;
  transition:transform 0.15s,box-shadow 0.2s,background 0.15s;
  box-shadow:0 2px 8px rgba(0,0,0,.08);
}
.cta-button::after{content:'→';font-size:1.1em;transition:transform .15s}
.cta-button:hover{
  transform:translateY(-2px);
  box-shadow:0 6px 20px rgba(0,0,0,.12);
  color:#fff;
}
.cta-button:hover::after{transform:translateX(3px)}

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
  align-items:flex-start;
  gap:1.25rem;
  transition:box-shadow .15s;
}
.pdf-download:hover{box-shadow:var(--shadow-sm)}
.pdf-icon{font-size:2rem;flex-shrink:0;line-height:1}
.pdf-content{flex:1;min-width:0}
.pdf-desc{font-size:0.9rem;color:var(--color-text-muted);margin:0 0 0.75rem;line-height:1.5}
.pdf-btn-icon{margin-right:0.25rem}
.pdf-download h3{font-size:1rem;margin-bottom:0.25rem}
.pdf-download p{font-size:0.9rem;color:var(--color-text-muted);margin:0}

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
  background:var(--color-bg,#fff);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.5rem;
  margin:1.5rem 0;
  transition:box-shadow .15s,transform .15s;
}
.review-card:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px)}
.review-card-header{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-bottom:0.5rem}
.review-card h3{font-size:1.15rem;margin:0}
.review-badge{display:inline-block;background:var(--color-success,#22c55e);color:#fff;padding:0.15rem 0.6rem;border-radius:var(--radius-full,999px);font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em}
.review-rating{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem}
.review-stars{color:var(--color-warning,#f59e0b);font-size:0.9rem;letter-spacing:0.03em}
.review-score{font-size:0.85rem;font-weight:600;color:var(--color-text-muted,#64748b)}
.review-summary{color:var(--color-text-muted);font-size:0.9rem;margin-bottom:1rem;line-height:1.6}
.review-cta{display:inline-block;margin-top:0.5rem}
.pros-cons{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:1rem 0}
.pros-cons .pros,.pros-cons .cons{padding:0}
.pros-heading{font-size:0.85rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;color:var(--color-success,#22c55e)}
.cons-heading{font-size:0.85rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;color:var(--color-error,#ef4444)}
.pros-cons h4{font-size:0.85rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem}
.pros-cons .pros h4{color:var(--color-success)}
.pros-cons .cons h4{color:var(--color-error)}
.pros-cons ul{list-style:none;padding:0;margin:0}
.pros-cons li{padding:0.35rem 0;font-size:0.88rem;color:var(--color-text-muted);display:flex;align-items:flex-start;gap:0.375rem}
.pro-icon{color:var(--color-success,#22c55e);font-weight:700;flex-shrink:0}
.con-icon{color:var(--color-error,#ef4444);font-weight:700;flex-shrink:0}
@media(max-width:640px){.pros-cons{grid-template-columns:1fr}}

/* ================================================================
   VS GRID (from VsCard renderer)
   ================================================================ */

.vs-card{margin:2rem 0}
.vs-grid{
  display:grid;
  grid-template-columns:1fr auto 1fr;
  gap:1.5rem;
  align-items:start;
}
.vs-side{background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);padding:1.5rem;transition:box-shadow .15s}
.vs-side:hover{box-shadow:var(--shadow-sm)}
.vs-side--winner{border-color:var(--color-success,#22c55e);border-width:2px}
.vs-side-header{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.5rem}
.vs-side h3{font-size:1.1rem;margin:0}
.vs-winner-badge{display:inline-block;background:var(--color-success,#22c55e);color:#fff;padding:0.15rem 0.6rem;border-radius:var(--radius-full,999px);font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em}
.vs-rating{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem}
.vs-stars{color:var(--color-warning,#f59e0b);font-size:0.85rem;letter-spacing:0.03em}
.vs-score{font-size:0.82rem;font-weight:600;color:var(--color-text-muted,#64748b)}
.vs-side p{color:var(--color-text-muted);font-size:0.9rem;margin-bottom:0.75rem;line-height:1.5}
.vs-section{margin-bottom:0.75rem}
.vs-section-label{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.375rem}
.vs-section-pros{color:var(--color-success,#22c55e)}
.vs-section-cons{color:var(--color-error,#ef4444)}
.vs-pros,.vs-cons{list-style:none;padding:0;margin:0}
.vs-pros li,.vs-cons li{padding:0.25rem 0;font-size:0.88rem;color:var(--color-text-muted);display:flex;align-items:flex-start;gap:0.375rem}
.vs-cta{display:inline-block;margin-top:0.75rem;font-size:0.85rem;padding:0.5rem 1.25rem}
.vs-divider{display:flex;align-items:center;justify-content:center}
.vs-divider span{display:flex;align-items:center;justify-content:center;width:3rem;height:3rem;border-radius:var(--radius-full,999px);background:var(--color-primary,#1e293b);color:#fff;font-weight:800;font-size:0.9rem;letter-spacing:0.02em}
@media(max-width:640px){
  .vs-grid{grid-template-columns:1fr}
  .vs-divider{padding:0.5rem 0}
  .vs-divider span{width:2.5rem;height:2.5rem;font-size:0.8rem}
}

/* ================================================================
   TESTIMONIAL SECTION (from TestimonialGrid renderer)
   ================================================================ */

.testimonial-section{margin:2rem 0;padding:2rem 0}
.testimonial-section .section-heading{text-align:center;font-size:clamp(1.5rem,3vw,2rem);margin-bottom:2rem}
.testimonial-rating{color:var(--color-warning,#f59e0b);font-size:0.9rem;margin-bottom:0.5rem;letter-spacing:0.05em}
.testimonial-card blockquote,.testimonial-quote{
  font-style:italic;
  color:var(--color-text);
  line-height:1.6;
  margin:0 0 1rem;
  font-size:0.95rem;
  border:none;
  padding:0;
  background:none;
  position:relative;
}
.testimonial-mark{font-size:3rem;color:var(--color-accent,#2563eb);opacity:0.15;font-family:Georgia,serif;line-height:0.8;vertical-align:text-top;margin-right:0.15rem;display:inline-block;transform:translateY(0.1em)}
.testimonial-author{display:flex;align-items:center;gap:0.75rem;margin-top:auto}
.testimonial-avatar{width:2.5rem;height:2.5rem;border-radius:var(--radius-full,999px);background:var(--color-accent,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0}
.testimonial-info{display:flex;flex-direction:column}
.testimonial-card cite{
  display:inline;
  font-style:normal;
  font-weight:600;
  color:var(--color-text);
  font-size:0.9rem;
}
.testimonial-verified{display:inline-flex;align-items:center;justify-content:center;width:1.1rem;height:1.1rem;border-radius:var(--radius-full,999px);background:var(--color-success,#22c55e);color:#fff;font-size:0.6rem;font-weight:700;margin-left:0.25rem;vertical-align:middle}
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
.pricing-section .section-heading{text-align:center;font-size:clamp(1.5rem,3vw,2rem);margin-bottom:0.5rem}
.pricing-section .section-subheading{text-align:center;color:var(--color-text-muted);font-size:1rem;margin-bottom:2rem;max-width:600px;margin-left:auto;margin-right:auto}
.pricing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.5rem;align-items:start;margin:2rem 0}
.pricing-card h3{font-size:1.15rem;margin-bottom:0.5rem}
.pricing-price{font-size:2.25rem;font-weight:800;color:var(--color-accent);margin-bottom:0.25rem}
.pricing-period{font-size:0.9rem;font-weight:400;color:var(--color-text-muted)}
.pricing-desc{color:var(--color-text-muted);font-size:0.88rem;margin:0.5rem 0 1rem;line-height:1.5}
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
  color:var(--color-text);
  display:flex;
  align-items:flex-start;
  gap:0.5rem;
}
.pricing-card .pricing-features li:last-child{border-bottom:none}
.pricing-check{font-weight:700;color:var(--color-success,#22c55e);flex-shrink:0}
.pricing-feature--excluded{opacity:0.5}
.pricing-feature--excluded .pricing-check{color:var(--color-text-muted,#94a3b8)}
.pricing-cta{width:100%;text-align:center;margin-top:auto;display:block}
.pricing-highlighted .pricing-cta{background:var(--color-accent);color:#fff}

/* ================================================================
   RANKING SECTION (from RankingList renderer)
   ================================================================ */

.ranking-section{margin:2rem 0;padding:2rem 0}
.ranking-list{list-style:none;padding:0;margin:1.5rem 0}
.ranking-item{display:flex;align-items:flex-start;gap:1.25rem;padding:1.25rem 1.5rem;background:var(--color-bg,#fff);border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-lg,.75rem);margin-bottom:1rem;transition:box-shadow .15s,transform .15s}
.ranking-item:hover{box-shadow:var(--shadow-sm);transform:translateY(-1px)}
.ranking-number{display:flex;align-items:center;justify-content:center;width:2.5rem;height:2.5rem;border-radius:var(--radius-full,999px);background:var(--color-bg-surface,#f1f5f9);color:var(--color-text-muted,#64748b);font-weight:800;font-size:1rem;flex-shrink:0}
.ranking-gold .ranking-number{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff}
.ranking-silver .ranking-number{background:linear-gradient(135deg,#cbd5e1,#94a3b8);color:#fff}
.ranking-bronze .ranking-number{background:linear-gradient(135deg,#d97706,#b45309);color:#fff}
.ranking-gold{border-left:3px solid #f59e0b}
.ranking-silver{border-left:3px solid #94a3b8}
.ranking-bronze{border-left:3px solid #b45309}
.ranking-content{flex:1;min-width:0}
.ranking-header{display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.375rem}
.ranking-header h3{margin:0;font-size:1.1rem}
.ranking-badge{display:inline-block;background:var(--color-success,#22c55e);color:#fff;padding:0.125rem 0.5rem;border-radius:var(--radius-full,999px);font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em}
.ranking-rating{display:flex;align-items:center;gap:0.5rem;margin-bottom:0.375rem}
.ranking-stars{color:var(--color-warning,#f59e0b);font-size:0.85rem;letter-spacing:0.03em}
.ranking-score-text{font-size:0.82rem;font-weight:600;color:var(--color-text-muted,#64748b)}
.ranking-score-bar{height:6px;background:var(--color-bg-surface,#e2e8f0);border-radius:999px;overflow:hidden;margin-bottom:0.5rem}
.ranking-score-fill{height:100%;background:linear-gradient(90deg,var(--color-accent,#2563eb),var(--color-success,#22c55e));border-radius:999px;transition:width .6s ease}
.ranking-content p{margin:0 0 0.5rem;color:var(--color-text-muted,#64748b);font-size:0.9rem;line-height:1.5}
.ranking-cta{padding:0.5rem 1.25rem;font-size:0.85rem}
@media(max-width:640px){.ranking-item{flex-direction:column;gap:0.75rem}.ranking-number{width:2rem;height:2rem;font-size:0.85rem}}

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

/* ================================================================
   GLASSMORPHISM HERO VARIANT
   ================================================================ */

.hero--glass{
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent,var(--color-primary-hover)));
  color:#fff;
  padding:5rem 2rem;
  position:relative;
  overflow:hidden;
}
.hero--glass::before{
  content:'';
  position:absolute;
  top:-50%;left:-50%;
  width:200%;height:200%;
  background:radial-gradient(ellipse at 30% 50%,rgba(255,255,255,.12) 0%,transparent 60%),
             radial-gradient(ellipse at 80% 20%,rgba(255,255,255,.08) 0%,transparent 50%);
  pointer-events:none;
}
.hero--glass h1{color:#fff}
.hero--glass .hero-sub{color:rgba(255,255,255,.8)}
.hero--glass .hero-badge{background:rgba(255,255,255,.12);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15)}
.hero--glass .hero-cta{background:rgba(255,255,255,.15);color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2)}
.hero--glass .hero-cta:hover{background:rgba(255,255,255,.25);color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.2)}

/* Glassmorphism utility for any card */
.glass-card{
  background:rgba(255,255,255,.06);
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.1);
  border-radius:var(--radius-lg,.75rem);
}

/* ================================================================
   TYPING EFFECT HERO VARIANT (CSS-only)
   ================================================================ */

.hero--typing h1{
  overflow:hidden;
  white-space:nowrap;
  border-right:3px solid var(--color-accent,#2563eb);
  width:0;
  animation:typewriter 2s steps(30) 0.5s forwards,blink-caret .5s step-end infinite;
}
@keyframes typewriter{
  from{width:0}
  to{width:100%}
}
@keyframes blink-caret{
  50%{border-color:transparent}
}
@media(prefers-reduced-motion:reduce){
  .hero--typing h1{width:100%;animation:none;border-right:none;white-space:normal}
}

/* ================================================================
   STATS-BAR HERO VARIANT (structural — stat counters)
   ================================================================ */

.hero--stats-bar{
  background:var(--color-hero-bg,var(--color-bg-surface));
  color:var(--color-hero-text,var(--color-text));
  padding:5rem 2rem 3rem;
  text-align:center;
}
.hero--stats-bar h1{max-width:800px;margin-left:auto;margin-right:auto;color:var(--color-hero-text,var(--color-text))}
.hero--stats-bar .hero-sub{max-width:560px;margin-left:auto;margin-right:auto;opacity:0.85;font-size:1.15rem;line-height:1.6}
.hero--stats-bar .hero-cta--large{padding:1rem 3rem;font-size:1.1rem}
.hero-stats-bar{
  display:flex;
  justify-content:center;
  gap:3rem;
  margin-top:2rem;
  padding:1.5rem 0;
  border-top:1px solid var(--color-border,#e2e8f0);
  border-bottom:1px solid var(--color-border,#e2e8f0);
}
.hero-stat{display:flex;flex-direction:column;align-items:center}
.hero-stat-value{font-size:2rem;font-weight:800;color:var(--color-accent);line-height:1.2}
.hero-stat-label{font-size:0.8rem;font-weight:500;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-top:0.25rem}
@media(max-width:768px){
  .hero-stats-bar{flex-wrap:wrap;gap:1.5rem}
  .hero-stat-value{font-size:1.5rem}
}

/* ================================================================
   SEARCH HERO VARIANT (structural — search bar)
   ================================================================ */

.hero--search{
  background:var(--color-hero-bg,var(--color-bg-surface));
  color:var(--color-hero-text,var(--color-text));
  padding:5rem 2rem 4rem;
  text-align:center;
}
.hero--search h1{max-width:700px;margin-left:auto;margin-right:auto;color:var(--color-hero-text,var(--color-text))}
.hero--search .hero-sub{max-width:520px;margin-left:auto;margin-right:auto;opacity:0.85}
.hero-search-form{
  display:flex;
  max-width:540px;
  margin:2rem auto 0;
  border-radius:var(--radius-lg,.75rem);
  overflow:hidden;
  box-shadow:0 4px 16px rgba(0,0,0,.08);
}
.hero-search-input{
  flex:1;
  padding:1rem 1.5rem;
  border:2px solid var(--color-border,#e2e8f0);
  border-right:none;
  font-size:1rem;
  border-radius:var(--radius-lg,.75rem) 0 0 var(--radius-lg,.75rem);
  outline:none;
}
.hero-search-input:focus{border-color:var(--color-accent)}
.hero-search-btn{
  padding:1rem 2rem;
  background:var(--color-accent);
  color:#fff;
  border:none;
  font-weight:600;
  font-size:1rem;
  cursor:pointer;
  border-radius:0 var(--radius-lg,.75rem) var(--radius-lg,.75rem) 0;
}
.hero-search-btn:hover{opacity:0.9}

/* ================================================================
   SINGLE-CTA HERO VARIANT (structural — one large CTA)
   ================================================================ */

.hero--single-cta{
  background:var(--color-bg);
  padding:4rem 2rem 3rem;
  text-align:center;
}
.hero--single-cta h1{max-width:700px;margin-left:auto;margin-right:auto;color:var(--color-text)}
.hero--single-cta .hero-sub{max-width:500px;margin-left:auto;margin-right:auto;color:var(--color-text-muted)}
.hero-cta--jumbo{
  display:inline-block;
  margin-top:2rem;
  padding:1.25rem 4rem;
  font-size:1.2rem;
  font-weight:700;
  border-radius:var(--radius-lg,.75rem);
  box-shadow:0 4px 20px rgba(0,0,0,.12);
}
.hero-cta--jumbo:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.18)}

/* ================================================================
   CLICK-TO-CALL HERO VARIANT (structural — phone-first for local services)
   ================================================================ */

.hero--click-to-call{
  background:var(--color-hero-bg,var(--color-bg-surface));
  color:var(--color-hero-text,var(--color-text));
  padding:4rem 2rem 3rem;
  text-align:center;
}
.hero--click-to-call h1{max-width:700px;margin-left:auto;margin-right:auto;color:var(--color-hero-text,var(--color-text))}
.hero--click-to-call .hero-sub{max-width:520px;margin-left:auto;margin-right:auto;opacity:0.85}
.hero-phone-row{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:0.5rem;
  margin:2rem 0;
}
.hero-phone-link{
  font-size:2.5rem;
  font-weight:800;
  letter-spacing:-0.02em;
  color:var(--color-accent);
  text-decoration:none;
  transition:transform 0.15s;
}
.hero-phone-link:hover{transform:scale(1.05)}
.hero-phone-label{font-size:0.9rem;opacity:0.7;font-weight:500}
@media(max-width:600px){.hero-phone-link{font-size:1.8rem}}

/* ================================================================
   MINIMAL TEXT HERO VARIANT (structural — text only, no CTAs/stars)
   ================================================================ */

.hero--minimal-text{
  background:var(--color-bg);
  padding:3rem 2rem 2rem;
}
.hero--minimal-text h1{max-width:800px;color:var(--color-text);font-size:2.2rem}
.hero--minimal-text .hero-sub--large{max-width:640px;font-size:1.2rem;line-height:1.6;color:var(--color-text-muted)}

/* ================================================================
   SVG PROGRESS RING (StatGrid)
   ================================================================ */

.stat-ring-wrap{
  position:relative;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  margin-bottom:0.75rem;
}
.stat-ring{display:block}
.stat-ring-fill{
  transition:stroke-dashoffset 1s ease;
}
.stat-ring-value{
  position:absolute;
  font-size:1.1rem;
  font-weight:800;
  color:var(--color-accent,#2563eb);
}

/* ================================================================
   CATEGORY SIDEBAR (OmniCalculator-style)
   ================================================================ */

.sidebar--categories{
  background:var(--color-bg);
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-lg,.75rem);
  padding:1.25rem;
  position:sticky;
  top:5rem;
  max-height:calc(100vh - 6rem);
  overflow-y:auto;
}
.sidebar-heading{
  font-size:1rem;
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:0.04em;
  margin:0 0 1rem;
  padding-bottom:0.75rem;
  border-bottom:2px solid var(--color-border);
  color:var(--color-text);
}
.sidebar-search{margin-bottom:1rem}
.sidebar-search-input{
  width:100%;
  padding:0.5rem 0.75rem;
  border:var(--border-width,1px) solid var(--color-border);
  border-radius:var(--radius-md,.375rem);
  font-size:0.85rem;
  background:var(--color-bg-surface);
  color:var(--color-text);
  transition:border-color .15s;
}
.sidebar-search-input:focus{border-color:var(--color-accent);outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--color-accent) 15%,transparent)}
.sidebar-cat-nav{display:flex;flex-direction:column;gap:0.125rem}
.sidebar-cat{
  display:flex;
  align-items:center;
  gap:0.75rem;
  padding:0.5rem 0.75rem;
  border-radius:var(--radius-md,.375rem);
  text-decoration:none;
  color:var(--color-text);
  font-size:0.9rem;
  font-weight:500;
  transition:background .12s,color .12s;
}
.sidebar-cat:hover{background:var(--color-bg-surface);color:var(--color-accent)}
.sidebar-cat--active{background:color-mix(in srgb,var(--color-accent) 10%,var(--color-bg));color:var(--color-accent);font-weight:700}
.sidebar-cat-icon{font-size:1.15rem;width:1.5rem;text-align:center;flex-shrink:0}
.sidebar-cat-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* Embed widget */
.embed-widget{margin:2rem 0}
.embed-title{font-size:1.1rem;margin-bottom:0.75rem;font-weight:600}
.embed-container{margin:0 auto;overflow:hidden;border-radius:var(--radius-md,.5rem);border:var(--border-width,1px) solid var(--color-border);background:var(--color-bg-surface)}
.embed-placeholder{padding:2rem;text-align:center;color:var(--color-text-muted);font-size:0.9rem}

/* Layout: sidebar + main content side by side */
[data-block-type="Sidebar"]+[data-block-type]{margin-left:0}
.has-sidebar .site-container>main{display:grid;grid-template-columns:260px 1fr;gap:2rem;align-items:start}
/* Full-width blocks span both columns in sidebar layouts */
.has-sidebar .site-container>main>[data-block-type="Hero"],
.has-sidebar .site-container>main>[data-block-type="Header"],
.has-sidebar .site-container>main>[data-block-type="Footer"],
.has-sidebar .site-container>main>[data-block-type="CTABanner"],
.has-sidebar .site-container>main>[data-block-type="LastUpdated"]{grid-column:1/-1}
@media(max-width:768px){
  .sidebar--categories{position:static;max-height:none}
  .has-sidebar .site-container>main{grid-template-columns:1fr}
}

/* ================================================================
   MAGAZINE THEME OVERRIDES
   ================================================================ */

[data-theme="magazine"] .article-body p:first-of-type::first-letter{
  float:left;
  font-size:3.5em;
  line-height:0.8;
  font-weight:700;
  font-family:var(--font-heading);
  color:var(--color-accent);
  margin:0.05em 0.15em 0 0;
  padding-top:0.05em;
}
[data-theme="magazine"] blockquote{
  font-family:var(--font-heading);
  font-size:1.35rem;
  font-style:italic;
  text-align:center;
  border-left:none;
  border-top:2px solid var(--color-accent);
  border-bottom:2px solid var(--color-accent);
  padding:1.5rem 2rem;
  margin:2.5rem auto;
  max-width:600px;
  color:var(--color-text);
  background:none;
  line-height:1.5;
}
[data-theme="magazine"] .hero--centered h1{
  font-size:clamp(2.5rem,6vw,4rem);
  letter-spacing:-0.04em;
  font-weight:900;
}
[data-theme="magazine"] .hero--centered .hero-sub{
  font-style:italic;
  font-size:1.3rem;
  font-family:var(--font-heading);
  opacity:0.8;
}
[data-theme="magazine"] article h2{
  border-left:none;
  padding-left:0;
  text-align:center;
  font-style:italic;
  font-weight:400;
  font-size:clamp(1.5rem,3vw,2rem);
}
[data-theme="magazine"] article h2::after{
  content:'';
  display:block;
  width:40px;
  height:2px;
  background:var(--color-accent);
  margin:0.75rem auto 0;
}
[data-theme="magazine"] article hr{
  border:none;
  height:auto;
  text-align:center;
  background:none;
  margin:3rem 0;
}
[data-theme="magazine"] article hr::after{
  content:'◆ ◆ ◆';
  color:var(--color-text-muted);
  font-size:0.75rem;
  letter-spacing:0.5em;
}

/* ================================================================
   BRUTALIST THEME OVERRIDES
   ================================================================ */

[data-theme="brutalist"] *{border-radius:0!important}
[data-theme="brutalist"] h1,[data-theme="brutalist"] h2,[data-theme="brutalist"] h3,[data-theme="brutalist"] h4{
  text-transform:uppercase;
  letter-spacing:0.05em;
}
[data-theme="brutalist"] .hero--centered,
[data-theme="brutalist"] .hero--split,
[data-theme="brutalist"] .hero--minimal{
  background:var(--color-primary);
  color:var(--color-badge-text,#fff);
  border-bottom:var(--border-width) solid var(--color-text);
}
[data-theme="brutalist"] .hero--centered h1,
[data-theme="brutalist"] .hero--split h1,
[data-theme="brutalist"] .hero--minimal h1{color:inherit}
[data-theme="brutalist"] .hero--centered .hero-sub,
[data-theme="brutalist"] .hero--split .hero-sub{color:inherit;opacity:0.85}
[data-theme="brutalist"] .hero--gradient{
  background:var(--color-primary);
  background-size:auto;
}
[data-theme="brutalist"] .hero-cta{
  border:var(--border-width) solid currentColor;
  background:transparent;
  color:inherit;
}
[data-theme="brutalist"] .hero-cta:hover{
  background:var(--color-bg);
  color:var(--color-primary);
  transform:none;
  box-shadow:none;
}
[data-theme="brutalist"] .review-card,
[data-theme="brutalist"] .pricing-card,
[data-theme="brutalist"] .testimonial-card,
[data-theme="brutalist"] .ranking-item,
[data-theme="brutalist"] .faq-item,
[data-theme="brutalist"] .factor-card,
[data-theme="brutalist"] .cost-range,
[data-theme="brutalist"] .vs-side,
[data-theme="brutalist"] .calc-form,
[data-theme="brutalist"] .lead-form{
  border:var(--border-width) solid var(--color-text);
  box-shadow:none;
  transition:none;
}
[data-theme="brutalist"] .review-card:hover,
[data-theme="brutalist"] .pricing-card:hover,
[data-theme="brutalist"] .testimonial-card:hover,
[data-theme="brutalist"] .ranking-item:hover{
  transform:none;
  box-shadow:none;
}
[data-theme="brutalist"] a:hover{text-decoration:underline}
[data-theme="brutalist"] .cta-button,
[data-theme="brutalist"] .hero-cta--secondary{
  border:var(--border-width) solid currentColor;
  transition:none;
}
[data-theme="brutalist"] .cta-button:hover{transform:none;box-shadow:none}
[data-theme="brutalist"] .cta-button::after{content:none}
[data-theme="brutalist"] .footer--multi-column{border-top:var(--border-width) solid var(--color-text)}
[data-theme="brutalist"] .header--topbar{border-bottom:var(--border-width) solid var(--color-text)}
[data-theme="brutalist"] article h2{border-left:var(--border-width) solid var(--color-text)}

/* ================================================================
   GLASS THEME OVERRIDES
   ================================================================ */

[data-theme="glass"] .hero--glass,
[data-theme="glass"] .hero--gradient{
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent,var(--color-primary-hover)),var(--color-secondary,var(--color-primary)));
  position:relative;
}
[data-theme="glass"] .hero--glass::before,
[data-theme="glass"] .hero--gradient::before{
  content:'';
  position:absolute;
  inset:0;
  background:
    radial-gradient(ellipse at 20% 50%,rgba(255,255,255,0.15) 0%,transparent 50%),
    radial-gradient(ellipse at 80% 20%,rgba(255,255,255,0.1) 0%,transparent 40%),
    radial-gradient(ellipse at 50% 80%,rgba(255,255,255,0.08) 0%,transparent 45%);
  pointer-events:none;
}
[data-theme="glass"] .review-card,
[data-theme="glass"] .pricing-card,
[data-theme="glass"] .testimonial-card,
[data-theme="glass"] .vs-side,
[data-theme="glass"] .calc-form,
[data-theme="glass"] .lead-form,
[data-theme="glass"] .faq-item{
  background:rgba(255,255,255,0.6);
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,0.3);
}
@media(prefers-color-scheme:dark){
  [data-theme="glass"] .review-card,
  [data-theme="glass"] .pricing-card,
  [data-theme="glass"] .testimonial-card,
  [data-theme="glass"] .vs-side,
  [data-theme="glass"] .calc-form,
  [data-theme="glass"] .lead-form,
  [data-theme="glass"] .faq-item{
    background:rgba(30,41,59,0.5);
    border:1px solid rgba(255,255,255,0.08);
  }
}
[data-theme="glass"] .hero-cta{
  background:rgba(255,255,255,0.15);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,0.2);
  color:#fff;
}
[data-theme="glass"] .hero-cta:hover{
  background:rgba(255,255,255,0.25);
  color:#fff;
}
[data-theme="glass"] .hero-badge{
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  background:rgba(255,255,255,0.12);
  border:1px solid rgba(255,255,255,0.15);
}
[data-theme="glass"] .header--minimal,
[data-theme="glass"] .header--centered{
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
  background:rgba(255,255,255,0.7);
}
@media(prefers-color-scheme:dark){
  [data-theme="glass"] .header--minimal,
  [data-theme="glass"] .header--centered{
    background:rgba(15,23,42,0.7);
  }
}

/* ================================================================
   RETRO THEME OVERRIDES
   ================================================================ */

[data-theme="retro"] .hero{
  position:relative;
  overflow:hidden;
}
[data-theme="retro"] .hero::after{
  content:'';
  position:absolute;
  bottom:-2px;
  left:0;
  right:0;
  height:40px;
  background:var(--color-bg,#fff);
  mask-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 1200 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40V15c100-20 200 10 300 5s200-25 300-5 200 25 300 5 200-20 300-5v25z' fill='%23fff'/%3E%3C/svg%3E");
  -webkit-mask-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 1200 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40V15c100-20 200 10 300 5s200-25 300-5 200 25 300 5 200-20 300-5v25z' fill='%23fff'/%3E%3C/svg%3E");
  mask-size:100% 100%;
  -webkit-mask-size:100% 100%;
  z-index:2;
  pointer-events:none;
  opacity:1;
  background-image:none;
  background-size:auto;
  background-position:initial;
}
[data-theme="retro"] .review-card:hover,
[data-theme="retro"] .pricing-card:hover,
[data-theme="retro"] .testimonial-card:hover,
[data-theme="retro"] .ranking-item:hover,
[data-theme="retro"] .resource-card:hover,
[data-theme="retro"] .article-card:hover{
  transform:translateY(-4px) rotate(-0.5deg);
}
[data-theme="retro"] .cta-button:hover,
[data-theme="retro"] .hero-cta:hover{
  transform:translateY(-3px) rotate(0.5deg);
}
[data-theme="retro"] .hero-badge{
  background:var(--color-accent);
  color:#fff;
  font-weight:800;
  letter-spacing:0.03em;
}
[data-theme="retro"] .trust-badge{
  border-width:2px;
  border-style:dashed;
}
[data-theme="retro"] .faq-item{
  border-width:2px;
  border-style:solid;
}
[data-theme="retro"] article h2{
  border-left:4px solid var(--color-accent);
  border-left-style:dashed;
}
[data-theme="retro"] section:nth-child(even){
  background-image:radial-gradient(circle,var(--color-border) 1px,transparent 1px);
  background-size:20px 20px;
}
[data-theme="retro"] .footer--multi-column,
[data-theme="retro"] .footer--newsletter{
  border-top:3px dashed var(--color-accent);
}

/* ================================================================
   CORPORATE THEME OVERRIDES
   ================================================================ */

[data-theme="corporate"] .hero{
  border-bottom:1px solid var(--color-border);
}
[data-theme="corporate"] .hero-badge{
  background:var(--color-bg-surface);
  color:var(--color-text);
  border:1px solid var(--color-border);
  font-weight:600;
  text-transform:uppercase;
  font-size:0.7rem;
  letter-spacing:0.08em;
}
[data-theme="corporate"] .review-card,
[data-theme="corporate"] .pricing-card,
[data-theme="corporate"] .testimonial-card{
  border:1px solid var(--color-border);
  box-shadow:none;
}
[data-theme="corporate"] .review-card:hover,
[data-theme="corporate"] .pricing-card:hover,
[data-theme="corporate"] .testimonial-card:hover{
  box-shadow:var(--shadow-sm);
  transform:none;
}
[data-theme="corporate"] .cta-button{
  text-transform:uppercase;
  letter-spacing:0.04em;
  font-weight:700;
  border-radius:var(--radius-sm);
}
[data-theme="corporate"] .pricing-highlighted{
  border-color:var(--color-primary);
  border-width:2px;
}
[data-theme="corporate"] .stat-card{
  border-left:3px solid var(--color-primary);
  border-radius:0;
}
[data-theme="corporate"] .ranking-number{
  border-radius:var(--radius-sm);
}
[data-theme="corporate"] .faq-item{
  border:1px solid var(--color-border);
  border-radius:var(--radius-sm);
}
[data-theme="corporate"] .footer--multi-column{
  border-top:2px solid var(--color-primary);
}
[data-theme="corporate"] article h2{
  border-bottom:1px solid var(--color-border);
  padding-bottom:0.5rem;
}

/* ================================================================
   CRAFT THEME OVERRIDES
   ================================================================ */

[data-theme="craft"] .hero{
  position:relative;
}
[data-theme="craft"] .hero-badge{
  background:var(--color-accent);
  color:#fff;
  border-radius:var(--radius-full);
  font-weight:700;
}
[data-theme="craft"] .review-card,
[data-theme="craft"] .pricing-card,
[data-theme="craft"] .testimonial-card,
[data-theme="craft"] .ranking-item{
  border:1px solid var(--color-border);
  box-shadow:2px 3px 0 var(--color-border);
}
[data-theme="craft"] .review-card:hover,
[data-theme="craft"] .pricing-card:hover,
[data-theme="craft"] .testimonial-card:hover,
[data-theme="craft"] .ranking-item:hover{
  box-shadow:3px 4px 0 var(--color-border-strong);
  transform:translate(-1px,-1px);
}
[data-theme="craft"] .cta-button{
  border:2px solid currentColor;
  box-shadow:2px 2px 0 currentColor;
}
[data-theme="craft"] .cta-button:hover{
  box-shadow:3px 3px 0 currentColor;
  transform:translate(-1px,-1px);
}
[data-theme="craft"] .stat-card{
  background:var(--color-bg-surface);
  border:1px solid var(--color-border);
}
[data-theme="craft"] .faq-item{
  border:1px solid var(--color-border);
  border-left:3px solid var(--color-accent);
}
[data-theme="craft"] .lead-form,
[data-theme="craft"] .calc-form{
  border:1px solid var(--color-border);
  box-shadow:3px 3px 0 var(--color-border);
}
[data-theme="craft"] section:nth-child(odd){
  background-image:url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='0.6' fill='%23cdc0aa' opacity='0.3'/%3E%3C/svg%3E");
}
[data-theme="craft"] .footer--multi-column{
  border-top:2px solid var(--color-accent);
}

/* ================================================================
   ACADEMIC THEME OVERRIDES
   ================================================================ */

[data-theme="academic"] .hero{
  border-bottom:2px solid var(--color-text);
  padding-bottom:2rem;
}
[data-theme="academic"] .hero h1{
  font-weight:800;
  letter-spacing:-0.01em;
}
[data-theme="academic"] .hero-badge{
  background:var(--color-text);
  color:var(--color-bg);
  font-size:0.65rem;
  text-transform:uppercase;
  letter-spacing:0.1em;
  border-radius:0;
}
[data-theme="academic"] .review-card,
[data-theme="academic"] .pricing-card,
[data-theme="academic"] .testimonial-card{
  border:1px solid var(--color-border);
  border-radius:0;
  box-shadow:none;
}
[data-theme="academic"] .review-card:hover,
[data-theme="academic"] .pricing-card:hover,
[data-theme="academic"] .testimonial-card:hover{
  transform:none;
  border-color:var(--color-text);
}
[data-theme="academic"] .cta-button{
  border-radius:0;
  text-transform:uppercase;
  font-size:0.85rem;
  letter-spacing:0.06em;
}
[data-theme="academic"] .ranking-number{
  border-radius:0;
  font-family:var(--font-mono);
}
[data-theme="academic"] .stat-card{
  border-top:2px solid var(--color-text);
  border-radius:0;
}
[data-theme="academic"] .faq-item{
  border-bottom:1px solid var(--color-border);
  border-radius:0;
}
[data-theme="academic"] .data-table th{
  text-transform:uppercase;
  font-size:0.75rem;
  letter-spacing:0.06em;
}
[data-theme="academic"] article h2{
  font-weight:800;
  border-bottom:2px solid var(--color-text);
  padding-bottom:0.25rem;
  margin-bottom:1rem;
}
[data-theme="academic"] .toc{
  border:1px solid var(--color-border);
  border-radius:0;
}
[data-theme="academic"] .footer--multi-column{
  border-top:2px solid var(--color-text);
}

/* ================================================================
   STARTUP THEME OVERRIDES
   ================================================================ */

[data-theme="startup"] .hero{
  padding:5rem 2rem;
}
[data-theme="startup"] .hero h1{
  font-size:clamp(2rem,5vw,3.2rem);
  font-weight:800;
  letter-spacing:-0.02em;
  line-height:1.15;
}
[data-theme="startup"] .hero-badge{
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent));
  color:#fff;
  font-weight:700;
  border-radius:var(--radius-full);
}
[data-theme="startup"] .review-card,
[data-theme="startup"] .pricing-card,
[data-theme="startup"] .testimonial-card{
  border:1px solid var(--color-border);
  transition:all 0.2s ease;
}
[data-theme="startup"] .review-card:hover,
[data-theme="startup"] .pricing-card:hover,
[data-theme="startup"] .testimonial-card:hover{
  border-color:var(--color-primary);
  box-shadow:0 8px 30px rgba(0,0,0,0.06);
  transform:translateY(-4px);
}
[data-theme="startup"] .pricing-highlighted{
  border:2px solid var(--color-primary);
  background:linear-gradient(180deg,var(--color-bg) 0%,var(--color-bg-surface) 100%);
}
[data-theme="startup"] .cta-button{
  font-weight:700;
  padding:0.875rem 2rem;
  border-radius:var(--radius-full);
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent,var(--color-primary-hover)));
  color:#fff;
  transition:all 0.2s ease;
}
[data-theme="startup"] .cta-button:hover{
  transform:translateY(-2px);
  box-shadow:0 6px 20px rgba(0,0,0,0.12);
}
[data-theme="startup"] .stat-card{
  text-align:center;
}
[data-theme="startup"] .stat-value{
  font-size:2.5rem;
  font-weight:800;
  background:linear-gradient(135deg,var(--color-primary),var(--color-accent));
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
[data-theme="startup"] .lead-form{
  border-radius:var(--radius-lg);
  border:1px solid var(--color-border);
}
[data-theme="startup"] .trust-badge{
  border:none;
  background:var(--color-bg-surface);
}
[data-theme="startup"] section{
  padding:var(--section-padding) 0;
}
[data-theme="startup"] .footer--multi-column{
  border-top:1px solid var(--color-border);
}

/* ================================================================
   NOIR THEME OVERRIDES
   ================================================================ */

[data-theme="noir"] .hero{
  position:relative;
  overflow:hidden;
}
[data-theme="noir"] .hero::before{
  content:'';
  position:absolute;
  inset:0;
  background:radial-gradient(ellipse at 30% 50%,rgba(255,255,255,0.03) 0%,transparent 60%);
  pointer-events:none;
}
[data-theme="noir"] .hero h1{
  font-weight:800;
  letter-spacing:-0.02em;
}
[data-theme="noir"] .hero-badge{
  background:rgba(255,255,255,0.08);
  color:var(--color-text);
  border:1px solid rgba(255,255,255,0.1);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
}
[data-theme="noir"] .review-card,
[data-theme="noir"] .pricing-card,
[data-theme="noir"] .testimonial-card,
[data-theme="noir"] .ranking-item{
  background:var(--color-bg-surface);
  border:1px solid var(--color-border);
  transition:all 0.25s ease;
}
[data-theme="noir"] .review-card:hover,
[data-theme="noir"] .pricing-card:hover,
[data-theme="noir"] .testimonial-card:hover,
[data-theme="noir"] .ranking-item:hover{
  border-color:var(--color-accent);
  box-shadow:0 0 20px rgba(255,255,255,0.03);
}
[data-theme="noir"] .pricing-highlighted{
  border:1px solid var(--color-accent);
  box-shadow:0 0 30px rgba(255,255,255,0.04);
}
[data-theme="noir"] .cta-button{
  background:var(--color-accent);
  color:var(--color-bg);
  font-weight:700;
  border:none;
  transition:all 0.2s ease;
}
[data-theme="noir"] .cta-button:hover{
  box-shadow:0 0 24px rgba(255,255,255,0.08);
  transform:translateY(-1px);
}
[data-theme="noir"] .cta-button::after{content:none}
[data-theme="noir"] .stat-card{
  background:var(--color-bg-surface);
  border:1px solid var(--color-border);
}
[data-theme="noir"] .faq-item{
  border:1px solid var(--color-border);
  background:var(--color-bg-surface);
}
[data-theme="noir"] .lead-form,
[data-theme="noir"] .calc-form{
  background:var(--color-bg-surface);
  border:1px solid var(--color-border);
}
[data-theme="noir"] .vs-side{
  background:var(--color-bg-surface);
  border:1px solid var(--color-border);
}
[data-theme="noir"] .trust-badge{
  background:rgba(255,255,255,0.04);
  border:1px solid var(--color-border);
}
[data-theme="noir"] article h2{
  color:var(--color-accent);
}
[data-theme="noir"] a:not(.cta-button):not(.hero-cta){
  color:var(--color-accent);
}
[data-theme="noir"] a:not(.cta-button):not(.hero-cta):hover{
  opacity:0.8;
}
[data-theme="noir"] .header--topbar,
[data-theme="noir"] .header--minimal,
[data-theme="noir"] .header--centered{
  background:var(--color-bg);
  border-bottom:1px solid var(--color-border);
}
[data-theme="noir"] .footer--multi-column{
  border-top:1px solid var(--color-border);
}
`;
