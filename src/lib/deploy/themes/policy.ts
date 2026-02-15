import { availableThemes } from './theme-definitions';

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

const knownThemes = new Set(availableThemes);

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

export function getPolicyThemes(): string[] {
    return [
        ...new Set([
            ...Object.values(VERTICAL_THEME_POLICY),
            ...Object.values(NICHE_THEME_POLICY),
        ]),
    ];
}

