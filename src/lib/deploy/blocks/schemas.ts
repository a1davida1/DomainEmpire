/**
 * Block Schema Definitions for Template System v2.
 *
 * Each block type has:
 * 1. A Zod schema for runtime validation
 * 2. A TypeScript type inferred from the schema
 * 3. A variant enum where applicable
 *
 * These schemas serve three purposes:
 * - Validate block content at save time
 * - Type-check block renderers at build time
 * - Define what the AI pipeline generates per block
 */

import { z } from 'zod';

// ============================================================
// Core Block Envelope
// ============================================================

export const BlockTypeEnum = z.enum([
  'Header',
  'Footer',
  'Sidebar',
  'Hero',
  'ArticleBody',
  'FAQ',
  'StepByStep',
  'Checklist',
  'AuthorBio',
  'ComparisonTable',
  'VsCard',
  'RankingList',
  'ProsConsCard',
  'LeadForm',
  'CTABanner',
  'PricingTable',
  'QuoteCalculator',
  'CostBreakdown',
  'StatGrid',
  'DataTable',
  'TestimonialGrid',
  'TrustBadges',
  'CitationBlock',
  'LastUpdated',
  'MedicalDisclaimer',
  'Wizard',
  'GeoContent',
  'InteractiveMap',
  'PdfDownload',
  'ScrollCTA',
  'EmbedWidget',
  'ResourceGrid',
  'LatestArticles',
]);

export type BlockType = z.infer<typeof BlockTypeEnum>;

