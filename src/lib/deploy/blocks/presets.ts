/**
 * Block Presets — predefined block sequences that map to v1 siteTemplate values.
 *
 * When a domain is migrated from v1 → v2, its siteTemplate value is used to
 * look up a preset here. The preset provides the default block sequence for
 * the homepage (route "/"). Article pages get their own block sequences based
 * on their contentType.
 *
 * Each preset is an array of partial BlockEnvelope objects (id is generated at insert time).
 */

import { randomUUID } from 'crypto';
import type { BlockType } from './schemas';
import { mergeBlockDefaults } from './default-content';

interface PresetBlock {
    type: BlockType;
    variant?: string;
    config?: Record<string, unknown>;
    content?: Record<string, unknown>;
}

/**
 * Homepage presets keyed by v1 siteTemplate name.
 * Each maps to an ordered array of blocks for the "/" route.
 */
export const HOMEPAGE_PRESETS: Record<string, PresetBlock[]> = {
    authority: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'centered' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CitationBlock' },
        { type: 'CTABanner', config: { style: 'bar', trigger: 'scroll' } },
        { type: 'Footer', variant: 'multi-column' },
    ],
    comparison: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'split' },
        { type: 'ComparisonTable', config: { variant: 'table' } },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'card', trigger: 'scroll' } },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'newsletter' },
    ],
    calculator: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'minimal' },
        { type: 'QuoteCalculator' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    review: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'centered' },
        { type: 'RankingList' },
        { type: 'ProsConsCard' },
        { type: 'ComparisonTable', config: { variant: 'table' } },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'banner', trigger: 'scroll' } },
        { type: 'Footer', variant: 'multi-column' },
    ],
    tool: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'minimal' },
        { type: 'QuoteCalculator' },
        { type: 'ComparisonTable', config: { variant: 'table' } },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'Footer', variant: 'minimal' },
    ],
    hub: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'gradient' },
        { type: 'InteractiveMap' },
        { type: 'StatGrid' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'bar', trigger: 'scroll' } },
        { type: 'Footer', variant: 'multi-column' },
    ],
    decision: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'centered' },
        { type: 'Wizard', config: { mode: 'wizard' } },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'card', trigger: 'scroll' } },
        { type: 'Footer', variant: 'newsletter' },
    ],
    cost_guide: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'minimal' },
        { type: 'CostBreakdown' },
        { type: 'QuoteCalculator' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'LeadForm' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    niche: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'centered' },
        { type: 'ArticleBody' },
        { type: 'StatGrid' },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'bar', trigger: 'scroll' } },
        { type: 'Footer', variant: 'multi-column' },
    ],
    info: [
        { type: 'Header', variant: 'centered' },
        { type: 'Hero', variant: 'centered' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'legal' },
    ],
    consumer: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'split' },
        { type: 'ComparisonTable', config: { variant: 'cards' } },
        { type: 'RankingList' },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'banner', trigger: 'scroll' } },
        { type: 'Footer', variant: 'newsletter' },
    ],
    brand: [
        { type: 'Header', variant: 'centered' },
        { type: 'Hero', variant: 'image' },
        { type: 'ArticleBody' },
        { type: 'TestimonialGrid' },
        { type: 'TrustBadges' },
        { type: 'CTABanner', config: { style: 'card', trigger: 'immediate' } },
        { type: 'Footer', variant: 'multi-column' },
    ],
    magazine: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'gradient' },
        { type: 'ArticleBody' },
        { type: 'StatGrid' },
        { type: 'FAQ' },
        { type: 'Footer', variant: 'multi-column' },
    ],
    landing: [
        { type: 'Header', variant: 'minimal' },
        { type: 'Hero', variant: 'centered' },
        { type: 'TrustBadges' },
        { type: 'LeadForm' },
        { type: 'TestimonialGrid' },
        { type: 'FAQ' },
        { type: 'Footer', variant: 'legal' },
    ],
    local_lead_gen: [
        { type: 'Header', variant: 'topbar', config: { sticky: true, showPhone: true } },
        { type: 'Hero', variant: 'click-to-call' },
        { type: 'TrustBadges' },
        { type: 'QuoteCalculator' },
        { type: 'FAQ' },
        { type: 'LeadForm' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    docs: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Sidebar', config: { position: 'left' } },
        { type: 'ArticleBody', config: { showTableOfContents: true } },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    storefront: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'image' },
        { type: 'ComparisonTable', config: { variant: 'cards' } },
        { type: 'PricingTable' },
        { type: 'TestimonialGrid' },
        { type: 'FAQ' },
        { type: 'CTABanner', config: { style: 'banner', trigger: 'scroll' } },
        { type: 'Footer', variant: 'multi-column' },
    ],
    minimal: [
        { type: 'Header', variant: 'minimal' },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    dashboard: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'minimal' },
        { type: 'StatGrid' },
        { type: 'DataTable' },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    newsletter: [
        { type: 'Header', variant: 'centered' },
        { type: 'Hero', variant: 'centered' },
        { type: 'ArticleBody' },
        { type: 'LeadForm' },
        { type: 'Footer', variant: 'newsletter' },
    ],
    community: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Hero', variant: 'gradient' },
        { type: 'ArticleBody' },
        { type: 'Wizard', config: { mode: 'quiz' } },
        { type: 'FAQ' },
        { type: 'LeadForm' },
        { type: 'Footer', variant: 'newsletter' },
    ],
};

