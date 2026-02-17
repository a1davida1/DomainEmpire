/**
 * Layout CSS generator.
 * Produces CSS for each structural dimension of a layout config.
 * All layouts use CSS Grid and collapse cleanly to single-column on mobile.
 */

import type { LayoutConfig } from './layout-definitions';

// ==============================
// Max Width
// ==============================

const maxWidthMap = {
    narrow: '640px',
    medium: '800px',
    wide: '1100px',
    full: '100%',
};

function getMaxWidthCSS(width: LayoutConfig['maxWidth']): string {
    const mw = maxWidthMap[width];
    const padding = width === 'full' ? '0 1.5rem' : '0 1rem';
    return `
/* Max width: ${width} */
.site-container{max-width:${mw};margin:0 auto;padding:${padding}}
`;
}

// ==============================
// Grid Structure
// ==============================

function getGridCSS(grid: LayoutConfig['grid']): string {
    if (grid === 'single') {
        return `
/* Grid: single column */
.layout-wrap{display:block}
.sidebar{display:none}
`;
    }

    const cols = grid === 'sidebar-right' ? '1fr 280px' : '280px 1fr';
    const order = grid === 'sidebar-right' ? '' : '.sidebar{order:-1}';

    return `
/* Grid: ${grid} */
.layout-wrap{display:grid;grid-template-columns:${cols};gap:2rem;align-items:start}
${order}
.sidebar{position:sticky;top:1.5rem}
.sidebar-section{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,.75rem);padding:1.25rem;margin-bottom:1rem}
.sidebar-section h3{font-size:0.9rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-muted);margin-bottom:0.75rem}
.sidebar-section ul{list-style:none;padding:0;margin:0}
.sidebar-section li{padding:0.375rem 0;border-bottom:1px solid var(--color-border)}
.sidebar-section li:last-child{border-bottom:none}
.sidebar-section a{color:var(--color-link);text-decoration:none;font-size:0.875rem}
.sidebar-section a:hover{text-decoration:underline}
@media(max-width:768px){
  .layout-wrap{grid-template-columns:1fr}
  .sidebar{position:static;order:99}
}
`;
}

// ==============================
// Header Styles
// ==============================

function getHeaderCSS(header: LayoutConfig['header']): string {
    switch (header) {
        case 'minimal':
            return `
/* Header: minimal */
header{padding:1rem 0;border-bottom:var(--border-width,1px) solid var(--color-border,#e2e8f0)}
header .site-container{display:flex;align-items:center;justify-content:space-between}
header .logo{font-family:var(--font-heading);font-size:1.125rem;font-weight:700;color:var(--color-text);text-decoration:none}
header nav{display:none}
`;
        case 'centered':
            return `
/* Header: centered */
header{padding:1.5rem 0;text-align:center;border-bottom:var(--border-width,1px) solid var(--color-border,#e2e8f0);background:var(--color-bg)}
header .site-container{display:flex;flex-direction:column;align-items:center;gap:0.75rem}
header .logo{font-family:var(--font-heading);font-size:1.5rem;font-weight:800;color:var(--color-text);text-decoration:none;letter-spacing:-0.025em}
header nav{display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center}
header nav a{color:var(--color-text-muted);text-decoration:none;font-size:0.875rem;font-weight:500;transition:color var(--transition-speed,.2s)}
header nav a:hover{color:var(--color-text)}
`;
        case 'topbar':
            return `
/* Header: topbar */
header{background:var(--color-primary,#1e293b);color:var(--color-badge-text,#f8fafc);padding:0;border-bottom:2px solid var(--color-header-border,transparent)}
header .site-container{display:flex;align-items:center;justify-content:space-between;padding-top:0.875rem;padding-bottom:0.875rem;max-width:1200px}
header .logo{font-family:var(--font-heading);font-size:1.25rem;font-weight:700;color:var(--color-badge-text,#f8fafc);text-decoration:none}
header nav{display:flex;gap:1.25rem}
header nav a{color:rgba(255,255,255,.7);text-decoration:none;font-size:0.875rem;font-weight:500;transition:color var(--transition-speed,.15s)}
header nav a:hover{color:#fff}
@media(max-width:640px){
  header .site-container{flex-direction:column;gap:0.5rem;text-align:center}
  header nav{flex-wrap:wrap;justify-content:center}
}
`;
        case 'simple':
        default:
            return `
/* Header: simple */
header{padding:1.25rem 0;border-bottom:2px solid var(--color-border,#e2e8f0);background:var(--color-bg)}
header .site-container{display:flex;align-items:center;justify-content:space-between}
header .logo{font-family:var(--font-heading);font-size:1.25rem;font-weight:700;color:var(--color-text);text-decoration:none}
header nav{display:flex;gap:1.25rem}
header nav a{color:var(--color-text-muted);text-decoration:none;font-size:0.9rem;transition:color var(--transition-speed,.2s)}
header nav a:hover{color:var(--color-text);text-decoration:underline}
`;
    }
}