/** Base envelope shared by every block instance */
export const BlockEnvelopeSchema = z.object({
  id: z.string(),
  type: BlockTypeEnum,
  variant: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

export type BlockEnvelope = z.infer<typeof BlockEnvelopeSchema>;

// ============================================================
// Layout Blocks
// ============================================================

// --- Header ---
export const HeaderVariant = z.enum(['topbar', 'centered', 'minimal', 'split']);

export const HeaderContentSchema = z.object({
  siteName: z.string(),
  logoUrl: z.string().optional(),
  navLinks: z.array(z.object({
    label: z.string(),
    href: z.string(),
  })).optional(),
});

export const HeaderConfigSchema = z.object({
  variant: HeaderVariant.default('topbar'),
  sticky: z.boolean().default(false),
  showSearch: z.boolean().default(false),
});

export type HeaderContent = z.infer<typeof HeaderContentSchema>;
export type HeaderConfig = z.infer<typeof HeaderConfigSchema>;

// --- Footer ---
export const FooterVariant = z.enum(['minimal', 'multi-column', 'newsletter', 'legal']);

export const FooterContentSchema = z.object({
  siteName: z.string(),
  copyrightYear: z.number().optional(),
  columns: z.array(z.object({
    title: z.string(),
    links: z.array(z.object({
      label: z.string(),
      href: z.string(),
    })),
  })).optional(),
  legalLinks: z.array(z.object({
    label: z.string(),
    href: z.string(),
  })).optional(),
  disclaimerText: z.string().optional(),
  newsletterEndpoint: z.string().optional(),
  newsletterHeadline: z.string().optional(),
  socialLinks: z.array(z.object({
    platform: z.string(),
    url: z.string(),
  })).optional(),
});

export const FooterConfigSchema = z.object({
  variant: FooterVariant.default('minimal'),
  showDisclaimer: z.boolean().default(true),
  showCookieConsent: z.boolean().default(true),
});

export type FooterContent = z.infer<typeof FooterContentSchema>;
export type FooterConfig = z.infer<typeof FooterConfigSchema>;

// --- Sidebar ---
export const SidebarContentSchema = z.object({
  sections: z.array(z.object({
    title: z.string(),
    html: z.string(),
  })),
});

export const SidebarConfigSchema = z.object({
  position: z.enum(['left', 'right']).default('right'),
  sticky: z.boolean().default(true),
  width: z.string().default('280px'),
});

export type SidebarContent = z.infer<typeof SidebarContentSchema>;
export type SidebarConfig = z.infer<typeof SidebarConfigSchema>;

// ============================================================
// Page Blocks
// ============================================================

// --- Hero ---
export const HeroVariant = z.enum(['centered', 'split', 'minimal', 'gradient', 'image']);

export const HeroContentSchema = z.object({
  heading: z.string(),
  subheading: z.string().optional(),
  ctaText: z.string().optional(),
  ctaUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  imageAlt: z.string().optional(),
  badge: z.string().optional(),
});

export const HeroConfigSchema = z.object({
  variant: HeroVariant.default('centered'),
  fullWidth: z.boolean().default(false),
  overlay: z.boolean().default(false),
});

export type HeroContent = z.infer<typeof HeroContentSchema>;
export type HeroConfig = z.infer<typeof HeroConfigSchema>;

// ============================================================
// Content Blocks
// ============================================================

// --- ArticleBody ---
export const ArticleBodyContentSchema = z.object({
  markdown: z.string(),
  title: z.string().optional(),
  metaDescription: z.string().optional(),
  targetKeyword: z.string().optional(),
  secondaryKeywords: z.array(z.string()).optional(),
});

export const ArticleBodyConfigSchema = z.object({
  showTableOfContents: z.boolean().default(false),
  showPrintButton: z.boolean().default(false),
});

export type ArticleBodyContent = z.infer<typeof ArticleBodyContentSchema>;
export type ArticleBodyConfig = z.infer<typeof ArticleBodyConfigSchema>;

// --- FAQ ---
export const FAQContentSchema = z.object({
  items: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

export const FAQConfigSchema = z.object({
  openFirst: z.boolean().default(false),
  maxAnswerLength: z.number().optional(),
  emitJsonLd: z.boolean().default(true),
});

export type FAQContent = z.infer<typeof FAQContentSchema>;
export type FAQConfig = z.infer<typeof FAQConfigSchema>;

// --- StepByStep / Checklist ---
export const ChecklistContentSchema = z.object({
  steps: z.array(z.object({
    heading: z.string(),
    body: z.string(),
  })),
});

export const ChecklistConfigSchema = z.object({
  interactive: z.boolean().default(true),
  showProgress: z.boolean().default(true),
  showPrintButton: z.boolean().default(true),
  numbered: z.boolean().default(true),
});

export type ChecklistContent = z.infer<typeof ChecklistContentSchema>;
export type ChecklistConfig = z.infer<typeof ChecklistConfigSchema>;

// --- AuthorBio ---
export const AuthorBioContentSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  bio: z.string(),
  avatarUrl: z.string().optional(),
  credentials: z.array(z.string()).optional(),
  socialLinks: z.array(z.object({
    platform: z.string(),
    url: z.string(),
  })).optional(),
});

export const AuthorBioConfigSchema = z.object({
  layout: z.enum(['inline', 'card', 'sidebar']).default('card'),
});

export type AuthorBioContent = z.infer<typeof AuthorBioContentSchema>;
export type AuthorBioConfig = z.infer<typeof AuthorBioConfigSchema>;

// ============================================================
// Comparison Blocks
// ============================================================

// --- ComparisonTable ---
export const ComparisonTableContentSchema = z.object({
  options: z.array(z.object({
    name: z.string(),
    url: z.string().optional(),
    badge: z.string().optional(),
    scores: z.record(z.string(), z.union([z.number(), z.string()])),
  })),
  columns: z.array(z.object({
    key: z.string(),
    label: z.string(),
    type: z.enum(['number', 'text', 'rating']),
    sortable: z.boolean().optional(),
  })),
  defaultSort: z.string().optional(),
  verdict: z.string().optional(),
});

export const ComparisonTableConfigSchema = z.object({
  variant: z.enum(['table', 'cards']).default('table'),
  showBadges: z.boolean().default(true),
  showVerdict: z.boolean().default(true),
  showCta: z.boolean().default(true),
  emitJsonLd: z.boolean().default(true),
});

export type ComparisonTableContent = z.infer<typeof ComparisonTableContentSchema>;
export type ComparisonTableConfig = z.infer<typeof ComparisonTableConfigSchema>;

// --- VsCard ---
export const VsCardContentSchema = z.object({
  itemA: z.object({
    name: z.string(),
    description: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    rating: z.number().optional(),
    url: z.string().optional(),
  }),
  itemB: z.object({
    name: z.string(),
    description: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    rating: z.number().optional(),
    url: z.string().optional(),
  }),
  verdict: z.string().optional(),
});

export const VsCardConfigSchema = z.object({
  showRatings: z.boolean().default(true),
  highlightWinner: z.boolean().default(true),
});

export type VsCardContent = z.infer<typeof VsCardContentSchema>;
export type VsCardConfig = z.infer<typeof VsCardConfigSchema>;

// --- RankingList ---
export const RankingListContentSchema = z.object({
  items: z.array(z.object({
    rank: z.number(),
    name: z.string(),
    description: z.string(),
    rating: z.number().optional(),
    badge: z.string().optional(),
    url: z.string().optional(),
  })),
  title: z.string().optional(),
});

export const RankingListConfigSchema = z.object({
  showRank: z.boolean().default(true),
  maxItems: z.number().optional(),
});

export type RankingListContent = z.infer<typeof RankingListContentSchema>;
export type RankingListConfig = z.infer<typeof RankingListConfigSchema>;

// --- ProsConsCard ---
export const ProsConsCardContentSchema = z.object({
  name: z.string(),
  rating: z.number().optional(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  summary: z.string().optional(),
  url: z.string().optional(),
  badge: z.string().optional(),
});

export const ProsConsCardConfigSchema = z.object({
  showRating: z.boolean().default(true),
  showCta: z.boolean().default(true),
});

export type ProsConsCardContent = z.infer<typeof ProsConsCardContentSchema>;
export type ProsConsCardConfig = z.infer<typeof ProsConsCardConfigSchema>;

// ============================================================
// Conversion Blocks
// ============================================================

// --- LeadForm ---
export const LeadFormContentSchema = z.object({
  heading: z.string().optional(),
  subheading: z.string().optional(),
  fields: z.array(z.object({
    name: z.string(),
    label: z.string(),
    type: z.enum(['text', 'email', 'tel', 'select', 'number']),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    half: z.boolean().optional(),
    placeholder: z.string().optional(),
  })),
  consentText: z.string(),
  successMessage: z.string(),
  disclosureAboveFold: z.string().optional(),
  privacyUrl: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
});

export const LeadFormConfigSchema = z.object({
  endpoint: z.string(),
  submitLabel: z.string().default('Submit'),
  showDisclosure: z.boolean().default(true),
});

export type LeadFormContent = z.infer<typeof LeadFormContentSchema>;
export type LeadFormConfig = z.infer<typeof LeadFormConfigSchema>;

// --- CTABanner ---
export const CTABannerContentSchema = z.object({
  text: z.string(),
  buttonLabel: z.string(),
  buttonUrl: z.string(),
});

export const CTABannerConfigSchema = z.object({
  style: z.enum(['bar', 'card', 'banner']).default('bar'),
  trigger: z.enum(['immediate', 'scroll', 'exit']).default('immediate'),
  scrollThreshold: z.number().default(0.6),
  dismissible: z.boolean().default(true),
});

export type CTABannerContent = z.infer<typeof CTABannerContentSchema>;
export type CTABannerConfig = z.infer<typeof CTABannerConfigSchema>;

// --- PricingTable ---
export const PricingTableContentSchema = z.object({
  plans: z.array(z.object({
    name: z.string(),
    price: z.string(),
    period: z.string().optional(),
    features: z.array(z.string()),
    ctaText: z.string().optional(),
    ctaUrl: z.string().optional(),
    highlighted: z.boolean().optional(),
    badge: z.string().optional(),
  })),
});

export const PricingTableConfigSchema = z.object({
  columns: z.number().default(3),
  showToggle: z.boolean().default(false),
});

export type PricingTableContent = z.infer<typeof PricingTableContentSchema>;
export type PricingTableConfig = z.infer<typeof PricingTableConfigSchema>;

// --- QuoteCalculator ---
export const QuoteCalculatorContentSchema = z.object({
  inputs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['number', 'select', 'range']),
    default: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    options: z.array(z.object({
      label: z.string(),
      value: z.number(),
    })).optional(),
  })),
  outputs: z.array(z.object({
    id: z.string(),
    label: z.string(),
    format: z.enum(['currency', 'percent', 'number']),
    decimals: z.number().optional(),
  })),
  formula: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  methodology: z.string().optional(),
});

