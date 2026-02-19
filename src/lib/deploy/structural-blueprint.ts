/**
 * Structural Blueprint — deterministic per-domain site architecture.
 *
 * Solves the template fingerprint problem: without this, every site in the
 * portfolio has identical page sets, nav structures, block ordering, and
 * section layouts. Google can detect and penalize template networks.
 *
 * Each domain gets a unique blueprint derived from a hash of its name.
 * The blueprint controls:
 *   1. Which sub-pages the site includes (8-14 pages, varied per domain)
 *   2. Nav structure (different groupings, labels, item counts)
 *   3. Block ordering on the homepage (different section sequences)
 *   4. Hero style per page (not just CSS variant, but structural differences)
 *   5. Footer layout and content
 *   6. CTA placement and style
 *   7. Sidebar presence/absence per page
 *
 * The blueprint is deterministic: same domain always produces the same structure.
 */

import { createHash } from 'node:crypto';

// ── Hash utilities ───────────────────────────────────────────────────────────

function domainHash(domain: string): Buffer {
    return createHash('md5').update(domain.toLowerCase().trim()).digest();
}

function pickFromHash(hash: Buffer, offset: number, options: number): number {
    return hash.readUInt8(offset % hash.length) % options;
}

function pickItem<T>(hash: Buffer, offset: number, items: T[]): T {
    return items[pickFromHash(hash, offset, items.length)];
}

