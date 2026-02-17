/**
 * Tests for the deploy-time image generation pipeline.
 */
import { describe, it, expect } from 'vitest';
import {
    generateOgImage,
    generateHeroImage,
    generateArticleImage,
    generateSiteImages,
    getOgImagePath,
    getFeaturedImagePath,
} from '@/lib/deploy/image-gen';

describe('OG social card generator', () => {
    it('produces valid SVG with correct dimensions', () => {
        const svg = generateOgImage({
            title: 'Best Health Insurance Plans 2026',
            siteName: 'HealthGuide',
            domain: 'healthguide.com',
            niche: 'insurance',
            skin: 'ocean',
        });
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('viewBox="0 0 1200 630"');
        expect(svg).toContain('width="1200"');
        expect(svg).toContain('height="630"');
    });

    it('includes title and domain text', () => {
        const svg = generateOgImage({
            title: 'Top 10 Budget Apps',
            siteName: 'FinanceHub',
            domain: 'financehub.com',
            niche: 'finance',
            skin: 'slate',
        });
        expect(svg).toContain('Top 10 Budget Apps');
        expect(svg).toContain('financehub.com');
        expect(svg).toContain('FinanceHub');
    });

    it('truncates very long titles', () => {
        const longTitle = 'A'.repeat(80);
        const svg = generateOgImage({
            title: longTitle,
            siteName: 'Test',
            domain: 'test.com',
            niche: 'general',
            skin: 'slate',
        });
        expect(svg).toContain('…');
        expect(svg).not.toContain(longTitle);
    });

    it('uses niche-specific gradient colors', () => {
        const healthSvg = generateOgImage({
            title: 'Test',
            siteName: 'Test',
            domain: 'test.com',
            niche: 'health',
            skin: 'slate',
        });
        // Health niche uses green gradients
        expect(healthSvg).toContain('#10b981');

        const financeSvg = generateOgImage({
            title: 'Test',
            siteName: 'Test',
            domain: 'test.com',
            niche: 'finance',
            skin: 'slate',
        });
        // Finance niche uses blue gradients
        expect(financeSvg).toContain('#2563eb');
    });

    it('includes pattern element', () => {
        const svg = generateOgImage({
            title: 'Test',
            siteName: 'Test',
            domain: 'test.com',
            niche: 'technology',
            skin: 'slate',
        });
        expect(svg).toContain('<pattern id="p"');
    });

    it('shows niche label badge', () => {
        const svg = generateOgImage({
            title: 'Test',
            siteName: 'Test',
            domain: 'test.com',
            niche: 'travel',
            skin: 'ocean',
        });
        expect(svg).toContain('TRAVEL');
    });
});

