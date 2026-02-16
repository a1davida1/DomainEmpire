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
export { resolveDomainTheme, getPolicyThemes, type ThemeResolution, type ThemeResolutionSource } from './policy';

// v2 theme/skin system
export { generateThemeCSS, availableV2Themes, V1_THEME_TO_V2_THEME, type ThemeTokens } from './theme-tokens';
export { generateSkinCSS, availableSkins, V1_THEME_TO_SKIN, type SkinTokens } from './skin-definitions';

import { baseStyles } from './base';
import { componentStyles } from './components';
import { responsiveStyles } from './responsive';
import { getThemeStyles } from './theme-definitions';
import { generateDomainVariantStyles } from './variants';
import { getLayoutConfig, getLayoutStyles } from '../layouts';
import { generateThemeCSS } from './theme-tokens';
import { generateSkinCSS } from './skin-definitions';

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
): string {
    const themeVars = generateThemeCSS(themeName);
    const skinVars = generateSkinCSS(skinName);
    const layoutConfig = getLayoutConfig(siteTemplate);
    const layoutStyles = getLayoutStyles(layoutConfig);
    const variantStyles = generateDomainVariantStyles(domain || 'default-domain');
    return themeVars + '\n' + skinVars + '\n' + baseStyles + layoutStyles + componentStyles + variantStyles + responsiveStyles;
}
