import { describe, it, expect } from 'vitest';
import {
    createSeededRng,
    generateSeed,
    computeChecklist,
    generateRandomizePlan,
    THEMES,
    SKINS,
    type PageSnapshot,
} from '@/lib/site-randomizer';

// ============================================================
// Seeded PRNG
// ============================================================

describe('createSeededRng', () => {
    it('produces deterministic output for the same seed', () => {
        const rng1 = createSeededRng(42);
        const rng2 = createSeededRng(42);
        const seq1 = Array.from({ length: 10 }, () => rng1());
        const seq2 = Array.from({ length: 10 }, () => rng2());
        expect(seq1).toEqual(seq2);
    });

    it('produces different output for different seeds', () => {
        const rng1 = createSeededRng(42);
        const rng2 = createSeededRng(99);
        const v1 = rng1();
        const v2 = rng2();
        expect(v1).not.toEqual(v2);
    });

    it('returns values in [0, 1)', () => {
        const rng = createSeededRng(12345);
        for (let i = 0; i < 100; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('generateSeed', () => {
    it('returns an integer', () => {
        const seed = generateSeed();
        expect(Number.isInteger(seed)).toBe(true);
    });

    it('returns different seeds on subsequent calls (probabilistic)', () => {
        const seeds = new Set(Array.from({ length: 10 }, () => generateSeed()));
        expect(seeds.size).toBeGreaterThan(1);
    });
});

// ============================================================
// Checklist Computation
// ============================================================

describe('computeChecklist', () => {
    const emptyPages: PageSnapshot[] = [];

    it('returns 0 score for no pages', () => {
        const result = computeChecklist(emptyPages, 'authority');
        expect(result.score).toBe(0);
        expect(result.launchReady).toBe(false);
        expect(result.mustHaveMet).toBe(0);
        expect(result.mustHaveTotal).toBeGreaterThan(0);
    });

    it('returns items array with expected categories', () => {
        const result = computeChecklist(emptyPages, 'authority');
        const categories = new Set(result.items.map(i => i.category));
        expect(categories.has('page')).toBe(true);
        expect(categories.has('block')).toBe(true);
        expect(categories.has('design')).toBe(true);
    });

    it('marks homepage as met when "/" route exists', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header' },
                { id: 'h2', type: 'Hero' },
                { id: 'f1', type: 'Footer' },
            ],
        }];
        const result = computeChecklist(pages, 'authority');
        const homepageItem = result.items.find(i => i.id === 'has-homepage');
        expect(homepageItem?.met).toBe(true);
    });

    it('detects missing header/hero/footer blocks', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [],
        }];
        const result = computeChecklist(pages, 'authority');
        expect(result.items.find(i => i.id === 'has-header')?.met).toBe(false);
        expect(result.items.find(i => i.id === 'has-hero')?.met).toBe(false);
        expect(result.items.find(i => i.id === 'has-footer')?.met).toBe(false);
    });

    it('detects conversion blocks', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'c1', type: 'CTABanner' },
            ],
        }];
        const result = computeChecklist(pages, 'authority');
        expect(result.items.find(i => i.id === 'has-conversion')?.met).toBe(true);
    });

    it('detects trust signals', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 't1', type: 'TrustBadges' },
            ],
        }];
        const result = computeChecklist(pages, 'authority');
        expect(result.items.find(i => i.id === 'has-trust')?.met).toBe(true);
    });

    it('reports consistent theme/skin when all pages match', () => {
        const pages: PageSnapshot[] = [
            { id: '1', route: '/', title: 'Home', theme: 'bold', skin: 'ocean', isPublished: true, blocks: [] },
            { id: '2', route: '/about', title: 'About', theme: 'bold', skin: 'ocean', isPublished: true, blocks: [] },
        ];
        const result = computeChecklist(pages, 'authority');
        expect(result.items.find(i => i.id === 'consistent-theme')?.met).toBe(true);
        expect(result.items.find(i => i.id === 'consistent-skin')?.met).toBe(true);
    });

    it('reports inconsistent theme when pages differ', () => {
        const pages: PageSnapshot[] = [
            { id: '1', route: '/', title: 'Home', theme: 'bold', skin: 'ocean', isPublished: true, blocks: [] },
            { id: '2', route: '/about', title: 'About', theme: 'clean', skin: 'ocean', isPublished: true, blocks: [] },
        ];
        const result = computeChecklist(pages, 'authority');
        expect(result.items.find(i => i.id === 'consistent-theme')?.met).toBe(false);
    });

    it('scores higher for a complete site', () => {
        const completeSite: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header' },
                { id: 'h2', type: 'Hero' },
                { id: 'f1', type: 'FAQ' },
                { id: 'c1', type: 'CTABanner' },
                { id: 't1', type: 'TrustBadges' },
                { id: 's1', type: 'StatGrid' },
                { id: 'f2', type: 'Footer' },
            ],
        }, {
            id: '2', route: '/about', title: 'About', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [{ id: 'a1', type: 'ArticleBody' }],
        }];
        const result = computeChecklist(completeSite, 'authority');
        expect(result.score).toBeGreaterThanOrEqual(80);
        expect(result.launchReady).toBe(true);
    });
});

