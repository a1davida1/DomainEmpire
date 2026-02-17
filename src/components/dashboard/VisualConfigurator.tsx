'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ============================================================
// Types
// ============================================================

interface Block {
    id: string;
    type: string;
    variant?: string;
    config?: Record<string, unknown>;
    content?: Record<string, unknown>;
}

interface VisualConfiguratorProps {
    pageId: string;
    domainId: string;
    initialBlocks: Block[];
    initialTheme: string;
    initialSkin: string;
    onSave?: (blocks: Block[]) => void;
    onCancel?: () => void;
}

// ============================================================
// Constants
// ============================================================

export const AVAILABLE_THEMES = ['clean', 'editorial', 'bold', 'minimal'] as const;
export const AVAILABLE_SKINS = ['slate', 'ocean', 'forest', 'ember', 'midnight', 'coral'] as const;

const SKIN_COLORS: Record<string, string> = {
    slate: '#1e293b',
    ocean: '#1e3a5f',
    forest: '#047857',
    ember: '#b45309',
    midnight: '#38bdf8',
    coral: '#7c3aed',
};

const THEME_LABELS: Record<string, string> = {
    clean: 'Clean — Public Sans, balanced spacing',
    editorial: 'Editorial — Merriweather serif, narrow reading width',
    bold: 'Bold — DM Sans, large radius, strong shadows',
    minimal: 'Minimal — System UI, tight, no shadows',
};

const BLOCK_CATEGORIES: Record<string, string[]> = {
    Layout: ['Header', 'Footer', 'Sidebar'],
    Content: ['Hero', 'ArticleBody', 'FAQ', 'StepByStep', 'Checklist', 'AuthorBio'],
    Comparison: ['ComparisonTable', 'VsCard', 'RankingList', 'ProsConsCard'],
    Conversion: ['LeadForm', 'CTABanner', 'PricingTable', 'ScrollCTA'],
    Data: ['QuoteCalculator', 'CostBreakdown', 'StatGrid', 'DataTable'],
    Social: ['TestimonialGrid', 'TrustBadges', 'CitationBlock'],
    Utility: ['LastUpdated', 'MedicalDisclaimer', 'PdfDownload', 'EmbedWidget'],
    Interactive: ['Wizard', 'GeoContent', 'InteractiveMap'],
};

const BLOCK_DESCRIPTIONS: Record<string, string> = {
    Header: 'Site header with logo and navigation',
    Footer: 'Site footer with links and copyright',
    Sidebar: 'Side panel with widget sections',
    Hero: 'Large banner with heading and CTA',
    ArticleBody: 'Main content area for article text',
    FAQ: 'Expandable question and answer list',
    StepByStep: 'Numbered step-by-step guide',
    Checklist: 'Interactive checklist with progress',
    AuthorBio: 'Author name, title, and biography',
    ComparisonTable: 'Side-by-side feature comparison',
    VsCard: 'Head-to-head versus comparison',
    RankingList: 'Ordered ranking of items',
    ProsConsCard: 'Pros and cons breakdown',
    LeadForm: 'Email/contact capture form',
    CTABanner: 'Call-to-action banner or bar',
    PricingTable: 'Pricing tier comparison',
    ScrollCTA: 'CTA that appears on scroll',
    QuoteCalculator: 'Interactive cost/quote calculator',
    CostBreakdown: 'Itemized cost analysis',
    StatGrid: 'Grid of key statistics',
    DataTable: 'Structured data table',
    TestimonialGrid: 'Customer testimonial cards',
    TrustBadges: 'Trust and credibility badges',
    CitationBlock: 'Source citations and references',
    LastUpdated: 'Content freshness indicator',
    MedicalDisclaimer: 'Health/medical disclaimer notice',
    PdfDownload: 'Downloadable PDF resource',
    EmbedWidget: 'Third-party embed container',
    Wizard: 'Multi-step interactive wizard',
    GeoContent: 'Location-aware content block',
    InteractiveMap: 'Interactive map display',
};

const CATEGORY_ICONS: Record<string, string> = {
    Layout: '\u{1F4D0}',
    Content: '\u{1F4DD}',
    Comparison: '\u{2696}\u{FE0F}',
    Conversion: '\u{1F3AF}',
    Data: '\u{1F4CA}',
    Social: '\u{2B50}',
    Utility: '\u{1F527}',
    Interactive: '\u{1F579}\u{FE0F}',
};

const VARIANT_OPTIONS: Record<string, string[]> = {
    Header: ['topbar', 'centered', 'minimal', 'split'],
    Footer: ['multi-column', 'newsletter', 'minimal', 'legal'],
    Hero: ['centered', 'split', 'minimal', 'gradient', 'image'],
    Wizard: ['wizard', 'quiz', 'survey', 'assessment', 'configurator'],
    ComparisonTable: ['table', 'cards'],
    CTABanner: ['bar', 'card', 'banner'],
};

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_WIDTHS: Record<ViewportSize, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
};

export const MAX_HISTORY = 50;

// ============================================================
// Structured Field Schemas — typed form fields per block type
// ============================================================

interface ScalarFieldDef {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'url' | 'number' | 'boolean' | 'select';
    target: 'content' | 'config';
    options?: string[];
    placeholder?: string;
}

interface ArrayFieldDef {
    key: string;
    label: string;
    type: 'array';
    target: 'content' | 'config';
    itemFields: { key: string; label: string; type: 'text' | 'textarea' | 'url' | 'number' | 'boolean' | 'select'; options?: string[]; placeholder?: string }[];
    itemLabel?: (item: Record<string, unknown>, idx: number) => string;
}

type FieldDef = ScalarFieldDef | ArrayFieldDef;