describe('Hero background generator', () => {
    it('produces valid SVG with default dimensions', () => {
        const svg = generateHeroImage({ niche: 'health', skin: 'forest' });
        expect(svg).toContain('viewBox="0 0 1440 600"');
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it('respects custom dimensions', () => {
        const svg = generateHeroImage({ niche: 'tech', skin: 'slate', width: 800, height: 300 });
        expect(svg).toContain('viewBox="0 0 800 300"');
    });

    it('uses skin background colors', () => {
        const svg = generateHeroImage({ niche: 'finance', skin: 'midnight' });
        // Midnight skin bg is #0f172a
        expect(svg).toContain('#0f172a');
    });

    it('includes niche-appropriate pattern', () => {
        const svg = generateHeroImage({ niche: 'health', skin: 'slate' });
        // Health uses crosses pattern
        expect(svg).toContain('<pattern id="p"');
    });

    it('includes floating decorative shapes', () => {
        const svg = generateHeroImage({ niche: 'gaming', skin: 'midnight' });
        expect(svg).toContain('<circle');
        expect(svg).toContain('opacity=');
    });
});

describe('Article featured image generator', () => {
    it('produces valid SVG with correct dimensions', () => {
        const svg = generateArticleImage({
            title: 'How to Choose the Right Insurance',
            niche: 'insurance',
            skin: 'ocean',
        });
        expect(svg).toContain('viewBox="0 0 1200 400"');
        expect(svg).toContain('width="1200"');
    });

    it('includes article title', () => {
        const svg = generateArticleImage({
            title: 'Budget Tips for 2026',
            niche: 'finance',
            skin: 'slate',
        });
        expect(svg).toContain('Budget Tips for 2026');
    });

    it('truncates long titles', () => {
        const longTitle = 'B'.repeat(60);
        const svg = generateArticleImage({
            title: longTitle,
            niche: 'tech',
            skin: 'slate',
        });
        expect(svg).toContain('…');
    });

    it('shows niche label', () => {
        const svg = generateArticleImage({
            title: 'Test',
            niche: 'beauty',
            skin: 'coral',
        });
        expect(svg).toContain('BEAUTY');
    });
});

describe('generateSiteImages', () => {
    it('generates hero background, OG images, and featured images', () => {
        const images = generateSiteImages({
            domain: 'example.com',
            siteTitle: 'Example Site',
            niche: 'health',
            skin: 'forest',
            pages: [
                { route: '/', title: 'Home' },
                { route: '/best-plans', title: 'Best Health Plans' },
                { route: '/compare', title: 'Compare Options' },
            ],
        });

        const paths = images.map((i: { path: string; content: string }) => i.path);

        // 1 hero bg
        expect(paths).toContain('images/hero-bg.svg');
        // 3 OG images (one per page)
        expect(paths).toContain('images/og/home.svg');
        expect(paths).toContain('images/og/best-plans.svg');
        expect(paths).toContain('images/og/compare.svg');
        // 2 featured images (non-home pages)
        expect(paths).toContain('images/featured/best-plans.svg');
        expect(paths).toContain('images/featured/compare.svg');
        // Home page should NOT have a featured image
        expect(paths).not.toContain('images/featured/home.svg');
    });

    it('handles single-page sites', () => {
        const images = generateSiteImages({
            domain: 'single.com',
            siteTitle: 'Single Page',
            niche: 'general',
            skin: 'slate',
            pages: [{ route: '/', title: 'Home' }],
        });

        expect(images.length).toBe(2); // hero-bg + home OG
    });

    it('all generated images are valid SVG', () => {
        const images = generateSiteImages({
            domain: 'test.com',
            siteTitle: 'Test',
            niche: 'tech',
            skin: 'midnight',
            pages: [
                { route: '/', title: 'Home' },
                { route: '/article', title: 'Article' },
            ],
        });

        for (const img of images) {
            expect(img.content).toContain('<svg');
            expect(img.content).toContain('xmlns="http://www.w3.org/2000/svg"');
        }
    });
});

describe('path helpers', () => {
    it('getOgImagePath returns correct path for homepage', () => {
        expect(getOgImagePath('/')).toBe('/images/og/home.svg');
    });

    it('getOgImagePath returns correct path for subpages', () => {
        expect(getOgImagePath('/best-plans')).toBe('/images/og/best-plans.svg');
        expect(getOgImagePath('/category/finance/')).toBe('/images/og/category-finance.svg');
    });

    it('getFeaturedImagePath returns correct path', () => {
        expect(getFeaturedImagePath('/best-plans')).toBe('/images/featured/best-plans.svg');
        expect(getFeaturedImagePath('/deep/nested/page/')).toBe('/images/featured/deep-nested-page.svg');
    });
});

describe('niche visual differentiation', () => {
    it('different niches produce different SVGs', () => {
        const health = generateOgImage({ title: 'Test', siteName: 'T', domain: 't.com', niche: 'health', skin: 'slate' });
        const finance = generateOgImage({ title: 'Test', siteName: 'T', domain: 't.com', niche: 'finance', skin: 'slate' });
        const gaming = generateOgImage({ title: 'Test', siteName: 'T', domain: 't.com', niche: 'gaming', skin: 'slate' });

        // All should be different
        expect(health).not.toBe(finance);
        expect(finance).not.toBe(gaming);
        expect(health).not.toBe(gaming);
    });

    it('different skins with same niche produce different hero backgrounds', () => {
        const slate = generateHeroImage({ niche: 'tech', skin: 'slate' });
        const midnight = generateHeroImage({ niche: 'tech', skin: 'midnight' });

        expect(slate).not.toBe(midnight);
    });

    it('escapes special characters in title', () => {
        const svg = generateOgImage({
            title: 'Best <script> & "Quotes"',
            siteName: 'Test',
            domain: 'test.com',
            niche: 'tech',
            skin: 'slate',
        });
        expect(svg).not.toContain('<script>');
        expect(svg).toContain('&lt;script&gt;');
        expect(svg).toContain('&amp;');
    });
});
