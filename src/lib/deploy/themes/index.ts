/**
 * Theme system barrel export.
 * Composes base, layout, component, theme-specific, and responsive styles into a single CSS string.
 */

export { baseStyles } from './base';
export { componentStyles } from './components';
export { responsiveStyles } from './responsive';
export { getThemeStyles, availableThemes } from './theme-definitions';

import { baseStyles } from './base';
import { componentStyles } from './components';
import { responsiveStyles } from './responsive';
import { getThemeStyles } from './theme-definitions';
import { getLayoutConfig, getLayoutStyles } from '../layouts';

/**
 * Generate the complete global CSS stylesheet for a given theme and layout.
 * Layers: base → layout → components → theme overrides → responsive breakpoints
 */
export function generateGlobalStyles(theme?: string, siteTemplate?: string): string {
    const layoutConfig = getLayoutConfig(siteTemplate);
    const layoutStyles = getLayoutStyles(layoutConfig);
    return baseStyles + layoutStyles + componentStyles + getThemeStyles(theme) + responsiveStyles;
}
