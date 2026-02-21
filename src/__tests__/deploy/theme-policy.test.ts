import { describe, expect, it } from 'vitest';
import { availableThemes, getPolicyThemes, resolveDomainTheme, resolveV2DomainTheme, getV2PolicyThemeSkins, availableV2Themes } from '@/lib/deploy/themes';
import { availableSkins } from '@/lib/deploy/themes/skin-definitions';

describe('theme policy resolution', () => {
    it('keeps explicit known theme values', () => {
        const resolved = resolveDomainTheme({
            themeStyle: 'medical-clean',
            vertical: 'health',
        });

        expect(resolved.theme).toBe('medical-clean');
        expect(resolved.source).toBe('explicit');
    });

    it('falls back to vertical policy when explicit theme is unknown', () => {
        const resolved = resolveDomainTheme({
            themeStyle: 'not-a-real-theme',
            vertical: 'finance',
        });

        expect(resolved.theme).toBe('minimal-blue');
        expect(resolved.source).toBe('policy_fallback');
    });

    it('falls back to niche policy when explicit theme is empty', () => {
        const resolved = resolveDomainTheme({
            themeStyle: '',
            niche: 'travel',
        });

        expect(resolved.theme).toBe('playful-modern');
        expect(resolved.source).toBe('policy_fallback');
    });

    it('uses a global fallback when no policy match exists', () => {
        const resolved = resolveDomainTheme({
            themeStyle: null,
            vertical: 'unmapped-vertical',
            niche: 'unmapped-niche',
        });

        expect(resolved.theme).toBe('clean-general');
        expect(resolved.source).toBe('global_fallback');
    });

    it('only references policy themes that exist', () => {
        for (const theme of getPolicyThemes()) {
            expect(availableThemes).toContain(theme);
        }
    });
});

