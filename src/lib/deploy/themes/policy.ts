import { availableThemes } from './theme-definitions';
import { V1_THEME_TO_V2_THEME, themes as v2Themes } from './theme-tokens';
import { V1_THEME_TO_SKIN, skins as v2Skins } from './skin-definitions';

export type ResolveThemeInput = {
    themeStyle?: string | null;
    vertical?: string | null;
    niche?: string | null;
};

export type ThemeResolutionSource = 'explicit' | 'policy_fallback' | 'global_fallback';

export interface ThemeResolution {
    theme: string;
    source: ThemeResolutionSource;
}

/** v2 resolution returns both a structural theme and a color skin. */
export interface V2ThemeResolution {
    theme: string;
    skin: string;
    source: ThemeResolutionSource;
}

const knownThemes = new Set(availableThemes);
const knownV2Themes = new Set(Object.keys(v2Themes));
const knownV2Skins = new Set(Object.keys(v2Skins));

/**
 * Policy maps: vertical/niche → v2 theme + skin pairs.
 * These map directly to the v2 token system, bypassing v1 entirely.
 */
const VERTICAL_V2_POLICY: Record<string, { theme: string; skin: string }> = {
    legal:         { theme: 'editorial', skin: 'slate' },
    insurance:     { theme: 'bold',      skin: 'ocean' },
    health:        { theme: 'clean',     skin: 'forest' },
    finance:       { theme: 'bold',      skin: 'ocean' },
    real_estate:   { theme: 'editorial', skin: 'ember' },
    medicare:      { theme: 'clean',     skin: 'forest' },
    technology:    { theme: 'minimal',   skin: 'midnight' },
    auto:          { theme: 'bold',      skin: 'midnight' },
    home:          { theme: 'clean',     skin: 'ember' },
    education:     { theme: 'editorial', skin: 'slate' },
    travel:        { theme: 'bold',      skin: 'coral' },
    pets:          { theme: 'bold',      skin: 'ember' },
    relationships: { theme: 'bold',      skin: 'coral' },
    business:      { theme: 'editorial', skin: 'ocean' },
    other:         { theme: 'clean',     skin: 'slate' },
};

const NICHE_V2_POLICY: Record<string, { theme: string; skin: string }> = {
    legal:           { theme: 'editorial', skin: 'slate' },
    insurance:       { theme: 'bold',      skin: 'ocean' },
    health:          { theme: 'clean',     skin: 'forest' },
    finance:         { theme: 'bold',      skin: 'ocean' },
    real_estate:     { theme: 'editorial', skin: 'ember' },
    medicare:        { theme: 'clean',     skin: 'forest' },
    technology:      { theme: 'minimal',   skin: 'midnight' },
    auto:            { theme: 'bold',      skin: 'midnight' },
    home:            { theme: 'clean',     skin: 'ember' },
    education:       { theme: 'editorial', skin: 'slate' },
    travel:          { theme: 'bold',      skin: 'coral' },
    pets:            { theme: 'bold',      skin: 'ember' },
    relationships:   { theme: 'bold',      skin: 'coral' },
    business:        { theme: 'editorial', skin: 'ocean' },
    wellness:        { theme: 'craft',     skin: 'sage' },
    beauty:          { theme: 'magazine',  skin: 'rose' },
    food:            { theme: 'craft',     skin: 'copper' },
    diy:             { theme: 'craft',     skin: 'sand' },
    parenting:       { theme: 'retro',     skin: 'rose' },
    gaming:          { theme: 'noir',      skin: 'dusk' },
    sports:          { theme: 'bold',      skin: 'cobalt' },
    science:         { theme: 'academic',  skin: 'steel' },
    personal_finance:{ theme: 'startup',   skin: 'indigo' },
    dental:          { theme: 'clean',     skin: 'teal' },
    creator_economy: { theme: 'startup',   skin: 'plum' },
    medical:         { theme: 'clean',     skin: 'teal' },
    luxury:          { theme: 'magazine',  skin: 'wine' },
    automotive:      { theme: 'bold',      skin: 'charcoal' },
    outdoor:         { theme: 'craft',     skin: 'arctic' },
    construction:    { theme: 'bold',      skin: 'copper' },
    general:         { theme: 'clean',     skin: 'slate' },
    other:           { theme: 'clean',     skin: 'slate' },
};

// Legacy v1 policy maps (kept for v1 rendering path)
const VERTICAL_THEME_POLICY: Record<string, string> = {
    legal: 'navy-serif',
    insurance: 'green-modern',
    health: 'medical-clean',
    finance: 'minimal-blue',
    real_estate: 'earth-inviting',
    medicare: 'high-contrast-accessible',
    technology: 'tech-modern',
    auto: 'masculine-dark',
    home: 'earth-inviting',
    education: 'trust-minimal',
    travel: 'playful-modern',
    pets: 'hobby-vibrant',
    relationships: 'consumer-friendly',
    business: 'professional-blue',
    other: 'clean-general',
};