/**
 * Article page presets keyed by contentType.
 * These define which blocks surround the main content for each article type.
 */
export const ARTICLE_PAGE_PRESETS: Record<string, PresetBlock[]> = {
    article: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LastUpdated' },
        { type: 'ArticleBody' },
        { type: 'AuthorBio' },
        { type: 'CitationBlock' },
        { type: 'CTABanner', config: { style: 'bar', trigger: 'scroll' } },
        { type: 'Footer', variant: 'minimal' },
    ],
    comparison: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LastUpdated' },
        { type: 'ComparisonTable' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    calculator: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'QuoteCalculator' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    cost_guide: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LastUpdated' },
        { type: 'CostBreakdown' },
        { type: 'ArticleBody' },
        { type: 'FAQ' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    lead_capture: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LeadForm' },
        { type: 'ArticleBody' },
        { type: 'TrustBadges' },
        { type: 'Footer', variant: 'legal' },
    ],
    health_decision: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'MedicalDisclaimer', config: { position: 'top' } },
        { type: 'LastUpdated' },
        { type: 'ArticleBody' },
        { type: 'MedicalDisclaimer', config: { position: 'bottom', showDoctorCta: true } },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'legal' },
    ],
    checklist: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LastUpdated' },
        { type: 'Checklist' },
        { type: 'ArticleBody' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    faq: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LastUpdated' },
        { type: 'FAQ' },
        { type: 'ArticleBody' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    review: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'LastUpdated' },
        { type: 'RankingList' },
        { type: 'ProsConsCard' },
        { type: 'ArticleBody' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    wizard: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Wizard', config: { mode: 'wizard' } },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    configurator: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Wizard', config: { mode: 'configurator' } },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    quiz: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Wizard', config: { mode: 'quiz' } },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    survey: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Wizard', config: { mode: 'survey' } },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    assessment: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'Wizard', config: { mode: 'assessment' } },
        { type: 'ArticleBody' },
        { type: 'Footer', variant: 'minimal' },
    ],
    interactive_infographic: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'StatGrid' },
        { type: 'ArticleBody' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
    interactive_map: [
        { type: 'Header', variant: 'topbar', config: { sticky: true } },
        { type: 'InteractiveMap' },
        { type: 'ArticleBody' },
        { type: 'CitationBlock' },
        { type: 'Footer', variant: 'minimal' },
    ],
};

/** Generate a unique block ID for use in page definitions */
function generateBlockId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/** @deprecated No-op. Kept for test compatibility. */
export function resetBlockIdCounter(): void {
    // No-op — IDs are now generated via crypto.randomUUID()
}

/**
 * Get a homepage preset for a given siteTemplate, with generated IDs.
 * Falls back to 'authority' if the template name is not recognized.
 * When domain/niche are provided, blocks get rich default content.
 */
export function getHomepagePreset(siteTemplate: string, domain?: string, niche?: string): Array<PresetBlock & { id: string }> {
    const blocks = HOMEPAGE_PRESETS[siteTemplate] ?? HOMEPAGE_PRESETS.authority;
    return blocks.map(b => {
        const merged = mergeBlockDefaults(b, domain, niche);
        return { ...b, id: generateBlockId(), content: merged.content, config: merged.config };
    });
}

/**
 * Get an article page preset for a given contentType, with generated IDs.
 * Falls back to 'article' if the content type is not recognized.
 * When domain/niche are provided, blocks get rich default content.
 */
export function getArticlePagePreset(contentType: string, domain?: string, niche?: string): Array<PresetBlock & { id: string }> {
    const blocks = ARTICLE_PAGE_PRESETS[contentType] ?? ARTICLE_PAGE_PRESETS.article;
    return blocks.map(b => {
        const merged = mergeBlockDefaults(b, domain, niche);
        return { ...b, id: generateBlockId(), content: merged.content, config: merged.config };
    });
}
