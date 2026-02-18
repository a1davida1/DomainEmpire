/**
 * Per-domain Favicon Generator — creates unique colored lettermark SVG favicons.
 *
 * Each domain gets a favicon derived from its first letter and skin accent color,
 * making browser tabs visually distinct across the portfolio.
 */

import { skins } from './themes/skin-definitions';

export interface FaviconOptions {
    domain: string;
    skin: string;
    niche?: string;
}

function escSvg(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate an SVG favicon with the domain's first letter on a colored background.
 */
export function generateFavicon(opts: FaviconOptions): string {
    const skinTokens = skins[opts.skin] ?? skins.slate;
    const bgColor = skinTokens.primary;
    const textColor = skinTokens.badgeText;

    const domainBase = opts.domain
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '')
        .replace(/^www\./, '');
    const letter = domainBase.charAt(0).toUpperCase() || 'D';

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${bgColor}"/>
  <text x="32" y="44" text-anchor="middle" font-family="system-ui,sans-serif" font-size="36" font-weight="700" fill="${textColor}">${escSvg(letter)}</text>
</svg>`;
}
