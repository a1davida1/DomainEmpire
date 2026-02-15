import { describe, expect, it } from 'vitest';
import { generateQuizPage } from '@/lib/deploy/templates/wizard';
import type { Article } from '@/lib/db/schema';
import type { PageShell } from '@/lib/deploy/templates/shared';

function makeArticle(): Article {
    return {
        id: 'art-1',
        domainId: 'dom-1',
        title: 'Readiness Quiz',
        slug: 'readiness-quiz',
        metaDescription: 'Quiz page',
        contentMarkdown: '',
        contentHtml: null,
        wordCount: 0,
        targetKeyword: 'readiness quiz',
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
        contentType: 'quiz',
        calculatorConfig: null,
        comparisonData: null,
        leadGenConfig: null,
        costGuideData: null,
        wizardConfig: {
            steps: [
                {
                    id: 's1',
                    title: 'Step 1',
                    fields: [
                        {
                            id: 'goal',
                            type: 'radio',
                            label: 'Goal',
                            options: [{ value: 'save', label: 'Save' }],
                            required: true,
                        },
                    ],
                },
            ],
            resultRules: [],
            resultTemplate: 'score',
            scoring: {
                method: 'weighted',
                weights: { goal: 100 },
                valueMap: { goal: { save: 95 } },
                outcomes: [{ min: 90, max: 100, title: 'Excellent', body: 'Great fit.' }],
            },
        },
        geoData: null,
        ctaConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
    } as Article;
}

function makeShell(): PageShell {
    return {
        siteTitle: 'Example',
        headScripts: '',
        bodyScripts: '',
        headerHtml: '<header></header>',
        footerHtml: '<footer></footer>',
        sidebarHtml: '',
        hasSidebar: false,
    };
}

describe('wizard mode scoring rendering', () => {
    it('renders quiz mode with scoring payload and outcome evaluator', async () => {
        const html = await generateQuizPage(makeArticle(), 'example.com', null, [], makeShell());
        expect(html).toContain('data-wizard-mode="quiz"');
        expect(html).toContain('"valueMap":{"goal":{"save":95}}');
        expect(html).toContain('"outcomes":[{"min":90,"max":100,"title":"Excellent","body":"Great fit."}]');
        expect(html).toContain('function getScoreOutcome(score)');
    });
});