const BLOCK_FIELD_SCHEMAS: Record<string, FieldDef[]> = {
    // --- Layout ---
    Header: [
        { key: 'siteName', label: 'Site Name', type: 'text', target: 'content', placeholder: 'Site name in logo' },
        { key: 'logoUrl', label: 'Logo URL', type: 'url', target: 'content', placeholder: '/logo.svg' },
        { key: 'sticky', label: 'Sticky Header', type: 'boolean', target: 'config' },
        { key: 'showSearch', label: 'Show Search', type: 'boolean', target: 'config' },
        { key: 'navLinks', label: 'Nav Links', type: 'array', target: 'content', itemFields: [
            { key: 'label', label: 'Label', type: 'text', placeholder: 'Link text' },
            { key: 'href', label: 'URL', type: 'url', placeholder: '/about' },
        ], itemLabel: (item) => String(item.label || 'Link') },
    ],
    Footer: [
        { key: 'siteName', label: 'Site Name', type: 'text', target: 'content' },
        { key: 'copyrightYear', label: 'Copyright Year', type: 'number', target: 'content' },
        { key: 'disclaimerText', label: 'Disclaimer', type: 'textarea', target: 'content' },
        { key: 'newsletterHeadline', label: 'Newsletter Headline', type: 'text', target: 'content' },
        { key: 'newsletterEndpoint', label: 'Newsletter Endpoint', type: 'url', target: 'content' },
        { key: 'showDisclaimer', label: 'Show Disclaimer', type: 'boolean', target: 'config' },
        { key: 'columns', label: 'Link Columns', type: 'array', target: 'content', itemFields: [
            { key: 'title', label: 'Column Title', type: 'text' },
        ], itemLabel: (item) => String(item.title || 'Column') },
    ],
    Sidebar: [
        { key: 'position', label: 'Position', type: 'select', target: 'config', options: ['left', 'right'] },
        { key: 'sticky', label: 'Sticky', type: 'boolean', target: 'config' },
        { key: 'width', label: 'Width', type: 'text', target: 'config', placeholder: '280px' },
        { key: 'sections', label: 'Sections', type: 'array', target: 'content', itemFields: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'html', label: 'HTML Content', type: 'textarea' },
        ], itemLabel: (item) => String(item.title || 'Section') },
    ],
    // --- Page ---
    Hero: [
        { key: 'heading', label: 'Heading', type: 'text', target: 'content', placeholder: 'Main heading text' },
        { key: 'subheading', label: 'Subheading', type: 'text', target: 'content', placeholder: 'Supporting text' },
        { key: 'badge', label: 'Badge', type: 'text', target: 'content', placeholder: 'e.g. "Updated 2026"' },
        { key: 'ctaText', label: 'CTA Button Text', type: 'text', target: 'content', placeholder: 'e.g. "Get Started"' },
        { key: 'ctaUrl', label: 'CTA Button URL', type: 'url', target: 'content', placeholder: '/pricing' },
        { key: 'imageUrl', label: 'Image URL', type: 'url', target: 'content' },
        { key: 'imageAlt', label: 'Image Alt Text', type: 'text', target: 'content' },
        { key: 'fullWidth', label: 'Full Width', type: 'boolean', target: 'config' },
        { key: 'overlay', label: 'Overlay', type: 'boolean', target: 'config' },
    ],
    // --- Content ---
    ArticleBody: [
        { key: 'title', label: 'Title', type: 'text', target: 'content' },
        { key: 'metaDescription', label: 'Meta Description', type: 'textarea', target: 'content' },
        { key: 'targetKeyword', label: 'Target Keyword', type: 'text', target: 'content' },
        { key: 'markdown', label: 'Body (Markdown)', type: 'textarea', target: 'content' },
        { key: 'showTableOfContents', label: 'Table of Contents', type: 'boolean', target: 'config' },
        { key: 'showPrintButton', label: 'Print Button', type: 'boolean', target: 'config' },
    ],
    FAQ: [
        { key: 'openFirst', label: 'Open First Item', type: 'boolean', target: 'config' },
        { key: 'maxAnswerLength', label: 'Max Answer Length', type: 'number', target: 'config' },
        { key: 'emitJsonLd', label: 'Emit JSON-LD', type: 'boolean', target: 'config' },
        { key: 'items', label: 'FAQ Items', type: 'array', target: 'content', itemFields: [
            { key: 'question', label: 'Question', type: 'text', placeholder: 'What is...?' },
            { key: 'answer', label: 'Answer', type: 'textarea', placeholder: 'The answer is...' },
        ], itemLabel: (item) => String(item.question || 'Q') },
    ],
    StepByStep: [
        { key: 'interactive', label: 'Interactive', type: 'boolean', target: 'config' },
        { key: 'showProgress', label: 'Show Progress', type: 'boolean', target: 'config' },
        { key: 'showPrintButton', label: 'Print Button', type: 'boolean', target: 'config' },
        { key: 'numbered', label: 'Numbered', type: 'boolean', target: 'config' },
        { key: 'steps', label: 'Steps', type: 'array', target: 'content', itemFields: [
            { key: 'heading', label: 'Step Heading', type: 'text' },
            { key: 'body', label: 'Step Body', type: 'textarea' },
        ], itemLabel: (item, idx) => String(item.heading || `Step ${idx + 1}`) },
    ],
    Checklist: [
        { key: 'interactive', label: 'Interactive', type: 'boolean', target: 'config' },
        { key: 'showProgress', label: 'Show Progress', type: 'boolean', target: 'config' },
        { key: 'showPrintButton', label: 'Print Button', type: 'boolean', target: 'config' },
        { key: 'numbered', label: 'Numbered', type: 'boolean', target: 'config' },
        { key: 'steps', label: 'Checklist Items', type: 'array', target: 'content', itemFields: [
            { key: 'heading', label: 'Item Heading', type: 'text' },
            { key: 'body', label: 'Item Body', type: 'textarea' },
        ], itemLabel: (item, idx) => String(item.heading || `Item ${idx + 1}`) },
    ],
    AuthorBio: [
        { key: 'name', label: 'Author Name', type: 'text', target: 'content' },
        { key: 'title', label: 'Author Title', type: 'text', target: 'content', placeholder: 'e.g. Senior Financial Advisor' },
        { key: 'bio', label: 'Bio', type: 'textarea', target: 'content' },
        { key: 'avatarUrl', label: 'Avatar URL', type: 'url', target: 'content' },
        { key: 'layout', label: 'Layout', type: 'select', target: 'config', options: ['inline', 'card', 'sidebar'] },
        { key: 'credentials', label: 'Credentials', type: 'array', target: 'content', itemFields: [
            { key: 'value', label: 'Credential', type: 'text', placeholder: 'e.g. CFA, CFP' },
        ], itemLabel: (item) => String(item.value || 'Credential') },
        { key: 'socialLinks', label: 'Social Links', type: 'array', target: 'content', itemFields: [
            { key: 'platform', label: 'Platform', type: 'text', placeholder: 'twitter' },
            { key: 'url', label: 'URL', type: 'url', placeholder: 'https://...' },
        ], itemLabel: (item) => String(item.platform || 'Link') },
    ],
    // --- Comparison ---
    ComparisonTable: [
        { key: 'defaultSort', label: 'Default Sort Column', type: 'text', target: 'content' },
        { key: 'verdict', label: 'Verdict', type: 'textarea', target: 'content' },
        { key: 'variant', label: 'Variant', type: 'select', target: 'config', options: ['table', 'cards'] },
        { key: 'showBadges', label: 'Show Badges', type: 'boolean', target: 'config' },
        { key: 'showVerdict', label: 'Show Verdict', type: 'boolean', target: 'config' },
        { key: 'showCta', label: 'Show CTA', type: 'boolean', target: 'config' },
        { key: 'emitJsonLd', label: 'Emit JSON-LD', type: 'boolean', target: 'config' },
        { key: 'columns', label: 'Columns', type: 'array', target: 'content', itemFields: [
            { key: 'key', label: 'Key', type: 'text' },
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'type', label: 'Type', type: 'select', options: ['number', 'text', 'rating'] },
        ], itemLabel: (item) => String(item.label || 'Column') },
        { key: 'options', label: 'Options', type: 'array', target: 'content', itemFields: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'url', label: 'URL', type: 'url' },
            { key: 'badge', label: 'Badge', type: 'text' },
        ], itemLabel: (item) => String(item.name || 'Option') },
    ],
    VsCard: [
        { key: 'verdict', label: 'Verdict', type: 'textarea', target: 'content' },
        { key: 'showRatings', label: 'Show Ratings', type: 'boolean', target: 'config' },
        { key: 'highlightWinner', label: 'Highlight Winner', type: 'boolean', target: 'config' },
    ],
    RankingList: [
        { key: 'title', label: 'Title', type: 'text', target: 'content' },
        { key: 'showRank', label: 'Show Rank', type: 'boolean', target: 'config' },
        { key: 'maxItems', label: 'Max Items', type: 'number', target: 'config' },
        { key: 'items', label: 'Ranked Items', type: 'array', target: 'content', itemFields: [
            { key: 'rank', label: 'Rank', type: 'number' },
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'description', label: 'Description', type: 'textarea' },
            { key: 'rating', label: 'Rating', type: 'number' },
            { key: 'badge', label: 'Badge', type: 'text' },
            { key: 'url', label: 'URL', type: 'url' },
        ], itemLabel: (item) => String(item.name || 'Item') },
    ],
    ProsConsCard: [
        { key: 'name', label: 'Product Name', type: 'text', target: 'content' },
        { key: 'rating', label: 'Rating', type: 'number', target: 'content' },
        { key: 'summary', label: 'Summary', type: 'textarea', target: 'content' },
        { key: 'url', label: 'URL', type: 'url', target: 'content' },
        { key: 'badge', label: 'Badge', type: 'text', target: 'content' },
        { key: 'showRating', label: 'Show Rating', type: 'boolean', target: 'config' },
        { key: 'showCta', label: 'Show CTA', type: 'boolean', target: 'config' },
        { key: 'pros', label: 'Pros', type: 'array', target: 'content', itemFields: [
            { key: 'value', label: 'Pro', type: 'text' },
        ], itemLabel: (item) => String(item.value || 'Pro') },
        { key: 'cons', label: 'Cons', type: 'array', target: 'content', itemFields: [
            { key: 'value', label: 'Con', type: 'text' },
        ], itemLabel: (item) => String(item.value || 'Con') },
    ],
    // --- Conversion ---
    LeadForm: [
        { key: 'consentText', label: 'Consent Text', type: 'textarea', target: 'content' },
        { key: 'successMessage', label: 'Success Message', type: 'text', target: 'content' },
        { key: 'disclosureAboveFold', label: 'Disclosure', type: 'textarea', target: 'content' },
        { key: 'privacyPolicyUrl', label: 'Privacy Policy URL', type: 'url', target: 'content' },
        { key: 'endpoint', label: 'Form Endpoint', type: 'url', target: 'config' },
        { key: 'submitLabel', label: 'Submit Button', type: 'text', target: 'config', placeholder: 'Get Quote' },
        { key: 'showDisclosure', label: 'Show Disclosure', type: 'boolean', target: 'config' },
        { key: 'fields', label: 'Form Fields', type: 'array', target: 'content', itemFields: [
            { key: 'name', label: 'Field Name', type: 'text' },
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'type', label: 'Type', type: 'select', options: ['text', 'email', 'tel', 'select', 'number'] },
        ], itemLabel: (item) => String(item.label || 'Field') },
    ],
    CTABanner: [
        { key: 'text', label: 'Banner Text', type: 'text', target: 'content', placeholder: 'Call to action message' },
        { key: 'buttonLabel', label: 'Button Label', type: 'text', target: 'content', placeholder: 'Learn More' },
        { key: 'buttonUrl', label: 'Button URL', type: 'url', target: 'content', placeholder: '/signup' },
        { key: 'style', label: 'Style', type: 'select', target: 'config', options: ['bar', 'card', 'banner'] },
        { key: 'trigger', label: 'Trigger', type: 'select', target: 'config', options: ['immediate', 'scroll', 'exit'] },
        { key: 'scrollThreshold', label: 'Scroll Threshold', type: 'number', target: 'config', placeholder: '0.6' },
        { key: 'dismissible', label: 'Dismissible', type: 'boolean', target: 'config' },
    ],
    PricingTable: [
        { key: 'columns', label: 'Columns', type: 'number', target: 'config' },
        { key: 'showToggle', label: 'Show Toggle', type: 'boolean', target: 'config' },
        { key: 'plans', label: 'Plans', type: 'array', target: 'content', itemFields: [
            { key: 'name', label: 'Plan Name', type: 'text' },
            { key: 'price', label: 'Price', type: 'text', placeholder: '$29/mo' },
            { key: 'period', label: 'Period', type: 'text', placeholder: 'month' },
            { key: 'ctaText', label: 'CTA Text', type: 'text' },
            { key: 'ctaUrl', label: 'CTA URL', type: 'url' },
            { key: 'highlighted', label: 'Highlighted', type: 'boolean' },
            { key: 'badge', label: 'Badge', type: 'text' },
        ], itemLabel: (item) => String(item.name || 'Plan') },
    ],
    ScrollCTA: [
        { key: 'text', label: 'Banner Text', type: 'text', target: 'content' },
        { key: 'buttonLabel', label: 'Button Label', type: 'text', target: 'content' },
        { key: 'buttonUrl', label: 'Button URL', type: 'url', target: 'content' },
        { key: 'style', label: 'Style', type: 'select', target: 'config', options: ['bar', 'card', 'banner'] },
        { key: 'scrollThreshold', label: 'Scroll Threshold', type: 'number', target: 'config', placeholder: '0.6' },
        { key: 'dismissible', label: 'Dismissible', type: 'boolean', target: 'config' },
    ],
    // --- Data ---
    QuoteCalculator: [
        { key: 'formula', label: 'Formula', type: 'text', target: 'content' },
        { key: 'methodology', label: 'Methodology', type: 'textarea', target: 'content' },
        { key: 'showMethodology', label: 'Show Methodology', type: 'boolean', target: 'config' },
        { key: 'autoCalculate', label: 'Auto Calculate', type: 'boolean', target: 'config' },
        { key: 'emitJsonLd', label: 'Emit JSON-LD', type: 'boolean', target: 'config' },
        { key: 'inputs', label: 'Inputs', type: 'array', target: 'content', itemFields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'type', label: 'Type', type: 'select', options: ['number', 'select', 'range'] },
            { key: 'min', label: 'Min', type: 'number' },
            { key: 'max', label: 'Max', type: 'number' },
        ], itemLabel: (item) => String(item.label || 'Input') },
        { key: 'outputs', label: 'Outputs', type: 'array', target: 'content', itemFields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'format', label: 'Format', type: 'select', options: ['currency', 'percent', 'number'] },
        ], itemLabel: (item) => String(item.label || 'Output') },
    ],
    CostBreakdown: [
        { key: 'showFactors', label: 'Show Factors', type: 'boolean', target: 'config' },
        { key: 'currencySymbol', label: 'Currency', type: 'text', target: 'config', placeholder: '$' },
        { key: 'showPrintButton', label: 'Print Button', type: 'boolean', target: 'config' },
        { key: 'ranges', label: 'Cost Ranges', type: 'array', target: 'content', itemFields: [
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'low', label: 'Low', type: 'number' },
            { key: 'high', label: 'High', type: 'number' },
            { key: 'average', label: 'Average', type: 'number' },
        ], itemLabel: (item) => String(item.label || 'Range') },
        { key: 'factors', label: 'Cost Factors', type: 'array', target: 'content', itemFields: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'impact', label: 'Impact', type: 'select', options: ['low', 'medium', 'high'] },
            { key: 'description', label: 'Description', type: 'textarea' },
        ], itemLabel: (item) => String(item.name || 'Factor') },
    ],
    StatGrid: [
        { key: 'filterable', label: 'Filterable', type: 'boolean', target: 'config' },
        { key: 'sortable', label: 'Sortable', type: 'boolean', target: 'config' },
        { key: 'showBars', label: 'Show Bars', type: 'boolean', target: 'config' },
        { key: 'columns', label: 'Columns', type: 'number', target: 'config' },
        { key: 'items', label: 'Stats', type: 'array', target: 'content', itemFields: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'metricLabel', label: 'Metric Label', type: 'text' },
            { key: 'metricValue', label: 'Value', type: 'number' },
            { key: 'summary', label: 'Summary', type: 'text' },
            { key: 'group', label: 'Group', type: 'text' },
        ], itemLabel: (item) => String(item.title || 'Stat') },
    ],
    DataTable: [
        { key: 'caption', label: 'Caption', type: 'text', target: 'content' },
        { key: 'sortable', label: 'Sortable', type: 'boolean', target: 'config' },
        { key: 'searchable', label: 'Searchable', type: 'boolean', target: 'config' },
        { key: 'striped', label: 'Striped Rows', type: 'boolean', target: 'config' },
    ],
    // --- Trust ---
    TestimonialGrid: [
        { key: 'columns', label: 'Columns', type: 'number', target: 'config' },
        { key: 'showRatings', label: 'Show Ratings', type: 'boolean', target: 'config' },
        { key: 'testimonials', label: 'Testimonials', type: 'array', target: 'content', itemFields: [
            { key: 'quote', label: 'Quote', type: 'textarea' },
            { key: 'author', label: 'Author', type: 'text' },
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'rating', label: 'Rating', type: 'number' },
        ], itemLabel: (item) => String(item.author || 'Testimonial') },
    ],
    TrustBadges: [
        { key: 'layout', label: 'Layout', type: 'select', target: 'config', options: ['row', 'grid'] },
        { key: 'badges', label: 'Badges', type: 'array', target: 'content', itemFields: [
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'iconUrl', label: 'Icon URL', type: 'url' },
            { key: 'description', label: 'Description', type: 'text' },
        ], itemLabel: (item) => String(item.label || 'Badge') },
    ],
    CitationBlock: [
        { key: 'collapsible', label: 'Collapsible', type: 'boolean', target: 'config' },
        { key: 'sources', label: 'Sources', type: 'array', target: 'content', itemFields: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'url', label: 'URL', type: 'url' },
            { key: 'publisher', label: 'Publisher', type: 'text' },
            { key: 'retrievedAt', label: 'Retrieved At', type: 'text', placeholder: 'YYYY-MM-DD' },
        ], itemLabel: (item) => String(item.title || 'Source') },
    ],
    LastUpdated: [
        { key: 'date', label: 'Date', type: 'text', target: 'content', placeholder: 'YYYY-MM-DD' },
        { key: 'reviewedBy', label: 'Reviewed By', type: 'text', target: 'content' },
        { key: 'status', label: 'Status', type: 'select', target: 'content', options: ['fresh', 'review-pending', 'stale'] },
        { key: 'showBadge', label: 'Show Badge', type: 'boolean', target: 'config' },
        { key: 'showReviewer', label: 'Show Reviewer', type: 'boolean', target: 'config' },
    ],
    MedicalDisclaimer: [
        { key: 'disclaimerText', label: 'Disclaimer Text', type: 'textarea', target: 'content' },
        { key: 'ctaText', label: 'CTA Text', type: 'text', target: 'content' },
        { key: 'showDoctorCta', label: 'Show Doctor CTA', type: 'boolean', target: 'config' },
        { key: 'position', label: 'Position', type: 'select', target: 'config', options: ['top', 'bottom', 'both'] },
    ],
    // --- Interactive ---
    Wizard: [
        { key: 'mode', label: 'Mode', type: 'select', target: 'config', options: ['wizard', 'quiz', 'survey', 'assessment', 'configurator'] },
        { key: 'showProgress', label: 'Show Progress', type: 'boolean', target: 'config' },
        { key: 'showAnswerSummary', label: 'Show Answer Summary', type: 'boolean', target: 'config' },
        { key: 'resultTemplate', label: 'Result Template', type: 'select', target: 'content', options: ['summary', 'recommendation', 'score', 'eligibility'] },
    ],
    GeoContent: [
        { key: 'fallback', label: 'Fallback Content', type: 'textarea', target: 'content' },
        { key: 'detectionMethod', label: 'Detection', type: 'select', target: 'config', options: ['timezone', 'ip'] },
    ],
    InteractiveMap: [
        { key: 'defaultRegion', label: 'Default Region', type: 'text', target: 'content' },
        { key: 'showTileGrid', label: 'Show Tile Grid', type: 'boolean', target: 'config' },
        { key: 'showDropdown', label: 'Show Dropdown', type: 'boolean', target: 'config' },
    ],
    PdfDownload: [
        { key: 'buttonText', label: 'Button Text', type: 'text', target: 'content', placeholder: 'Download PDF' },
        { key: 'articleId', label: 'Article ID', type: 'text', target: 'content' },
        { key: 'domainId', label: 'Domain ID', type: 'text', target: 'content' },
        { key: 'type', label: 'Type', type: 'select', target: 'config', options: ['article', 'worksheet'] },
        { key: 'gated', label: 'Gated', type: 'boolean', target: 'config' },
        { key: 'captureApiUrl', label: 'Capture API URL', type: 'url', target: 'config' },
    ],
    EmbedWidget: [
        { key: 'sourceBlockId', label: 'Source Block ID', type: 'text', target: 'content' },
        { key: 'title', label: 'Title', type: 'text', target: 'content' },
        { key: 'width', label: 'Width', type: 'text', target: 'config', placeholder: '100%' },
        { key: 'height', label: 'Height', type: 'text', target: 'config', placeholder: '600px' },
    ],
};

