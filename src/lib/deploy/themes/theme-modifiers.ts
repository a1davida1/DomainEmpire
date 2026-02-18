/**
 * Theme Modifiers — independent visual axes that multiply the combinatorial
 * design space beyond the base 4 themes x 6 skins.
 *
 * Each modifier is deterministically assigned per-domain via a hash seed,
 * producing 3,456+ visually distinct combinations.
 */

import { createHash } from 'node:crypto';

export interface ThemeModifiers {
    density: 'compact' | 'normal' | 'spacious';
    cardStyle: 'flat' | 'elevated' | 'bordered' | 'glass';
    headingStyle: 'standard' | 'underlined' | 'highlight';
}

const DENSITIES: ThemeModifiers['density'][] = ['compact', 'normal', 'spacious'];
const CARD_STYLES: ThemeModifiers['cardStyle'][] = ['flat', 'elevated', 'bordered', 'glass'];
const HEADING_STYLES: ThemeModifiers['headingStyle'][] = ['standard', 'underlined', 'highlight'];

function domainHash(domain: string): Buffer {
    return createHash('md5').update(domain).digest();
}

/** Deterministic modifier selection per domain. */
export function resolveThemeModifiers(domain: string): ThemeModifiers {
    const hash = domainHash(domain);
    return {
        density: DENSITIES[hash[4] % DENSITIES.length],
        cardStyle: CARD_STYLES[hash[5] % CARD_STYLES.length],
        headingStyle: HEADING_STYLES[hash[6] % HEADING_STYLES.length],
    };
}

/** Generate CSS custom properties for the resolved modifiers. */
export function generateModifierCSS(mods: ThemeModifiers): string {
    const parts: string[] = [];

    // Density
    switch (mods.density) {
        case 'compact':
            parts.push(`:root{--mod-spacing-mult:0.82;--mod-section-pad:2.5rem;--mod-container-nudge:-40px}`);
            parts.push(`section{padding-top:calc(var(--section-padding) * 0.82);padding-bottom:calc(var(--section-padding) * 0.82)}`);
            parts.push(`article p,article li{margin-bottom:calc(var(--spacing-unit) * 0.82)}`);
            break;
        case 'spacious':
            parts.push(`:root{--mod-spacing-mult:1.2;--mod-section-pad:4.5rem;--mod-container-nudge:40px}`);
            parts.push(`section{padding-top:calc(var(--section-padding) * 1.2);padding-bottom:calc(var(--section-padding) * 1.2)}`);
            parts.push(`article p,article li{margin-bottom:calc(var(--spacing-unit) * 1.2)}`);
            break;
    }

    // Card style
    switch (mods.cardStyle) {
        case 'flat':
            parts.push(`.calc-form,.lead-form,.wizard-step,.faq-item,.comparison-verdict,.review-card,.pricing-card,.testimonial-card{box-shadow:none;border:1px solid var(--color-border)}`);
            break;
        case 'elevated':
            parts.push(`.calc-form,.lead-form,.wizard-step,.faq-item,.comparison-verdict,.review-card,.pricing-card,.testimonial-card{box-shadow:0 8px 30px rgba(0,0,0,0.08);border:none}`);
            break;
        case 'bordered':
            parts.push(`.calc-form,.lead-form,.wizard-step,.faq-item,.comparison-verdict,.review-card,.pricing-card,.testimonial-card{box-shadow:none;border:2px solid var(--color-border-strong)}`);
            break;
        case 'glass':
            parts.push(`.calc-form,.lead-form,.wizard-step,.faq-item,.comparison-verdict,.review-card,.pricing-card,.testimonial-card{box-shadow:0 4px 16px rgba(0,0,0,0.06);border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);background:color-mix(in srgb,var(--color-bg-surface) 85%,transparent)}`);
            break;
    }

    // Heading style
    switch (mods.headingStyle) {
        case 'underlined':
            parts.push(`article h2{padding-bottom:0.5rem;border-bottom:3px solid var(--color-accent);display:inline-block}`);
            parts.push(`article h3{padding-bottom:0.35rem;border-bottom:2px solid var(--color-border)}`);
            break;
        case 'highlight':
            parts.push(`article h2{background:linear-gradient(to top,color-mix(in srgb,var(--color-accent) 12%,transparent) 40%,transparent 40%);display:inline;padding:0 0.15em}`);
            parts.push(`article h3{background:linear-gradient(to top,color-mix(in srgb,var(--color-accent) 8%,transparent) 35%,transparent 35%);display:inline;padding:0 0.1em}`);
            break;
    }

    return parts.join('\n');
}
