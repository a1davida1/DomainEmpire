/**
 * Block System v2 — barrel export.
 */

// Schemas & types
export {
    BlockTypeEnum,
    BlockEnvelopeSchema,
    PageDefinitionSchema,
    BLOCK_SCHEMA_REGISTRY,
    validateBlock,
    type BlockType,
    type BlockEnvelope,
    type PageDefinition,
    type AnyBlock,
    type TypedBlock,
    // Content types
    type HeaderContent,
    type FooterContent,
    type HeroContent,
    type ArticleBodyContent,
    type FAQContent,
    type ChecklistContent,
    type ComparisonTableContent,
    type LeadFormContent,
    type CTABannerContent,
    type QuoteCalculatorContent,
    type CostBreakdownContent,
    type StatGridContent,
    type WizardContent,
    type GeoContentContent,
    type InteractiveMapContent,
} from './schemas';

// Assembler
export {
    assemblePageFromBlocks,
    registerBlockRenderer,
    renderBlock,
    type RenderContext,
} from './assembler';

// Interactive block renderers — side-effect import registers them
import './renderers-interactive';

// Presets
export {
    HOMEPAGE_PRESETS,
    ARTICLE_PAGE_PRESETS,
    getHomepagePreset,
    getArticlePagePreset,
} from './presets';

// Seeder
export {
    seedPageDefinitions,
    batchSeedPageDefinitions,
    type SeedOptions,
    type SeedResult,
    type BatchSeedOptions,
    type BatchSeedResult,
} from './seed';