function shuffleWithHash<T>(hash: Buffer, offset: number, items: T[]): T[] {
    const arr = [...items];
    let seed = hash.readUInt32BE(offset % (hash.length - 3));
    for (let i = arr.length - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const j = seed % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ── Page Set Definitions ─────────────────────────────────────────────────────

export type SubPageSlot =
    | 'guides-hub' | 'guide-complete' | 'guide-save-money' | 'guide-mistakes'
    | 'calculator' | 'compare' | 'reviews' | 'faq' | 'pricing'
    | 'blog' | 'resources' | 'about' | 'contact'
    | 'how-it-works' | 'checklist' | 'glossary' | 'case-studies';

const CORE_PAGES: SubPageSlot[] = ['calculator', 'about', 'contact'];
const GUIDE_PAGES: SubPageSlot[] = ['guides-hub', 'guide-complete', 'guide-save-money', 'guide-mistakes'];
const TOOL_PAGES: SubPageSlot[] = ['compare', 'reviews', 'pricing'];
const CONTENT_PAGES: SubPageSlot[] = ['blog', 'resources', 'faq'];
const BONUS_PAGES: SubPageSlot[] = ['how-it-works', 'checklist', 'glossary', 'case-studies'];

// ── Nav Label Variants ───────────────────────────────────────────────────────

const NAV_GUIDE_LABELS = ['Resources', 'Guides', 'Learn', 'Knowledge Base', 'Library'];
const NAV_TOOL_LABELS = ['Tools', 'Compare', 'Calculators', 'Cost Tools'];
const NAV_REVIEW_LABELS = ['Reviews', 'Ratings', 'Top Picks', 'Best Of'];
const NAV_BLOG_LABELS = ['Blog', 'Articles', 'Insights', 'News'];
const NAV_ABOUT_LABELS = ['About', 'About Us', 'Our Story', 'Who We Are'];

// ── Hero Structural Variants ─────────────────────────────────────────────────

export type HeroStructure = 'standard' | 'split-reverse' | 'minimal-left' | 'card-overlay' | 'stats-bar' | 'breadcrumb-hero';

const HERO_STRUCTURES: HeroStructure[] = ['standard', 'split-reverse', 'minimal-left', 'card-overlay', 'stats-bar', 'breadcrumb-hero'];

// ── Footer Structural Variants ───────────────────────────────────────────────

export type FooterStructure = 'columns-4' | 'columns-3' | 'columns-2' | 'centered' | 'minimal-links' | 'stacked';

const FOOTER_STRUCTURES: FooterStructure[] = ['columns-4', 'columns-3', 'columns-2', 'centered', 'minimal-links', 'stacked'];

// ── Homepage Section Order Variants ──────────────────────────────────────────

export type HomepageSectionSlot = 'hero' | 'cost-breakdown' | 'calculator' | 'comparison' | 'faq' | 'article' | 'testimonials' | 'lead-form' | 'trust-badges' | 'stats' | 'cta-banner';

const HOMEPAGE_LAYOUTS: HomepageSectionSlot[][] = [
    ['hero', 'cost-breakdown', 'calculator', 'faq', 'lead-form', 'cta-banner'],
    ['hero', 'calculator', 'comparison', 'article', 'faq', 'cta-banner'],
    ['hero', 'stats', 'article', 'cost-breakdown', 'faq', 'lead-form'],
    ['hero', 'trust-badges', 'cost-breakdown', 'testimonials', 'faq', 'cta-banner'],
    ['hero', 'comparison', 'calculator', 'trust-badges', 'faq', 'lead-form'],
    ['hero', 'article', 'stats', 'calculator', 'faq', 'cta-banner'],
    ['hero', 'cost-breakdown', 'trust-badges', 'comparison', 'lead-form', 'faq'],
    ['hero', 'calculator', 'article', 'testimonials', 'faq', 'cta-banner'],
    ['hero', 'stats', 'cost-breakdown', 'article', 'lead-form', 'faq'],
    ['hero', 'trust-badges', 'calculator', 'comparison', 'faq', 'cta-banner'],
];

// ── CTA Variants ─────────────────────────────────────────────────────────────

export type CtaStyle = 'banner-full' | 'card-centered' | 'inline-bar' | 'sticky-bottom' | 'side-panel' | 'none';

const CTA_STYLES: CtaStyle[] = ['banner-full', 'card-centered', 'inline-bar', 'sticky-bottom', 'side-panel', 'none'];

// ── Header Variants ──────────────────────────────────────────────────────────

export type HeaderStyle = 'topbar-sticky' | 'topbar-static' | 'centered-logo' | 'minimal-inline' | 'split-actions';

const HEADER_STYLES: HeaderStyle[] = ['topbar-sticky', 'topbar-static', 'centered-logo', 'minimal-inline', 'split-actions'];

// ── Sidebar Strategy ─────────────────────────────────────────────────────────

export type SidebarStrategy = 'guides-only' | 'all-content' | 'none' | 'homepage-only';

const SIDEBAR_STRATEGIES: SidebarStrategy[] = ['guides-only', 'all-content', 'none', 'homepage-only'];

// ── Blueprint Type ───────────────────────────────────────────────────────────

export interface StructuralBlueprint {
    domain: string;

    /** Which sub-pages this site includes (7-15 pages, always includes core) */
    pages: SubPageSlot[];
    /** How many guide sub-pages (1-3) */
    guideCount: number;

    /** Nav structure */
    nav: {
        style: 'flat' | 'dropdown-one' | 'dropdown-two';
        items: Array<{ label: string; href: string; children?: Array<{ label: string; href: string }> }>;
    };

    /** Homepage section order */
    homepageLayout: HomepageSectionSlot[];

    /** Header structural style */
    headerStyle: HeaderStyle;
    /** Hero structural approach (not just CSS variant) */
    heroStructure: HeroStructure;
    /** Footer structural layout */
    footerStructure: FooterStructure;
    /** CTA style on content pages */
    ctaStyle: CtaStyle;
    /** Where to show sidebars */
    sidebarStrategy: SidebarStrategy;

    /** Whether to show trust badges on homepage */
    showHomepageTrustBadges: boolean;
    /** Whether to show testimonials */
    showTestimonials: boolean;
    /** Whether to include a pricing page */
    showPricing: boolean;
}

// ── Blueprint Generation ─────────────────────────────────────────────────────

export function generateBlueprint(domain: string): StructuralBlueprint {
    const hash = domainHash(domain);

    // Page set selection
    const guideCount = 1 + pickFromHash(hash, 0, 3); // 1-3 guides
    const selectedGuides = GUIDE_PAGES.slice(0, 1 + guideCount); // always include hub + N guides
    const toolPageCount = 1 + pickFromHash(hash, 1, TOOL_PAGES.length); // 1-3 tool pages
    const selectedTools = shuffleWithHash(hash, 2, TOOL_PAGES).slice(0, toolPageCount);
    const contentPageCount = 1 + pickFromHash(hash, 3, CONTENT_PAGES.length); // 1-3 content pages
    const selectedContent = shuffleWithHash(hash, 4, CONTENT_PAGES).slice(0, contentPageCount);
    const bonusCount = pickFromHash(hash, 5, 3); // 0-2 bonus pages
    const selectedBonus = shuffleWithHash(hash, 6, BONUS_PAGES).slice(0, bonusCount);

    const pages: SubPageSlot[] = [
        ...CORE_PAGES,
        ...selectedGuides,
        ...selectedTools,
        ...selectedContent,
        ...selectedBonus,
    ];

    // Nav structure
    const navStyle = pickItem(hash, 7, ['flat', 'dropdown-one', 'dropdown-two'] as const);
    const nav = buildNav(hash, pages, navStyle);

    // Structural choices
    const homepageLayout = pickItem(hash, 8, HOMEPAGE_LAYOUTS);
    const headerStyle = pickItem(hash, 9, HEADER_STYLES);
    const heroStructure = pickItem(hash, 10, HERO_STRUCTURES);
    const footerStructure = pickItem(hash, 11, FOOTER_STRUCTURES);
    const ctaStyle = pickItem(hash, 12, CTA_STYLES);
    const sidebarStrategy = pickItem(hash, 13, SIDEBAR_STRATEGIES);

    const showHomepageTrustBadges = pickFromHash(hash, 14, 3) !== 0; // 66% chance
    const showTestimonials = pickFromHash(hash, 15, 3) !== 0; // 66% chance
    const showPricing = pages.includes('pricing');

    return {
        domain,
        pages,
        guideCount,
        nav: { style: navStyle, items: nav },
        homepageLayout,
        headerStyle,
        heroStructure,
        footerStructure,
        ctaStyle,
        sidebarStrategy,
        showHomepageTrustBadges,
        showTestimonials,
        showPricing,
    };
}

// ── Nav Builder ──────────────────────────────────────────────────────────────

function buildNav(
    hash: Buffer,
    pages: SubPageSlot[],
    style: 'flat' | 'dropdown-one' | 'dropdown-two',
): Array<{ label: string; href: string; children?: Array<{ label: string; href: string }> }> {
    const guideLabel = pickItem(hash, 20, NAV_GUIDE_LABELS);
    const toolLabel = pickItem(hash, 21, NAV_TOOL_LABELS);
    const reviewLabel = pickItem(hash, 22, NAV_REVIEW_LABELS);
    const blogLabel = pickItem(hash, 23, NAV_BLOG_LABELS);
    const aboutLabel = pickItem(hash, 24, NAV_ABOUT_LABELS);

    const hasGuides = pages.includes('guides-hub');
    const hasCalculator = pages.includes('calculator');
    const hasCompare = pages.includes('compare');
    const hasReviews = pages.includes('reviews');
    const hasBlog = pages.includes('blog');
    const hasFaq = pages.includes('faq');
    const hasPricing = pages.includes('pricing');
    const hasResources = pages.includes('resources');

    const items: Array<{ label: string; href: string; children?: Array<{ label: string; href: string }> }> = [];

    items.push({ label: 'Home', href: '/' });

    if (style === 'flat') {
        if (hasGuides) items.push({ label: guideLabel, href: '/guides' });
        if (hasCalculator) items.push({ label: 'Calculator', href: '/calculator' });
        if (hasCompare) items.push({ label: 'Compare', href: '/compare' });
        if (hasReviews) items.push({ label: reviewLabel, href: '/reviews' });
        if (hasBlog) items.push({ label: blogLabel, href: '/blog' });
        items.push({ label: aboutLabel, href: '/about' });
    } else if (style === 'dropdown-one') {
        const children: Array<{ label: string; href: string }> = [];
        if (hasGuides) children.push({ label: 'Guides', href: '/guides' });
        if (hasCalculator) children.push({ label: 'Calculator', href: '/calculator' });
        if (hasCompare) children.push({ label: 'Compare', href: '/compare' });
        if (hasFaq) children.push({ label: 'FAQ', href: '/faq' });
        if (hasResources) children.push({ label: 'Resources', href: '/resources' });
        if (children.length > 0) {
            items.push({ label: guideLabel, href: hasGuides ? '/guides' : children[0].href, children });
        }
        if (hasReviews) items.push({ label: reviewLabel, href: '/reviews' });
        if (hasBlog) items.push({ label: blogLabel, href: '/blog' });
        if (hasPricing) items.push({ label: 'Pricing', href: '/pricing' });
        items.push({ label: aboutLabel, href: '/about' });
    } else {
        // dropdown-two: two dropdown groups
        const toolChildren: Array<{ label: string; href: string }> = [];
        if (hasCalculator) toolChildren.push({ label: 'Calculator', href: '/calculator' });
        if (hasCompare) toolChildren.push({ label: 'Compare', href: '/compare' });
        if (hasPricing) toolChildren.push({ label: 'Pricing', href: '/pricing' });

        const learnChildren: Array<{ label: string; href: string }> = [];
        if (hasGuides) learnChildren.push({ label: 'Guides', href: '/guides' });
        if (hasFaq) learnChildren.push({ label: 'FAQ', href: '/faq' });
        if (hasBlog) learnChildren.push({ label: blogLabel, href: '/blog' });
        if (hasResources) learnChildren.push({ label: 'Resources', href: '/resources' });

        if (toolChildren.length > 0) {
            items.push({ label: toolLabel, href: toolChildren[0].href, children: toolChildren });
        }
        if (learnChildren.length > 0) {
            items.push({ label: guideLabel, href: learnChildren[0].href, children: learnChildren });
        }
        if (hasReviews) items.push({ label: reviewLabel, href: '/reviews' });
        items.push({ label: aboutLabel, href: '/about' });
    }

    return items;
}

// ── Route mapping ────────────────────────────────────────────────────────────

export const SLOT_TO_ROUTE: Record<SubPageSlot, string> = {
    'guides-hub': '/guides',
    'guide-complete': '/guides/complete-guide',
    'guide-save-money': '/guides/save-money',
    'guide-mistakes': '/guides/common-mistakes',
    'calculator': '/calculator',
    'compare': '/compare',
    'reviews': '/reviews',
    'faq': '/faq',
    'pricing': '/pricing',
    'blog': '/blog',
    'resources': '/resources',
    'about': '/about',
    'contact': '/contact',
    'how-it-works': '/how-it-works',
    'checklist': '/checklist',
    'glossary': '/glossary',
    'case-studies': '/case-studies',
};

/** Check if a route should have a sidebar based on the blueprint */
export function shouldHaveSidebar(blueprint: StructuralBlueprint, route: string): boolean {
    switch (blueprint.sidebarStrategy) {
        case 'none': return false;
        case 'homepage-only': return route === '/';
        case 'guides-only': return route.startsWith('/guides');
        case 'all-content': return !['/contact', '/about', '/privacy-policy', '/terms', '/disclosure'].includes(route);
    }
}

/** Map a homepage section slot to the block type(s) it uses */
export function sectionSlotToBlockType(slot: HomepageSectionSlot): string {
    switch (slot) {
        case 'hero': return 'Hero';
        case 'cost-breakdown': return 'CostBreakdown';
        case 'calculator': return 'QuoteCalculator';
        case 'comparison': return 'ComparisonTable';
        case 'faq': return 'FAQ';
        case 'article': return 'ArticleBody';
        case 'testimonials': return 'TestimonialGrid';
        case 'lead-form': return 'LeadForm';
        case 'trust-badges': return 'TrustBadges';
        case 'stats': return 'StatGrid';
        case 'cta-banner': return 'CTABanner';
    }
}

/** Map header style to block variant + config */
export function headerStyleToBlock(style: HeaderStyle): { variant: string; config: Record<string, unknown> } {
    switch (style) {
        case 'topbar-sticky': return { variant: 'topbar', config: { sticky: true } };
        case 'topbar-static': return { variant: 'topbar', config: { sticky: false } };
        case 'centered-logo': return { variant: 'centered', config: { sticky: true } };
        case 'minimal-inline': return { variant: 'minimal', config: { sticky: false } };
        case 'split-actions': return { variant: 'split', config: { sticky: true } };
    }
}

/** Map footer structure to block variant */
export function footerStructureToVariant(structure: FooterStructure): string {
    switch (structure) {
        case 'columns-4': return 'multi-column';
        case 'columns-3': return 'multi-column';
        case 'columns-2': return 'newsletter';
        // We don't currently support a distinct "centered" footer variant in the block system.
        // Use "minimal" styling with a single curated link column.
        case 'centered': return 'minimal';
        case 'minimal-links': return 'minimal';
        case 'stacked': return 'legal';
    }
}

/** Map hero structure to block variant */
export function heroStructureToVariant(structure: HeroStructure): string {
    switch (structure) {
        case 'standard': return 'centered';
        case 'split-reverse': return 'split';
        case 'minimal-left': return 'minimal';
        case 'card-overlay': return 'glass';
        case 'stats-bar': return 'gradient';
        case 'breadcrumb-hero': return 'minimal';
    }
}

/** Map CTA style to block config */
export function ctaStyleToConfig(style: CtaStyle): Record<string, unknown> | null {
    switch (style) {
        case 'banner-full': return { style: 'banner', trigger: 'scroll' };
        case 'card-centered': return { style: 'card', trigger: 'scroll' };
        case 'inline-bar': return { style: 'bar', trigger: 'scroll' };
        case 'sticky-bottom': return { style: 'bar', trigger: 'immediate' };
        case 'side-panel': return { style: 'card', trigger: 'scroll' };
        case 'none': return null;
    }
}

// ── Footer Column Builder ────────────────────────────────────────────────────

interface FooterColumn {
    title: string;
    links: Array<{ label: string; href: string }>;
}

const COLUMN_TITLE_VARIANTS: Record<string, string[]> = {
    tools: ['Tools', 'Calculators', 'Free Tools', 'Explore Tools'],
    learn: ['Learn', 'Guides', 'Resources', 'Read More', 'Knowledge Base'],
    company: ['Company', 'About', 'Info', 'Legal'],
};

/**
 * Build footer columns that only include links to pages that actually exist.
 * Different domains get different column structures based on their blueprint.
 */
export function buildBlueprintFooterColumns(
    blueprint: StructuralBlueprint,
    liveRoutes: Set<string>,
    siteName: string,
    niche: string,
): FooterColumn[] {
    const hash = domainHash(blueprint.domain);

    function exists(route: string): boolean { return liveRoutes.has(route); }
    function pickLabel(offset: number, category: string): string {
        const options = COLUMN_TITLE_VARIANTS[category] || [category];
        return options[pickFromHash(hash, offset, options.length)];
    }

    // Tool/calculator links
    const toolLinks: Array<{ label: string; href: string }> = [];
    if (exists('/calculator')) toolLinks.push({ label: 'Cost Calculator', href: '/calculator' });
    if (exists('/compare')) toolLinks.push({ label: 'Comparison Guide', href: '/compare' });
    if (exists('/pricing')) toolLinks.push({ label: 'Pricing Guide', href: '/pricing' });
    if (exists('/checklist')) toolLinks.push({ label: 'Checklist', href: '/checklist' });

    // Learning/content links
    const learnLinks: Array<{ label: string; href: string }> = [];
    if (exists('/guides')) learnLinks.push({ label: 'How-To Guides', href: '/guides' });
    if (exists('/guides/complete-guide')) learnLinks.push({ label: 'Complete Guide', href: '/guides/complete-guide' });
    if (exists('/guides/save-money')) learnLinks.push({ label: 'Save Money', href: '/guides/save-money' });
    if (exists('/blog')) learnLinks.push({ label: 'Blog', href: '/blog' });
    if (exists('/faq')) learnLinks.push({ label: 'FAQ', href: '/faq' });
    if (exists('/resources')) learnLinks.push({ label: `${niche.charAt(0).toUpperCase() + niche.slice(1)} Resources`, href: '/resources' });
    if (exists('/how-it-works')) learnLinks.push({ label: 'How It Works', href: '/how-it-works' });
    if (exists('/glossary')) learnLinks.push({ label: 'Glossary', href: '/glossary' });
    if (exists('/case-studies')) learnLinks.push({ label: 'Case Studies', href: '/case-studies' });
    if (exists('/reviews')) learnLinks.push({ label: 'Reviews', href: '/reviews' });

    // Company/legal links
    const companyLinks: Array<{ label: string; href: string }> = [];
    if (exists('/about')) companyLinks.push({ label: 'About Us', href: '/about' });
    if (exists('/contact')) companyLinks.push({ label: 'Contact', href: '/contact' });
    if (exists('/privacy-policy')) companyLinks.push({ label: 'Privacy Policy', href: '/privacy-policy' });
    if (exists('/terms')) companyLinks.push({ label: 'Terms of Service', href: '/terms' });
    if (exists('/disclosure')) companyLinks.push({ label: 'Disclosure', href: '/disclosure' });

    const columns: FooterColumn[] = [];

    // Different structures based on blueprint footer style
    switch (blueprint.footerStructure) {
        case 'columns-4':
        case 'columns-3':
            if (toolLinks.length > 0) columns.push({ title: pickLabel(30, 'tools'), links: toolLinks });
            if (learnLinks.length > 0) columns.push({ title: pickLabel(31, 'learn'), links: learnLinks.slice(0, 5) });
            columns.push({ title: pickLabel(32, 'company'), links: companyLinks });
            break;
        case 'columns-2':
            // Merge tools + learn into one column
            columns.push({ title: pickLabel(30, 'tools'), links: [...toolLinks, ...learnLinks].slice(0, 6) });
            columns.push({ title: pickLabel(32, 'company'), links: companyLinks });
            break;
        case 'centered':
        case 'minimal-links':
            // Single flat row of the most important links
            columns.push({
                title: siteName,
                links: [...toolLinks.slice(0, 2), ...learnLinks.slice(0, 2), ...companyLinks.slice(0, 3)],
            });
            break;
        case 'stacked':
            columns.push({ title: pickLabel(31, 'learn'), links: [...toolLinks, ...learnLinks].slice(0, 8) });
            columns.push({ title: pickLabel(32, 'company'), links: companyLinks });
            break;
    }

    return columns;
}
