import { describe, expect, it } from 'vitest';
import { generateSkinCSS, skins } from '@/lib/deploy/themes/skin-definitions';

describe('generateSkinCSS branding overrides', () => {
    it('uses default skin tokens when no branding is provided', () => {
        const css = generateSkinCSS('slate');
        expect(css).toContain(`--color-primary:${skins.slate.primary}`);
        expect(css).toContain(`--color-secondary:${skins.slate.secondary}`);
        expect(css).toContain(`--color-accent:${skins.slate.accent}`);
    });

    it('overrides primary color and derived tokens from branding', () => {
        const css = generateSkinCSS('slate', { primaryColor: '#ff0000' });
        expect(css).toContain('--color-primary:#ff0000');
        // primaryHover, footerBg, badgeBg, linkColor should also use the override
        expect(css).not.toContain(`--color-primary:${skins.slate.primary}`);
        expect(css).toContain('--color-footer-bg:#ff0000');
        expect(css).toContain('--color-badge-bg:#ff0000');
        expect(css).toContain('--color-link:#ff0000');
        // primaryHover should be a darkened version, not the original
        expect(css).not.toContain(`--color-primary-hover:${skins.slate.primaryHover}`);
    });

    it('overrides secondary color from branding', () => {
        const css = generateSkinCSS('ocean', { secondaryColor: '#00ff00' });
        expect(css).toContain('--color-secondary:#00ff00');
        expect(css).not.toContain(`--color-secondary:${skins.ocean.secondary}`);
        // Other tokens should remain unchanged
        expect(css).toContain(`--color-primary:${skins.ocean.primary}`);
    });

    it('overrides accent color from branding', () => {
        const css = generateSkinCSS('forest', { accentColor: '#0000ff' });
        expect(css).toContain('--color-accent:#0000ff');
        expect(css).not.toContain(`--color-accent:${skins.forest.accent}`);
    });

    it('applies all three branding overrides simultaneously', () => {
        const css = generateSkinCSS('ember', {
            primaryColor: '#111111',
            secondaryColor: '#222222',
            accentColor: '#333333',
        });
        expect(css).toContain('--color-primary:#111111');
        expect(css).toContain('--color-secondary:#222222');
        expect(css).toContain('--color-accent:#333333');
    });

    it('ignores invalid hex colors (no hash)', () => {
        const css = generateSkinCSS('slate', { primaryColor: 'ff0000' });
        expect(css).toContain(`--color-primary:${skins.slate.primary}`);
    });

    it('ignores invalid hex colors (too short)', () => {
        const css = generateSkinCSS('slate', { primaryColor: '#fff' });
        expect(css).toContain(`--color-primary:${skins.slate.primary}`);
    });

    it('ignores invalid hex colors (non-hex chars)', () => {
        const css = generateSkinCSS('slate', { primaryColor: '#zzzzzz' });
        expect(css).toContain(`--color-primary:${skins.slate.primary}`);
    });

    it('ignores undefined/empty branding fields', () => {
        const css = generateSkinCSS('slate', { primaryColor: undefined, secondaryColor: '' });
        expect(css).toContain(`--color-primary:${skins.slate.primary}`);
        expect(css).toContain(`--color-secondary:${skins.slate.secondary}`);
    });

    it('falls back to slate skin when skin name is unknown', () => {
        const css = generateSkinCSS('nonexistent');
        expect(css).toContain(`--color-primary:${skins.slate.primary}`);
    });

    it('applies branding overrides even on unknown skin (falls back to slate)', () => {
        const css = generateSkinCSS('nonexistent', { primaryColor: '#abcdef' });
        expect(css).toContain('--color-primary:#abcdef');
    });
});
