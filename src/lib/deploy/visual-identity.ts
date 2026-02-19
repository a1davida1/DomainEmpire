/**
 * Visual Identity Assignment — deterministic visual combo selection per domain.
 *
 * Given a domain name, returns a curated theme/skin/variant combination
 * that's visually distinct from other domains. Uses an MD5 hash of the
 * domain name for deterministic, reproducible assignment.
 *
 * This ensures:
 * - Every domain gets a unique-looking site from 48 curated combos
 * - The assignment is stable (same domain always gets same combo)
 * - Anti-detection: no two nearby domains share the same fingerprint
 */

import { createHash } from 'node:crypto';

export interface VisualCombo {
    theme: string;
    skin: string;
    heroVariant: string;
    headerVariant: string;
    footerVariant: string;
}

/**
 * 48 hand-curated visual combos — each theme+skin+variant set is designed
 * to look cohesive and professional together.
 */
export const VISUAL_COMBOS: VisualCombo[] = [
    // Clean theme — modern, light, Public Sans
    { theme: 'clean', skin: 'slate', heroVariant: 'centered', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'clean', skin: 'ocean', heroVariant: 'gradient', headerVariant: 'centered', footerVariant: 'newsletter' },
    { theme: 'clean', skin: 'forest', heroVariant: 'glass', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'clean', skin: 'ember', heroVariant: 'split', headerVariant: 'minimal', footerVariant: 'minimal' },
    { theme: 'clean', skin: 'coral', heroVariant: 'image', headerVariant: 'topbar', footerVariant: 'newsletter' },
    { theme: 'clean', skin: 'midnight', heroVariant: 'glass', headerVariant: 'centered', footerVariant: 'legal' },

    // Editorial theme — content-heavy, Merriweather headings
    { theme: 'editorial', skin: 'slate', heroVariant: 'minimal', headerVariant: 'centered', footerVariant: 'multi-column' },
    { theme: 'editorial', skin: 'ocean', heroVariant: 'centered', headerVariant: 'topbar', footerVariant: 'newsletter' },
    { theme: 'editorial', skin: 'forest', heroVariant: 'split', headerVariant: 'centered', footerVariant: 'legal' },
    { theme: 'editorial', skin: 'midnight', heroVariant: 'gradient', headerVariant: 'minimal', footerVariant: 'multi-column' },
    { theme: 'editorial', skin: 'ember', heroVariant: 'image', headerVariant: 'topbar', footerVariant: 'minimal' },
    { theme: 'editorial', skin: 'coral', heroVariant: 'typing', headerVariant: 'centered', footerVariant: 'newsletter' },

    // Bold theme — strong contrast, DM Sans + Inter
    { theme: 'bold', skin: 'midnight', heroVariant: 'glass', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'bold', skin: 'ember', heroVariant: 'gradient', headerVariant: 'minimal', footerVariant: 'newsletter' },
    { theme: 'bold', skin: 'ocean', heroVariant: 'image', headerVariant: 'centered', footerVariant: 'legal' },
    { theme: 'bold', skin: 'coral', heroVariant: 'centered', headerVariant: 'topbar', footerVariant: 'minimal' },
    { theme: 'bold', skin: 'slate', heroVariant: 'split', headerVariant: 'split', footerVariant: 'multi-column' },
    { theme: 'bold', skin: 'forest', heroVariant: 'typing', headerVariant: 'topbar', footerVariant: 'newsletter' },

    // Minimal theme — system fonts, clean whitespace
    { theme: 'minimal', skin: 'slate', heroVariant: 'minimal', headerVariant: 'minimal', footerVariant: 'minimal' },
    { theme: 'minimal', skin: 'ocean', heroVariant: 'centered', headerVariant: 'topbar', footerVariant: 'legal' },
    { theme: 'minimal', skin: 'forest', heroVariant: 'split', headerVariant: 'centered', footerVariant: 'minimal' },
    { theme: 'minimal', skin: 'midnight', heroVariant: 'gradient', headerVariant: 'minimal', footerVariant: 'multi-column' },
    { theme: 'minimal', skin: 'ember', heroVariant: 'glass', headerVariant: 'topbar', footerVariant: 'newsletter' },
    { theme: 'minimal', skin: 'coral', heroVariant: 'image', headerVariant: 'centered', footerVariant: 'legal' },

    // Magazine theme — editorial luxury, Playfair Display + Source Serif 4
    { theme: 'magazine', skin: 'slate', heroVariant: 'centered', headerVariant: 'centered', footerVariant: 'multi-column' },
    { theme: 'magazine', skin: 'ocean', heroVariant: 'image', headerVariant: 'minimal', footerVariant: 'newsletter' },
    { theme: 'magazine', skin: 'forest', heroVariant: 'minimal', headerVariant: 'centered', footerVariant: 'legal' },
    { theme: 'magazine', skin: 'ember', heroVariant: 'split', headerVariant: 'topbar', footerVariant: 'minimal' },
    { theme: 'magazine', skin: 'midnight', heroVariant: 'gradient', headerVariant: 'centered', footerVariant: 'multi-column' },
    { theme: 'magazine', skin: 'coral', heroVariant: 'centered', headerVariant: 'minimal', footerVariant: 'newsletter' },

    // Brutalist theme — anti-design, Space Mono + IBM Plex Sans
    { theme: 'brutalist', skin: 'slate', heroVariant: 'minimal', headerVariant: 'topbar', footerVariant: 'minimal' },
    { theme: 'brutalist', skin: 'ocean', heroVariant: 'centered', headerVariant: 'minimal', footerVariant: 'multi-column' },
    { theme: 'brutalist', skin: 'forest', heroVariant: 'split', headerVariant: 'topbar', footerVariant: 'legal' },
    { theme: 'brutalist', skin: 'ember', heroVariant: 'gradient', headerVariant: 'split', footerVariant: 'minimal' },
    { theme: 'brutalist', skin: 'midnight', heroVariant: 'centered', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'brutalist', skin: 'coral', heroVariant: 'split', headerVariant: 'minimal', footerVariant: 'legal' },

    // Glass theme — modern SaaS, frosted glass, Inter
    { theme: 'glass', skin: 'slate', heroVariant: 'glass', headerVariant: 'minimal', footerVariant: 'newsletter' },
    { theme: 'glass', skin: 'ocean', heroVariant: 'gradient', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'glass', skin: 'forest', heroVariant: 'glass', headerVariant: 'centered', footerVariant: 'minimal' },
    { theme: 'glass', skin: 'ember', heroVariant: 'centered', headerVariant: 'minimal', footerVariant: 'legal' },
    { theme: 'glass', skin: 'midnight', heroVariant: 'glass', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'glass', skin: 'coral', heroVariant: 'gradient', headerVariant: 'centered', footerVariant: 'newsletter' },

    // Retro theme — warm, playful, Quicksand + Nunito
    { theme: 'retro', skin: 'slate', heroVariant: 'centered', headerVariant: 'split', footerVariant: 'multi-column' },
    { theme: 'retro', skin: 'ocean', heroVariant: 'split', headerVariant: 'topbar', footerVariant: 'newsletter' },
    { theme: 'retro', skin: 'forest', heroVariant: 'gradient', headerVariant: 'centered', footerVariant: 'legal' },
    { theme: 'retro', skin: 'ember', heroVariant: 'image', headerVariant: 'split', footerVariant: 'minimal' },
    { theme: 'retro', skin: 'midnight', heroVariant: 'glass', headerVariant: 'topbar', footerVariant: 'multi-column' },
    { theme: 'retro', skin: 'coral', heroVariant: 'centered', headerVariant: 'centered', footerVariant: 'newsletter' },
];

/**
 * Get a deterministic visual combo for a domain name.
 * Same domain always returns the same combo.
 */
export function getVisualCombo(domain: string): VisualCombo {
    const hash = createHash('md5').update(domain).digest();
    const idx = hash.readUInt32BE(0) % VISUAL_COMBOS.length;
    return VISUAL_COMBOS[idx];
}

/**
 * Apply a visual combo's variants to a block sequence.
 * Updates Hero, Header, and Footer variants to match the combo.
 */
export function applyVisualCombo<T extends { type: string; variant?: string }>(
    blocks: T[],
    combo: VisualCombo,
): T[] {
    return blocks.map(b => {
        if (b.type === 'Hero') return { ...b, variant: combo.heroVariant };
        if (b.type === 'Header') return { ...b, variant: combo.headerVariant };
        if (b.type === 'Footer') return { ...b, variant: combo.footerVariant };
        return b;
    });
}
