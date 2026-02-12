/**
 * Layout definitions for 20 distinct site layouts.
 * Each layout is a combination of structural choices that produce
 * visually different sites when combined with theme color/font overrides.
 */

export interface LayoutConfig {
    maxWidth: 'narrow' | 'medium' | 'wide' | 'full';
    grid: 'single' | 'sidebar-right' | 'sidebar-left';
    header: 'simple' | 'centered' | 'topbar' | 'minimal';
    hero: 'none' | 'centered-text' | 'gradient-split' | 'full-width-dark' | 'card';
    listing: 'list' | 'card-grid-2col' | 'card-grid-3col' | 'magazine-mixed' | 'compact-table' | 'none';
    footer: 'minimal' | 'multi-column' | 'cta-bar' | 'newsletter';
}

const layouts: Record<string, LayoutConfig> = {
    authority: {
        maxWidth: 'wide', grid: 'sidebar-right', header: 'topbar',
        hero: 'full-width-dark', listing: 'magazine-mixed', footer: 'multi-column',
    },
    comparison: {
        maxWidth: 'wide', grid: 'single', header: 'simple',
        hero: 'gradient-split', listing: 'card-grid-3col', footer: 'cta-bar',
    },
    calculator: {
        maxWidth: 'medium', grid: 'single', header: 'minimal',
        hero: 'card', listing: 'list', footer: 'minimal',
    },
    review: {
        maxWidth: 'wide', grid: 'sidebar-right', header: 'topbar',
        hero: 'none', listing: 'card-grid-2col', footer: 'multi-column',
    },
    tool: {
        maxWidth: 'full', grid: 'single', header: 'minimal',
        hero: 'none', listing: 'compact-table', footer: 'minimal',
    },
    hub: {
        maxWidth: 'wide', grid: 'single', header: 'topbar',
        hero: 'centered-text', listing: 'card-grid-3col', footer: 'multi-column',
    },
    decision: {
        maxWidth: 'narrow', grid: 'single', header: 'centered',
        hero: 'centered-text', listing: 'list', footer: 'minimal',
    },
    cost_guide: {
        maxWidth: 'wide', grid: 'sidebar-left', header: 'simple',
        hero: 'gradient-split', listing: 'card-grid-2col', footer: 'cta-bar',
    },
    niche: {
        maxWidth: 'narrow', grid: 'single', header: 'centered',
        hero: 'none', listing: 'list', footer: 'minimal',
    },
    info: {
        maxWidth: 'wide', grid: 'sidebar-left', header: 'topbar',
        hero: 'none', listing: 'compact-table', footer: 'multi-column',
    },
    consumer: {
        maxWidth: 'wide', grid: 'single', header: 'topbar',
        hero: 'gradient-split', listing: 'card-grid-3col', footer: 'newsletter',
    },
    brand: {
        maxWidth: 'medium', grid: 'single', header: 'centered',
        hero: 'full-width-dark', listing: 'card-grid-2col', footer: 'minimal',
    },
    magazine: {
        maxWidth: 'wide', grid: 'single', header: 'topbar',
        hero: 'full-width-dark', listing: 'magazine-mixed', footer: 'multi-column',
    },
    landing: {
        maxWidth: 'full', grid: 'single', header: 'minimal',
        hero: 'gradient-split', listing: 'none', footer: 'cta-bar',
    },
    docs: {
        maxWidth: 'wide', grid: 'sidebar-left', header: 'topbar',
        hero: 'none', listing: 'list', footer: 'minimal',
    },
    storefront: {
        maxWidth: 'wide', grid: 'single', header: 'topbar',
        hero: 'card', listing: 'card-grid-3col', footer: 'multi-column',
    },
    minimal: {
        maxWidth: 'narrow', grid: 'single', header: 'minimal',
        hero: 'none', listing: 'list', footer: 'minimal',
    },
    dashboard: {
        maxWidth: 'full', grid: 'sidebar-left', header: 'topbar',
        hero: 'none', listing: 'compact-table', footer: 'minimal',
    },
    newsletter: {
        maxWidth: 'narrow', grid: 'single', header: 'centered',
        hero: 'centered-text', listing: 'list', footer: 'newsletter',
    },
    community: {
        maxWidth: 'wide', grid: 'sidebar-right', header: 'topbar',
        hero: 'centered-text', listing: 'card-grid-2col', footer: 'multi-column',
    },
};

const defaultLayout: LayoutConfig = layouts.authority;

/** Get layout config for a site template name. Falls back to authority layout. */
export function getLayoutConfig(template?: string): LayoutConfig {
    if (!template) return defaultLayout;
    return layouts[template] ?? defaultLayout;
}

/** All available layout/template names */
export const availableLayouts = Object.keys(layouts);