export const QuoteCalculatorConfigSchema = z.object({
  showMethodology: z.boolean().default(true),
  autoCalculate: z.boolean().default(true),
  emitJsonLd: z.boolean().default(true),
});

export type QuoteCalculatorContent = z.infer<typeof QuoteCalculatorContentSchema>;
export type QuoteCalculatorConfig = z.infer<typeof QuoteCalculatorConfigSchema>;

// ============================================================
// Data Blocks
// ============================================================

// --- CostBreakdown ---
export const CostBreakdownContentSchema = z.object({
  ranges: z.array(z.object({
    label: z.string().optional(),
    low: z.number(),
    high: z.number(),
    average: z.number().optional(),
    dataPoints: z.array(z.number()).optional(),
  })),
  factors: z.array(z.object({
    name: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
    description: z.string(),
  })).optional(),
});

export const CostBreakdownConfigSchema = z.object({
  showFactors: z.boolean().default(true),
  currencySymbol: z.string().default('$'),
  showPrintButton: z.boolean().default(true),
});

export type CostBreakdownContent = z.infer<typeof CostBreakdownContentSchema>;
export type CostBreakdownConfig = z.infer<typeof CostBreakdownConfigSchema>;

// --- StatGrid ---
export const StatGridContentSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    metricLabel: z.string(),
    metricValue: z.number(),
    summary: z.string(),
    group: z.string(),
  })),
});

export const StatGridConfigSchema = z.object({
  filterable: z.boolean().default(true),
  sortable: z.boolean().default(true),
  showBars: z.boolean().default(true),
  columns: z.number().default(3),
});

export type StatGridContent = z.infer<typeof StatGridContentSchema>;
export type StatGridConfig = z.infer<typeof StatGridConfigSchema>;

// --- DataTable ---
export const DataTableContentSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number()]))),
  caption: z.string().optional(),
});

export const DataTableConfigSchema = z.object({
  sortable: z.boolean().default(true),
  searchable: z.boolean().default(false),
  striped: z.boolean().default(true),
});