// ============================================================
// Randomization Plan
// ============================================================

describe('generateRandomizePlan', () => {
    it('picks a valid theme and skin', () => {
        const plan = generateRandomizePlan(42, [], 'authority', 'example.com');
        expect(THEMES).toContain(plan.theme);
        expect(SKINS).toContain(plan.skin);
    });

    it('is deterministic for the same seed', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header', variant: 'topbar' },
                { id: 'h2', type: 'Hero', variant: 'centered' },
                { id: 'f1', type: 'Footer', variant: 'minimal' },
            ],
        }];
        const plan1 = generateRandomizePlan(42, pages, 'authority', 'test.com');
        const plan2 = generateRandomizePlan(42, pages, 'authority', 'test.com');
        expect(plan1.theme).toBe(plan2.theme);
        expect(plan1.skin).toBe(plan2.skin);
        expect(plan1.pageUpdates[0].blocks.map(b => b.variant))
            .toEqual(plan2.pageUpdates[0].blocks.map(b => b.variant));
    });

    it('produces different output for different seeds', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header' },
                { id: 'h2', type: 'Hero' },
                { id: 'f1', type: 'Footer' },
            ],
        }];
        const plans = Array.from({ length: 5 }, (_, i) =>
            generateRandomizePlan(i * 1000 + 1, pages, 'authority', 'test.com')
        );
        const identities = new Set(plans.map(p => `${p.theme}/${p.skin}`));
        expect(identities.size).toBeGreaterThan(1);
    });

    it('creates missing homepage when no pages exist', () => {
        const plan = generateRandomizePlan(42, [], 'authority', 'example.com');
        expect(plan.missingPages.length).toBeGreaterThan(0);
        expect(plan.missingPages.some(p => p.route === '/')).toBe(true);
    });

    it('does not create duplicate homepage if one already exists', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header' },
                { id: 'h2', type: 'Hero' },
                { id: 'f1', type: 'Footer' },
            ],
        }];
        const plan = generateRandomizePlan(42, pages, 'authority', 'test.com');
        expect(plan.missingPages.some(p => p.route === '/')).toBe(false);
    });

    it('ensures must-have blocks on homepage', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'a1', type: 'ArticleBody' },
            ],
        }];
        const plan = generateRandomizePlan(42, pages, 'authority', 'test.com');
        const homeBlocks = plan.pageUpdates[0].blocks;
        const types = homeBlocks.map(b => b.type);
        expect(types).toContain('Header');
        expect(types).toContain('Hero');
        expect(types).toContain('Footer');
    });

    it('ensures conversion block exists in plan', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header' },
                { id: 'h2', type: 'Hero' },
                { id: 'f1', type: 'Footer' },
            ],
        }];
        const plan = generateRandomizePlan(42, pages, 'authority', 'test.com');
        const allTypes = new Set([
            ...plan.pageUpdates.flatMap(pu => pu.blocks.map(b => b.type)),
            ...plan.missingPages.flatMap(mp => mp.blocks.map(b => b.type)),
        ]);
        const hasConversion = ['LeadForm', 'CTABanner', 'ScrollCTA', 'PricingTable'].some(t => allTypes.has(t));
        expect(hasConversion).toBe(true);
    });

    it('ensures FAQ exists in plan', () => {
        const pages: PageSnapshot[] = [{
            id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate',
            isPublished: true, blocks: [
                { id: 'h1', type: 'Header' },
                { id: 'h2', type: 'Hero' },
                { id: 'f1', type: 'Footer' },
            ],
        }];
        const plan = generateRandomizePlan(42, pages, 'authority', 'test.com');
        const allTypes = new Set([
            ...plan.pageUpdates.flatMap(pu => pu.blocks.map(b => b.type)),
            ...plan.missingPages.flatMap(mp => mp.blocks.map(b => b.type)),
        ]);
        expect(allTypes.has('FAQ')).toBe(true);
    });

    it('applies consistent theme/skin across all page updates', () => {
        const pages: PageSnapshot[] = [
            { id: '1', route: '/', title: 'Home', theme: 'clean', skin: 'slate', isPublished: true, blocks: [{ id: 'h1', type: 'Header' }] },
            { id: '2', route: '/about', title: 'About', theme: 'editorial', skin: 'ocean', isPublished: true, blocks: [{ id: 'a1', type: 'ArticleBody' }] },
        ];
        const plan = generateRandomizePlan(42, pages, 'authority', 'test.com');
        for (const pu of plan.pageUpdates) {
            expect(pu.theme).toBe(plan.theme);
            expect(pu.skin).toBe(plan.skin);
        }
    });

    it('generated homepage blocks include template-specific blocks', () => {
        const plan = generateRandomizePlan(42, [], 'comparison', 'vs-test.com');
        const homepage = plan.missingPages.find(p => p.route === '/');
        expect(homepage).toBeDefined();
        const types = homepage!.blocks.map(b => b.type);
        expect(types).toContain('Header');
        expect(types).toContain('Hero');
        expect(types).toContain('Footer');
        // comparison template should include at least one of ComparisonTable, ProsConsCard, RankingList
        const hasComparisonBlock = ['ComparisonTable', 'ProsConsCard', 'RankingList'].some(t => types.includes(t));
        expect(hasComparisonBlock).toBe(true);
    });
});

