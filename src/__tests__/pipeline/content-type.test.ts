import { describe, it, expect } from 'vitest';

// Mirror the getContentType function from pipeline.ts (word-boundary version)
type ContentType =
    | 'article'
    | 'comparison'
    | 'calculator'
    | 'cost_guide'
    | 'lead_capture'
    | 'health_decision'
    | 'checklist'
    | 'faq'
    | 'review'
    | 'wizard'
    | 'quiz'
    | 'survey'
    | 'assessment'
    | 'configurator'
    | 'interactive_infographic'
    | 'interactive_map';

type Rule = { type: ContentType; match: RegExp; reject?: RegExp };

const RULES: Rule[] = [
    { type: 'quiz', match: /\bquiz\b|knowledge check|test yourself/ },
    { type: 'survey', match: /\bsurvey\b|\bquestionnaire\b|\bpoll\b/ },
    { type: 'assessment', match: /\bassessment\b|\bself[- ]assessment\b|score yourself/ },
    { type: 'configurator', match: /\bconfigurator\b|build your own|customize/ },
    { type: 'interactive_infographic', match: /\binfographic\b|data visualization|visual breakdown/ },
    { type: 'interactive_map', match: /\binteractive map\b|map by state|regional map/ },
    { type: 'comparison', match: /\bvs\b|\bversus\b|compared to/ },
    { type: 'calculator', match: /\bcalculator\b|\bestimator\b|\bcompute\b/ },
    { type: 'calculator', match: /\btool\b/, reject: /\btoolkit\b|\btoolbox\b/ },
    { type: 'cost_guide', match: /\bcost\b|\bprice\b|how much|\bfee\b/ },
    { type: 'lead_capture', match: /\blawyer\b|\battorney\b|get a quote/ },
    { type: 'lead_capture', match: /\bclaim\b/, reject: /claim to/ },
    { type: 'lead_capture', match: /\bcase\b/, reject: /case study|showcase/ },
    { type: 'health_decision', match: /\bsafe\b|side effects|\btreatment\b|\bsymptom|\bdiagnosis\b/ },
    { type: 'faq', match: /\bfaq\b|\bquestions\b|q&a|\banswered\b/ },
    { type: 'checklist', match: /\bchecklist\b|step by step|steps to/ },
    { type: 'review', match: /\breview\b/ },
    { type: 'review', match: /\bbest\s/, reject: /best practice|best way to/ },
    { type: 'review', match: /\btop\s\d/ },
];

function getContentType(keyword: string): ContentType {
    const lower = keyword.toLowerCase();
    for (const rule of RULES) {
        if (rule.match.test(lower) && !rule.reject?.test(lower)) {
            return rule.type;
        }
    }
    return 'article';
}

describe('getContentType', () => {
    it('detects comparison keywords', () => {
        expect(getContentType('term life vs whole life insurance')).toBe('comparison');
        expect(getContentType('roth versus traditional IRA')).toBe('comparison');
        expect(getContentType('medicare advantage compared to medigap')).toBe('comparison');
    });

    it('detects quiz keywords', () => {
        expect(getContentType('retirement readiness quiz')).toBe('quiz');
        expect(getContentType('medicare knowledge check')).toBe('quiz');
    });

    it('detects survey keywords', () => {
        expect(getContentType('small business owner survey')).toBe('survey');
        expect(getContentType('insurance questionnaire')).toBe('survey');
    });

    it('detects assessment keywords', () => {
        expect(getContentType('risk tolerance assessment')).toBe('assessment');
        expect(getContentType('self-assessment for debt')).toBe('assessment');
    });

    it('detects configurator keywords', () => {
        expect(getContentType('solar plan configurator')).toBe('configurator');
        expect(getContentType('build your own insurance plan')).toBe('configurator');
    });

    it('detects interactive infographic keywords', () => {
        expect(getContentType('mortgage fee infographic')).toBe('interactive_infographic');
        expect(getContentType('visual breakdown of treatment costs')).toBe('interactive_infographic');
    });

    it('detects interactive map keywords', () => {
        expect(getContentType('benefits map by state')).toBe('interactive_map');
        expect(getContentType('interactive map for tax rates')).toBe('interactive_map');
    });

    it('detects calculator keywords', () => {
        expect(getContentType('mortgage calculator')).toBe('calculator');
        expect(getContentType('retirement savings estimator')).toBe('calculator');
        expect(getContentType('compound interest compute')).toBe('calculator');
        expect(getContentType('BMI calculation tool')).toBe('calculator');
    });

    it('detects cost guide keywords', () => {
        expect(getContentType('how much does a divorce cost')).toBe('cost_guide');
        expect(getContentType('home inspection price')).toBe('cost_guide');
        expect(getContentType('attorney fee for bankruptcy')).toBe('cost_guide');
    });

    it('detects lead capture keywords', () => {
        expect(getContentType('personal injury lawyer near me')).toBe('lead_capture');
        expect(getContentType('file a workers comp claim')).toBe('lead_capture');
        expect(getContentType('get a quote for car insurance')).toBe('lead_capture');
    });

    it('detects health decision keywords', () => {
        expect(getContentType('is melatonin safe for kids')).toBe('health_decision');
        expect(getContentType('metformin side effects')).toBe('health_decision');
        expect(getContentType('best treatment for sciatica')).toBe('health_decision');
        expect(getContentType('lung cancer diagnosis stages')).toBe('health_decision');
    });

    it('detects FAQ keywords', () => {
        expect(getContentType('medicare faq')).toBe('faq');
        expect(getContentType('frequently asked questions about 401k')).toBe('faq');
        expect(getContentType('common questions answered about HSA')).toBe('faq');
    });

    it('detects checklist keywords', () => {
        expect(getContentType('home buying checklist')).toBe('checklist');
        expect(getContentType('step by step guide to filing taxes')).toBe('checklist');
        expect(getContentType('steps to refinance your mortgage')).toBe('checklist');
    });

    it('detects review keywords', () => {
        expect(getContentType('best credit cards 2024')).toBe('review');
        expect(getContentType('top 10 budgeting apps')).toBe('review');
        expect(getContentType('lemonade insurance review')).toBe('review');
    });

    it('falls back to article for generic keywords', () => {
        expect(getContentType('what is compound interest')).toBe('article');
        expect(getContentType('understanding health insurance')).toBe('article');
        expect(getContentType('retirement planning guide')).toBe('article');
    });

    // Word-boundary false-positive prevention
    it('does not match "Elvis" as comparison (no "vs" false positive)', () => {
        expect(getContentType('Elvis Presley biography')).toBe('article');
    });

    it('does not match "case study" as lead capture', () => {
        expect(getContentType('marketing case study analysis')).toBe('article');
    });

    it('does not match "showcase" as lead capture', () => {
        expect(getContentType('portfolio showcase design')).toBe('article');
    });

    it('does not match "best practices" as review', () => {
        expect(getContentType('best practices for password security')).toBe('article');
    });

    it('does not match "best way to" as review', () => {
        expect(getContentType('best way to learn programming')).toBe('article');
    });

    it('does not match "toolkit" as calculator', () => {
        expect(getContentType('developer toolkit essentials')).toBe('article');
    });

    it('does not match "top" without a number as review', () => {
        expect(getContentType('top of the line insurance')).toBe('article');
    });

    it('matches "top 5" as review', () => {
        expect(getContentType('top 5 mutual funds')).toBe('review');
    });
});