// ==============================
// Hero Styles
// ==============================

function getHeroCSS(hero: LayoutConfig['hero']): string {
    switch (hero) {
        case 'none':
            return `/* Hero: none */
.hero{padding:2.5rem 0 1.5rem}
.hero h1{font-size:clamp(1.75rem,4vw,2.25rem);margin-bottom:0.75rem}
.hero-sub{color:var(--color-text-muted);font-size:1.1rem;max-width:600px}
.hero-badge{display:inline-block;background:var(--color-badge-bg);color:var(--color-badge-text);padding:0.25rem 0.75rem;border-radius:var(--radius-full,999px);font-size:0.78rem;font-weight:600;margin-bottom:1rem}
.hero-cta{display:inline-block;margin-top:1.25rem}
`;
        case 'centered-text':
            return `
/* Hero: centered-text */
.hero{text-align:center;padding:4rem 1.5rem;border-bottom:var(--border-width,1px) solid var(--color-border);background:var(--color-hero-bg,var(--color-bg-surface))}
.hero h1{font-size:clamp(2rem,5vw,2.75rem);font-weight:800;letter-spacing:-0.03em;margin-bottom:0.75rem;color:var(--color-hero-text,var(--color-text))}
.hero-sub{color:var(--color-text-muted);font-size:1.15rem;max-width:600px;margin:0 auto;line-height:1.65}
.hero-badge{display:inline-block;background:var(--color-badge-bg);color:var(--color-badge-text);padding:0.3rem 0.9rem;border-radius:var(--radius-full,999px);font-size:0.8rem;font-weight:600;margin-bottom:1.25rem}
.hero-cta{display:inline-block;margin-top:1.5rem;background:var(--color-accent);color:#fff;padding:0.75rem 2rem;border-radius:var(--radius-md,.5rem);font-weight:600;font-size:1rem;transition:transform .15s,box-shadow .15s}
.hero-cta:hover{color:#fff;transform:translateY(-1px);box-shadow:var(--shadow-md)}
`;
        case 'gradient-split':
            return `
/* Hero: gradient-split */
.hero{background:var(--color-hero-bg,linear-gradient(135deg,var(--color-primary),var(--color-primary-hover)));color:var(--color-hero-text,#f8fafc);padding:3.5rem 2rem;border-radius:var(--radius-lg,.75rem);margin:1.5rem 0}
.hero h1{font-size:clamp(2rem,5vw,2.5rem);font-weight:800;margin-bottom:0.75rem;color:inherit}
.hero-sub{color:rgba(255,255,255,.75);font-size:1.1rem;max-width:640px;line-height:1.65}
.hero-badge{display:inline-block;background:rgba(255,255,255,.15);color:#fff;padding:0.3rem 0.9rem;border-radius:var(--radius-full,999px);font-size:0.8rem;font-weight:600;margin-bottom:1.25rem;backdrop-filter:blur(4px)}
.hero-cta{display:inline-block;margin-top:1.5rem;background:#fff;color:var(--color-primary);padding:0.75rem 2rem;border-radius:var(--radius-md,.5rem);font-weight:600;transition:transform .15s,box-shadow .15s}
.hero-cta:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,0,0,.2);color:var(--color-primary)}
`;
        case 'full-width-dark':
            return `
/* Hero: full-width-dark */
.hero{background:var(--color-primary,#0f172a);color:var(--color-hero-text,#f8fafc);padding:4rem 2rem;text-align:center}
.hero h1{font-size:clamp(2rem,5vw,2.75rem);font-weight:800;letter-spacing:-0.03em;margin-bottom:0.75rem;color:inherit}
.hero-sub{color:rgba(255,255,255,.65);font-size:1.15rem;max-width:640px;margin:0 auto;line-height:1.65}
.hero-badge{display:inline-block;background:rgba(255,255,255,.1);color:#fff;padding:0.3rem 0.9rem;border-radius:var(--radius-full,999px);font-size:0.8rem;font-weight:600;margin-bottom:1.25rem}
.hero-cta{display:inline-block;margin-top:1.5rem;background:#fff;color:var(--color-primary);padding:0.75rem 2rem;border-radius:var(--radius-md,.5rem);font-weight:600;transition:transform .15s}
.hero-cta:hover{transform:translateY(-1px);color:var(--color-primary)}
`;
        case 'card':
            return `
/* Hero: card */
.hero{background:var(--color-bg-surface,#f8fafc);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,1rem);padding:3rem 2rem;margin:1.5rem 0;text-align:center}
.hero h1{font-size:clamp(1.75rem,4vw,2.25rem);font-weight:700;margin-bottom:0.5rem}
.hero-sub{color:var(--color-text-muted);font-size:1.05rem;max-width:560px;margin:0 auto}
.hero-badge{display:inline-block;background:var(--color-badge-bg);color:var(--color-badge-text);padding:0.25rem 0.75rem;border-radius:var(--radius-full,999px);font-size:0.78rem;font-weight:600;margin-bottom:1rem}
.hero-cta{display:inline-block;margin-top:1.25rem;background:var(--color-accent);color:#fff;padding:0.625rem 1.5rem;border-radius:var(--radius-md,.5rem);font-weight:600;transition:transform .15s}
.hero-cta:hover{transform:translateY(-1px);color:#fff}
`;
        default:
            return '';
    }
}

