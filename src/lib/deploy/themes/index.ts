/**
 * Theme system barrel export.
 * Composes base, layout, component, theme-specific, and responsive styles into a single CSS string.
 *
 * v1 path: generateGlobalStyles() — monolithic CSS string blobs (existing templates)
 * v2 path: generateV2GlobalStyles() — CSS custom properties via theme tokens + skin tokens
 */

export { baseStyles } from './base';
export { componentStyles } from './components';
export { responsiveStyles } from './responsive';
export { getThemeStyles, availableThemes } from './theme-definitions';
export { resolveDomainTheme, resolveV2DomainTheme, getPolicyThemes, getV2PolicyThemeSkins, type ThemeResolution, type V2ThemeResolution, type ThemeResolutionSource } from './policy';

// v2 theme/skin system
export { generateThemeCSS, availableV2Themes, V1_THEME_TO_V2_THEME, type ThemeTokens } from './theme-tokens';
export { generateSkinCSS, generateDarkModeCSS, generateHueShiftCSS, domainHueOffset, availableSkins, V1_THEME_TO_SKIN, type SkinTokens, type BrandingOverrides } from './skin-definitions';
export { resolveThemeModifiers, generateModifierCSS, type ThemeModifiers } from './theme-modifiers';
export { resolveTypographyPreset, generateTypographyCSS, TYPOGRAPHY_PRESETS, type TypographyPreset } from './typography-presets';
export { resolveDividerStyle, generateDividerCSS, type DividerStyle } from './section-dividers';

import { baseStyles } from './base';
import { componentStyles } from './components';
import { blockVariantStyles } from './block-variants';
import { responsiveStyles } from './responsive';
import { getThemeStyles } from './theme-definitions';
import { generateDomainVariantStyles } from './variants';
import { getLayoutConfig, getLayoutStyles } from '../layouts';
import { generateThemeCSS } from './theme-tokens';
import { generateSkinCSS, generateDarkModeCSS, generateHueShiftCSS, domainHueOffset, type BrandingOverrides } from './skin-definitions';
import { resolveThemeModifiers, generateModifierCSS } from './theme-modifiers';
import { resolveTypographyPreset, generateTypographyCSS } from './typography-presets';
import { resolveDividerStyle, generateDividerCSS } from './section-dividers';
import { randomizeCSS } from './class-randomizer';

/**
 * v1: Generate the complete global CSS stylesheet for a given theme and layout.
 * Layers: base → layout → components → theme overrides → variant → responsive
 */
export function generateGlobalStyles(theme?: string, siteTemplate?: string, domain?: string): string {
    const layoutConfig = getLayoutConfig(siteTemplate);
    const layoutStyles = getLayoutStyles(layoutConfig);
    return baseStyles + layoutStyles + componentStyles + getThemeStyles(theme) + generateDomainVariantStyles(domain || 'default-domain') + responsiveStyles;
}

/**
 * v2: Generate CSS for block-based pages using the token system.
 * Layers: theme tokens → skin tokens → base → layout → components → variant → responsive
 *
 * Unlike v1, color/font values come from CSS custom properties set by the
 * theme and skin layers, so components reference var(--color-primary) etc.
 */
export function generateV2GlobalStyles(
    themeName: string,
    skinName: string,
    siteTemplate?: string,
    domain?: string,
    branding?: BrandingOverrides,
): string {
    const d = domain || 'default-domain';
    const themeVars = generateThemeCSS(themeName);
    const skinVars = generateSkinCSS(skinName, branding);
    const layoutConfig = getLayoutConfig(siteTemplate);
    const layoutStyles = getLayoutStyles(layoutConfig);
    const variantStyles = generateDomainVariantStyles(d);
    const darkMode = generateDarkModeCSS(skinName);

    // Per-domain differentiation layers
    const hueShift = generateHueShiftCSS(skinName, domainHueOffset(d));
    const modifiers = generateModifierCSS(resolveThemeModifiers(d));
    const typo = generateTypographyCSS(resolveTypographyPreset(d));
    const dividers = generateDividerCSS(resolveDividerStyle(d));

    const raw = [
        themeVars, skinVars, hueShift, typo, modifiers,
        baseStyles, layoutStyles, componentStyles, blockVariantStyles,
        variantStyles, dividers, darkMode, responsiveStyles,
    ].join('\n');
    const randomized = domain ? randomizeCSS(raw, domain) : raw;
    return minifyCSS(randomized);
}

/**
 * Lightweight CSS minification — strips comments, collapses whitespace,
 * removes unnecessary semicolons before closing braces.
 */
function minifyCSS(css: string): string {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, '')         // strip comments
        .replace(/\s*\n\s*/g, '')                  // collapse newlines
        .replace(/\s{2,}/g, ' ')                   // collapse multiple spaces
        .replace(/;\s*}/g, '}')                     // remove last semicolons
        .replace(/:\s+/g, ':')                      // collapse space after colons
        .replace(/\s*\{\s*/g, '{')                  // collapse around braces
        .replace(/\s*}\s*/g, '}')                   // collapse around braces
        .replace(/\s*,\s*/g, ',')                   // collapse around commas in selectors
        .trim();
}
