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
    /** 8px baseline spacing scale: sp1=0.5rem(8px) … sp8=4rem–5rem (varies by theme) */
    spacingScale: [string, string, string, string, string, string, string, string];
    /** Default vertical padding for each <section> */
    sectionPadding: string;
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
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3.5rem',
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
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '4rem',
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
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','3rem','3.5rem','4rem','5rem'],
        sectionPadding: '3rem',
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
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3rem',
    },
    magazine: {
        fontHeading: 'Playfair Display, Georgia, serif',
        fontBody: 'Source Serif 4, Georgia, serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1.08rem',
        lineHeight: 1.82,
        radiusSm: '0.125rem',
        radiusMd: '0.25rem',
        radiusLg: '0.375rem',
        radiusFull: '999px',
        shadowSm: 'none',
        shadowMd: '0 1px 3px rgba(0,0,0,0.04)',
        shadowLg: '0 4px 12px rgba(0,0,0,0.06)',
        spacingUnit: '2rem',
        containerMax: '780px',
        borderWidth: '1px',
        transitionSpeed: '0.25s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','3rem','3.5rem','4rem','4.5rem'],
        sectionPadding: '4.5rem',
    },
    brutalist: {
        fontHeading: 'Space Mono, ui-monospace, monospace',
        fontBody: 'IBM Plex Sans, system-ui, sans-serif',
        fontMono: 'Space Mono, ui-monospace, monospace',
        fontSizeBase: '1rem',
        lineHeight: 1.65,
        radiusSm: '0',
        radiusMd: '0',
        radiusLg: '0',
        radiusFull: '0',
        shadowSm: 'none',
        shadowMd: 'none',
        shadowLg: 'none',
        spacingUnit: '1.5rem',
        containerMax: '1200px',
        borderWidth: '3px',
        transitionSpeed: '0s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3rem',
    },
    glass: {
        fontHeading: 'Inter, system-ui, sans-serif',
        fontBody: 'Inter, system-ui, sans-serif',
        fontMono: 'JetBrains Mono, ui-monospace, monospace',
        fontSizeBase: '0.95rem',
        lineHeight: 1.68,
        radiusSm: '0.75rem',
        radiusMd: '1rem',
        radiusLg: '1.5rem',
        radiusFull: '999px',
        shadowSm: '0 2px 8px rgba(0,0,0,0.04)',
        shadowMd: '0 8px 24px rgba(0,0,0,0.06)',
        shadowLg: '0 16px 48px rgba(0,0,0,0.08)',
        spacingUnit: '1.5rem',
        containerMax: '1100px',
        borderWidth: '1px',
        transitionSpeed: '0.2s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3.5rem',
    },
    retro: {
        fontHeading: 'Quicksand, Nunito, system-ui, sans-serif',
        fontBody: 'Nunito, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1.05rem',
        lineHeight: 1.75,
        radiusSm: '0.75rem',
        radiusMd: '1rem',
        radiusLg: '1.5rem',
        radiusFull: '999px',
        shadowSm: '0 2px 4px rgba(0,0,0,0.06)',
        shadowMd: '0 4px 16px rgba(0,0,0,0.08)',
        shadowLg: '0 8px 32px rgba(0,0,0,0.1)',
        spacingUnit: '1.6rem',
        containerMax: '960px',
        borderWidth: '2px',
        transitionSpeed: '0.2s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3.5rem',
    },
    corporate: {
        fontHeading: 'Libre Franklin, system-ui, sans-serif',
        fontBody: 'Atkinson Hyperlegible, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1rem',
        lineHeight: 1.72,
        radiusSm: '0.25rem',
        radiusMd: '0.375rem',
        radiusLg: '0.5rem',
        radiusFull: '999px',
        shadowSm: '0 1px 2px rgba(0,0,0,0.05)',
        shadowMd: '0 2px 8px rgba(0,0,0,0.07)',
        shadowLg: '0 6px 20px rgba(0,0,0,0.09)',
        spacingUnit: '1.5rem',
        containerMax: '1040px',
        borderWidth: '1px',
        transitionSpeed: '0.18s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3.5rem',
    },
    craft: {
        fontHeading: 'Vollkorn, Georgia, serif',
        fontBody: 'Cabin, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        fontSizeBase: '1.05rem',
        lineHeight: 1.76,
        radiusSm: '0.5rem',
        radiusMd: '0.75rem',
        radiusLg: '1rem',
        radiusFull: '999px',
        shadowSm: '0 1px 4px rgba(120,80,40,0.06)',
        shadowMd: '0 4px 14px rgba(120,80,40,0.08)',
        shadowLg: '0 8px 28px rgba(120,80,40,0.1)',
        spacingUnit: '1.7rem',
        containerMax: '880px',
        borderWidth: '1.5px',
        transitionSpeed: '0.22s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.75rem','4.5rem'],
        sectionPadding: '4rem',
    },
    academic: {
        fontHeading: 'IBM Plex Serif, Georgia, serif',
        fontBody: 'IBM Plex Sans, system-ui, sans-serif',
        fontMono: 'IBM Plex Mono, ui-monospace, monospace',
        fontSizeBase: '0.95rem',
        lineHeight: 1.65,
        radiusSm: '0.125rem',
        radiusMd: '0.25rem',
        radiusLg: '0.375rem',
        radiusFull: '999px',
        shadowSm: 'none',
        shadowMd: '0 1px 4px rgba(0,0,0,0.06)',
        shadowLg: '0 3px 10px rgba(0,0,0,0.08)',
        spacingUnit: '1.25rem',
        containerMax: '1080px',
        borderWidth: '1px',
        transitionSpeed: '0.15s',
        spacingScale: ['0.375rem','0.75rem','1.25rem','1.75rem','2.25rem','2.75rem','3.25rem','3.75rem'],
        sectionPadding: '2.5rem',
    },
    startup: {
        fontHeading: 'Plus Jakarta Sans, system-ui, sans-serif',
        fontBody: 'Plus Jakarta Sans, system-ui, sans-serif',
        fontMono: 'JetBrains Mono, ui-monospace, monospace',
        fontSizeBase: '0.95rem',
        lineHeight: 1.7,
        radiusSm: '0.5rem',
        radiusMd: '0.625rem',
        radiusLg: '1rem',
        radiusFull: '999px',
        shadowSm: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
        shadowMd: '0 4px 16px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.03)',
        shadowLg: '0 12px 40px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)',
        spacingUnit: '1.5rem',
        containerMax: '1140px',
        borderWidth: '1px',
        transitionSpeed: '0.2s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','3rem','4rem','5rem','6rem'],
        sectionPadding: '4.5rem',
    },
    noir: {
        fontHeading: 'Sora, system-ui, sans-serif',
        fontBody: 'Karla, system-ui, sans-serif',
        fontMono: 'JetBrains Mono, ui-monospace, monospace',
        fontSizeBase: '1rem',
        lineHeight: 1.72,
        radiusSm: '0.375rem',
        radiusMd: '0.5rem',
        radiusLg: '0.75rem',
        radiusFull: '999px',
        shadowSm: '0 0 6px rgba(255,255,255,0.03)',
        shadowMd: '0 0 20px rgba(255,255,255,0.04)',
        shadowLg: '0 0 40px rgba(255,255,255,0.05)',
        spacingUnit: '1.5rem',
        containerMax: '1060px',
        borderWidth: '1px',
        transitionSpeed: '0.2s',
        spacingScale: ['0.5rem','1rem','1.5rem','2rem','2.5rem','3rem','3.5rem','4rem'],
        sectionPadding: '3.5rem',
    },
};

/**
 * Generate CSS custom properties from a theme's structural tokens.
 */
export function generateThemeCSS(themeName: string): string {
    const t = themes[themeName] ?? themes.clean;
    const sp = t.spacingScale;
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
  --sp-1:${sp[0]};--sp-2:${sp[1]};--sp-3:${sp[2]};--sp-4:${sp[3]};--sp-5:${sp[4]};--sp-6:${sp[5]};--sp-7:${sp[6]};--sp-8:${sp[7]};
  --section-padding:${t.sectionPadding};
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
    'high-contrast-accessible': 'brutalist',
    'playful-modern': 'retro',
    'masculine-dark': 'brutalist',
    'enthusiast-community': 'clean',
    'clean-general': 'clean',
    'luxury-serif': 'magazine',
    'saas-modern': 'glass',
    'funky-colorful': 'retro',
    'raw-industrial': 'brutalist',
    'corporate-blue': 'corporate',
    'financial-trust': 'corporate',
    'artisan-warm': 'craft',
    'boutique-organic': 'craft',
    'research-dense': 'academic',
    'data-focused': 'academic',
    'modern-saas': 'startup',
    'product-landing': 'startup',
    'dark-premium': 'noir',
    'dark-tech': 'noir',
};