// ==============================
// Article Listing Styles
// ==============================

function getListingCSS(listing: LayoutConfig['listing']): string {
    switch (listing) {
        case 'list':
            return `
/* Listing: list */
.articles ul{list-style:none;padding:0}
.articles li{padding:0.875rem 0;border-bottom:1px solid var(--color-border)}
.articles li:last-child{border-bottom:none}
.articles a{color:var(--color-text);text-decoration:none;font-weight:500;font-size:1.05rem;transition:color var(--transition-speed,.2s)}
.articles a:hover{color:var(--color-link)}
`;
        case 'card-grid-2col':
            return `
/* Listing: card-grid-2col */
.articles ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:1.25rem}
.articles li{background:var(--color-bg-surface);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,.75rem);padding:1.25rem;transition:box-shadow var(--transition-speed,.15s),transform var(--transition-speed,.15s)}
.articles li:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}
.articles a{color:var(--color-text);text-decoration:none;font-weight:600;font-size:1rem;display:block}
.articles a:hover{color:var(--color-link)}
@media(max-width:640px){.articles ul{grid-template-columns:1fr}}
`;
        case 'card-grid-3col':
            return `
/* Listing: card-grid-3col */
.articles ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem}
.articles li{background:var(--color-bg);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,.75rem);padding:1.25rem;transition:box-shadow var(--transition-speed,.15s),transform var(--transition-speed,.15s)}
.articles li:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}
.articles a{color:var(--color-text);text-decoration:none;font-weight:600;font-size:0.95rem;display:block}
.articles a:hover{color:var(--color-link)}
@media(max-width:900px){.articles ul{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.articles ul{grid-template-columns:1fr}}
`;
        case 'magazine-mixed':
            return `
/* Listing: magazine-mixed */
.articles ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem}
.articles li:first-child{grid-column:1/-1;background:linear-gradient(135deg,var(--color-primary),var(--color-primary-hover));border-radius:var(--radius-lg,1rem);padding:2rem}
.articles li:first-child a{color:#fff;font-size:1.5rem;font-weight:800}
.articles li:not(:first-child){background:var(--color-bg-surface);border:var(--border-width,1px) solid var(--color-border);border-radius:var(--radius-lg,.75rem);padding:1.25rem}
.articles a{color:var(--color-text);text-decoration:none;font-weight:600;display:block}
.articles a:hover{color:var(--color-link)}
.articles li:first-child a:hover{color:rgba(255,255,255,.8)}
@media(max-width:768px){.articles ul{grid-template-columns:1fr}.articles li:first-child{padding:1.5rem}}
`;
        case 'compact-table':
            return `
/* Listing: compact-table */
.articles ul{list-style:none;padding:0;border:var(--border-width,1px) solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);overflow:hidden}
.articles li{padding:0.75rem 1rem;border-bottom:1px solid var(--color-border,#f1f5f9);display:flex;align-items:center;justify-content:space-between;transition:background var(--transition-speed,.15s)}
.articles li:last-child{border-bottom:none}
.articles li:hover{background:var(--color-bg-surface,#f8fafc)}
.articles a{color:var(--color-text,#1e293b);text-decoration:none;font-weight:500;font-size:0.95rem}
.articles a:hover{color:var(--color-link,#2563eb)}
`;
        case 'none':
            return `/* Listing: none */
.articles{display:none}
`;
        default:
            return '';
    }
}