describe('v2 theme policy resolution', () => {
    // Priority 1: Explicit v2 theme + skin
    it('returns explicit v2 theme/skin when both are valid', () => {
        const resolved = resolveV2DomainTheme({
            theme: 'bold',
            skin: 'coral',
            vertical: 'health',
        });
        expect(resolved.theme).toBe('bold');
        expect(resolved.skin).toBe('coral');
        expect(resolved.source).toBe('explicit');
    });

    it('ignores explicit v2 theme when skin is missing', () => {
        const resolved = resolveV2DomainTheme({
            theme: 'bold',
            skin: null,
            vertical: 'health',
        });
        // Should fall through to policy since skin is null
        expect(resolved.source).not.toBe('explicit');
        expect(resolved.theme).toBe('clean');
        expect(resolved.skin).toBe('forest');
    });

    it('ignores explicit v2 when theme name is invalid', () => {
        const resolved = resolveV2DomainTheme({
            theme: 'nonexistent-theme',
            skin: 'slate',
            vertical: 'legal',
        });
        expect(resolved.source).toBe('policy_fallback');
    });

    it('ignores explicit v2 when skin name is invalid', () => {
        const resolved = resolveV2DomainTheme({
            theme: 'clean',
            skin: 'nonexistent-skin',
            vertical: 'legal',
        });
        expect(resolved.source).toBe('policy_fallback');
    });

    // Priority 2: v1 themeStyle → v2 mapping
    it('maps v1 themeStyle to v2 theme+skin', () => {
        const resolved = resolveV2DomainTheme({
            themeStyle: 'navy-serif',
            vertical: 'unmapped',
        });
        expect(resolved.theme).toBe('editorial');
        expect(resolved.skin).toBe('slate');
        expect(resolved.source).toBe('explicit');
    });

    it('maps v1 tech-modern to bold+midnight', () => {
        const resolved = resolveV2DomainTheme({
            themeStyle: 'tech-modern',
        });
        expect(resolved.theme).toBe('bold');
        expect(resolved.skin).toBe('midnight');
        expect(resolved.source).toBe('explicit');
    });

    it('skips v1 mapping when themeStyle is unknown', () => {
        const resolved = resolveV2DomainTheme({
            themeStyle: 'not-a-v1-theme',
            vertical: 'finance',
        });
        // Falls through to policy
        expect(resolved.theme).toBe('startup');
        expect(resolved.skin).toBe('indigo');
        expect(resolved.source).toBe('policy_fallback');
    });

    // Priority 3: Policy-based vertical/niche fallback
    it('resolves vertical to v2 theme+skin via policy', () => {
        const cases: Array<{ vertical: string; theme: string; skin: string }> = [
            { vertical: 'legal', theme: 'corporate', skin: 'slate' },
            { vertical: 'insurance', theme: 'corporate', skin: 'cobalt' },
            { vertical: 'health', theme: 'clean', skin: 'forest' },
            { vertical: 'finance', theme: 'startup', skin: 'indigo' },
            { vertical: 'real_estate', theme: 'editorial', skin: 'sand' },
            { vertical: 'medicare', theme: 'clean', skin: 'forest' },
            { vertical: 'technology', theme: 'minimal', skin: 'midnight' },
            { vertical: 'auto', theme: 'bold', skin: 'midnight' },
            { vertical: 'home', theme: 'clean', skin: 'ember' },
            { vertical: 'education', theme: 'editorial', skin: 'slate' },
            { vertical: 'travel', theme: 'bold', skin: 'coral' },
            { vertical: 'pets', theme: 'bold', skin: 'ember' },
            { vertical: 'relationships', theme: 'bold', skin: 'coral' },
            { vertical: 'business', theme: 'corporate', skin: 'steel' },
        ];
        for (const c of cases) {
            const resolved = resolveV2DomainTheme({ vertical: c.vertical });
            expect(resolved.theme).toBe(c.theme);
            expect(resolved.skin).toBe(c.skin);
            expect(resolved.source).toBe('policy_fallback');
        }
    });

    it('falls back to niche when vertical is unmapped', () => {
        const resolved = resolveV2DomainTheme({
            vertical: 'unmapped',
            niche: 'travel',
        });
        expect(resolved.theme).toBe('bold');
        expect(resolved.skin).toBe('coral');
        expect(resolved.source).toBe('policy_fallback');
    });

    it('normalizes vertical keys (spaces, hyphens, casing)', () => {
        const resolved = resolveV2DomainTheme({
            vertical: 'Real Estate',
        });
        expect(resolved.theme).toBe('editorial');
        expect(resolved.skin).toBe('sand');

        const resolved2 = resolveV2DomainTheme({
            vertical: 'REAL-ESTATE',
        });
        expect(resolved2.theme).toBe('editorial');
        expect(resolved2.skin).toBe('sand');
    });

    // Priority 4: Hard default
    it('returns clean+slate when nothing matches', () => {
        const resolved = resolveV2DomainTheme({
            themeStyle: null,
            vertical: 'unmapped',
            niche: 'unmapped',
        });
        expect(resolved.theme).toBe('clean');
        expect(resolved.skin).toBe('slate');
        expect(resolved.source).toBe('global_fallback');
    });

    it('returns clean+slate with completely empty input', () => {
        const resolved = resolveV2DomainTheme({});
        expect(resolved.theme).toBe('clean');
        expect(resolved.skin).toBe('slate');
        expect(resolved.source).toBe('global_fallback');
    });

    // Priority order: explicit v2 > v1 mapping > policy
    it('explicit v2 takes precedence over v1 themeStyle', () => {
        const resolved = resolveV2DomainTheme({
            theme: 'minimal',
            skin: 'midnight',
            themeStyle: 'navy-serif', // would map to editorial+slate
            vertical: 'health',       // would map to clean+forest
        });
        expect(resolved.theme).toBe('minimal');
        expect(resolved.skin).toBe('midnight');
        expect(resolved.source).toBe('explicit');
    });

    it('v1 mapping takes precedence over vertical policy', () => {
        const resolved = resolveV2DomainTheme({
            themeStyle: 'navy-serif', // maps to editorial+slate
            vertical: 'health',       // would map to clean+forest
        });
        expect(resolved.theme).toBe('editorial');
        expect(resolved.skin).toBe('slate');
        expect(resolved.source).toBe('explicit');
    });

    // Validation: all policy entries reference real themes/skins
    it('all v2 policy theme+skin pairs reference valid names', () => {
        const v2ThemeSet = new Set(availableV2Themes);
        const v2SkinSet = new Set(availableSkins);
        for (const pair of getV2PolicyThemeSkins()) {
            expect(v2ThemeSet).toContain(pair.theme);
            expect(v2SkinSet).toContain(pair.skin);
        }
    });
});