export type DataTableContent = z.infer<typeof DataTableContentSchema>;
export type DataTableConfig = z.infer<typeof DataTableConfigSchema>;

// ============================================================
// Trust Blocks
// ============================================================

// --- TestimonialGrid ---
export const TestimonialGridContentSchema = z.object({
  testimonials: z.array(z.object({
    quote: z.string(),
    author: z.string(),
    title: z.string().optional(),
    avatarUrl: z.string().optional(),
    rating: z.number().optional(),
  })),
});

export const TestimonialGridConfigSchema = z.object({
  columns: z.number().default(3),
  showRatings: z.boolean().default(true),
});

export type TestimonialGridContent = z.infer<typeof TestimonialGridContentSchema>;
export type TestimonialGridConfig = z.infer<typeof TestimonialGridConfigSchema>;

// --- TrustBadges ---
export const TrustBadgesContentSchema = z.object({
  badges: z.array(z.object({
    label: z.string(),
    iconUrl: z.string().optional(),
    description: z.string().optional(),
  })),
});

export const TrustBadgesConfigSchema = z.object({
  layout: z.enum(['row', 'grid']).default('row'),
});

export type TrustBadgesContent = z.infer<typeof TrustBadgesContentSchema>;
export type TrustBadgesConfig = z.infer<typeof TrustBadgesConfigSchema>;

// --- CitationBlock ---
export const CitationBlockContentSchema = z.object({
  sources: z.array(z.object({
    title: z.string(),
    url: z.string().optional(),
    publisher: z.string().optional(),
    retrievedAt: z.string().optional(),
    usage: z.string().optional(),
  })),
});

export const CitationBlockConfigSchema = z.object({
  collapsible: z.boolean().default(false),
});

export type CitationBlockContent = z.infer<typeof CitationBlockContentSchema>;
export type CitationBlockConfig = z.infer<typeof CitationBlockConfigSchema>;

// --- LastUpdated ---
export const LastUpdatedContentSchema = z.object({
  date: z.string(),
  reviewedBy: z.string().optional(),
  status: z.enum(['fresh', 'review-pending', 'stale']).default('fresh'),
});

export const LastUpdatedConfigSchema = z.object({
  showBadge: z.boolean().default(true),
  showReviewer: z.boolean().default(true),
});

export type LastUpdatedContent = z.infer<typeof LastUpdatedContentSchema>;
export type LastUpdatedConfig = z.infer<typeof LastUpdatedConfigSchema>;

// --- MedicalDisclaimer ---
export const MedicalDisclaimerContentSchema = z.object({
  disclaimerText: z.string().default(
    'This content is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider.',
  ),
  ctaText: z.string().optional(),
});

export const MedicalDisclaimerConfigSchema = z.object({
  showDoctorCta: z.boolean().default(true),
  position: z.enum(['top', 'bottom', 'both']).default('top'),
});

export type MedicalDisclaimerContent = z.infer<typeof MedicalDisclaimerContentSchema>;
export type MedicalDisclaimerConfig = z.infer<typeof MedicalDisclaimerConfigSchema>;

// ============================================================
// Interactive Blocks
// ============================================================

// --- Wizard ---
export const WizardContentSchema = z.object({
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    fields: z.array(z.object({
      id: z.string(),
      type: z.enum(['radio', 'checkbox', 'select', 'number', 'text']),
      label: z.string(),
      options: z.array(z.object({
        value: z.string(),
        label: z.string(),
      })).optional(),
      required: z.boolean().optional(),
    })),
    nextStep: z.string().optional(),
    branches: z.array(z.object({
      condition: z.string(),
      goTo: z.string(),
    })).optional(),
  })),
  resultRules: z.array(z.object({
    condition: z.string(),
    title: z.string(),
    body: z.string(),
    cta: z.object({
      text: z.string(),
      url: z.string(),
    }).optional(),
  })),
  resultTemplate: z.enum(['summary', 'recommendation', 'score', 'eligibility']),
  collectLead: z.object({
    fields: z.array(z.string()),
    consentText: z.string(),
    endpoint: z.string(),
  }).optional(),
  scoring: z.object({
    method: z.enum(['completion', 'weighted']).optional(),
    weights: z.record(z.string(), z.number()).optional(),
    valueMap: z.record(z.string(), z.record(z.string(), z.number())).optional(),
    bands: z.array(z.object({
      min: z.number(),
      max: z.number(),
      label: z.string(),
      description: z.string().optional(),
    })).optional(),
    outcomes: z.array(z.object({
      min: z.number(),
      max: z.number(),
      title: z.string(),
      body: z.string(),
      cta: z.object({
        text: z.string(),
        url: z.string(),
      }).optional(),
    })).optional(),
  }).optional(),
});

