/**
 * Theme Token Definitions — structural tokens for Template System v2.
 *
 * A "theme" controls structural aspects: fonts, spacing, radius, shadows.
 * A "skin" controls colors. Together they compose the full visual identity.
 *
 * Each theme emits CSS custom properties under the --font-*, --radius-*, --shadow-*, --spacing-* namespaces.
 */

export interface ThemeTokens {
    fontHeading: string;
    fontBody: string;
    fontMono: string;
    fontSizeBase: string;
    lineHeight: number;
    radiusSm: string;
    radiusMd: string;
    radiusLg: string;
    radiusFull: string;
    shadowSm: string;
    shadowMd: string;
    shadowLg: string;
    spacingUnit: string;
    containerMax: string;
    borderWidth: string;
    transitionSpeed: string;
}

export const themes: Record<string, ThemeTokens> = {
    clean: {
        fontHeading: 'Public Sans, system-ui, sans-serif',
        fontBody: 'Public Sans, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1rem',
        lineHeight: 1.72,
        radiusSm: '0.375rem',
        radiusMd: '0.5rem',
        radiusLg: '0.75rem',
        radiusFull: '999px',
        shadowSm: '0 1px 3px rgba(0,0,0,0.08)',
        shadowMd: '0 4px 12px rgba(0,0,0,0.1)',
        shadowLg: '0 10px 28px rgba(0,0,0,0.12)',
        spacingUnit: '1.6rem',
        containerMax: '1100px',
        borderWidth: '1px',
        transitionSpeed: '0.2s',
    },
    editorial: {
        fontHeading: 'Merriweather, Georgia, serif',
        fontBody: 'Source Sans Pro, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1.05rem',
        lineHeight: 1.78,
        radiusSm: '0.25rem',
        radiusMd: '0.375rem',
        radiusLg: '0.5rem',
        radiusFull: '999px',
        shadowSm: '0 2px 4px rgba(0,0,0,0.06)',
        shadowMd: '0 4px 12px rgba(0,0,0,0.08)',
        shadowLg: '0 8px 24px rgba(0,0,0,0.1)',
        spacingUnit: '1.75rem',
        containerMax: '900px',
        borderWidth: '1px',
        transitionSpeed: '0.2s',
    },
    bold: {
        fontHeading: 'DM Sans, system-ui, sans-serif',
        fontBody: 'Inter, system-ui, sans-serif',
        fontMono: 'JetBrains Mono, ui-monospace, monospace',
        fontSizeBase: '1rem',
        lineHeight: 1.7,
        radiusSm: '0.5rem',
        radiusMd: '0.75rem',
        radiusLg: '1.25rem',
        radiusFull: '999px',
        shadowSm: '0 2px 8px rgba(0,0,0,0.1)',
        shadowMd: '0 6px 18px rgba(0,0,0,0.12)',
        shadowLg: '0 12px 36px rgba(0,0,0,0.15)',
        spacingUnit: '1.5rem',
        containerMax: '1200px',
        borderWidth: '2px',
        transitionSpeed: '0.15s',
    },
    minimal: {
        fontHeading: 'system-ui, -apple-system, sans-serif',
        fontBody: 'system-ui, -apple-system, sans-serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1.05rem',
        lineHeight: 1.8,
        radiusSm: '0.25rem',
        radiusMd: '0.375rem',
        radiusLg: '0.5rem',
        radiusFull: '999px',
        shadowSm: 'none',
        shadowMd: '0 2px 6px rgba(0,0,0,0.06)',
        shadowLg: '0 4px 12px rgba(0,0,0,0.08)',
        spacingUnit: '1.45rem',
        containerMax: '680px',
        borderWidth: '1px',
        transitionSpeed: '0.2s',
    },
};

/**
 * Generate CSS custom properties from a theme's structural tokens.
 */
export function generateThemeCSS(themeName: string): string {
    const t = themes[themeName] ?? themes.clean;
    return `:root{
  --font-heading:${t.fontHeading};
  --font-body:${t.fontBody};
  --font-mono:${t.fontMono};
  --font-size-base:${t.fontSizeBase};
  --line-height:${t.lineHeight};
  --radius-sm:${t.radiusSm};
  --radius-md:${t.radiusMd};
  --radius-lg:${t.radiusLg};
  --radius-full:${t.radiusFull};
  --shadow-sm:${t.shadowSm};
  --shadow-md:${t.shadowMd};
  --shadow-lg:${t.shadowLg};
  --spacing-unit:${t.spacingUnit};
  --container-max:${t.containerMax};
  --border-width:${t.borderWidth};
  --transition-speed:${t.transitionSpeed};
}`;
}

/** List all available theme names */
export const availableV2Themes = Object.keys(themes);

/**
 * Migration map: old v1 theme name → v2 theme name.
 * Used by the migration script to auto-assign themes to existing domains.
 */
export const V1_THEME_TO_V2_THEME: Record<string, string> = {
    'navy-serif': 'editorial',
    'green-modern': 'clean',
    'medical-clean': 'minimal',
    'professional-blue': 'editorial',
    'health-clean': 'minimal',
    'consumer-friendly': 'bold',
    'tech-modern': 'bold',
    'trust-minimal': 'minimal',
    'hobby-vibrant': 'bold',
    'minimal-blue': 'clean',
    'earth-inviting': 'editorial',
    'high-contrast-accessible': 'bold',
    'playful-modern': 'bold',
    'masculine-dark': 'bold',
    'enthusiast-community': 'clean',
    'clean-general': 'clean',
};
