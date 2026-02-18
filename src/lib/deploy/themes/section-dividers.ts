/**
 * Section Dividers — SVG-based decorative separators between page sections.
 *
 * Each divider is an inline SVG encoded as a CSS background-image on a
 * ::before pseudo-element. Assigned per-domain via hash for visual diversity.
 */

import { createHash } from 'node:crypto';

export type DividerStyle = 'none' | 'line' | 'wave' | 'diagonal' | 'curve' | 'zigzag';

const DIVIDER_STYLES: DividerStyle[] = ['none', 'line', 'wave', 'diagonal', 'curve', 'zigzag'];

export function resolveDividerStyle(domain: string): DividerStyle {
    const hash = createHash('md5').update(domain).digest();
    return DIVIDER_STYLES[hash[7] % DIVIDER_STYLES.length];
}

function svgDataUri(svg: string): string {
    return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\n/g, '').trim())}")`;
}

function waveSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 48" preserveAspectRatio="none"><path d="M0,24 C240,48 480,0 720,24 C960,48 1200,0 1440,24 L1440,48 L0,48 Z" fill="${color}"/></svg>`;
}

function diagonalSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 48" preserveAspectRatio="none"><polygon points="0,48 1440,0 1440,48" fill="${color}"/></svg>`;
}

function curveSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 48" preserveAspectRatio="none"><path d="M0,48 Q720,-24 1440,48 Z" fill="${color}"/></svg>`;
}

function zigzagSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 24" preserveAspectRatio="none"><polyline points="0,24 60,0 120,24 180,0 240,24 300,0 360,24 420,0 480,24 540,0 600,24 660,0 720,24 780,0 840,24 900,0 960,24 1020,0 1080,24 1140,0 1200,24 1260,0 1320,24 1380,0 1440,24" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}

/**
 * Generate CSS that adds decorative dividers between sections.
 * Uses var(--color-border) as the divider color for theme compatibility.
 */
export function generateDividerCSS(style: DividerStyle): string {
    if (style === 'none') return '';

    if (style === 'line') {
        return `section + section{border-top:2px solid var(--color-border);margin-top:0;padding-top:var(--section-padding)}`;
    }

    const color = '%23e2e8f0'; // url-encoded #e2e8f0 — light gray, overridden by dark mode
    let svg: string;
    let height = '48px';

    switch (style) {
        case 'wave':
            svg = waveSvg(color);
            break;
        case 'diagonal':
            svg = diagonalSvg(color);
            break;
        case 'curve':
            svg = curveSvg(color);
            break;
        case 'zigzag':
            svg = zigzagSvg(color);
            height = '24px';
            break;
        default:
            return '';
    }

    const bgImage = svgDataUri(svg);

    return `section + section{position:relative;margin-top:0;padding-top:calc(var(--section-padding) + ${height})}
section + section::before{content:'';position:absolute;top:0;left:0;right:0;height:${height};background-image:${bgImage};background-size:100% ${height};background-repeat:no-repeat;pointer-events:none}
@media(prefers-color-scheme:dark){section + section::before{opacity:0.3}}`;
}