export const WizardConfigSchema = z.object({
  mode: z.enum(['wizard', 'configurator', 'quiz', 'survey', 'assessment']).default('wizard'),
  showProgress: z.boolean().default(true),
  showAnswerSummary: z.boolean().default(false),
});

export type WizardContent = z.infer<typeof WizardContentSchema>;
export type WizardConfig = z.infer<typeof WizardConfigSchema>;

// --- GeoContent ---
export const GeoContentContentSchema = z.object({
  regions: z.record(z.string(), z.object({
    content: z.string(),
    label: z.string().optional(),
  })),
  fallback: z.string(),
});

export const GeoContentConfigSchema = z.object({
  detectionMethod: z.enum(['timezone', 'ip']).default('timezone'),
});

export type GeoContentContent = z.infer<typeof GeoContentContentSchema>;
export type GeoContentConfig = z.infer<typeof GeoContentConfigSchema>;

// --- InteractiveMap ---
export const InteractiveMapContentSchema = z.object({
  regions: z.record(z.string(), z.object({
    label: z.string(),
    content: z.string(),
  })),
  defaultRegion: z.string().optional(),
});

export const InteractiveMapConfigSchema = z.object({
  showTileGrid: z.boolean().default(true),
  showDropdown: z.boolean().default(true),
});

export type InteractiveMapContent = z.infer<typeof InteractiveMapContentSchema>;
export type InteractiveMapConfig = z.infer<typeof InteractiveMapConfigSchema>;

// --- PdfDownload ---
export const PdfDownloadContentSchema = z.object({
  buttonText: z.string().optional(),
  articleId: z.string(),
  domainId: z.string(),
});

export const PdfDownloadConfigSchema = z.object({
  type: z.enum(['article', 'worksheet']).default('article'),
  gated: z.boolean().default(false),
  captureApiUrl: z.string().optional(),
});

export type PdfDownloadContent = z.infer<typeof PdfDownloadContentSchema>;
export type PdfDownloadConfig = z.infer<typeof PdfDownloadConfigSchema>;

// --- ScrollCTA (alias for CTABanner with scroll trigger) ---
export const ScrollCTAContentSchema = CTABannerContentSchema;
export const ScrollCTAConfigSchema = CTABannerConfigSchema.extend({
  trigger: z.literal('scroll').default('scroll'),
});

export type ScrollCTAContent = z.infer<typeof ScrollCTAContentSchema>;
export type ScrollCTAConfig = z.infer<typeof ScrollCTAConfigSchema>;

// --- EmbedWidget ---
export const EmbedWidgetContentSchema = z.object({
  sourceBlockId: z.string(),
  title: z.string(),
});

export const EmbedWidgetConfigSchema = z.object({
  width: z.string().default('100%'),
  height: z.string().default('600px'),
});

export type EmbedWidgetContent = z.infer<typeof EmbedWidgetContentSchema>;
export type EmbedWidgetConfig = z.infer<typeof EmbedWidgetConfigSchema>;

// ============================================================
// Typed Block (discriminated union)
// ============================================================

export interface TypedBlock<
  T extends BlockType = BlockType,
  C = Record<string, unknown>,
  K = Record<string, unknown>,
> {
  id: string;
  type: T;
  variant?: string;
  content: C;
  config?: K;
}

