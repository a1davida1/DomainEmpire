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
.sidebar-section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;margin-bottom:1rem}
.sidebar-section h3{font-size:0.9rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;margin-bottom:0.75rem}
.sidebar-section ul{list-style:none;padding:0;margin:0}
.sidebar-section li{padding:0.375rem 0;border-bottom:1px solid #f1f5f9}
.sidebar-section li:last-child{border-bottom:none}
.sidebar-section a{color:#2563eb;text-decoration:none;font-size:0.875rem}
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
header{padding:1rem 0;border-bottom:1px solid #f1f5f9}
header nav{display:flex;align-items:center}
header .logo{font-size:1.125rem;font-weight:700;color:inherit;text-decoration:none}
header .nav-links{display:none}
`;
        case 'centered':
            return `
/* Header: centered */
header{padding:1.5rem 0;text-align:center;border-bottom:1px solid #e2e8f0}
header nav{display:flex;flex-direction:column;align-items:center;gap:0.75rem}
header .logo{font-size:1.5rem;font-weight:800;color:inherit;text-decoration:none;letter-spacing:-0.025em}
header .nav-links{display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center}
header .nav-links a{color:#64748b;text-decoration:none;font-size:0.875rem;font-weight:500}
header .nav-links a:hover{color:#1e293b}
`;
        case 'topbar':
            return `
/* Header: topbar */
header{background:#1e293b;color:#f8fafc;padding:0}
header nav{display:flex;align-items:center;justify-content:space-between;padding:0.875rem 1.5rem;max-width:1200px;margin:0 auto}
header .logo{font-size:1.25rem;font-weight:700;color:#f8fafc;text-decoration:none}
header .nav-links{display:flex;gap:1.25rem}
header .nav-links a{color:#cbd5e1;text-decoration:none;font-size:0.875rem;font-weight:500;transition:color 0.15s}
header .nav-links a:hover{color:#f8fafc}
@media(max-width:640px){
  header nav{flex-direction:column;gap:0.5rem;text-align:center}
  header .nav-links{flex-wrap:wrap;justify-content:center}
}
`;
        case 'simple':
        default:
            return `
/* Header: simple */
header{padding:1.25rem 0;border-bottom:2px solid #e2e8f0}
header nav{display:flex;align-items:center;justify-content:space-between}
header .logo{font-size:1.25rem;font-weight:700;color:inherit;text-decoration:none}
header .nav-links{display:flex;gap:1.25rem}
header .nav-links a{color:#475569;text-decoration:none;font-size:0.9rem}
header .nav-links a:hover{color:#1e293b;text-decoration:underline}
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
.hero{padding:2rem 0 1rem}
.hero h1{font-size:2rem;margin-bottom:0.5rem}
.hero p{color:#64748b;font-size:1.05rem}
`;
        case 'centered-text':
            return `
/* Hero: centered-text */
.hero{text-align:center;padding:3.5rem 1rem;border-bottom:1px solid #e2e8f0}
.hero h1{font-size:2.25rem;font-weight:800;letter-spacing:-0.025em;margin-bottom:0.75rem}
.hero p{color:#64748b;font-size:1.125rem;max-width:600px;margin:0 auto;line-height:1.6}
`;
        case 'gradient-split':
            return `
/* Hero: gradient-split */
.hero{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:#f8fafc;padding:3rem 2rem;border-radius:0.75rem;margin:1.5rem 0}
.hero h1{font-size:2.25rem;font-weight:800;margin-bottom:0.75rem}
.hero p{color:#cbd5e1;font-size:1.05rem;max-width:640px;line-height:1.6}
`;
        case 'full-width-dark':
            return `
/* Hero: full-width-dark */
.hero{background:#0f172a;color:#f8fafc;padding:3.5rem 2rem;margin:-1rem -1rem 2rem;text-align:center}
.hero h1{font-size:2.5rem;font-weight:800;letter-spacing:-0.03em;margin-bottom:0.75rem}
.hero p{color:#94a3b8;font-size:1.125rem;max-width:640px;margin:0 auto;line-height:1.6}
`;
        case 'card':
            return `
/* Hero: card */
.hero{background:#f8fafc;border:1px solid #e2e8f0;border-radius:1rem;padding:2.5rem 2rem;margin:1.5rem 0;text-align:center}
.hero h1{font-size:2rem;font-weight:700;margin-bottom:0.5rem}
.hero p{color:#64748b;font-size:1.05rem;max-width:560px;margin:0 auto}
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
.articles li{padding:0.875rem 0;border-bottom:1px solid #f1f5f9}
.articles li:last-child{border-bottom:none}
.articles a{color:#1e293b;text-decoration:none;font-weight:500;font-size:1.05rem}
.articles a:hover{color:#2563eb}
`;
        case 'card-grid-2col':
            return `
/* Listing: card-grid-2col */
.articles ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(2,1fr);gap:1.25rem}
.articles li{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;transition:box-shadow 0.15s,transform 0.15s}
.articles li:hover{box-shadow:0 4px 12px rgba(0,0,0,0.08);transform:translateY(-2px)}
.articles a{color:#1e293b;text-decoration:none;font-weight:600;font-size:1rem;display:block}
.articles a:hover{color:#2563eb}
@media(max-width:640px){.articles ul{grid-template-columns:1fr}}
`;
        case 'card-grid-3col':
            return `
/* Listing: card-grid-3col */
.articles ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem}
.articles li{background:#fff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;transition:box-shadow 0.15s,transform 0.15s}
.articles li:hover{box-shadow:0 4px 12px rgba(0,0,0,0.08);transform:translateY(-2px)}
.articles a{color:#1e293b;text-decoration:none;font-weight:600;font-size:0.95rem;display:block}
.articles a:hover{color:#2563eb}
@media(max-width:900px){.articles ul{grid-template-columns:repeat(2,1fr)}}
@media(max-width:640px){.articles ul{grid-template-columns:1fr}}
`;
        case 'magazine-mixed':
            return `
/* Listing: magazine-mixed */
.articles ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:1.25rem}
.articles li:first-child{grid-column:1/-1;background:linear-gradient(135deg,#1e293b,#334155);border-radius:1rem;padding:2rem}
.articles li:first-child a{color:#f8fafc;font-size:1.5rem;font-weight:800}
.articles li:not(:first-child){background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem}
.articles a{color:#1e293b;text-decoration:none;font-weight:600;display:block}
.articles a:hover{color:#2563eb}
.articles li:first-child a:hover{color:#93c5fd}
@media(max-width:768px){.articles ul{grid-template-columns:1fr}.articles li:first-child{padding:1.5rem}}
`;
        case 'compact-table':
            return `
/* Listing: compact-table */
.articles ul{list-style:none;padding:0;border:1px solid #e2e8f0;border-radius:0.5rem;overflow:hidden}
.articles li{padding:0.75rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between}
.articles li:last-child{border-bottom:none}
.articles li:hover{background:#f8fafc}
.articles a{color:#1e293b;text-decoration:none;font-weight:500;font-size:0.95rem}
.articles a:hover{color:#2563eb}
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
footer{padding:2rem 0;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:0.85rem}
footer .footer-links{margin-bottom:0.75rem}
footer .footer-links a{color:#64748b;text-decoration:none;font-size:0.85rem}
footer .footer-links a:hover{text-decoration:underline}
`;
        case 'multi-column':
            return `
/* Footer: multi-column */
footer{background:#1e293b;color:#cbd5e1;padding:2.5rem 1.5rem 1.5rem;margin-top:3rem}
footer .footer-links{display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center;margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid #334155}
footer .footer-links a{color:#94a3b8;text-decoration:none;font-size:0.875rem;font-weight:500}
footer .footer-links a:hover{color:#f8fafc}
footer p{text-align:center;font-size:0.8rem;color:#64748b}
`;
        case 'cta-bar':
            return `
/* Footer: cta-bar */
footer{padding:0;margin-top:3rem}
.footer-cta{background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;padding:2rem;text-align:center;border-radius:0.75rem 0.75rem 0 0}
.footer-cta h3{font-size:1.25rem;font-weight:700;margin-bottom:0.5rem}
.footer-cta p{color:#bfdbfe;font-size:0.95rem;margin-bottom:1rem}
.footer-cta a{display:inline-block;background:#fff;color:#1e40af;padding:0.625rem 1.5rem;border-radius:0.375rem;font-weight:600;text-decoration:none}
.footer-cta a:hover{background:#f0f9ff}
.footer-bottom{background:#1e293b;color:#94a3b8;padding:1rem 1.5rem;text-align:center;font-size:0.8rem}
footer .footer-links{display:flex;gap:1.25rem;justify-content:center;margin-bottom:0.75rem}
footer .footer-links a{color:#94a3b8;text-decoration:none;font-size:0.85rem}
footer .footer-links a:hover{color:#f8fafc}
`;
        case 'newsletter':
            return `
/* Footer: newsletter */
footer{padding:0;margin-top:3rem}
.footer-newsletter{background:#f8fafc;border-top:2px solid #e2e8f0;padding:2rem;text-align:center}
.footer-newsletter h3{font-size:1.125rem;font-weight:700;margin-bottom:0.25rem}
.footer-newsletter p{color:#64748b;font-size:0.9rem;margin-bottom:1rem}
.footer-newsletter form{display:flex;gap:0.5rem;max-width:400px;margin:0 auto}
.footer-newsletter input[type="email"]{flex:1;padding:0.5rem 0.75rem;border:1px solid #cbd5e1;border-radius:0.375rem;font-size:0.95rem}
.footer-newsletter button{background:#2563eb;color:#fff;padding:0.5rem 1.25rem;border:none;border-radius:0.375rem;font-weight:600;cursor:pointer}
.footer-newsletter button:hover{background:#1d4ed8}
.footer-bottom{padding:1.5rem;text-align:center;color:#94a3b8;font-size:0.8rem}
footer .footer-links{display:flex;gap:1.25rem;justify-content:center;margin-bottom:0.75rem}
footer .footer-links a{color:#64748b;text-decoration:none;font-size:0.85rem}
footer .footer-links a:hover{text-decoration:underline}
@media(max-width:480px){.footer-newsletter form{flex-direction:column}.footer-newsletter button{width:100%}}
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
