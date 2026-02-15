import { describe, expect, it } from 'vitest';
import { availableThemes, getPolicyThemes, resolveDomainTheme } from '@/lib/deploy/themes';

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