export type HeaderBlock = TypedBlock<'Header', HeaderContent, HeaderConfig>;
export type FooterBlock = TypedBlock<'Footer', FooterContent, FooterConfig>;
export type SidebarBlock = TypedBlock<'Sidebar', SidebarContent, SidebarConfig>;
export type HeroBlock = TypedBlock<'Hero', HeroContent, HeroConfig>;
export type ArticleBodyBlock = TypedBlock<'ArticleBody', ArticleBodyContent, ArticleBodyConfig>;
export type FAQBlock = TypedBlock<'FAQ', FAQContent, FAQConfig>;
export type ChecklistBlock = TypedBlock<'Checklist', ChecklistContent, ChecklistConfig>;
export type StepByStepBlock = TypedBlock<'StepByStep', ChecklistContent, ChecklistConfig>;
export type AuthorBioBlock = TypedBlock<'AuthorBio', AuthorBioContent, AuthorBioConfig>;
export type ComparisonTableBlock = TypedBlock<'ComparisonTable', ComparisonTableContent, ComparisonTableConfig>;
export type VsCardBlock = TypedBlock<'VsCard', VsCardContent, VsCardConfig>;
export type RankingListBlock = TypedBlock<'RankingList', RankingListContent, RankingListConfig>;
export type ProsConsCardBlock = TypedBlock<'ProsConsCard', ProsConsCardContent, ProsConsCardConfig>;
export type LeadFormBlock = TypedBlock<'LeadForm', LeadFormContent, LeadFormConfig>;
export type CTABannerBlock = TypedBlock<'CTABanner', CTABannerContent, CTABannerConfig>;
export type PricingTableBlock = TypedBlock<'PricingTable', PricingTableContent, PricingTableConfig>;
export type QuoteCalculatorBlock = TypedBlock<'QuoteCalculator', QuoteCalculatorContent, QuoteCalculatorConfig>;
export type CostBreakdownBlock = TypedBlock<'CostBreakdown', CostBreakdownContent, CostBreakdownConfig>;
export type StatGridBlock = TypedBlock<'StatGrid', StatGridContent, StatGridConfig>;
export type DataTableBlock = TypedBlock<'DataTable', DataTableContent, DataTableConfig>;
export type TestimonialGridBlock = TypedBlock<'TestimonialGrid', TestimonialGridContent, TestimonialGridConfig>;
export type TrustBadgesBlock = TypedBlock<'TrustBadges', TrustBadgesContent, TrustBadgesConfig>;
export type CitationBlockBlock = TypedBlock<'CitationBlock', CitationBlockContent, CitationBlockConfig>;
export type LastUpdatedBlock = TypedBlock<'LastUpdated', LastUpdatedContent, LastUpdatedConfig>;
export type MedicalDisclaimerBlock = TypedBlock<'MedicalDisclaimer', MedicalDisclaimerContent, MedicalDisclaimerConfig>;
export type WizardBlock = TypedBlock<'Wizard', WizardContent, WizardConfig>;
export type GeoContentBlock = TypedBlock<'GeoContent', GeoContentContent, GeoContentConfig>;
export type InteractiveMapBlock = TypedBlock<'InteractiveMap', InteractiveMapContent, InteractiveMapConfig>;
export type PdfDownloadBlock = TypedBlock<'PdfDownload', PdfDownloadContent, PdfDownloadConfig>;
export type ScrollCTABlock = TypedBlock<'ScrollCTA', ScrollCTAContent, ScrollCTAConfig>;
export type EmbedWidgetBlock = TypedBlock<'EmbedWidget', EmbedWidgetContent, EmbedWidgetConfig>;

// --- ResourceGrid ---
export const ResourceGridContentSchema = z.object({
  heading: z.string().optional(),
  items: z.array(z.object({
    icon: z.string(),
    title: z.string(),
    description: z.string(),
    href: z.string(),
  })).default([]),
});
export const ResourceGridConfigSchema = z.object({}).passthrough();
export type ResourceGridContent = z.infer<typeof ResourceGridContentSchema>;
export type ResourceGridConfig = z.infer<typeof ResourceGridConfigSchema>;
export type ResourceGridBlock = TypedBlock<'ResourceGrid', ResourceGridContent, ResourceGridConfig>;

// --- LatestArticles ---
export const LatestArticlesContentSchema = z.object({
  heading: z.string().optional(),
  articles: z.array(z.object({
    title: z.string(),
    excerpt: z.string(),
    href: z.string(),
    image: z.string().optional(),
  })).default([]),
});
export const LatestArticlesConfigSchema = z.object({}).passthrough();
export type LatestArticlesContent = z.infer<typeof LatestArticlesContentSchema>;
export type LatestArticlesConfig = z.infer<typeof LatestArticlesConfigSchema>;
export type LatestArticlesBlock = TypedBlock<'LatestArticles', LatestArticlesContent, LatestArticlesConfig>;

export type AnyBlock =
  | HeaderBlock
  | FooterBlock
  | SidebarBlock
  | HeroBlock
  | ArticleBodyBlock
  | FAQBlock
  | ChecklistBlock
  | StepByStepBlock
  | AuthorBioBlock
  | ComparisonTableBlock
  | VsCardBlock
  | RankingListBlock
  | ProsConsCardBlock
  | LeadFormBlock
  | CTABannerBlock
  | PricingTableBlock
  | QuoteCalculatorBlock
  | CostBreakdownBlock
  | StatGridBlock
  | DataTableBlock
  | TestimonialGridBlock
  | TrustBadgesBlock
  | CitationBlockBlock
  | LastUpdatedBlock
  | MedicalDisclaimerBlock
  | WizardBlock
  | GeoContentBlock
  | InteractiveMapBlock
  | PdfDownloadBlock
  | ScrollCTABlock
  | EmbedWidgetBlock
  | ResourceGridBlock
  | LatestArticlesBlock;

// ============================================================
// Page Definition (stored in DB)
// ============================================================

export const PageDefinitionSchema = z.object({
  route: z.string().default('/'),
  theme: z.string().default('clean'),
  skin: z.string().default('slate'),
  blocks: z.array(BlockEnvelopeSchema),
});

export type PageDefinitionBlock = z.infer<typeof PageDefinitionSchema>;

// ============================================================
// Content schema registry — maps block type to content + config schemas
// ============================================================

