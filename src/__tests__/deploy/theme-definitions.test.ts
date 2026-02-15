import { describe, expect, it } from 'vitest';
import { availableThemes, getThemeStyles } from '@/lib/deploy/themes';

describe('theme definitions', () => {
    it('includes all seeded bucket themes', () => {
        const required = [
            'navy-serif',
            'green-modern',
            'medical-clean',
            'minimal-blue',
            'earth-inviting',
            'high-contrast-accessible',
            'playful-modern',
            'masculine-dark',
            'enthusiast-community',
            'clean-general',
        ];
        for (const theme of required) {
            expect(availableThemes).toContain(theme);
        }
    });

    it('returns non-default css for a seeded theme', () => {
        const css = getThemeStyles('minimal-blue');
        expect(css).toContain('Source Sans Pro');
        expect(css).toContain('#1d4ed8');
    });
});

