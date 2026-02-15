import { describe, expect, it } from 'vitest';
import { generateEmbedPage } from '@/lib/deploy/templates/embed';
import type { Article } from '@/lib/db/schema';

function makeWizardArticle(contentType: Article['contentType']): Article {
    return {
        id: 'a1',
        domainId: 'd1',
        title: 'Interactive Tool',
        slug: 'interactive-tool',
        metaDescription: 'desc',
        contentMarkdown: '',
        contentHtml: null,
        wordCount: 0,
        targetKeyword: 'keyword',
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
        status: 'draft',
        publishedAt: null,
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
        reviewRequestedAt: null,
        lastReviewedBy: null,
        publishedBy: null,
        contentType,
        calculatorConfig: null,
        comparisonData: null,
        leadGenConfig: null,
        costGuideData: null,
        wizardConfig: {
            steps: [
                {
                    id: 's1',
                    title: 'Step 1',
                    fields: [{ id: 'q1', type: 'radio', label: 'Question', options: [{ value: 'a', label: 'A' }], required: true }],
                },
            ],
            resultRules: [
                { condition: "q1 == 'a'", title: 'Result', body: 'Body' },
            ],
            resultTemplate: 'recommendation',
        },
        geoData: null,
        ctaConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
    } as Article;
}

describe('embed wizard variants', () => {
    it('renders quiz copy and mode class', () => {
        const html = generateEmbedPage(makeWizardArticle('quiz'), 'example.com');
        expect(html).toContain('wizard-mode-quiz');
        expect(html).toContain('See Score');
        expect(html).toContain('Your Score');
    });

    it('renders configurator copy and mode class', () => {
        const html = generateEmbedPage(makeWizardArticle('configurator'), 'example.com');
        expect(html).toContain('wizard-mode-configurator');
        expect(html).toContain('Review Configuration');
        expect(html).toContain('Your Configuration');
    });
});