export const BLOCK_SCHEMA_REGISTRY: Record<BlockType, {
  content: z.ZodType;
  config: z.ZodType;
}> = {
  Header: { content: HeaderContentSchema, config: HeaderConfigSchema },
  Footer: { content: FooterContentSchema, config: FooterConfigSchema },
  Sidebar: { content: SidebarContentSchema, config: SidebarConfigSchema },
  Hero: { content: HeroContentSchema, config: HeroConfigSchema },
  ArticleBody: { content: ArticleBodyContentSchema, config: ArticleBodyConfigSchema },
  FAQ: { content: FAQContentSchema, config: FAQConfigSchema },
  StepByStep: { content: ChecklistContentSchema, config: ChecklistConfigSchema },
  Checklist: { content: ChecklistContentSchema, config: ChecklistConfigSchema },
  AuthorBio: { content: AuthorBioContentSchema, config: AuthorBioConfigSchema },
  ComparisonTable: { content: ComparisonTableContentSchema, config: ComparisonTableConfigSchema },
  VsCard: { content: VsCardContentSchema, config: VsCardConfigSchema },
  RankingList: { content: RankingListContentSchema, config: RankingListConfigSchema },
  ProsConsCard: { content: ProsConsCardContentSchema, config: ProsConsCardConfigSchema },
  LeadForm: { content: LeadFormContentSchema, config: LeadFormConfigSchema },
  CTABanner: { content: CTABannerContentSchema, config: CTABannerConfigSchema },
  PricingTable: { content: PricingTableContentSchema, config: PricingTableConfigSchema },
  QuoteCalculator: { content: QuoteCalculatorContentSchema, config: QuoteCalculatorConfigSchema },
  CostBreakdown: { content: CostBreakdownContentSchema, config: CostBreakdownConfigSchema },
  StatGrid: { content: StatGridContentSchema, config: StatGridConfigSchema },
  DataTable: { content: DataTableContentSchema, config: DataTableConfigSchema },
  TestimonialGrid: { content: TestimonialGridContentSchema, config: TestimonialGridConfigSchema },
  TrustBadges: { content: TrustBadgesContentSchema, config: TrustBadgesConfigSchema },
  CitationBlock: { content: CitationBlockContentSchema, config: CitationBlockConfigSchema },
  LastUpdated: { content: LastUpdatedContentSchema, config: LastUpdatedConfigSchema },
  MedicalDisclaimer: { content: MedicalDisclaimerContentSchema, config: MedicalDisclaimerConfigSchema },
  Wizard: { content: WizardContentSchema, config: WizardConfigSchema },
  GeoContent: { content: GeoContentContentSchema, config: GeoContentConfigSchema },
  InteractiveMap: { content: InteractiveMapContentSchema, config: InteractiveMapConfigSchema },
  PdfDownload: { content: PdfDownloadContentSchema, config: PdfDownloadConfigSchema },
  ScrollCTA: { content: ScrollCTAContentSchema, config: ScrollCTAConfigSchema },
  EmbedWidget: { content: EmbedWidgetContentSchema, config: EmbedWidgetConfigSchema },
  ResourceGrid: { content: ResourceGridContentSchema, config: ResourceGridConfigSchema },
  LatestArticles: { content: LatestArticlesContentSchema, config: LatestArticlesConfigSchema },
};

/**
 * Validate a block's content and config against its registered schema.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateBlock(block: BlockEnvelope): {
  success: boolean;
  errors?: string[];
} {
  const registry = BLOCK_SCHEMA_REGISTRY[block.type as BlockType];
  if (!registry) {
    return { success: false, errors: [`Unknown block type: ${block.type}`] };
  }

  const errors: string[] = [];

  if (block.content) {
    const contentResult = registry.content.safeParse(block.content);
    if (!contentResult.success) {
      errors.push(`Content validation failed: ${JSON.stringify(contentResult.error)}`);
    }
  }

  if (block.config) {
    const configResult = registry.config.safeParse(block.config);
    if (!configResult.success) {
      errors.push(`Config validation failed: ${JSON.stringify(configResult.error)}`);
    }
  }

  return errors.length > 0 ? { success: false, errors } : { success: true };
}

// ============================================================
// Logical Block Categories — groups 33 blocks into ~12 sections
// ============================================================

export type SectionCategory =
  | 'hero'
  | 'content'
  | 'faq'
  | 'steps'
  | 'social-proof'
  | 'comparison'
  | 'lead-capture'
  | 'calculator'
  | 'data-display'
  | 'internal-links'
  | 'layout'
  | 'metadata';

/** Maps every BlockType to its logical section category */
export const BLOCK_CATEGORIES: Record<BlockType, SectionCategory> = {
  Header: 'layout',
  Footer: 'layout',
  Sidebar: 'layout',
  Hero: 'hero',
  ArticleBody: 'content',
  FAQ: 'faq',
  StepByStep: 'steps',
  Checklist: 'steps',
  AuthorBio: 'social-proof',
  ComparisonTable: 'comparison',
  VsCard: 'comparison',
  RankingList: 'comparison',
  ProsConsCard: 'comparison',
  LeadForm: 'lead-capture',
  CTABanner: 'lead-capture',
  ScrollCTA: 'lead-capture',
  PricingTable: 'data-display',
  QuoteCalculator: 'calculator',
  CostBreakdown: 'calculator',
  StatGrid: 'data-display',
  DataTable: 'data-display',
  TestimonialGrid: 'social-proof',
  TrustBadges: 'social-proof',
  CitationBlock: 'metadata',
  LastUpdated: 'metadata',
  MedicalDisclaimer: 'metadata',
  Wizard: 'lead-capture',
  GeoContent: 'content',
  InteractiveMap: 'content',
  PdfDownload: 'metadata',
  EmbedWidget: 'content',
  ResourceGrid: 'internal-links',
  LatestArticles: 'internal-links',
};

