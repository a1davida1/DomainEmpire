/**
 * Tests for Template System v2 — block schemas, assembler, presets, and renderers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    BlockEnvelopeSchema,
    PageDefinitionSchema,
    BLOCK_SCHEMA_REGISTRY,
    validateBlock,
    type BlockType,
    type BlockEnvelope,
    HeaderContentSchema,
    FAQContentSchema,
    ComparisonTableContentSchema,
} from '@/lib/deploy/blocks/schemas';
import {
    assemblePageFromBlocks,
    renderBlock,
    type RenderContext,
} from '@/lib/deploy/blocks/assembler';
// Side-effect import to register interactive renderers
import '@/lib/deploy/blocks/renderers-interactive';
import {
    HOMEPAGE_PRESETS,
    ARTICLE_PAGE_PRESETS,
    getHomepagePreset,
    getArticlePagePreset,
    resetBlockIdCounter,
} from '@/lib/deploy/blocks/presets';
import { generateThemeCSS, availableV2Themes } from '@/lib/deploy/themes/theme-tokens';
import { generateSkinCSS, availableSkins } from '@/lib/deploy/themes/skin-definitions';
import { generateV2GlobalStyles } from '@/lib/deploy/themes';

// ============================================================
// Test Helpers
// ============================================================

function makeCtx(overrides?: Partial<RenderContext>): RenderContext {
    return {
        domain: 'example.com',
        siteTitle: 'Example Site',
        route: '/',
        theme: 'clean',
        skin: 'slate',
        headScripts: '',
        bodyScripts: '',
        ...overrides,
    };
}

function makeBlock(type: BlockType, content?: Record<string, unknown>, config?: Record<string, unknown>): BlockEnvelope {
    return { id: 'test-1', type, content, config };
}

function extractJsonLd(html: string): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    const re = /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;
    for (const match of html.matchAll(re)) {
        const raw = (match[1] || '').trim();
        if (!raw) continue;
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') out.push(parsed as Record<string, unknown>);
    }
    return out;
}

// ============================================================
// Schema Validation
// ============================================================

describe('Block Schemas', () => {
    it('BlockEnvelopeSchema validates a minimal block', () => {
        const result = BlockEnvelopeSchema.safeParse({
            id: 'blk_1',
            type: 'Header',
        });
        expect(result.success).toBe(true);
    });

    it('BlockEnvelopeSchema rejects unknown block type', () => {
        const result = BlockEnvelopeSchema.safeParse({
            id: 'blk_1',
            type: 'NonExistent',
        });
        expect(result.success).toBe(false);
    });

    it('PageDefinitionSchema validates a complete page definition', () => {
        const result = PageDefinitionSchema.safeParse({
            route: '/',
            theme: 'clean',
            skin: 'slate',
            blocks: [
                { id: 'blk_1', type: 'Header' },
                { id: 'blk_2', type: 'Hero' },
                { id: 'blk_3', type: 'Footer' },
            ],
        });
        expect(result.success).toBe(true);
    });

    it('BLOCK_SCHEMA_REGISTRY has entry for every block type', () => {
        const allTypes: BlockType[] = [
            'Header', 'Footer', 'Sidebar', 'Hero', 'ArticleBody',
            'FAQ', 'StepByStep', 'Checklist', 'AuthorBio',
            'ComparisonTable', 'VsCard', 'RankingList', 'ProsConsCard',
            'LeadForm', 'CTABanner', 'PricingTable',
            'QuoteCalculator', 'CostBreakdown', 'StatGrid', 'DataTable',
            'TestimonialGrid', 'TrustBadges', 'CitationBlock',
            'LastUpdated', 'MedicalDisclaimer',
            'Wizard', 'GeoContent', 'InteractiveMap',
            'PdfDownload', 'ScrollCTA', 'EmbedWidget',
        ];
        for (const type of allTypes) {
            expect(BLOCK_SCHEMA_REGISTRY[type]).toBeDefined();
            expect(BLOCK_SCHEMA_REGISTRY[type].content).toBeDefined();
            expect(BLOCK_SCHEMA_REGISTRY[type].config).toBeDefined();
        }
    });

    it('HeaderContentSchema validates correctly', () => {
        const valid = HeaderContentSchema.safeParse({
            siteName: 'Test Site',
            navLinks: [{ label: 'Home', href: '/' }],
        });
        expect(valid.success).toBe(true);

        const invalid = HeaderContentSchema.safeParse({
            siteName: 123, // wrong type
        });
        expect(invalid.success).toBe(false);
    });

    it('FAQContentSchema validates items array', () => {
        const valid = FAQContentSchema.safeParse({
            items: [
                { question: 'What is this?', answer: 'A test.' },
                { question: 'Why?', answer: 'Because.' },
            ],
        });
        expect(valid.success).toBe(true);
    });

    it('ComparisonTableContentSchema validates complex data', () => {
        const valid = ComparisonTableContentSchema.safeParse({
            options: [{
                name: 'Product A',
                scores: { price: 4, quality: 5 },
            }],
            columns: [
                { key: 'price', label: 'Price', type: 'rating' },
                { key: 'quality', label: 'Quality', type: 'rating' },
            ],
            verdict: 'Product A wins',
        });
        expect(valid.success).toBe(true);
    });

    it('LeadForm schema accepts heading, placeholders, and privacyUrl', () => {
        const result = validateBlock({
            id: 'blk_lead',
            type: 'LeadForm',
            content: {
                heading: 'Get Matched',
                subheading: 'Answer 2 questions to get started.',
                fields: [
                    { name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
                    { name: 'zip', label: 'ZIP', type: 'number', placeholder: '10001', required: true, half: true },
                    { name: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 123-4567', required: true, half: true },
                ],
                consentText: 'By submitting you agree to our Privacy Policy.',
                successMessage: 'Thanks!',
                privacyUrl: '/privacy-policy',
            },
            config: {
                endpoint: '#',
                submitLabel: 'Send',
                showDisclosure: true,
            },
        });
        expect(result.success).toBe(true);
    });

    it('validateBlock returns success for valid block', () => {
        const result = validateBlock({
            id: 'blk_1',
            type: 'FAQ',
            content: {
                items: [{ question: 'Q1', answer: 'A1' }],
            },
        });
        expect(result.success).toBe(true);
    });

    it('validateBlock returns errors for invalid content', () => {
        const result = validateBlock({
            id: 'blk_1',
            type: 'FAQ',
            content: {
                items: 'not an array',
            },
        });
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('validateBlock returns error for unknown block type', () => {
        const result = validateBlock({
            id: 'blk_1',
            type: 'FakeBlock' as BlockType,
        });
        expect(result.success).toBe(false);
        expect(result.errors![0]).toContain('Unknown block type');
    });
});

// ============================================================
// Block Renderers
// ============================================================

describe('Block Renderers', () => {
    const ctx = makeCtx();

    it('Header renders with site name and nav links', () => {
        const html = renderBlock(makeBlock('Header', {
            siteName: 'Test Site',
            navLinks: [
                { label: 'Home', href: '/' },
                { label: 'About', href: '/about' },
            ],
        }), ctx);
        expect(html).toContain('Test Site');
        expect(html).toContain('href="/"');
        expect(html).toContain('About');
        expect(html).toContain('class="header');
    });

    it('Header falls back to ctx.siteTitle when no siteName', () => {
        const html = renderBlock(makeBlock('Header', {}), ctx);
        expect(html).toContain('Example Site');
    });

    it('Footer renders copyright and variant class', () => {
        const html = renderBlock(makeBlock('Footer', { siteName: 'My Site' }, { variant: 'minimal' }), ctx);
        expect(html).toContain('My Site');
        expect(html).toContain('footer--minimal');
        expect(html).toContain(String(new Date().getFullYear()));
    });

    it('Hero renders heading, subheading, and CTA', () => {
        const html = renderBlock(makeBlock('Hero', {
            heading: 'Welcome',
            subheading: 'Start here',
            ctaText: 'Get Started',
            ctaUrl: '/start',
        }), ctx);
        expect(html).toContain('Welcome');
        expect(html).toContain('Start here');
        expect(html).toContain('Get Started');
        expect(html).toContain('href="/start"');
    });

    it('ArticleBody renders markdown content', () => {
        const html = renderBlock(makeBlock('ArticleBody', {
            markdown: '<p>Hello world</p>',
            title: 'Test Article',
        }), ctx);
        expect(html).toContain('Test Article');
        expect(html).toContain('<p>Hello world</p>');
    });

    it('FAQ renders accordion items with JSON-LD', () => {
        const html = renderBlock(makeBlock('FAQ', {
            items: [
                { question: 'What is this?', answer: '<p>A test</p>' },
                { question: 'Why?', answer: '<p>Because</p>' },
            ],
        }), ctx);
        expect(html).toContain('What is this?');
        expect(html).toContain('<p>A test</p>');
        expect(html).toContain('FAQPage');
        expect(html).toContain('<details');
    });

    it('FAQ does not emit JSON-LD when emitJsonLd is false', () => {
        const html = renderBlock(makeBlock('FAQ', {
            items: [
                { question: 'Q1', answer: '<p>A1</p>' },
            ],
        }, { emitJsonLd: false }), ctx);
        expect(html).toContain('Frequently Asked Questions');
        expect(html).not.toContain('FAQPage');
        expect(html).not.toContain('application/ld+json');
    });

    it('FAQ returns empty for no items', () => {
        const html = renderBlock(makeBlock('FAQ', { items: [] }), ctx);
        expect(html).toBe('');
    });

    it('CTABanner renders immediate style', () => {
        const html = renderBlock(makeBlock('CTABanner', {
            text: 'Act now!',
            buttonLabel: 'Click',
            buttonUrl: '/go',
        }, { style: 'card', trigger: 'immediate' }), ctx);
        expect(html).toContain('Act now!');
        expect(html).toContain('Click');
        expect(html).toContain('cta-section--card');
    });

    it('CTABanner renders scroll-triggered CTA', () => {
        const html = renderBlock(makeBlock('CTABanner', {
            text: 'Scroll CTA',
            buttonLabel: 'Go',
            buttonUrl: '/cta',
        }, { trigger: 'scroll' }), ctx);
        expect(html).toContain('scroll-cta');
        expect(html).toContain('IntersectionObserver');
    });

    it('CitationBlock renders sources', () => {
        const html = renderBlock(makeBlock('CitationBlock', {
            sources: [
                { title: 'Source 1', url: 'https://example.com', publisher: 'Pub' },
            ],
        }), ctx);
        expect(html).toContain('Source 1');
        expect(html).toContain('Pub');
        expect(html).toContain('data-sources');
    });

    it('MedicalDisclaimer renders disclaimer with CTA', () => {
        const html = renderBlock(makeBlock('MedicalDisclaimer', {}, { showDoctorCta: true }), ctx);
        expect(html).toContain('Medical Disclaimer');
        expect(html).toContain('Talk to Your Doctor');
    });

    it('Checklist renders interactive steps', () => {
        const html = renderBlock(makeBlock('Checklist', {
            steps: [
                { heading: 'Step 1', body: 'Do this' },
                { heading: 'Step 2', body: 'Then this' },
            ],
        }, { interactive: true }), ctx);
        expect(html).toContain('Step 1');
        expect(html).toContain('checkbox');
        expect(html).toContain('checklist-progress');
    });

    it('TrustBadges renders badges', () => {
        const html = renderBlock(makeBlock('TrustBadges', {
            badges: [
                { label: 'Verified', description: 'We are verified' },
            ],
        }), ctx);
        expect(html).toContain('Verified');
        expect(html).toContain('trust-badge');
    });

    it('Unknown block type renders comment', () => {
        const html = renderBlock(makeBlock('NonExistent' as BlockType, {}), ctx);
        expect(html).toContain('<!-- unknown block');
    });
});

// ============================================================
// Interactive Renderers
// ============================================================

describe('Interactive Block Renderers', () => {
    const ctx = makeCtx();

    it('ComparisonTable renders sortable table', () => {
        const html = renderBlock(makeBlock('ComparisonTable', {
            options: [
                { name: 'A', scores: { price: 4, quality: 5 } },
                { name: 'B', scores: { price: 3, quality: 4 } },
            ],
            columns: [
                { key: 'price', label: 'Price', type: 'rating' },
                { key: 'quality', label: 'Quality', type: 'rating' },
            ],
            verdict: 'A wins',
        }), ctx);
        expect(html).toContain('comparison-table');
        expect(html).toContain('A wins');
        expect(html).toContain('data-sort-key');
        expect(html).toContain('★');
    });

    it('ComparisonTable returns empty for no options', () => {
        const html = renderBlock(makeBlock('ComparisonTable', {
            options: [],
            columns: [],
        }), ctx);
        expect(html).toBe('');
    });

    it('QuoteCalculator renders inputs and outputs', () => {
        const html = renderBlock(makeBlock('QuoteCalculator', {
            inputs: [
                { id: 'amount', label: 'Amount', type: 'number', default: 1000 },
                { id: 'rate', label: 'Rate', type: 'range', min: 0, max: 20, step: 0.5, default: 5 },
            ],
            outputs: [
                { id: 'result', label: 'Total', format: 'currency', decimals: 2 },
            ],
            formula: '{amount: amount * (1 + rate/100)}',
        }), ctx);
        expect(html).toContain('calc-form');
        expect(html).toContain('Amount');
        expect(html).toContain('type="range"');
        expect(html).toContain('calc-results');
    });

    it('CostBreakdown renders ranges and factors', () => {
        const html = renderBlock(makeBlock('CostBreakdown', {
            ranges: [
                { label: 'Basic', low: 100, high: 500, average: 250 },
            ],
            factors: [
                { name: 'Location', impact: 'high', description: 'Varies by area' },
            ],
        }), ctx);
        expect(html).toContain('$100');
        expect(html).toContain('$500');
        expect(html).toContain('Location');
        expect(html).toContain('impact-high');
    });

    it('LeadForm renders fields and submit handler', () => {
        const html = renderBlock(makeBlock('LeadForm', {
            fields: [
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'name', label: 'Name', type: 'text' },
            ],
            consentText: 'I agree to terms',
            successMessage: 'Thanks!',
        }, { endpoint: '/api/capture' }), ctx);
        expect(html).toContain('lead-form');
        expect(html).toContain('type="email"');
        expect(html).toContain('I agree to terms');
        expect(html).toContain('/api/capture');
    });

    it('StatGrid renders cards with filter chips', () => {
        const html = renderBlock(makeBlock('StatGrid', {
            items: [
                { id: 's1', title: 'Stat 1', metricLabel: 'Score', metricValue: 80, summary: 'Good', group: 'A' },
                { id: 's2', title: 'Stat 2', metricLabel: 'Score', metricValue: 60, summary: 'OK', group: 'B' },
            ],
        }), ctx);
        expect(html).toContain('infographic-card');
        expect(html).toContain('Stat 1');
        expect(html).toContain('data-group="A"');
        expect(html).toContain('infographic-chip');
    });

    it('InteractiveMap renders regions with dropdown', () => {
        const html = renderBlock(makeBlock('InteractiveMap', {
            regions: {
                NY: { label: 'New York', content: '<p>NY data</p>' },
                CA: { label: 'California', content: '<p>CA data</p>' },
            },
            defaultRegion: 'NY',
        }), ctx);
        expect(html).toContain('imap-shell');
        expect(html).toContain('New York');
        expect(html).toContain('California');
        expect(html).toContain('imap-select');
    });

    it('ProsConsCard renders pros and cons', () => {
        const html = renderBlock(makeBlock('ProsConsCard', {
            name: 'Product X',
            rating: 4,
            pros: ['Fast', 'Cheap'],
            cons: ['Fragile'],
        }), ctx);
        expect(html).toContain('Product X');
        expect(html).toContain('★★★★☆');
        expect(html).toContain('Fast');
        expect(html).toContain('Fragile');
    });

    it('RankingList renders ranked items', () => {
        const html = renderBlock(makeBlock('RankingList', {
            items: [
                { rank: 1, name: 'First', description: 'The best', rating: 5 },
                { rank: 2, name: 'Second', description: 'Also good', rating: 4 },
            ],
            title: 'Top Picks',
        }), ctx);
        expect(html).toContain('ranking-number');
        expect(html).toContain('First');
        expect(html).toContain('Top Picks');
    });

    it('Wizard renders steps, progress, and results template', () => {
        const html = renderBlock(makeBlock('Wizard', {
            steps: [{
                id: 'step1',
                title: 'Choose',
                fields: [{
                    id: 'choice',
                    type: 'radio',
                    label: 'Pick one',
                    options: [
                        { value: 'a', label: 'Option A' },
                        { value: 'b', label: 'Option B' },
                    ],
                    required: true,
                }],
            }],
            resultRules: [
                { condition: "choice == 'a'", title: 'You chose A', body: 'Great choice!' },
            ],
            resultTemplate: 'recommendation',
        }, { mode: 'quiz' }), ctx);
        expect(html).toContain('wizard-container');
        expect(html).toContain('wizard-mode-quiz');
        expect(html).toContain('Pick one');
        expect(html).toContain('Option A');
        expect(html).toContain('wizard-progress');
        expect(html).toContain('wizard-results');
        expect(html).toContain('See Score'); // quiz mode final step label
    });

    it('DataTable renders headers and rows', () => {
        const html = renderBlock(makeBlock('DataTable', {
            headers: ['Name', 'Price'],
            rows: [['Widget', 9.99], ['Gadget', 19.99]],
            caption: 'Products',
        }), ctx);
        expect(html).toContain('Products');
        expect(html).toContain('Widget');
        expect(html).toContain('19.99');
    });

    it('TestimonialGrid renders quotes', () => {
        const html = renderBlock(makeBlock('TestimonialGrid', {
            testimonials: [
                { quote: 'Amazing product!', author: 'Jane', rating: 5 },
            ],
        }), ctx);
        expect(html).toContain('Amazing product!');
        expect(html).toContain('Jane');
        expect(html).toContain('★★★★★');
    });

    it('PricingTable renders plan cards', () => {
        const html = renderBlock(makeBlock('PricingTable', {
            plans: [
                { name: 'Basic', price: '$9', period: 'mo', features: ['Feature 1'], highlighted: false },
                { name: 'Pro', price: '$29', period: 'mo', features: ['Feature 1', 'Feature 2'], highlighted: true, badge: 'Popular' },
            ],
        }), ctx);
        expect(html).toContain('Basic');
        expect(html).toContain('$29');
        expect(html).toContain('pricing-highlighted');
        expect(html).toContain('Popular');
    });
});

// ============================================================
// Page Assembly
// ============================================================

describe('Page Assembly', () => {
    it('assemblePageFromBlocks produces valid HTML document', () => {
        const blocks: BlockEnvelope[] = [
            { id: 'h1', type: 'Header', content: { siteName: 'Test' } },
            { id: 'hero', type: 'Hero', content: { heading: 'Welcome' } },
            { id: 'body', type: 'ArticleBody', content: { markdown: '<p>Content</p>' } },
            { id: 'f1', type: 'Footer', content: { siteName: 'Test' } },
        ];
        const ctx = makeCtx({ pageTitle: 'Home', pageDescription: 'Test desc' });
        const html = assemblePageFromBlocks(blocks, ctx);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html lang="en">');
        expect(html).toContain('Home | Example Site');
        expect(html).toContain('data-theme="clean"');
        expect(html).toContain('data-skin="slate"');
        expect(html).toContain('<header');
        expect(html).toContain('Welcome');
        expect(html).toContain('<p>Content</p>');
        expect(html).toContain('<footer');
    });

    it('assemblePageFromBlocks emits SoftwareApplication JSON-LD for tool blocks', () => {
        const blocks: BlockEnvelope[] = [
            { id: 'h1', type: 'Header', content: { siteName: 'Test' } },
            {
                id: 'wiz',
                type: 'Wizard',
                content: {
                    steps: [{
                        id: 'step1',
                        title: 'Choose',
                        fields: [{
                            id: 'choice',
                            type: 'radio',
                            label: 'Pick one',
                            options: [
                                { value: 'a', label: 'Option A' },
                                { value: 'b', label: 'Option B' },
                            ],
                            required: true,
                        }],
                    }],
                    resultRules: [
                        { condition: "choice == 'a'", title: 'You chose A', body: 'Great choice!' },
                    ],
                    resultTemplate: 'recommendation',
                },
                config: { mode: 'quiz' },
            },
            { id: 'f1', type: 'Footer', content: { siteName: 'Test' } },
        ];
        const ctx = makeCtx({ route: '/tools/test', pageTitle: 'Test Tool', pageDescription: 'Tool desc' });
        const html = assemblePageFromBlocks(blocks, ctx);
        const jsonLd = extractJsonLd(html);

        expect(jsonLd.some(o => o['@type'] === 'SoftwareApplication')).toBe(true);
    });

    it('assemblePageFromBlocks emits Product JSON-LD for ComparisonTable blocks', () => {
        const blocks: BlockEnvelope[] = [
            { id: 'h1', type: 'Header', content: { siteName: 'Test' } },
            {
                id: 'cmp',
                type: 'ComparisonTable',
                content: {
                    options: [{
                        name: 'Product A',
                        scores: { price: 4, quality: 5 },
                    }],
                    columns: [
                        { key: 'price', label: 'Price', type: 'rating' },
                        { key: 'quality', label: 'Quality', type: 'rating' },
                    ],
                    verdict: 'Product A wins',
                },
            },
            { id: 'f1', type: 'Footer', content: { siteName: 'Test' } },
        ];
        const ctx = makeCtx({ route: '/compare', pageTitle: 'Compare', pageDescription: 'Compare desc' });
        const html = assemblePageFromBlocks(blocks, ctx);
        const jsonLd = extractJsonLd(html);

        const product = jsonLd.find(o => o['@type'] === 'Product' && o.name === 'Product A') as Record<string, unknown> | undefined;
        expect(product).toBeDefined();
        const aggregate = (product?.aggregateRating || null) as Record<string, unknown> | null;
        expect(aggregate).toBeTruthy();
        expect(aggregate?.['ratingValue']).toBe(4.5);
        expect(aggregate?.['ratingCount']).toBe(2);
    });

    it('assemblePageFromBlocks uses Article schema on non-home pages with ArticleBody', () => {
        const blocks: BlockEnvelope[] = [
            { id: 'h1', type: 'Header', content: { siteName: 'Test' } },
            { id: 'body', type: 'ArticleBody', content: { markdown: '<p>Content</p>', title: 'Guide' } },
            { id: 'f1', type: 'Footer', content: { siteName: 'Test' } },
        ];
        const ctx = makeCtx({ route: '/guides/test', pageTitle: 'Guide', pageDescription: 'Guide desc' });
        const html = assemblePageFromBlocks(blocks, ctx);
        const jsonLd = extractJsonLd(html);

        expect(jsonLd.some(o => o['@type'] === 'Article')).toBe(true);
    });

    it('header and footer are placed outside main', () => {
        const blocks: BlockEnvelope[] = [
            { id: 'h1', type: 'Header', content: { siteName: 'X' } },
            { id: 'c1', type: 'ArticleBody', content: { markdown: 'text' } },
            { id: 'f1', type: 'Footer', content: { siteName: 'X' } },
        ];
        const html = assemblePageFromBlocks(blocks, makeCtx());
        const headerIdx = html.indexOf('<header');
        const mainIdx = html.indexOf('<main');
        const footerIdx = html.indexOf('<footer');

        expect(headerIdx).toBeLessThan(mainIdx);
        expect(mainIdx).toBeLessThan(footerIdx);
    });
});

// ============================================================
// Presets
// ============================================================

describe('Block Presets', () => {
    beforeEach(() => {
        resetBlockIdCounter();
    });

    it('HOMEPAGE_PRESETS has entry for every v1 siteTemplate', () => {
        const v1Templates = [
            'authority', 'comparison', 'calculator', 'review', 'tool', 'hub',
            'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand',
            'magazine', 'landing', 'docs', 'storefront', 'minimal', 'dashboard',
            'newsletter', 'community',
        ];
        for (const tmpl of v1Templates) {
            expect(HOMEPAGE_PRESETS[tmpl]).toBeDefined();
            expect(HOMEPAGE_PRESETS[tmpl].length).toBeGreaterThan(0);
        }
    });

    it('ARTICLE_PAGE_PRESETS has entry for every contentType', () => {
        const contentTypes = [
            'article', 'comparison', 'calculator', 'cost_guide', 'lead_capture',
            'health_decision', 'checklist', 'faq', 'review', 'wizard',
            'configurator', 'quiz', 'survey', 'assessment',
            'interactive_infographic', 'interactive_map',
        ];
        for (const ct of contentTypes) {
            expect(ARTICLE_PAGE_PRESETS[ct]).toBeDefined();
            expect(ARTICLE_PAGE_PRESETS[ct].length).toBeGreaterThan(0);
        }
    });

    it('every preset starts with Header and ends with Footer', () => {
        for (const [_name, blocks] of Object.entries(HOMEPAGE_PRESETS)) {
            expect(blocks[0].type).toBe('Header');
            expect(blocks[blocks.length - 1].type).toBe('Footer');
        }
    });

    it('getHomepagePreset returns blocks with unique IDs', () => {
        const blocks = getHomepagePreset('authority');
        const ids = blocks.map(b => b.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(blocks[0].type).toBe('Header');
    });

    it('getHomepagePreset falls back to authority for unknown template', () => {
        const blocks = getHomepagePreset('nonexistent');
        const authorityBlocks = getHomepagePreset('authority');
        expect(blocks.length).toBe(authorityBlocks.length);
    });

    it('getArticlePagePreset returns blocks with unique IDs', () => {
        const blocks = getArticlePagePreset('calculator');
        const ids = blocks.map((b: { id: string }) => b.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(blocks.some((b: { type: string }) => b.type === 'QuoteCalculator')).toBe(true);
    });
});

// ============================================================
// Theme/Skin Token System
// ============================================================

describe('Theme/Skin Token System', () => {
    it('generateThemeCSS produces CSS custom properties', () => {
        const css = generateThemeCSS('clean');
        expect(css).toContain('--font-heading:');
        expect(css).toContain('--font-body:');
        expect(css).toContain('--radius-md:');
        expect(css).toContain('--shadow-md:');
        expect(css).toContain(':root{');
    });

    it('generateThemeCSS falls back to clean for unknown theme', () => {
        const css = generateThemeCSS('nonexistent');
        const cleanCss = generateThemeCSS('clean');
        expect(css).toBe(cleanCss);
    });

    it('generateSkinCSS produces color custom properties', () => {
        const css = generateSkinCSS('ocean');
        expect(css).toContain('--color-primary:');
        expect(css).toContain('--color-bg:');
        expect(css).toContain('--color-hero-bg:');
        expect(css).toContain('--color-link:');
    });

    it('generateSkinCSS falls back to slate for unknown skin', () => {
        const css = generateSkinCSS('nonexistent');
        const slateCss = generateSkinCSS('slate');
        expect(css).toBe(slateCss);
    });

    it('all themes produce valid CSS', () => {
        for (const theme of availableV2Themes) {
            const css = generateThemeCSS(theme);
            expect(css).toContain(':root{');
            expect(css.length).toBeGreaterThan(50);
        }
    });

    it('all skins produce valid CSS', () => {
        for (const skin of availableSkins) {
            const css = generateSkinCSS(skin);
            expect(css).toContain(':root{');
            expect(css.length).toBeGreaterThan(50);
        }
    });

    it('generateV2GlobalStyles combines theme + skin + base', () => {
        const css = generateV2GlobalStyles('clean', 'slate');
        expect(css).toContain('--font-heading:');
        expect(css).toContain('--color-primary:');
        // Should contain base styles
        expect(css.length).toBeGreaterThan(500);
    });
});
