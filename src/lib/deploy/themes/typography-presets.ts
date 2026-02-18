/**
 * Typography Presets — 12 curated font pairings assigned per-domain.
 *
 * Each preset provides a heading font, body font, and Google Fonts URL.
 * The base 4 themes define default fonts; these presets override them
 * for additional variation within the same structural theme.
 */

import { createHash } from 'node:crypto';

export interface TypographyPreset {
    id: string;
    headingFont: string;
    bodyFont: string;
    googleFontsUrl: string;
}

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
    {
        id: 'public-sans',
        headingFont: 'Public Sans, system-ui, sans-serif',
        bodyFont: 'Public Sans, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
    },
    {
        id: 'merriweather-source',
        headingFont: 'Merriweather, Georgia, serif',
        bodyFont: 'Source Sans 3, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,900;1,400&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
    },
    {
        id: 'dm-inter',
        headingFont: 'DM Sans, system-ui, sans-serif',
        bodyFont: 'Inter, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Inter:wght@400;500;600;700&display=swap',
    },
    {
        id: 'lora-roboto',
        headingFont: 'Lora, Georgia, serif',
        bodyFont: 'Roboto, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Roboto:wght@400;500;700&display=swap',
    },
    {
        id: 'playfair-lato',
        headingFont: 'Playfair Display, Georgia, serif',
        bodyFont: 'Lato, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Lato:wght@400;700&display=swap',
    },
    {
        id: 'nunito-open',
        headingFont: 'Nunito, system-ui, sans-serif',
        bodyFont: 'Open Sans, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Open+Sans:wght@400;500;600;700&display=swap',
    },
    {
        id: 'bitter-source',
        headingFont: 'Bitter, Georgia, serif',
        bodyFont: 'Source Sans 3, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,400;0,600;0,700;1,400&family=Source+Sans+3:wght@400;500;600;700&display=swap',
    },
    {
        id: 'crimson-montserrat',
        headingFont: 'Crimson Text, Georgia, serif',
        bodyFont: 'Montserrat, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&family=Montserrat:wght@400;500;600;700&display=swap',
    },
    {
        id: 'baskerville-raleway',
        headingFont: 'Libre Baskerville, Georgia, serif',
        bodyFont: 'Raleway, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Raleway:wght@400;500;600;700&display=swap',
    },
    {
        id: 'space-work',
        headingFont: 'Space Grotesk, system-ui, sans-serif',
        bodyFont: 'Work Sans, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&display=swap',
    },
    {
        id: 'outfit-figtree',
        headingFont: 'Outfit, system-ui, sans-serif',
        bodyFont: 'Figtree, system-ui, sans-serif',
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Figtree:wght@400;500;600;700&display=swap',
    },
    {
        id: 'system',
        headingFont: 'system-ui, -apple-system, sans-serif',
        bodyFont: 'system-ui, -apple-system, sans-serif',
        googleFontsUrl: '',
    },
];

/** Deterministic preset selection per domain. */
export function resolveTypographyPreset(domain: string): TypographyPreset {
    const hash = createHash('md5').update(domain).digest();
    const idx = hash.readUInt32BE(8) % TYPOGRAPHY_PRESETS.length;
    return TYPOGRAPHY_PRESETS[idx];
}

/** Generate CSS custom property overrides for a typography preset. */
export function generateTypographyCSS(preset: TypographyPreset): string {
    return `:root{--font-heading:${preset.headingFont};--font-body:${preset.bodyFont}}`;
}