// ============================================================
// Page Type Templates — 6 canonical page shapes
// ============================================================

export type PageType =
  | 'offer'
  | 'comparison'
  | 'directory'
  | 'article'
  | 'calculator'
  | 'legal';

export interface PageTypeTemplate {
  label: string;
  description: string;
  /** Ordered list of section categories that compose this page type */
  sections: SectionCategory[];
  /** Recommended block types for each section (first is default) */
  recommended: Partial<Record<SectionCategory, BlockType[]>>;
}

export const PAGE_TYPE_TEMPLATES: Record<PageType, PageTypeTemplate> = {
  offer: {
    label: 'Offer / Referral Landing',
    description: 'Lead-capture page with hero, benefits, social proof, and CTA.',
    sections: ['layout', 'hero', 'content', 'social-proof', 'calculator', 'lead-capture', 'faq', 'layout'],
    recommended: {
      hero: ['Hero'],
      content: ['ArticleBody'],
      'social-proof': ['TestimonialGrid', 'TrustBadges', 'StatGrid'],
      calculator: ['QuoteCalculator', 'CostBreakdown'],
      'lead-capture': ['LeadForm', 'CTABanner'],
      faq: ['FAQ'],
    },
  },
  comparison: {
    label: 'Comparison Page',
    description: '"X vs Y" or "Best ___ for ___" — comparison tables with verdict.',
    sections: ['layout', 'hero', 'comparison', 'content', 'social-proof', 'lead-capture', 'faq', 'layout'],
    recommended: {
      hero: ['Hero'],
      comparison: ['ComparisonTable', 'VsCard', 'ProsConsCard', 'RankingList'],
      content: ['ArticleBody'],
      'social-proof': ['TrustBadges', 'TestimonialGrid'],
      'lead-capture': ['CTABanner', 'ScrollCTA'],
      faq: ['FAQ'],
    },
  },
  directory: {
    label: 'Directory / Listing',
    description: 'Hub page linking to sub-pages — guides, reviews, resources.',
    sections: ['layout', 'hero', 'internal-links', 'content', 'lead-capture', 'layout'],
    recommended: {
      hero: ['Hero'],
      'internal-links': ['ResourceGrid', 'LatestArticles'],
      content: ['ArticleBody'],
      'lead-capture': ['CTABanner'],
    },
  },
  article: {
    label: 'Blog / Article',
    description: 'Long-form content page with author, citations, and related links.',
    sections: ['layout', 'hero', 'metadata', 'content', 'steps', 'social-proof', 'metadata', 'lead-capture', 'internal-links', 'layout'],
    recommended: {
      hero: ['Hero'],
      metadata: ['LastUpdated', 'CitationBlock', 'MedicalDisclaimer'],
      content: ['ArticleBody'],
      steps: ['StepByStep', 'Checklist'],
      'social-proof': ['AuthorBio', 'TrustBadges'],
      'lead-capture': ['CTABanner', 'ScrollCTA'],
      'internal-links': ['LatestArticles', 'ResourceGrid'],
    },
  },
  calculator: {
    label: 'Calculator / Tool',
    description: 'Interactive tool page — cost calculators, quote builders, wizards.',
    sections: ['layout', 'hero', 'calculator', 'data-display', 'content', 'lead-capture', 'faq', 'social-proof', 'layout'],
    recommended: {
      hero: ['Hero'],
      calculator: ['QuoteCalculator', 'CostBreakdown'],
      'data-display': ['DataTable', 'StatGrid', 'PricingTable'],
      content: ['ArticleBody'],
      'lead-capture': ['LeadForm', 'CTABanner', 'ScrollCTA'],
      faq: ['FAQ'],
      'social-proof': ['TrustBadges', 'TestimonialGrid'],
    },
  },
  legal: {
    label: 'Contact / Legal',
    description: 'Simple content page — privacy, terms, contact, about.',
    sections: ['layout', 'content', 'lead-capture', 'layout'],
    recommended: {
      content: ['ArticleBody'],
      'lead-capture': ['LeadForm'],
    },
  },
};
