/**
 * Site Randomizer — seeded randomization engine + Featured Site Checklist.
 *
 * Pure functions: no DB access, no side effects.
 * The UI layer calls these to compute checklist state and generate
 * randomization plans, then applies the plan via API calls.
 */

import { getDefaultBlockContent } from '@/lib/deploy/blocks/default-content';

// ============================================================
// Seeded PRNG (mulberry32) — deterministic from a single integer seed
// ============================================================

export function createSeededRng(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededPick<T>(rng: () => number, arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('seededPick: empty array');
    return arr[Math.floor(rng() * arr.length)];
}

function seededShuffle<T>(rng: () => number, arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function generateSeed(): number {
    return (Math.random() * 0x7fffffff) | 0;
}

// ============================================================
// Types
// ============================================================

export interface PageSnapshot {
    id: string;
    route: string;
    title: string;
    theme: string | null;
    skin: string | null;
    isPublished: boolean;
    blocks: BlockSnapshot[];
}

export interface BlockSnapshot {
    id: string;
    type: string;
    variant?: string;
    config?: Record<string, unknown>;
    content?: Record<string, unknown>;
}

export interface ChecklistItem {
    id: string;
    label: string;
    description: string;
    met: boolean;
    category: 'page' | 'block' | 'design' | 'conversion' | 'trust';
    priority: 'must' | 'should' | 'nice';
    autoFixable: boolean;
}

export interface ChecklistResult {
    items: ChecklistItem[];
    score: number;       // 0–100
    mustHaveMet: number;
    mustHaveTotal: number;
    launchReady: boolean;
}

export interface RandomizePlan {
    seed: number;
    theme: string;
    skin: string;
    pageUpdates: Array<{
        pageId: string;
        theme: string;
        skin: string;
        blocks: BlockSnapshot[];
    }>;
    missingPages: Array<{
        route: string;
        title: string;
        theme: string;
        skin: string;
        blocks: BlockSnapshot[];
        publish: boolean;
    }>;
}

// ============================================================
// Constants (mirrored from VisualConfigurator — importable by client code)
// ============================================================

export const THEMES = [
    'clean',
    'editorial',
    'bold',
    'minimal',
    'magazine',
    'glass',
    'corporate',
    'craft',
    'startup',
    'noir',
] as const;

export const SKINS = [
    'slate',
    'ocean',
    'forest',
    'ember',
    'midnight',
    'sage',
    'indigo',
    'sand',
    'teal',
    'wine',
    'cobalt',
    'charcoal',
    'arctic',
    'dusk',
] as const;

type ThemeChoice = (typeof THEMES)[number];
type SkinChoice = (typeof SKINS)[number];

const DESIGN_IDENTITIES: ReadonlyArray<{ theme: ThemeChoice; skin: SkinChoice }> = [
    { theme: 'clean', skin: 'slate' },
    { theme: 'clean', skin: 'teal' },
    { theme: 'editorial', skin: 'sand' },
    { theme: 'editorial', skin: 'wine' },
    { theme: 'bold', skin: 'cobalt' },
    { theme: 'minimal', skin: 'sage' },
    { theme: 'magazine', skin: 'indigo' },
    { theme: 'glass', skin: 'arctic' },
    { theme: 'corporate', skin: 'ocean' },
    { theme: 'craft', skin: 'ember' },
    { theme: 'startup', skin: 'cobalt' },
    { theme: 'startup', skin: 'teal' },
    { theme: 'noir', skin: 'charcoal' },
    { theme: 'noir', skin: 'dusk' },
    { theme: 'bold', skin: 'midnight' },
];

const VARIANT_OPTIONS: Record<string, readonly string[]> = {
    Header: ['topbar', 'centered', 'minimal', 'split'],
    Footer: ['multi-column', 'newsletter', 'minimal', 'legal'],
    Hero: ['centered', 'split', 'minimal', 'gradient', 'image'],
    Wizard: ['wizard', 'quiz', 'survey', 'assessment', 'configurator'],
    ComparisonTable: ['table', 'cards'],
    CTABanner: ['bar', 'card', 'banner'],
};

// Which block types count toward each checklist signal
const _LAYOUT_BLOCKS = new Set(['Header', 'Footer']);
const _CONTENT_BLOCKS = new Set(['Hero', 'ArticleBody', 'FAQ', 'StepByStep', 'Checklist']);
const CONVERSION_BLOCKS = new Set(['LeadForm', 'CTABanner', 'ScrollCTA', 'PricingTable']);
const TRUST_BLOCKS = new Set(['TestimonialGrid', 'TrustBadges', 'CitationBlock', 'AuthorBio']);
const DATA_BLOCKS = new Set(['StatGrid', 'DataTable', 'ComparisonTable', 'RankingList', 'CostBreakdown', 'QuoteCalculator']);

// Must-have pages for a "Featured Site"
const _REQUIRED_PAGES = [
    { route: '/', label: 'Homepage' },
];

// Must-have block types on the homepage
const _HOMEPAGE_MUST_HAVE_BLOCKS = ['Header', 'Hero', 'Footer'];
const _HOMEPAGE_SHOULD_HAVE_BLOCKS = ['FAQ', 'CTABanner'];

// ============================================================
// Checklist Computation
// ============================================================

export function computeChecklist(
    pages: PageSnapshot[],
    _siteTemplate: string,
): ChecklistResult {
    const items: ChecklistItem[] = [];

    const homepage = pages.find(p => p.route === '/');
    const allBlockTypes = new Set(pages.flatMap(p => p.blocks.map(b => b.type)));
    const homepageBlockTypes = new Set(homepage?.blocks.map(b => b.type) ?? []);
    const publishedPages = pages.filter(p => p.isPublished);

    // --- Page checks ---
    items.push({
        id: 'has-homepage',
        label: 'Homepage exists',
        description: 'Site has a "/" route page',
        met: !!homepage,
        category: 'page',
        priority: 'must',
        autoFixable: true,
    });

    items.push({
        id: 'homepage-published',
        label: 'Homepage is published',
        description: 'The homepage is marked as published for deployment',
        met: !!homepage?.isPublished,
        category: 'page',
        priority: 'must',
        autoFixable: true,
    });

    items.push({
        id: 'has-multiple-pages',
        label: 'Multiple pages',
        description: 'Site has at least 2 pages for navigation depth',
        met: pages.length >= 2,
        category: 'page',
        priority: 'should',
        autoFixable: false,
    });

    items.push({
        id: 'all-pages-published',
        label: 'All pages published',
        description: 'Every page is marked published',
        met: pages.length > 0 && publishedPages.length === pages.length,
        category: 'page',
        priority: 'should',
        autoFixable: true,
    });

    // --- Layout blocks ---
    items.push({
        id: 'has-header',
        label: 'Header block',
        description: 'Homepage has a Header for site navigation',
        met: homepageBlockTypes.has('Header'),
        category: 'block',
        priority: 'must',
        autoFixable: true,
    });

    items.push({
        id: 'has-footer',
        label: 'Footer block',
        description: 'Homepage has a Footer with legal/navigation links',
        met: homepageBlockTypes.has('Footer'),
        category: 'block',
        priority: 'must',
        autoFixable: true,
    });

    items.push({
        id: 'has-hero',
        label: 'Hero block',
        description: 'Homepage has a Hero section for first impressions',
        met: homepageBlockTypes.has('Hero'),
        category: 'block',
        priority: 'must',
        autoFixable: true,
    });

    // --- Design checks ---
    const hasConsistentTheme = pages.length > 0 && pages.every(p => p.theme && p.theme === pages[0].theme);
    items.push({
        id: 'consistent-theme',
        label: 'Consistent theme',
        description: 'All pages use the same theme for visual cohesion',
        met: hasConsistentTheme,
        category: 'design',
        priority: 'must',
        autoFixable: true,
    });

    const hasConsistentSkin = pages.length > 0 && pages.every(p => p.skin && p.skin === pages[0].skin);
    items.push({
        id: 'consistent-skin',
        label: 'Consistent skin',
        description: 'All pages use the same color skin',
        met: hasConsistentSkin,
        category: 'design',
        priority: 'must',
        autoFixable: true,
    });

    // --- Conversion checks ---
    const hasConversion = [...CONVERSION_BLOCKS].some(t => allBlockTypes.has(t));
    items.push({
        id: 'has-conversion',
        label: 'Conversion element',
        description: 'Site includes at least one lead form, CTA, or pricing block',
        met: hasConversion,
        category: 'conversion',
        priority: 'should',
        autoFixable: true,
    });

    items.push({
        id: 'has-faq',
        label: 'FAQ section',
        description: 'Site includes an FAQ for SEO and user trust',
        met: allBlockTypes.has('FAQ'),
        category: 'conversion',
        priority: 'should',
        autoFixable: true,
    });

    // --- Trust checks ---
    const hasTrust = [...TRUST_BLOCKS].some(t => allBlockTypes.has(t));
    items.push({
        id: 'has-trust',
        label: 'Trust signals',
        description: 'Site includes testimonials, trust badges, citations, or author bio',
        met: hasTrust,
        category: 'trust',
        priority: 'should',
        autoFixable: true,
    });

    const hasData = [...DATA_BLOCKS].some(t => allBlockTypes.has(t));
    items.push({
        id: 'has-data',
        label: 'Data/comparison element',
        description: 'Site has stats, tables, comparisons, or calculator blocks',
        met: hasData,
        category: 'trust',
        priority: 'nice',
        autoFixable: false,
    });

    // --- Score ---
    const mustItems = items.filter(i => i.priority === 'must');
    const shouldItems = items.filter(i => i.priority === 'should');
    const niceItems = items.filter(i => i.priority === 'nice');

    const mustMet = mustItems.filter(i => i.met).length;
    const shouldMet = shouldItems.filter(i => i.met).length;
    const niceMet = niceItems.filter(i => i.met).length;

    // Weighted score: must=5pts, should=3pts, nice=1pt
    const maxScore = mustItems.length * 5 + shouldItems.length * 3 + niceItems.length * 1;
    const actualScore = mustMet * 5 + shouldMet * 3 + niceMet * 1;
    const score = maxScore > 0 ? Math.round((actualScore / maxScore) * 100) : 0;

    return {
        items,
        score,
        mustHaveMet: mustMet,
        mustHaveTotal: mustItems.length,
        launchReady: mustMet === mustItems.length,
    };
}

// ============================================================
// Seeded Randomization Engine
// ============================================================

/**
 * Generate a deterministic randomization plan from a seed.
 * The plan describes theme/skin picks and block variant changes
 * for every existing page, plus any missing must-have pages to create.
 */
export function generateRandomizePlan(
    seed: number,
    pages: PageSnapshot[],
    siteTemplate: string,
    domainName: string,
): RandomizePlan {
    resetBlockCounter();
    const rng = createSeededRng(seed);

    // Pick global identity from curated theme+skin pairings to keep output polished.
    const identity = seededPick(rng, DESIGN_IDENTITIES);
    const theme = identity.theme;
    const skin = identity.skin;

    // Randomize existing pages
    const pageUpdates = pages.map(page => ({
        pageId: page.id,
        theme,
        skin,
        blocks: randomizeBlockVariants(rng, page.blocks),
    }));

    // Determine missing must-have pages
    const missingPages: RandomizePlan['missingPages'] = [];
    const existingRoutes = new Set(pages.map(p => p.route));

    if (!existingRoutes.has('/')) {
        missingPages.push({
            route: '/',
            title: extractTitleFromDomain(domainName),
            theme,
            skin,
            blocks: generateHomepageBlocks(rng, siteTemplate, domainName),
            publish: true,
        });
    }

    // Ensure homepage has must-have blocks (Header, Hero, Footer)
    const homepageUpdate = pageUpdates.find(
        pu => pages.find(p => p.id === pu.pageId)?.route === '/'
    );
    if (homepageUpdate) {
        ensureMustHaveBlocks(rng, homepageUpdate.blocks, siteTemplate, domainName);
    }

    // Helper to compute all block types across page updates and missing pages
    const collectBlockTypes = () => new Set([
        ...pageUpdates.flatMap(pu => pu.blocks.map(b => b.type)),
        ...missingPages.flatMap(mp => mp.blocks.map(b => b.type)),
    ]);

    // Ensure conversion block exists somewhere
    if (![...CONVERSION_BLOCKS].some(t => collectBlockTypes().has(t))) {
        if (homepageUpdate) {
            const ctaVariant = seededPick(rng, VARIANT_OPTIONS.CTABanner ?? ['banner']);
            homepageUpdate.blocks.splice(
                Math.max(homepageUpdate.blocks.length - 1, 0),
                0,
                makeBlock(rng, 'CTABanner', ctaVariant, domainName),
            );
        }
    }

    // Ensure trust signal exists somewhere
    if (![...TRUST_BLOCKS].some(t => collectBlockTypes().has(t))) {
        if (homepageUpdate) {
            homepageUpdate.blocks.splice(
                Math.max(homepageUpdate.blocks.length - 1, 0),
                0,
                makeBlock(rng, 'TrustBadges', undefined, domainName),
            );
        }
    }

    // Ensure FAQ exists somewhere
    if (!collectBlockTypes().has('FAQ')) {
        if (homepageUpdate) {
            homepageUpdate.blocks.splice(
                Math.max(homepageUpdate.blocks.length - 1, 0),
                0,
                makeBlock(rng, 'FAQ', undefined, domainName),
            );
        }
    }

    return { seed, theme, skin, pageUpdates, missingPages };
}

// ============================================================
// Helpers
// ============================================================

function randomizeBlockVariants(rng: () => number, blocks: BlockSnapshot[]): BlockSnapshot[] {
    return blocks.map(block => {
        const variants = VARIANT_OPTIONS[block.type];
        if (!variants || variants.length <= 1) return { ...block };
        return {
            ...block,
            variant: seededPick(rng, variants),
        };
    });
}

function ensureMustHaveBlocks(
    rng: () => number,
    blocks: BlockSnapshot[],
    _siteTemplate: string,
    domainName?: string,
): void {
    const types = new Set(blocks.map(b => b.type));

    // Header must be first
    if (!types.has('Header')) {
        const variant = seededPick(rng, VARIANT_OPTIONS.Header!);
        blocks.unshift(makeBlock(rng, 'Header', variant, domainName));
    }

    // Hero after Header
    if (!types.has('Hero')) {
        const variant = seededPick(rng, VARIANT_OPTIONS.Hero!);
        const insertIdx = blocks.findIndex(b => b.type === 'Header') + 1;
        blocks.splice(insertIdx, 0, makeBlock(rng, 'Hero', variant, domainName));
    }

    // Footer must be last
    if (!types.has('Footer')) {
        const variant = seededPick(rng, VARIANT_OPTIONS.Footer!);
        blocks.push(makeBlock(rng, 'Footer', variant, domainName));
    }
}

function generateHomepageBlocks(
    rng: () => number,
    siteTemplate: string,
    domainName?: string,
): BlockSnapshot[] {
    // Generate a well-rounded homepage based on the site template category
    const headerVariant = seededPick(rng, VARIANT_OPTIONS.Header!);
    const heroVariant = seededPick(rng, VARIANT_OPTIONS.Hero!);
    const footerVariant = seededPick(rng, VARIANT_OPTIONS.Footer!);
    const ctaVariant = seededPick(rng, VARIANT_OPTIONS.CTABanner ?? ['banner']);

    const blocks: BlockSnapshot[] = [
        makeBlock(rng, 'Header', headerVariant, domainName),
        makeBlock(rng, 'Hero', heroVariant, domainName),
    ];

    // Template-specific middle blocks
    const templateBlocks = getTemplateMiddleBlocks(siteTemplate);
    const shuffled = seededShuffle(rng, templateBlocks);
    for (const tb of shuffled) {
        blocks.push(makeBlock(rng, tb.type, tb.variant, domainName));
    }

    // Always include FAQ + CTA + trust
    const existingTypes = new Set(blocks.map(b => b.type));
    if (!existingTypes.has('FAQ')) blocks.push(makeBlock(rng, 'FAQ', undefined, domainName));
    if (!existingTypes.has('CTABanner')) blocks.push(makeBlock(rng, 'CTABanner', ctaVariant, domainName));
    if (!existingTypes.has('TrustBadges')) blocks.push(makeBlock(rng, 'TrustBadges', undefined, domainName));

    blocks.push(makeBlock(rng, 'Footer', footerVariant, domainName));
    return blocks;
}

interface MiddleBlock { type: string; variant?: string; }

function getTemplateMiddleBlocks(siteTemplate: string): MiddleBlock[] {
    const map: Record<string, MiddleBlock[]> = {
        authority: [{ type: 'ArticleBody' }, { type: 'StatGrid' }, { type: 'CitationBlock' }],
        comparison: [{ type: 'ComparisonTable' }, { type: 'ProsConsCard' }, { type: 'RankingList' }],
        calculator: [{ type: 'QuoteCalculator' }, { type: 'ArticleBody' }, { type: 'CostBreakdown' }],
        review: [{ type: 'RankingList' }, { type: 'ProsConsCard' }, { type: 'ComparisonTable' }],
        tool: [{ type: 'QuoteCalculator' }, { type: 'ComparisonTable' }, { type: 'ArticleBody' }],
        hub: [{ type: 'StatGrid' }, { type: 'ArticleBody' }, { type: 'InteractiveMap' }],
        decision: [{ type: 'Wizard' }, { type: 'ArticleBody' }],
        cost_guide: [{ type: 'CostBreakdown' }, { type: 'QuoteCalculator' }, { type: 'ArticleBody' }],
        niche: [{ type: 'ArticleBody' }, { type: 'StatGrid' }],
        info: [{ type: 'ArticleBody' }, { type: 'CitationBlock' }],
        consumer: [{ type: 'ComparisonTable' }, { type: 'RankingList' }],
        brand: [{ type: 'ArticleBody' }, { type: 'TestimonialGrid' }],
        magazine: [{ type: 'ArticleBody' }, { type: 'StatGrid' }],
        landing: [{ type: 'LeadForm' }, { type: 'TestimonialGrid' }],
        docs: [{ type: 'ArticleBody' }, { type: 'CitationBlock' }],
        storefront: [{ type: 'PricingTable' }, { type: 'ComparisonTable' }, { type: 'TestimonialGrid' }],
        minimal: [{ type: 'ArticleBody' }],
        dashboard: [{ type: 'StatGrid' }, { type: 'DataTable' }, { type: 'ArticleBody' }],
        newsletter: [{ type: 'ArticleBody' }, { type: 'LeadForm' }],
        community: [{ type: 'ArticleBody' }, { type: 'Wizard' }],
    };
    return map[siteTemplate] ?? map.authority;
}

let blockCounter = 0;

function resetBlockCounter(): void {
    blockCounter = 0;
}

function makeBlock(rng: () => number, type: string, variant?: string, domain?: string, niche?: string): BlockSnapshot {
    blockCounter++;
    const defaults = getDefaultBlockContent(type, domain, niche, variant);
    const rngHex = Math.floor(rng() * 0xFFFFFF).toString(36);
    return {
        id: `blk_${blockCounter.toString(36)}_${rngHex}`,
        type,
        ...(variant ? { variant } : {}),
        ...(defaults.content ? { content: defaults.content } : {}),
        ...(defaults.config ? { config: defaults.config } : {}),
    };
}

function extractTitleFromDomain(domain: string): string {
    return domain
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
