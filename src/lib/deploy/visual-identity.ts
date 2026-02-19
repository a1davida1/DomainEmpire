/**
 * Visual Identity Assignment — deterministic visual combo selection per domain.
 *
 * Given a domain name, returns a curated theme/skin/variant combination
 * that's visually distinct from other domains. Uses an MD5 hash of the
 * domain name for deterministic, reproducible assignment.
 *
 * This ensures:
 * - Every domain gets a unique-looking site from all available combos
 * - The assignment is stable (same domain always gets same combo)
 * - Anti-detection: no two nearby domains share the same fingerprint
 */

import { createHash } from 'node:crypto';
import { availableV2Themes } from './themes/theme-tokens';
import { availableSkins } from './themes/skin-definitions';

export interface VisualCombo {
    theme: string;
    skin: string;
    heroVariant: string;
    headerVariant: string;
    footerVariant: string;
}

const HERO_VARIANTS = ['centered', 'gradient', 'glass', 'split', 'image', 'minimal', 'typing'] as const;
const HEADER_VARIANTS = ['topbar', 'centered', 'minimal', 'split'] as const;
const FOOTER_VARIANTS = ['multi-column', 'newsletter', 'minimal', 'legal'] as const;

/**
 * All visual combos — generated from available themes/skins with
 * deterministic variant assignment so each combo looks distinct.
 */
export const VISUAL_COMBOS: VisualCombo[] = (() => {
    const combos: VisualCombo[] = [];
    let variantIdx = 0;
    for (const theme of availableV2Themes) {
        for (const skin of availableSkins) {
            combos.push({
                theme,
                skin,
                heroVariant: HERO_VARIANTS[variantIdx % HERO_VARIANTS.length],
                headerVariant: HEADER_VARIANTS[(variantIdx + 1) % HEADER_VARIANTS.length],
                footerVariant: FOOTER_VARIANTS[(variantIdx + 2) % FOOTER_VARIANTS.length],
            });
            variantIdx++;
        }
    }
    return combos;
})();

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
