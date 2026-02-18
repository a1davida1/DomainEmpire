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
        badgeBg: '#22c55e',
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
        badgeBg: '#fb7185',
        badgeText: '#ffffff',
        linkColor: '#7c3aed',
        linkHover: '#6d28d9',
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
export function generateDarkModeCSS(skinName: string): string {
    if (skinName === 'midnight') return '';
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
 * Uses the same MD5-hash approach as visual-identity.ts.
 */
export function domainHueOffset(domain: string): number {
    let hash = 5381;
    for (let i = 0; i < domain.length; i++) {
        hash = ((hash << 5) + hash + domain.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
}
