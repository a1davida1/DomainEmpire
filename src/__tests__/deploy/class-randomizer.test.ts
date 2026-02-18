import { describe, it, expect } from 'vitest';
import { getDomainPrefix, randomizeCSS, randomizeHTML, buildClassMap } from '@/lib/deploy/themes/class-randomizer';

describe('class-randomizer', () => {
    it('getDomainPrefix returns 3-char lowercase alpha string', () => {
        const prefix = getDomainPrefix('example.com');
        expect(prefix).toMatch(/^[a-z]{3}$/);
    });

    it('getDomainPrefix is deterministic', () => {
        const a = getDomainPrefix('test-domain.net');
        const b = getDomainPrefix('test-domain.net');
        expect(a).toBe(b);
    });

    it('getDomainPrefix varies across domains', () => {
        const prefixes = new Set([
            getDomainPrefix('alpha.com'),
            getDomainPrefix('beta.com'),
            getDomainPrefix('gamma.com'),
            getDomainPrefix('delta.com'),
        ]);
        // At least 3 unique out of 4 (hash collisions theoretically possible but extremely unlikely)
        expect(prefixes.size).toBeGreaterThanOrEqual(3);
    });

    it('randomizeCSS replaces class selectors with prefixed versions', () => {
        const css = '.hero-cta{color:red} .header-nav{display:flex} .review-card:hover{opacity:1}';
        const result = randomizeCSS(css, 'mysite.com');
        const p = getDomainPrefix('mysite.com');
        expect(result).toContain(`.${p}-hero-cta`);
        expect(result).toContain(`.${p}-header-nav`);
        expect(result).toContain(`.${p}-review-card`);
        expect(result).not.toContain('.hero-cta{');
        expect(result).not.toContain('.header-nav{');
    });

    it('randomizeCSS does not touch non-fingerprint classes', () => {
        const css = '.my-custom-class{color:blue} h1{font-size:2rem}';
        const result = randomizeCSS(css, 'mysite.com');
        expect(result).toContain('.my-custom-class');
        expect(result).toContain('h1{');
    });

    it('randomizeHTML replaces class names in HTML attributes', () => {
        const html = '<div class="header-nav nav-open"><a class="cta-button">Click</a></div>';
        const result = randomizeHTML(html, 'mysite.com');
        const p = getDomainPrefix('mysite.com');
        expect(result).toContain(`${p}-header-nav`);
        expect(result).toContain(`${p}-nav-open`);
        expect(result).toContain(`${p}-cta-button`);
    });

    it('randomizeHTML replaces class names in querySelector strings', () => {
        const html = "document.querySelector('.back-to-top')";
        const result = randomizeHTML(html, 'example.org');
        const p = getDomainPrefix('example.org');
        expect(result).toContain(`${p}-back-to-top`);
    });

    it('buildClassMap returns correct number of entries', () => {
        const map = buildClassMap('test.com');
        expect(map.size).toBeGreaterThan(50);
        // Every value should start with the prefix
        const p = getDomainPrefix('test.com');
        for (const [_key, value] of map) {
            expect(value).toMatch(new RegExp(`^${p}-`));
        }
    });

    it('CSS and HTML randomization use the same prefix for a domain', () => {
        const domain = 'consistent.com';
        const css = randomizeCSS('.cta-button{color:red}', domain);
        const html = randomizeHTML('<a class="cta-button">Go</a>', domain);
        const p = getDomainPrefix(domain);
        expect(css).toContain(`.${p}-cta-button`);
        expect(html).toContain(`${p}-cta-button`);
    });

    it('different domains produce different class names', () => {
        const css1 = randomizeCSS('.hero-cta{color:red}', 'site-a.com');
        const css2 = randomizeCSS('.hero-cta{color:red}', 'site-b.com');
        const p1 = getDomainPrefix('site-a.com');
        const p2 = getDomainPrefix('site-b.com');
        if (p1 !== p2) {
            expect(css1).not.toBe(css2);
        }
    });
});
