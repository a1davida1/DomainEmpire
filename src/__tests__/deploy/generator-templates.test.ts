import { describe, it, expect } from 'vitest';
import {
    escapeHtml,
    escapeAttr,
    buildSchemaJsonLd,
    buildPrintButton,
    generateDataSourcesSection,
} from '@/lib/deploy/templates/shared';
import type { Article, Dataset } from '@/lib/db/schema';

// Helper to create a minimal article fixture
function makeArticle(overrides: Partial<Article> = {}): Article {
    return {
        id: 'test-id',
        domainId: 'domain-id',
        title: 'Test Article',
        slug: 'test-article',
        metaDescription: 'Test description',
        contentMarkdown: '# Hello\nWorld',
        contentHtml: null,
        wordCount: 2,
        targetKeyword: 'test',
        secondaryKeywords: [],
        headerStructure: null,
        internalLinks: null,
        externalLinks: null,
        schemaMarkup: null,
        researchData: null,
        aiModel: null,
        aiPromptVersion: null,
        generationPasses: 0,
        generationCost: null,
        humanizationScore: null,
        contentFingerprint: null,
        monetizationElements: null,
        status: 'published',
        publishedAt: new Date('2024-01-01'),
        isSeedArticle: false,
        pageviews30d: 0,
        uniqueVisitors30d: 0,
        avgTimeOnPage: null,
        bounceRate: null,
        revenue30d: 0,
        lastRefreshedAt: null,
        stalenessScore: null,
        ymylLevel: 'none',
        lastReviewedAt: null,
        lastReviewedBy: null,
        publishedBy: null,
        contentType: 'article',
        calculatorConfig: null,
        comparisonData: null,
        leadGenConfig: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
        ...overrides,
    } as Article;
}

describe('escapeHtml', () => {
    it('escapes angle brackets and ampersands', () => {
        expect(escapeHtml('<script>alert("xss")</script>')).toBe(
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        );
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("it's")).toBe("it&#039;s");
    });
});

describe('escapeAttr', () => {
    it('escapes double quotes for attributes', () => {
        expect(escapeAttr('say "hello"')).toBe('say &quot;hello&quot;');
    });
});

describe('buildSchemaJsonLd', () => {
    it('generates Article JSON-LD', () => {
        const article = makeArticle();
        const result = buildSchemaJsonLd(article, 'example.com', 'Article');
        expect(result).toContain('"@type":"Article"');
        expect(result).toContain('"headline":"Test Article"');
        expect(result).toContain('"url":"https://example.com/test-article"');
        expect(result).toContain('<script type="application/ld+json">');
    });

    it('generates WebApplication JSON-LD for calculators', () => {
        const article = makeArticle({ contentType: 'calculator' });
        const result = buildSchemaJsonLd(article, 'example.com', 'WebApplication', {
            applicationCategory: 'FinanceApplication',
        });
        expect(result).toContain('"@type":"WebApplication"');
        expect(result).toContain('"applicationCategory":"FinanceApplication"');
    });

    it('generates ItemList JSON-LD for comparisons', () => {
        const article = makeArticle({ contentType: 'comparison' });
        const result = buildSchemaJsonLd(article, 'example.com', 'ItemList', {
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Option A' },
                { '@type': 'ListItem', position: 2, name: 'Option B' },
            ],
            numberOfItems: 2,
        });
        expect(result).toContain('"@type":"ItemList"');
        expect(result).toContain('"numberOfItems":2');
    });

    it('generates FAQPage JSON-LD', () => {
        const article = makeArticle({ contentType: 'faq' });
        const result = buildSchemaJsonLd(article, 'example.com', 'FAQPage', {
            mainEntity: [
                { '@type': 'Question', name: 'What is X?', acceptedAnswer: { '@type': 'Answer', text: 'X is...' } },
            ],
        });
        expect(result).toContain('"@type":"FAQPage"');
        expect(result).toContain('"mainEntity"');
    });
});

describe('generateDataSourcesSection', () => {
    it('returns empty string for no datasets', () => {
        expect(generateDataSourcesSection([])).toBe('');
    });

    it('renders dataset list with links', () => {
        const datasets = [{
            dataset: {
                id: 'd1',
                name: 'BLS CPI Data',
                sourceUrl: 'https://bls.gov/cpi',
                sourceTitle: 'CPI Report',
                publisher: 'Bureau of Labor Statistics',
                retrievedAt: new Date('2024-06-01'),
                effectiveDate: null,
                expiresAt: null,
                freshnessClass: 'monthly',
                data: {},
                dataHash: 'abc',
                version: 1,
                domainId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as Dataset,
            usage: 'Inflation rate data',
        }];

        const result = generateDataSourcesSection(datasets);
        expect(result).toContain('Data Sources');
        expect(result).toContain('CPI Report');
        expect(result).toContain('https://bls.gov/cpi');
        expect(result).toContain('Bureau of Labor Statistics');
        expect(result).toContain('Inflation rate data');
    });

    it('escapes HTML in dataset names', () => {
        const datasets = [{
            dataset: {
                id: 'd1',
                name: '<script>alert("xss")</script>',
                sourceUrl: null,
                sourceTitle: null,
                publisher: null,
                retrievedAt: null,
                effectiveDate: null,
                expiresAt: null,
                freshnessClass: 'monthly',
                data: {},
                dataHash: null,
                version: 1,
                domainId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as Dataset,
            usage: null,
        }];

        const result = generateDataSourcesSection(datasets);
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;script&gt;');
    });
});

describe('buildPrintButton', () => {
    it('supports interactive infographic pages', () => {
        expect(buildPrintButton('interactive_infographic')).toContain('Save as PDF');
    });

    it('supports interactive map pages', () => {
        expect(buildPrintButton('interactive_map')).toContain('Save as PDF');
    });
});