// ==============================
// Footer Styles
// ==============================

function getFooterCSS(footer: LayoutConfig['footer']): string {
    switch (footer) {
        case 'minimal':
            return `
/* Footer: minimal */
footer{padding:2.5rem 0;border-top:var(--border-width,1px) solid var(--color-border);text-align:center;color:var(--color-text-muted);font-size:0.85rem;margin-top:3rem}
footer a{color:var(--color-text-muted);text-decoration:none;font-size:0.85rem}
footer a:hover{color:var(--color-text);text-decoration:underline}
.footer-columns{display:flex;gap:2rem;justify-content:center;margin-bottom:1.5rem;flex-wrap:wrap}
.footer-col h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;color:var(--color-text-muted)}
.footer-col ul{list-style:none}
.footer-col li{margin-bottom:0.25rem}
.footer-disclaimer{font-size:0.8rem;color:var(--color-text-muted);max-width:600px;margin:0 auto 1rem;line-height:1.5}
`;
        case 'multi-column':
            return `
/* Footer: multi-column */
footer{background:var(--color-footer-bg,#1e293b);color:var(--color-footer-text,#cbd5e1);padding:3rem 0 1.5rem;margin-top:3rem}
footer p{text-align:center;font-size:0.8rem;color:var(--color-footer-text,#64748b);opacity:.7}
footer a{color:var(--color-footer-text,#94a3b8);text-decoration:none;transition:opacity var(--transition-speed,.2s)}
footer a:hover{opacity:1;color:#fff}
.footer-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:2rem;margin-bottom:2rem;padding-bottom:2rem;border-bottom:1px solid rgba(255,255,255,.1)}
.footer-col h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem;color:rgba(255,255,255,.5)}
.footer-col ul{list-style:none}
.footer-col li{margin-bottom:0.375rem}
.footer-col a{font-size:0.875rem;font-weight:400}
.footer-disclaimer{font-size:0.8rem;opacity:.6;max-width:600px;margin:0 auto 1.5rem;text-align:center;line-height:1.5}
`;
        case 'cta-bar':
            return `
/* Footer: cta-bar */
footer{padding:0;margin-top:3rem}
.footer-cta{background:linear-gradient(135deg,var(--color-primary),var(--color-accent));color:#fff;padding:2.5rem;text-align:center;border-radius:var(--radius-lg) var(--radius-lg) 0 0}
.footer-cta h3{font-size:1.25rem;font-weight:700;margin-bottom:0.5rem}
.footer-cta p{color:rgba(255,255,255,.75);font-size:0.95rem;margin-bottom:1.25rem}
.footer-cta a{display:inline-block;background:#fff;color:var(--color-primary);padding:0.75rem 1.75rem;border-radius:var(--radius-md);font-weight:600;text-decoration:none;transition:transform .15s}
.footer-cta a:hover{transform:translateY(-1px)}
.footer-bottom{background:var(--color-footer-bg,#1e293b);color:var(--color-footer-text,#94a3b8);padding:1.25rem 1.5rem;text-align:center;font-size:0.8rem}
footer a{color:var(--color-footer-text,#94a3b8);text-decoration:none}
footer a:hover{color:#fff}
.footer-columns{display:flex;gap:2rem;justify-content:center;margin-bottom:1rem;flex-wrap:wrap}
.footer-col h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;opacity:.6}
.footer-col ul{list-style:none}
.footer-disclaimer{font-size:0.8rem;opacity:.6;max-width:600px;margin:0 auto 1rem;text-align:center}
`;
        case 'newsletter':
            return `
/* Footer: newsletter */
footer{padding:0;margin-top:3rem}
.footer-newsletter{background:var(--color-bg-surface,#f8fafc);border-top:2px solid var(--color-border);padding:2.5rem;text-align:center}
.footer-newsletter h4{font-size:1.125rem;font-weight:700;margin-bottom:0.25rem}
.footer-newsletter p{color:var(--color-text-muted);font-size:0.9rem;margin-bottom:1rem}
.newsletter-form{display:flex;gap:0.5rem;max-width:420px;margin:0 auto}
.newsletter-form input[type="email"]{flex:1;padding:0.625rem 0.875rem;border:var(--border-width,1px) solid var(--color-border-strong);border-radius:var(--radius-md,.375rem);font-size:0.95rem;background:var(--color-bg)}
.newsletter-form button{background:var(--color-accent,#2563eb);color:#fff;padding:0.625rem 1.5rem;border:none;border-radius:var(--radius-md,.375rem);font-weight:600;cursor:pointer;transition:background var(--transition-speed,.2s)}
.newsletter-form button:hover{opacity:.9}
.footer-bottom{padding:1.5rem;text-align:center;color:var(--color-text-muted);font-size:0.8rem}
footer a{color:var(--color-text-muted);text-decoration:none}
footer a:hover{color:var(--color-text)}
.footer-columns{display:flex;gap:2rem;justify-content:center;margin-bottom:1rem;flex-wrap:wrap}
.footer-col h4{font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem}
.footer-col ul{list-style:none}
.footer-disclaimer{font-size:0.8rem;color:var(--color-text-muted);max-width:600px;margin:0 auto 1rem;text-align:center}
@media(max-width:480px){.newsletter-form{flex-direction:column}.newsletter-form button{width:100%}}
`;
        default:
            return '';
    }
}

// ==============================
// Compose all layout CSS
// ==============================

/** Generate complete CSS for a layout configuration */
export function getLayoutStyles(config: LayoutConfig): string {
    return [
        getMaxWidthCSS(config.maxWidth),
        getGridCSS(config.grid),
        getHeaderCSS(config.header),
        getHeroCSS(config.hero),
        getListingCSS(config.listing),
        getFooterCSS(config.footer),
    ].join('\n');
}