const NICHE_THEME_POLICY: Record<string, string> = {
    legal: 'navy-serif',
    insurance: 'green-modern',
    health: 'medical-clean',
    finance: 'minimal-blue',
    real_estate: 'earth-inviting',
    medicare: 'high-contrast-accessible',
    technology: 'tech-modern',
    auto: 'masculine-dark',
    home: 'earth-inviting',
    education: 'trust-minimal',
    travel: 'playful-modern',
    pets: 'hobby-vibrant',
    relationships: 'consumer-friendly',
    business: 'professional-blue',
    general: 'clean-general',
    other: 'clean-general',
};

function normalizeKey(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase().replaceAll(/[\s-]+/g, '_');
    return normalized.length > 0 ? normalized : null;
}

function isKnownTheme(theme?: string | null): theme is string {
    return Boolean(theme && knownThemes.has(theme));
}

function isKnownV2Theme(theme?: string | null): theme is string {
    return Boolean(theme && knownV2Themes.has(theme));
}

function isKnownV2Skin(skin?: string | null): skin is string {
    return Boolean(skin && knownV2Skins.has(skin));
}

function resolvePolicyTheme(vertical?: string | null, niche?: string | null): string | null {
    const verticalKey = normalizeKey(vertical);
    if (verticalKey && VERTICAL_THEME_POLICY[verticalKey]) {
        return VERTICAL_THEME_POLICY[verticalKey];
    }

    const nicheKey = normalizeKey(niche);
    if (nicheKey && NICHE_THEME_POLICY[nicheKey]) {
        return NICHE_THEME_POLICY[nicheKey];
    }

    return null;
}

/** Resolve v1 theme for legacy template rendering. */
export function resolveDomainTheme(input: ResolveThemeInput): ThemeResolution {
    const requested = input.themeStyle?.trim() || null;
    if (isKnownTheme(requested)) {
        return {
            theme: requested,
            source: 'explicit',
        };
    }

    const policyTheme = resolvePolicyTheme(input.vertical, input.niche);
    if (policyTheme && isKnownTheme(policyTheme)) {
        return {
            theme: policyTheme,
            source: 'policy_fallback',
        };
    }

    const globalFallback = process.env.GLOBAL_FALLBACK_THEME?.trim() || 'clean-general';
    const validatedFallback = isKnownTheme(globalFallback) ? globalFallback : availableThemes[0] ?? 'clean-general';
    return {
        theme: validatedFallback,
        source: 'global_fallback',
    };
}

/**
 * Resolve v2 theme + skin for the block-based token system.
 *
 * Priority:
 * 1. Explicit v2 theme/skin if provided and valid
 * 2. Explicit v1 themeStyle → mapped via V1_THEME_TO_V2_THEME/V1_THEME_TO_SKIN
 * 3. Policy-based resolution using vertical/niche → v2 theme+skin
 * 4. Hard default: clean + slate
 */
export function resolveV2DomainTheme(input: ResolveThemeInput & {
    theme?: string | null;
    skin?: string | null;
}): V2ThemeResolution {
    // 1. Explicit v2 theme/skin
    const explicitTheme = input.theme?.trim() || null;
    const explicitSkin = input.skin?.trim() || null;
    if (isKnownV2Theme(explicitTheme) && isKnownV2Skin(explicitSkin)) {
        return { theme: explicitTheme, skin: explicitSkin, source: 'explicit' };
    }

    // 2. v1 themeStyle → v2 mapping
    const v1Theme = input.themeStyle?.trim() || null;
    if (v1Theme && V1_THEME_TO_V2_THEME[v1Theme]) {
        return {
            theme: V1_THEME_TO_V2_THEME[v1Theme],
            skin: V1_THEME_TO_SKIN[v1Theme] || 'slate',
            source: 'explicit',
        };
    }

    // 3. Policy-based: vertical/niche → v2 theme+skin
    const verticalKey = normalizeKey(input.vertical);
    if (verticalKey && VERTICAL_V2_POLICY[verticalKey]) {
        const policy = VERTICAL_V2_POLICY[verticalKey];
        return { theme: policy.theme, skin: policy.skin, source: 'policy_fallback' };
    }
    const nicheKey = normalizeKey(input.niche);
    if (nicheKey && NICHE_V2_POLICY[nicheKey]) {
        const policy = NICHE_V2_POLICY[nicheKey];
        return { theme: policy.theme, skin: policy.skin, source: 'policy_fallback' };
    }

    // 4. Hard default
    return { theme: 'clean', skin: 'slate', source: 'global_fallback' };
}

export function getPolicyThemes(): string[] {
    return [
        ...new Set([
            ...Object.values(VERTICAL_THEME_POLICY),
            ...Object.values(NICHE_THEME_POLICY),
        ]),
    ];
}

/** Return deduplicated v2 theme+skin pairs used by the policy system. */
export function getV2PolicyThemeSkins(): Array<{ theme: string; skin: string }> {
    const seen = new Set<string>();
    const result: Array<{ theme: string; skin: string }> = [];
    for (const pair of [...Object.values(VERTICAL_V2_POLICY), ...Object.values(NICHE_V2_POLICY)]) {
        const key = `${pair.theme}:${pair.skin}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(pair);
        }
    }
    return result;
}