function generateBlockId(): string {
    return `blk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ============================================================
// Undo/Redo Hook
// ============================================================

interface HistoryState {
    blocks: Block[];
}

function useUndoRedo(initial: Block[]) {
    const [state, setState] = useState({
        history: [{ blocks: initial }] as HistoryState[],
        pointer: 0,
    });

    const current = state.history[state.pointer].blocks;

    const push = useCallback((blocks: Block[]) => {
        setState(prev => {
            const truncated = prev.history.slice(0, prev.pointer + 1);
            const next = [...truncated, { blocks }];
            if (next.length > MAX_HISTORY) next.shift();
            return {
                history: next,
                pointer: Math.min(next.length - 1, MAX_HISTORY - 1),
            };
        });
    }, []);

    const undo = useCallback(() => {
        setState(prev => ({
            ...prev,
            pointer: Math.max(prev.pointer - 1, 0),
        }));
    }, []);

    const redo = useCallback(() => {
        setState(prev => ({
            ...prev,
            pointer: Math.min(prev.pointer + 1, prev.history.length - 1),
        }));
    }, []);

    const canUndo = state.pointer > 0;
    const canRedo = state.pointer < state.history.length - 1;

    return { current, push, undo, redo, canUndo, canRedo };
}

// ============================================================
// Visual Configurator Component
// ============================================================

export function VisualConfigurator({
    pageId,
    domainId: _domainId,
    initialBlocks,
    initialTheme,
    initialSkin,
    onSave,
    onCancel,
}: VisualConfiguratorProps) {
    const { current: blocks, push: pushHistory, undo, redo, canUndo, canRedo } = useUndoRedo(initialBlocks);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [theme, setTheme] = useState(initialTheme);
    const [skin, setSkin] = useState(initialSkin);
    const [viewport, setViewport] = useState<ViewportSize>('desktop');
    const [previewKey, setPreviewKey] = useState(Date.now());
    const [dirty, setDirty] = useState(false);
    const [showPalette, setShowPalette] = useState(false);
    const [insertIndex, setInsertIndex] = useState<number | null>(null);
    const [paletteSearch, setPaletteSearch] = useState('');
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [regenerating, setRegenerating] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [iframeLoading, setIframeLoading] = useState(true);
    const [jsonError, setJsonError] = useState<string | null>(null);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const blockListRef = useRef<HTMLDivElement>(null);

    // --- Warn on unsaved changes before navigating away ---
    useEffect(() => {
        function handleBeforeUnload(e: BeforeUnloadEvent) {
            if (!dirty) return;
            e.preventDefault();
            e.returnValue = '';
        }
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [dirty]);

    useEffect(() => {
        setJsonError(null);
    }, [selectedBlockId]);

    // --- postMessage bridge listener ---
    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'block-select') {
                setSelectedBlockId(event.data.blockId);
            }
        }
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // --- Keyboard shortcuts ---
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }
            if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [undo, redo, blocks, theme, skin, dirty]);

    const previewUrl = `/api/pages/${pageId}/preview?format=html&configurator=true&t=${previewKey}`;

    function updateBlocks(newBlocks: Block[]) {
        pushHistory(newBlocks);
        setDirty(true);
    }

    // --- Refresh preview ---
    function refreshPreview() {
        setIframeLoading(true);
        setPreviewKey(Date.now());
    }

    // --- Save blocks + theme/skin, then refresh preview ---
    async function handleSave() {
        if (!dirty) return;
        setSaving(true);
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blocks, theme, skin }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Save failed');
                return;
            }
            setDirty(false);
            setSuccessMsg('Saved');
            setTimeout(() => setSuccessMsg(null), 2000);
            refreshPreview();
            onSave?.(blocks);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    }

    // --- Theme/skin change ---
    async function handleThemeChange(newTheme: string) {
        setTheme(newTheme);
        setDirty(true);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme: newTheme }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to update theme');
                return;
            }
            refreshPreview();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update theme');
        }
    }

    async function handleSkinChange(newSkin: string) {
        setSkin(newSkin);
        setDirty(true);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skin: newSkin }),
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to update skin');
                return;
            }
            refreshPreview();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update skin');
        }
    }

    // --- Block operations ---
    function moveBlock(index: number, direction: -1 | 1) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= blocks.length) return;
        const updated = [...blocks];
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        updateBlocks(updated);
    }

    function removeBlock(index: number) {
        const removed = blocks[index];
        if (selectedBlockId === removed.id) setSelectedBlockId(null);
        updateBlocks(blocks.filter((_, i) => i !== index));
    }

    function openPalette(index: number) {
        setInsertIndex(index);
        setShowPalette(true);
        setPaletteSearch('');
    }

    function addBlock(type: string) {
        const newBlock: Block = {
            id: generateBlockId(),
            type,
            variant: VARIANT_OPTIONS[type]?.[0],
            config: {},
            content: {},
        };
        const idx = insertIndex ?? blocks.length;
        const updated = [...blocks];
        updated.splice(idx, 0, newBlock);
        updateBlocks(updated);
        setShowPalette(false);
        setInsertIndex(null);
        setSelectedBlockId(newBlock.id);
    }

    function updateBlockField(blockId: string, field: 'variant' | 'config' | 'content', value: unknown) {
        const updated = blocks.map(b => {
            if (b.id !== blockId) return b;
            if (field === 'variant') return { ...b, variant: value as string };
            return { ...b, [field]: value };
        });
        updateBlocks(updated);
    }

    function handleJsonBlur(blockId: string, field: 'config' | 'content', rawValue: string) {
        try {
            const parsed = JSON.parse(rawValue);
            updateBlockField(blockId, field, parsed);
            setJsonError(null);
        } catch (err) {
            setJsonError(
                err instanceof Error
                    ? `Invalid ${field} JSON: ${err.message}`
                    : `Invalid ${field} JSON`
            );
        }
    }

    // --- Regenerate single block ---
    async function handleRegenerateBlock(blockId: string) {
        setRegenerating(blockId);
        setError(null);
        try {
            const res = await fetch(`/api/pages/${pageId}/blocks/${blockId}/regenerate`, {
                method: 'POST',
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Regeneration failed');
                return;
            }
            setSuccessMsg(`Regenerated ${data.blockType} — ${data.tokensUsed} tokens, $${(data.cost || 0).toFixed(4)}`);
            setTimeout(() => setSuccessMsg(null), 3000);
            // Reload blocks
            const pageRes = await fetch(`/api/pages/${pageId}`);
            const pageData = await pageRes.json();
            if (pageRes.ok && Array.isArray(pageData.blocks)) {
                pushHistory(pageData.blocks);
            }
            refreshPreview();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Regeneration failed');
        } finally {
            setRegenerating(null);
        }
    }

    // --- Drag & drop ---
    function handleDragStart(index: number) {
        setDragIndex(index);
    }

    function handleDragOver(e: React.DragEvent, index: number) {
        e.preventDefault();
        setDragOverIndex(index);
    }

    function handleDrop(index: number) {
        if (dragIndex === null || dragIndex === index) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }
        const updated = [...blocks];
        const [moved] = updated.splice(dragIndex, 1);
        const targetIndex = dragIndex < index ? index - 1 : index;
        updated.splice(targetIndex, 0, moved);
        updateBlocks(updated);
        setDragIndex(null);
        setDragOverIndex(null);
    }

    function handleDragEnd() {
        setDragIndex(null);
        setDragOverIndex(null);
    }

    // --- Highlight block in iframe ---
    function highlightBlockInPreview(blockId: string) {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'block-highlight', blockId },
            window.location.origin,
        );
    }

    // --- Selected block ---
    const selectedBlock = blocks.find(b => b.id === selectedBlockId) ?? null;
    const selectedBlockIndex = selectedBlock ? blocks.findIndex(b => b.id === selectedBlockId) : -1;

    return (
        <div className="flex h-[calc(100vh-12rem)] gap-0 rounded-xl border bg-background shadow-sm overflow-hidden">
            {/* ====== LEFT PANEL: Editor ====== */}
            <div className="flex w-[380px] min-w-[380px] flex-col border-r">
                {/* Toolbar */}
                <div className="flex items-center justify-between border-b px-3 py-2">
                    <div className="flex items-center gap-1.5">
                        {onCancel && (
                            <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 px-2 text-xs">
                                \u2190 Back
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={undo} disabled={!canUndo} className="h-7 w-7 p-0" title="Undo (Ctrl+Z)">
                            \u21A9
                        </Button>
                        <Button size="sm" variant="ghost" onClick={redo} disabled={!canRedo} className="h-7 w-7 p-0" title="Redo (Ctrl+Y)">
                            \u21AA
                        </Button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {dirty && <Badge variant="secondary" className="text-[10px] h-5">Unsaved</Badge>}
                        {successMsg && <span className="text-[10px] text-green-600 font-medium">{successMsg}</span>}
                        <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="h-7 text-xs">
                            {saving ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>

                {/* Theme/Skin pickers */}
                <div className="flex gap-2 border-b px-3 py-2">
                    <div className="flex-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Theme</label>
                        <select
                            className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs"
                            value={theme}
                            onChange={(e) => handleThemeChange(e.target.value)}
                            title="Page theme"
                        >
                            {AVAILABLE_THEMES.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <span className="text-[9px] text-muted-foreground">{THEME_LABELS[theme] || ''}</span>
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Skin</label>
                        <select
                            className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs"
                            value={skin}
                            onChange={(e) => handleSkinChange(e.target.value)}
                            title="Page skin"
                        >
                            {AVAILABLE_SKINS.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                        <div className="mt-0.5 flex items-center gap-1">
                            {AVAILABLE_SKINS.map(s => (
                                <button
                                    key={s}
                                    className={`h-4 w-4 rounded-full border-2 transition-transform ${skin === s ? 'scale-125 border-foreground' : 'border-transparent hover:scale-110'}`}
                                    style={{ backgroundColor: SKIN_COLORS[s] }}
                                    onClick={() => handleSkinChange(s)}
                                    title={s}
                                    type="button"
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Block List */}
                <div className="flex-1 overflow-y-auto" ref={blockListRef}>
                    <div className="p-2 space-y-0.5">
                        {blocks.map((block, index) => (
                            <div key={block.id}>
                                {/* Drop zone */}
                                <div
                                    className={`h-0.5 rounded transition-all ${dragOverIndex === index ? 'bg-blue-400 h-1.5' : ''}`}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={() => handleDrop(index)}
                                />
                                <div
                                    className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors ${
                                        selectedBlockId === block.id
                                            ? 'bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700'
                                            : 'hover:bg-muted/50 border border-transparent'
                                    } ${dragIndex === index ? 'opacity-40' : ''}`}
                                    onClick={() => {
                                        setSelectedBlockId(block.id);
                                        highlightBlockInPreview(block.id);
                                    }}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragEnd={handleDragEnd}
                                >
                                    <span className="cursor-grab text-muted-foreground" title="Drag to reorder">{'\u2807'}</span>
                                    <Badge variant="outline" className="font-mono text-[10px] h-5">{block.type}</Badge>
                                    {block.variant && (
                                        <span className="text-[10px] text-muted-foreground truncate">({block.variant})</span>
                                    )}
                                    {block.content && Object.keys(block.content).length > 0 && (
                                        <span className="text-[10px] text-green-600">{'\u25CF'}</span>
                                    )}
                                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="rounded p-0.5 text-[10px] text-muted-foreground hover:bg-muted" onClick={(e) => { e.stopPropagation(); moveBlock(index, -1); }} disabled={index === 0} title="Move up">{'\u2191'}</button>
                                        <button className="rounded p-0.5 text-[10px] text-muted-foreground hover:bg-muted" onClick={(e) => { e.stopPropagation(); moveBlock(index, 1); }} disabled={index === blocks.length - 1} title="Move down">{'\u2193'}</button>
                                        <button className="rounded p-0.5 text-[10px] text-muted-foreground hover:bg-muted" onClick={(e) => { e.stopPropagation(); openPalette(index + 1); }} title="Insert after">+</button>
                                        <button className="rounded p-0.5 text-[10px] text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); removeBlock(index); }} title="Remove">{'\u2715'}</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {/* Final drop zone */}
                        <div
                            className={`h-0.5 rounded transition-all ${dragOverIndex === blocks.length ? 'bg-blue-400 h-1.5' : ''}`}
                            onDragOver={(e) => handleDragOver(e, blocks.length)}
                            onDrop={() => handleDrop(blocks.length)}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-1 h-7 text-xs"
                            onClick={() => openPalette(blocks.length)}
                        >
                            + Add Block
                        </Button>
                    </div>
                </div>

                {/* Config Panel for selected block */}
                {selectedBlock && (
                    <div className="border-t max-h-[40%] overflow-y-auto">
                        <div className="p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Badge variant="default" className="text-[10px]">{selectedBlock.type}</Badge>
                                    <span className="text-[10px] text-muted-foreground">#{selectedBlockIndex + 1}</span>
                                </div>
                                <button
                                    className="text-[10px] text-muted-foreground hover:text-foreground"
                                    onClick={() => setSelectedBlockId(null)}
                                >{'\u2715'} Close</button>
                            </div>

                            {/* Variant selector */}
                            {VARIANT_OPTIONS[selectedBlock.type] && (
                                <div>
                                    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Variant</label>
                                    <select
                                        className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs"
                                        value={selectedBlock.variant || ''}
                                        onChange={(e) => updateBlockField(selectedBlock.id, 'variant', e.target.value)}
                                        title="Block variant"
                                    >
                                        {VARIANT_OPTIONS[selectedBlock.type].map(v => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Structured fields or JSON fallback */}
                            {BLOCK_FIELD_SCHEMAS[selectedBlock.type] ? (
                                <div className="space-y-2">
                                    {BLOCK_FIELD_SCHEMAS[selectedBlock.type].map(field => {
                                        const block = selectedBlock!;
                                        const dataObj = (field.target === 'config' ? block.config : block.content) || {};
                                        const currentVal = (dataObj as Record<string, unknown>)[field.key];

                                        function setFieldValue(val: unknown) {
                                            const obj = { ...((field.target === 'config' ? block.config : block.content) || {}) };
                                            (obj as Record<string, unknown>)[field.key] = val;
                                            updateBlockField(block.id, field.target, obj);
                                        }

                                        // --- Array field editor ---
                                        if (field.type === 'array') {
                                            const arrField = field as ArrayFieldDef;
                                            const items = (Array.isArray(currentVal) ? currentVal : []) as Record<string, unknown>[];
                                            const getLabel = arrField.itemLabel || ((_item: Record<string, unknown>, idx: number) => `Item ${idx + 1}`);

                                            function updateItem(idx: number, key: string, val: unknown) {
                                                const updated = items.map((it, i) => i === idx ? { ...it, [key]: val } : it);
                                                setFieldValue(updated);
                                            }
                                            function removeItem(idx: number) {
                                                setFieldValue(items.filter((_, i) => i !== idx));
                                            }
                                            function addItem() {
                                                const blank: Record<string, unknown> = {};
                                                for (const f of arrField.itemFields) {
                                                    blank[f.key] = f.type === 'boolean' ? false : f.type === 'number' ? 0 : '';
                                                }
                                                setFieldValue([...items, blank]);
                                            }

                                            return (
                                                <div key={field.key}>
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{field.label}</label>
                                                        <button
                                                            type="button"
                                                            className="text-[10px] text-blue-600 hover:underline"
                                                            onClick={addItem}
                                                        >+ Add</button>
                                                    </div>
                                                    <div className="mt-1 space-y-1.5">
                                                        {items.map((item, idx) => (
                                                            <div key={idx} className="rounded border bg-muted/20">
                                                                <div className="flex items-center justify-between px-2 py-1 text-[10px]">
                                                                    <span className="font-medium truncate">{getLabel(item, idx)}</span>
                                                                    <button
                                                                        type="button"
                                                                        className="text-destructive hover:bg-destructive/10 rounded px-1 ml-1"
                                                                        onClick={() => removeItem(idx)}
                                                                        title="Remove"
                                                                    >{'\u2715'}</button>
                                                                </div>
                                                                <div className="px-2 pb-2 space-y-1.5">
                                                                    {arrField.itemFields.map(sf => {
                                                                        const sfVal = item[sf.key];
                                                                        if (sf.type === 'boolean') {
                                                                            return (
                                                                                <label key={sf.key} className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                                                                                    <input type="checkbox" checked={!!sfVal} onChange={(e) => updateItem(idx, sf.key, e.target.checked)} className="rounded" />
                                                                                    <span>{sf.label}</span>
                                                                                </label>
                                                                            );
                                                                        }
                                                                        if (sf.type === 'select') {
                                                                            return (
                                                                                <div key={sf.key}>
                                                                                    <label className="text-[9px] text-muted-foreground">{sf.label}</label>
                                                                                    <select className="block w-full rounded border bg-background px-1 py-0.5 text-[10px]" value={String(sfVal || '')} onChange={(e) => updateItem(idx, sf.key, e.target.value)} title={sf.label}>
                                                                                        <option value="">—</option>
                                                                                        {sf.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                                                                    </select>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        if (sf.type === 'textarea') {
                                                                            return (
                                                                                <div key={sf.key}>
                                                                                    <label className="text-[9px] text-muted-foreground">{sf.label}</label>
                                                                                    <textarea className="block w-full rounded border bg-background px-1 py-0.5 text-[10px] resize-y" rows={2} value={String(sfVal || '')} placeholder={sf.placeholder} title={sf.label} onChange={(e) => updateItem(idx, sf.key, e.target.value)} />
                                                                                </div>
                                                                            );
                                                                        }
                                                                        if (sf.type === 'number') {
                                                                            return (
                                                                                <div key={sf.key}>
                                                                                    <label className="text-[9px] text-muted-foreground">{sf.label}</label>
                                                                                    <input type="number" className="block w-full rounded border bg-background px-1 py-0.5 text-[10px]" value={sfVal != null ? Number(sfVal) : ''} placeholder={sf.placeholder} title={sf.label} onChange={(e) => updateItem(idx, sf.key, e.target.value ? Number(e.target.value) : undefined)} />
                                                                                </div>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <div key={sf.key}>
                                                                                <label className="text-[9px] text-muted-foreground">{sf.label}</label>
                                                                                <input type={sf.type === 'url' ? 'url' : 'text'} className="block w-full rounded border bg-background px-1 py-0.5 text-[10px]" value={String(sfVal || '')} placeholder={sf.placeholder} title={sf.label} onChange={(e) => updateItem(idx, sf.key, e.target.value)} />
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {items.length === 0 && (
                                                            <p className="text-[10px] text-muted-foreground italic px-1">No items. Click + Add above.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // --- Scalar field renderers ---
                                        return (
                                            <div key={field.key}>
                                                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{field.label}</label>
                                                {field.type === 'boolean' ? (
                                                    <label className="mt-0.5 flex items-center gap-1.5 text-xs cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!currentVal}
                                                            onChange={(e) => setFieldValue(e.target.checked)}
                                                            className="rounded"
                                                        />
                                                        <span>{field.label}</span>
                                                    </label>
                                                ) : field.type === 'select' ? (
                                                    <select
                                                        className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs"
                                                        value={String(currentVal || '')}
                                                        onChange={(e) => setFieldValue(e.target.value)}
                                                        title={field.label}
                                                    >
                                                        <option value="">—</option>
                                                        {(field as ScalarFieldDef).options?.map(o => (
                                                            <option key={o} value={o}>{o}</option>
                                                        ))}
                                                    </select>
                                                ) : field.type === 'textarea' ? (
                                                    <textarea
                                                        className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs resize-y"
                                                        rows={3}
                                                        value={String(currentVal || '')}
                                                        placeholder={(field as ScalarFieldDef).placeholder}
                                                        title={field.label}
                                                        onChange={(e) => setFieldValue(e.target.value)}
                                                    />
                                                ) : field.type === 'number' ? (
                                                    <input
                                                        type="number"
                                                        className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs"
                                                        value={currentVal != null ? Number(currentVal) : ''}
                                                        placeholder={(field as ScalarFieldDef).placeholder}
                                                        title={field.label}
                                                        onChange={(e) => setFieldValue(e.target.value ? Number(e.target.value) : undefined)}
                                                    />
                                                ) : (
                                                    <input
                                                        type={field.type === 'url' ? 'url' : 'text'}
                                                        className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 text-xs"
                                                        value={String(currentVal || '')}
                                                        placeholder={(field as ScalarFieldDef).placeholder}
                                                        title={field.label}
                                                        onChange={(e) => setFieldValue(e.target.value)}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                    {/* JSON fallback toggle for advanced editing */}
                                    <details className="text-[10px]">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Advanced JSON</summary>
                                        <div className="mt-1 space-y-2">
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground">Config</label>
                                                <textarea
                                                    className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px] resize-y"
                                                    rows={3}
                                                    defaultValue={JSON.stringify(selectedBlock.config || {}, null, 2)}
                                                    title="Block config JSON"
                                                    key={`config-adv-${selectedBlock.id}`}
                                                    onChange={() => setJsonError(null)}
                                                    onBlur={(e) => handleJsonBlur(selectedBlock.id, 'config', e.currentTarget.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium text-muted-foreground">Content</label>
                                                <textarea
                                                    className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px] resize-y"
                                                    rows={5}
                                                    defaultValue={JSON.stringify(selectedBlock.content || {}, null, 2)}
                                                    title="Block content JSON"
                                                    key={`content-adv-${selectedBlock.id}`}
                                                    onChange={() => setJsonError(null)}
                                                    onBlur={(e) => handleJsonBlur(selectedBlock.id, 'content', e.currentTarget.value)}
                                                />
                                            </div>
                                            {jsonError && (
                                                <p className="text-[10px] text-destructive">{jsonError}</p>
                                            )}
                                        </div>
                                    </details>
                                </div>
                            ) : (
                                <>
                                    {/* JSON-only for untyped block types */}
                                    <div>
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Config</label>
                                        <textarea
                                            className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px] resize-y"
                                            rows={3}
                                            defaultValue={JSON.stringify(selectedBlock.config || {}, null, 2)}
                                            title="Block config JSON"
                                            key={`config-${selectedBlock.id}`}
                                            onChange={() => setJsonError(null)}
                                            onBlur={(e) => handleJsonBlur(selectedBlock.id, 'config', e.currentTarget.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Content</label>
                                        <textarea
                                            className="mt-0.5 block w-full rounded border bg-background px-1.5 py-1 font-mono text-[10px] resize-y"
                                            rows={5}
                                            defaultValue={JSON.stringify(selectedBlock.content || {}, null, 2)}
                                            title="Block content JSON"
                                            key={`content-${selectedBlock.id}`}
                                            onChange={() => setJsonError(null)}
                                            onBlur={(e) => handleJsonBlur(selectedBlock.id, 'content', e.currentTarget.value)}
                                        />
                                    </div>
                                    {jsonError && (
                                        <p className="text-[10px] text-destructive">{jsonError}</p>
                                    )}
                                </>
                            )}

                            {/* Regenerate */}
                            <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs"
                                onClick={() => handleRegenerateBlock(selectedBlock.id)}
                                disabled={regenerating === selectedBlock.id}
                            >
                                {regenerating === selectedBlock.id ? 'Regenerating...' : `Regenerate ${selectedBlock.type}`}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* ====== RIGHT PANEL: Preview ====== */}
            <div className="flex flex-1 flex-col bg-muted/30">
                {/* Viewport toolbar */}
                <div className="flex items-center justify-between border-b bg-background px-3 py-2">
                    <div className="flex items-center gap-1">
                        {(['desktop', 'tablet', 'mobile'] as ViewportSize[]).map(vp => (
                            <Button
                                key={vp}
                                size="sm"
                                variant={viewport === vp ? 'default' : 'ghost'}
                                className="h-7 text-xs capitalize"
                                onClick={() => setViewport(vp)}
                            >
                                {vp === 'desktop' ? '\u{1F5A5}' : vp === 'tablet' ? '\u{1F4F1}' : '\u{1F4F1}'} {vp}
                            </Button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                            {blocks.length} blocks {'\u00B7'} {theme}/{skin}
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={refreshPreview}>
                            {'\u21BB'} Refresh
                        </Button>
                    </div>
                </div>

                {/* Error bar */}
                {error && (
                    <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                        {error}
                        <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
                    </div>
                )}

                {/* iframe container */}
                <div className="flex flex-1 items-start justify-center overflow-auto p-4">
                    <div
                        className="relative bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300"
                        style={{
                            width: VIEWPORT_WIDTHS[viewport],
                            maxWidth: '100%',
                            height: '100%',
                        }}
                    >
                        {iframeLoading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                    <span className="text-xs text-muted-foreground">Loading preview…</span>
                                </div>
                            </div>
                        )}
                        <iframe
                            ref={iframeRef}
                            src={previewUrl}
                            className="h-full w-full border-0"
                            title="Page preview"
                            sandbox="allow-scripts allow-same-origin"
                            onLoad={() => setIframeLoading(false)}
                        />
                    </div>
                </div>
            </div>

            {/* ====== Block Palette Modal ====== */}
            {showPalette && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="max-h-[80vh] w-full max-w-xl overflow-auto rounded-xl border bg-background p-5 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-base font-semibold">Add Block</h3>
                            <Button size="sm" variant="ghost" onClick={() => { setShowPalette(false); setInsertIndex(null); }}>
                                {'\u2715'}
                            </Button>
                        </div>

                        {/* Search */}
                        <input
                            type="text"
                            className="mb-3 w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                            placeholder="Search blocks..."
                            value={paletteSearch}
                            onChange={(e) => setPaletteSearch(e.target.value)}
                            autoFocus
                            title="Search blocks"
                        />

                        <div className="space-y-4">
                            {Object.entries(BLOCK_CATEGORIES).map(([category, types]) => {
                                const filtered = types.filter(t =>
                                    !paletteSearch || t.toLowerCase().includes(paletteSearch.toLowerCase()) ||
                                    (BLOCK_DESCRIPTIONS[t] || '').toLowerCase().includes(paletteSearch.toLowerCase())
                                );
                                if (filtered.length === 0) return null;
                                return (
                                    <div key={category}>
                                        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {CATEGORY_ICONS[category] || ''} {category}
                                        </h4>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            {filtered.map(type => (
                                                <button
                                                    key={type}
                                                    className="flex flex-col items-start rounded-lg border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted hover:border-foreground/20"
                                                    onClick={() => addBlock(type)}
                                                >
                                                    <span className="text-sm font-medium">{type}</span>
                                                    <span className="text-[10px] text-muted-foreground leading-tight">
                                                        {BLOCK_DESCRIPTIONS[type] || ''}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
