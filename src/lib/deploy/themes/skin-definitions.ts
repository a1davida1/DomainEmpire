/**
 * Skin Definitions — color token palettes for Template System v2.
 *
 * A "skin" controls all color tokens. A "theme" controls structural tokens
 * (fonts, spacing, radius, shadows). Together they compose the full look.
 *
 * Each skin emits CSS custom properties under the --color-* namespace.
 */

export interface SkinTokens {
    primary: string;
    primaryHover: string;
    secondary: string;
    bg: string;
    bgSurface: string;
    text: string;
    textMuted: string;
    accent: string;
    border: string;
    borderStrong: string;
    success: string;
    warning: string;
    error: string;
    heroBg: string;
    heroText: string;
    headerBorder: string;
    footerBg: string;
    footerText: string;
    badgeBg: string;
    badgeText: string;
    linkColor: string;
    linkHover: string;
}

export const skins: Record<string, SkinTokens> = {
    slate: {
        primary: '#1e293b',
        primaryHover: '#334155',
        secondary: '#475569',
        bg: '#ffffff',
        bgSurface: '#f8fafc',
        text: '#1e293b',
        textMuted: '#64748b',
        accent: '#2563eb',
        border: '#e2e8f0',
        borderStrong: '#cbd5e1',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)',
        heroText: '#111827',
        headerBorder: '#e5e7eb',
        footerBg: '#1e293b',
        footerText: '#94a3b8',
        badgeBg: '#1e293b',
        badgeText: '#ffffff',
        linkColor: '#2563eb',
        linkHover: '#1d4ed8',
    },
    ocean: {
        primary: '#1e3a5f',
        primaryHover: '#0f2541',
        secondary: '#2563eb',
        bg: '#f8fbff',
        bgSurface: '#eff6ff',
        text: '#1e293b',
        textMuted: '#64748b',
        accent: '#2563eb',
        border: '#bfdbfe',
        borderStrong: '#93c5fd',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#1e3a5f 0%,#1e40af 50%,#312e81 100%)',
        heroText: '#ffffff',
        headerBorder: '#1e3a5f',
        footerBg: '#1e3a5f',
        footerText: '#94a3b8',
        badgeBg: '#1d4ed8',
        badgeText: '#ffffff',
        linkColor: '#2563eb',
        linkHover: '#1d4ed8',
    },
    forest: {
        primary: '#047857',
        primaryHover: '#065f46',
        secondary: '#059669',
        bg: '#f0fdf4',
        bgSurface: '#f7fef9',
        text: '#14532d',
        textMuted: '#4b7a5c',
        accent: '#10b981',
        border: '#bbf7d0',
        borderStrong: '#86efac',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#f0fdf4 0%,#d1fae5 50%,#a7f3d0 100%)',
        heroText: '#065f46',
        headerBorder: '#10b981',
        footerBg: '#14532d',
        footerText: '#86efac',
        badgeBg: '#047857',
        badgeText: '#ffffff',
        linkColor: '#059669',
        linkHover: '#047857',
    },
    ember: {
        primary: '#b45309',
        primaryHover: '#92400e',
        secondary: '#d97706',
        bg: '#fffbf5',
        bgSurface: '#fef3c7',
        text: '#292524',
        textMuted: '#78716c',
        accent: '#f59e0b',
        border: '#fed7aa',
        borderStrong: '#fdba74',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#fef3c7,#fed7aa)',
        heroText: '#78350f',
        headerBorder: '#f59e0b',
        footerBg: '#78350f',
        footerText: '#fde68a',
        badgeBg: '#f59e0b',
        badgeText: '#78350f',
        linkColor: '#d97706',
        linkHover: '#b45309',
    },
    midnight: {
        primary: '#38bdf8',
        primaryHover: '#7dd3fc',
        secondary: '#f59e0b',
        bg: '#0f172a',
        bgSurface: '#1e293b',
        text: '#e2e8f0',
        textMuted: '#94a3b8',
        accent: '#38bdf8',
        border: '#334155',
        borderStrong: '#475569',
        success: '#22c55e',
        warning: '#fbbf24',
        error: '#f87171',
        heroBg: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0c4a6e 100%)',
        heroText: '#f1f5f9',
        headerBorder: '#334155',
        footerBg: '#020617',
        footerText: '#64748b',
        badgeBg: '#38bdf8',
        badgeText: '#0f172a',
        linkColor: '#38bdf8',
        linkHover: '#7dd3fc',
    },
    coral: {
        primary: '#7c3aed',
        primaryHover: '#6d28d9',
        secondary: '#fb923c',
        bg: '#fffaf2',
        bgSurface: '#fef7ee',
        text: '#2d1f45',
        textMuted: '#6b5a83',
        accent: '#fb7185',
        border: '#fed7aa',
        borderStrong: '#fdba74',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd)',
        heroText: '#3b0764',
        headerBorder: '#fb923c',
        footerBg: '#3b0764',
        footerText: '#c4b5fd',
        badgeBg: '#7c3aed',
        badgeText: '#ffffff',
        linkColor: '#7c3aed',
        linkHover: '#6d28d9',
    },
    sage: {
        primary: '#4a6741',
        primaryHover: '#3b5334',
        secondary: '#6b8f5e',
        bg: '#f9faf7',
        bgSurface: '#f0f4ec',
        text: '#1a2e14',
        textMuted: '#5a7252',
        accent: '#5a9a4a',
        border: '#d4dece',
        borderStrong: '#b8c8ae',
        success: '#2d8a4e',
        warning: '#c8922a',
        error: '#c44040',
        heroBg: 'linear-gradient(135deg,#f0f4ec 0%,#d4dece 40%,#c5d6b8 100%)',
        heroText: '#1a2e14',
        headerBorder: '#b8c8ae',
        footerBg: '#1a2e14',
        footerText: '#9bb08e',
        badgeBg: '#4a6741',
        badgeText: '#f0f4ec',
        linkColor: '#3d7a30',
        linkHover: '#2d5c23',
    },
    rose: {
        primary: '#8b3a62',
        primaryHover: '#6e2d4e',
        secondary: '#b25882',
        bg: '#fdf8fa',
        bgSurface: '#f9eff4',
        text: '#2d1524',
        textMuted: '#8a6878',
        accent: '#d4688e',
        border: '#edd5e0',
        borderStrong: '#deb8cc',
        success: '#16a34a',
        warning: '#d4922a',
        error: '#c44040',
        heroBg: 'linear-gradient(135deg,#f9eff4 0%,#edd5e0 50%,#e2bfd0 100%)',
        heroText: '#2d1524',
        headerBorder: '#deb8cc',
        footerBg: '#2d1524',
        footerText: '#c89aae',
        badgeBg: '#8b3a62',
        badgeText: '#fdf8fa',
        linkColor: '#a24472',
        linkHover: '#8b3a62',
    },
    indigo: {
        primary: '#3730a3',
        primaryHover: '#312e81',
        secondary: '#6366f1',
        bg: '#f8f7ff',
        bgSurface: '#eef0ff',
        text: '#1e1b4b',
        textMuted: '#6466a0',
        accent: '#818cf8',
        border: '#c7d2fe',
        borderStrong: '#a5b4fc',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#312e81 0%,#4338ca 40%,#6366f1 100%)',
        heroText: '#eef2ff',
        headerBorder: '#3730a3',
        footerBg: '#1e1b4b',
        footerText: '#a5b4fc',
        badgeBg: '#4f46e5',
        badgeText: '#ffffff',
        linkColor: '#4f46e5',
        linkHover: '#4338ca',
    },
    sand: {
        primary: '#78603c',
        primaryHover: '#604b2e',
        secondary: '#9a7e58',
        bg: '#faf8f4',
        bgSurface: '#f3efe8',
        text: '#2c2416',
        textMuted: '#7c705e',
        accent: '#b8860b',
        border: '#e0d8ca',
        borderStrong: '#cdc0aa',
        success: '#508040',
        warning: '#c88a20',
        error: '#b83a3a',
        heroBg: 'linear-gradient(135deg,#f3efe8 0%,#e0d8ca 50%,#d4c8b0 100%)',
        heroText: '#2c2416',
        headerBorder: '#cdc0aa',
        footerBg: '#2c2416',
        footerText: '#a89880',
        badgeBg: '#78603c',
        badgeText: '#f3efe8',
        linkColor: '#8a6e3e',
        linkHover: '#6e5630',
    },
    teal: {
        primary: '#0d6e6e',
        primaryHover: '#0a5858',
        secondary: '#14a3a3',
        bg: '#f5fcfc',
        bgSurface: '#e8f6f6',
        text: '#0c2d2d',
        textMuted: '#4a7a7a',
        accent: '#0fb8b8',
        border: '#b2e0e0',
        borderStrong: '#80cccc',
        success: '#16a34a',
        warning: '#d4922a',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#083e3e 0%,#0a5858 50%,#0d6e6e 100%)',
        heroText: '#e0f4f4',
        headerBorder: '#0d6e6e',
        footerBg: '#0c2d2d',
        footerText: '#80cccc',
        badgeBg: '#0d6e6e',
        badgeText: '#f0fafa',
        linkColor: '#0c8585',
        linkHover: '#0a6868',
    },
    wine: {
        primary: '#722f37',
        primaryHover: '#5c262e',
        secondary: '#a0444f',
        bg: '#fdf7f7',
        bgSurface: '#f6ecec',
        text: '#2a1215',
        textMuted: '#7a5258',
        accent: '#b5434e',
        border: '#e4cdd0',
        borderStrong: '#d2aeb2',
        success: '#3d8b50',
        warning: '#c8922a',
        error: '#a03030',
        heroBg: 'linear-gradient(135deg,#722f37 0%,#8b3a44 50%,#a04450 100%)',
        heroText: '#faf0f0',
        headerBorder: '#722f37',
        footerBg: '#2a1215',
        footerText: '#c8989d',
        badgeBg: '#722f37',
        badgeText: '#fdf7f7',
        linkColor: '#8b3a44',
        linkHover: '#722f37',
    },
    plum: {
        primary: '#6b2fa0',
        primaryHover: '#562680',
        secondary: '#9b59b6',
        bg: '#fdf7ff',
        bgSurface: '#f3eaf8',
        text: '#1c0a2e',
        textMuted: '#7a5a90',
        accent: '#a855f7',
        border: '#dcc8eb',
        borderStrong: '#c4a2d8',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#4a1a78 0%,#6b2fa0 50%,#8a48c0 100%)',
        heroText: '#f5eefa',
        headerBorder: '#6b2fa0',
        footerBg: '#1c0a2e',
        footerText: '#b88ed0',
        badgeBg: '#7c3aed',
        badgeText: '#ffffff',
        linkColor: '#7c3aed',
        linkHover: '#6b2fa0',
    },
    steel: {
        primary: '#374151',
        primaryHover: '#1f2937',
        secondary: '#6b7280',
        bg: '#f9fafb',
        bgSurface: '#f3f4f6',
        text: '#111827',
        textMuted: '#6b7280',
        accent: '#4b5563',
        border: '#e5e7eb',
        borderStrong: '#d1d5db',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#374151 0%,#4b5563 50%,#6b7280 100%)',
        heroText: '#f9fafb',
        headerBorder: '#374151',
        footerBg: '#111827',
        footerText: '#9ca3af',
        badgeBg: '#374151',
        badgeText: '#f9fafb',
        linkColor: '#374151',
        linkHover: '#1f2937',
    },
    cobalt: {
        primary: '#1e40af',
        primaryHover: '#1e3a8a',
        secondary: '#3b82f6',
        bg: '#f8faff',
        bgSurface: '#eff4ff',
        text: '#172554',
        textMuted: '#4a6ca8',
        accent: '#3b82f6',
        border: '#bfdbfe',
        borderStrong: '#93c5fd',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#1e3a8a 0%,#1e40af 40%,#2563eb 100%)',
        heroText: '#eff6ff',
        headerBorder: '#1e40af',
        footerBg: '#172554',
        footerText: '#93c5fd',
        badgeBg: '#2563eb',
        badgeText: '#ffffff',
        linkColor: '#2563eb',
        linkHover: '#1d4ed8',
    },
    copper: {
        primary: '#92400e',
        primaryHover: '#78350f',
        secondary: '#b45309',
        bg: '#fefcf8',
        bgSurface: '#fdf2e4',
        text: '#451a03',
        textMuted: '#8a6540',
        accent: '#c2742c',
        border: '#f0d8b8',
        borderStrong: '#dfc098',
        success: '#508040',
        warning: '#b8860b',
        error: '#b83a3a',
        heroBg: 'linear-gradient(135deg,#92400e 0%,#a85820 50%,#c2742c 100%)',
        heroText: '#fef7ed',
        headerBorder: '#92400e',
        footerBg: '#451a03',
        footerText: '#d4a06a',
        badgeBg: '#b45309',
        badgeText: '#fef7ed',
        linkColor: '#a85820',
        linkHover: '#92400e',
    },
    arctic: {
        primary: '#155e75',
        primaryHover: '#164e63',
        secondary: '#0891b2',
        bg: '#f5fdff',
        bgSurface: '#e6f8fc',
        text: '#083344',
        textMuted: '#4a8494',
        accent: '#06b6d4',
        border: '#a5e8f4',
        borderStrong: '#67d8ee',
        success: '#16a34a',
        warning: '#f59e0b',
        error: '#dc2626',
        heroBg: 'linear-gradient(135deg,#e6f8fc 0%,#cceef6 50%,#a5e8f4 100%)',
        heroText: '#083344',
        headerBorder: '#67d8ee',
        footerBg: '#083344',
        footerText: '#67d8ee',
        badgeBg: '#0891b2',
        badgeText: '#ffffff',
        linkColor: '#0e7490',
        linkHover: '#155e75',
    },
    charcoal: {
        primary: '#d4d4d8',
        primaryHover: '#e4e4e7',
        secondary: '#a1a1aa',
        bg: '#18181b',
        bgSurface: '#27272a',
        text: '#e4e4e7',
        textMuted: '#a1a1aa',
        accent: '#e4e4e7',
        border: '#3f3f46',
        borderStrong: '#52525b',
        success: '#4ade80',
        warning: '#fbbf24',
        error: '#f87171',
        heroBg: 'linear-gradient(135deg,#18181b 0%,#27272a 50%,#3f3f46 100%)',
        heroText: '#fafafa',
        headerBorder: '#3f3f46',
        footerBg: '#09090b',
        footerText: '#71717a',
        badgeBg: '#d4d4d8',
        badgeText: '#18181b',
        linkColor: '#d4d4d8',
        linkHover: '#e4e4e7',
    },
    dusk: {
        primary: '#7e22ce',
        primaryHover: '#6b21a8',
        secondary: '#ec4899',
        bg: '#0f0720',
        bgSurface: '#1a1030',
        text: '#e8dff0',
        textMuted: '#a090b8',
        accent: '#c084fc',
        border: '#302050',
        borderStrong: '#483068',
        success: '#4ade80',
        warning: '#fbbf24',
        error: '#f87171',
        heroBg: 'linear-gradient(135deg,#0f0720 0%,#1a1030 40%,#2d1860 100%)',
        heroText: '#f0e8ff',
        headerBorder: '#302050',
        footerBg: '#080412',
        footerText: '#6a508a',
        badgeBg: '#c084fc',
        badgeText: '#0f0720',
        linkColor: '#c084fc',
        linkHover: '#d8b4fe',
    },
};