// ============================================================
// Block Variant CSS Inclusion
// ============================================================

describe('block variant CSS in v2 pipeline', () => {
    it('generateV2GlobalStyles includes block variant CSS', async () => {
        const { generateV2GlobalStyles } = await import('@/lib/deploy/themes/index');
        const { getDomainPrefix } = await import('@/lib/deploy/themes/class-randomizer');
        const domain = 'test.com';
        const p = getDomainPrefix(domain);
        const css = generateV2GlobalStyles('clean', 'slate', 'authority', domain);
        // Check for hero variant selectors (randomized with domain prefix)
        expect(css).toContain('.hero--centered');
        expect(css).toContain('.hero--gradient');
        expect(css).toContain('.hero--split');
        // Check for header variant selectors (randomized)
        expect(css).toContain(`.${p}-header--topbar`);
        expect(css).toContain(`.${p}-header--centered`);
        // Check for footer variant selectors
        expect(css).toContain('.footer--multi-column');
        expect(css).toContain('.footer--minimal');
        // Check for CTA section variants (randomized)
        expect(css).toContain(`.${p}-cta-section--bar`);
        // Check for renderer-specific classes (randomized)
        expect(css).toContain(`.${p}-review-card`);
        expect(css).toContain(`.${p}-testimonial-card`);
        expect(css).toContain(`.${p}-pricing-card`);
        expect(css).toContain(`.${p}-ranking-item`);
        expect(css).toContain(`.${p}-vs-grid`);
    });
});