/**
 * Lighten a hex color by mixing with white.
 */
function lighten(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lr = Math.round(r + (255 - r) * amount);
    const lg = Math.round(g + (255 - g) * amount);
    const lb = Math.round(b + (255 - b) * amount);
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

/**
 * Darken a hex color by mixing with black.
 */
function darken(hex: string, amount: number): string {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const dr = Math.round(r * (1 - amount));
    const dg = Math.round(g * (1 - amount));
    const db = Math.round(b * (1 - amount));
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

/** Optional branding overrides from contentConfig.branding */
export interface BrandingOverrides {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function isValidHex(c?: string): c is string {
    return Boolean(c && HEX_RE.test(c));
}

export function generateSkinCSS(skinName: string, branding?: BrandingOverrides): string {
    const skin = { ...(skins[skinName] ?? skins.slate) };

    // Apply branding overrides — only valid hex colors are accepted
    if (branding) {
        if (isValidHex(branding.primaryColor)) {
            skin.primary = branding.primaryColor;
            skin.primaryHover = darken(branding.primaryColor, 0.15);
            skin.footerBg = branding.primaryColor;
            skin.badgeBg = branding.primaryColor;
            skin.linkColor = branding.primaryColor;
            skin.linkHover = darken(branding.primaryColor, 0.15);
        }
        if (isValidHex(branding.secondaryColor)) {
            skin.secondary = branding.secondaryColor;
        }
        if (isValidHex(branding.accentColor)) {
            skin.accent = branding.accentColor;
        }
    }

    return `:root{
  --color-primary:${skin.primary};
  --color-primary-hover:${skin.primaryHover};
  --color-secondary:${skin.secondary};
  --color-bg:${skin.bg};
  --color-bg-surface:${skin.bgSurface};
  --color-text:${skin.text};
  --color-text-muted:${skin.textMuted};
  --color-accent:${skin.accent};
  --color-accent-hover:${darken(skin.accent, 0.15)};
  --color-border:${skin.border};
  --color-border-strong:${skin.borderStrong};
  --color-success:${skin.success};
  --color-success-light:${lighten(skin.success, 0.88)};
  --color-success-hover:${darken(skin.success, 0.15)};
  --color-warning:${skin.warning};
  --color-warning-light:${lighten(skin.warning, 0.88)};
  --color-warning-hover:${darken(skin.warning, 0.15)};
  --color-error:${skin.error};
  --color-error-light:${lighten(skin.error, 0.88)};
  --color-error-hover:${darken(skin.error, 0.15)};
  --color-hero-bg:${skin.heroBg};
  --color-hero-text:${skin.heroText};
  --color-header-border:${skin.headerBorder};
  --color-footer-bg:${skin.footerBg};
  --color-footer-text:${skin.footerText};
  --color-badge-bg:${skin.badgeBg};
  --color-badge-text:${skin.badgeText};
  --color-link:${skin.linkColor};
  --color-link-hover:${skin.linkHover};
}`;
}

/**
 * Generate dark-mode overrides for light-themed skins via prefers-color-scheme.
 * Midnight skin is already dark, so it gets no override.
 */
const DARK_SKINS = new Set(['midnight', 'charcoal', 'dusk']);

export function generateDarkModeCSS(skinName: string): string {
    if (DARK_SKINS.has(skinName)) return '';
    return `
@media(prefers-color-scheme:dark){
  :root{
    --color-bg:#0f172a;
    --color-bg-surface:#1e293b;
    --color-text:#e2e8f0;
    --color-text-muted:#94a3b8;
    --color-border:#334155;
    --color-border-strong:#475569;
    --color-hero-bg:#1e293b;
    --color-hero-text:#f1f5f9;
    --color-footer-bg:#020617;
    --color-footer-text:#64748b;
    --color-header-border:#334155;
    --color-badge-bg:#38bdf8;
    --color-badge-text:#0f172a;
    --color-success-light:#064e3b;
    --color-warning-light:#78350f;
    --color-error-light:#7f1d1d;
  }
  img{opacity:0.9}
}`;
}

/** List all available skin names */
export const availableSkins = Object.keys(skins);

/**
 * Migration map: old v1 theme name → v2 skin name.
 * Used by the migration script to auto-assign skins to existing domains.
 */
export const V1_THEME_TO_SKIN: Record<string, string> = {
    'navy-serif': 'slate',
    'green-modern': 'forest',
    'medical-clean': 'slate',
    'professional-blue': 'ocean',
    'health-clean': 'forest',
    'consumer-friendly': 'ember',
    'tech-modern': 'midnight',
    'trust-minimal': 'slate',
    'hobby-vibrant': 'ember',
    'minimal-blue': 'ocean',
    'earth-inviting': 'ember',
    'high-contrast-accessible': 'slate',
    'playful-modern': 'coral',
    'masculine-dark': 'midnight',
    'enthusiast-community': 'ocean',
    'clean-general': 'slate',
    'corporate-blue': 'indigo',
    'financial-trust': 'slate',
    'artisan-warm': 'sand',
    'boutique-organic': 'sage',
    'research-dense': 'slate',
    'data-focused': 'indigo',
    'modern-saas': 'indigo',
    'product-landing': 'slate',
    'dark-premium': 'midnight',
    'dark-tech': 'midnight',
    'medical-teal': 'teal',
    'luxury-wine': 'wine',
    'creative-plum': 'plum',
    'neutral-steel': 'steel',
    'professional-cobalt': 'cobalt',
    'industrial-copper': 'copper',
    'winter-arctic': 'arctic',
    'dark-charcoal': 'charcoal',
    'dark-dusk': 'dusk',
};

// ============================================================
// Per-domain hue shifting — makes accent colors unique
// ============================================================

function hexToHsl(hex: string): [number, number, number] | null {
    const h = hex.replace('#', '');
    if (h.length !== 6) return null;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hue = 0;
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
    return [hue * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
    const hue = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function shiftHex(hex: string, degrees: number): string {
    const hsl = hexToHsl(hex);
    if (!hsl) return hex;
    return hslToHex(hsl[0] + degrees, hsl[1], hsl[2]);
}

/**
 * Generate CSS overrides that shift accent-related colors by a domain-specific
 * hue offset. Structural colors (bg, text, border) stay untouched for readability.
 */
export function generateHueShiftCSS(skinName: string, hueDegrees: number): string {
    if (hueDegrees === 0) return '';
    const skin = skins[skinName] ?? skins.slate;
    const shifted = {
        accent: shiftHex(skin.accent, hueDegrees),
        linkColor: shiftHex(skin.linkColor, hueDegrees),
        linkHover: shiftHex(skin.linkHover, hueDegrees),
        primary: shiftHex(skin.primary, hueDegrees),
        primaryHover: shiftHex(skin.primaryHover, hueDegrees),
        badgeBg: shiftHex(skin.badgeBg, hueDegrees),
    };
    return `:root{
  --color-accent:${shifted.accent};
  --color-link:${shifted.linkColor};
  --color-link-hover:${shifted.linkHover};
  --color-primary:${shifted.primary};
  --color-primary-hover:${shifted.primaryHover};
  --color-badge-bg:${shifted.badgeBg};
  --color-accent-hover:${darken(shifted.accent, 0.15)};
}`;
}

/**
 * Compute a deterministic hue offset (0-359) from a domain name.
 * Uses DJB2 hash for speed (no crypto import needed).
 */
export function domainHueOffset(domain: string): number {
    let hash = 5381;
    for (let i = 0; i < domain.length; i++) {
        hash = ((hash << 5) + hash + domain.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
}
