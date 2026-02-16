/**
 * Tests for per-block AI prompt templates and block pipeline utilities.
 */

import { describe, it, expect } from 'vitest';
import {
    getBlockPrompt,
    isAiGeneratableBlock,
    AI_GENERATABLE_BLOCK_TYPES,
    STRUCTURAL_BLOCK_TYPES,
    type BlockPromptContext,
} from '@/lib/ai/block-prompts';
import type { BlockType } from '@/lib/deploy/blocks/schemas';

// ============================================================
// Test Helpers
// ============================================================

function makeCtx(overrides?: Partial<BlockPromptContext>): BlockPromptContext {
    return {
        keyword: 'best home insurance',
        domainName: 'homeinsuranceguide.com',
        niche: 'insurance',
        siteTitle: 'Home Insurance Guide',
        researchData: {
            statistics: [{ stat: '43% of claims denied', source: 'NAIC 2025' }],
        },
        ...overrides,
    };
}

// ============================================================
// Prompt Generation
// ============================================================

describe('Block Prompt Generation', () => {
    const ctx = makeCtx();

    it('returns null for structural block types', () => {
        for (const type of STRUCTURAL_BLOCK_TYPES) {
            expect(getBlockPrompt(type, ctx)).toBeNull();
        }
    });

    it('returns a prompt string for AI-generatable types', () => {
        for (const type of AI_GENERATABLE_BLOCK_TYPES) {
            const prompt = getBlockPrompt(type, ctx);
            expect(prompt).not.toBeNull();
            expect(typeof prompt).toBe('string');
            expect(prompt!.length).toBeGreaterThan(50);
        }
    });

    it('Hero prompt includes keyword and domain', () => {
        const prompt = getBlockPrompt('Hero', ctx)!;
        expect(prompt).toContain('best home insurance');
        expect(prompt).toContain('homeinsuranceguide.com');
        expect(prompt).toContain('heading');
        expect(prompt).toContain('subheading');
        expect(prompt).toContain('JSON');
    });

    it('ArticleBody prompt includes anti-AI rules', () => {
        const prompt = getBlockPrompt('ArticleBody', ctx)!;
        expect(prompt).toContain('ANTI-AI');
        expect(prompt).toContain('delve');
        expect(prompt).toContain('markdown');
    });

    it('ArticleBody prompt includes voice instructions when voiceSeed provided', () => {
        const ctxWithVoice = makeCtx({
            voiceSeed: {
                name: 'Sarah',
                background: 'Former claims adjuster',
                quirk: 'Uses parenthetical asides',
                toneDial: 7,
                tangents: 'Personal anecdotes',
                petPhrase: 'here\'s the thing',
                formatting: 'Short paragraphs',
            },
        });
        const prompt = getBlockPrompt('ArticleBody', ctxWithVoice)!;
        expect(prompt).toContain('Sarah');
        expect(prompt).toContain('Former claims adjuster');
        expect(prompt).toContain('parenthetical asides');
    });

    it('FAQ prompt asks for JSON array of items', () => {
        const prompt = getBlockPrompt('FAQ', ctx)!;
        expect(prompt).toContain('items');
        expect(prompt).toContain('question');
        expect(prompt).toContain('answer');
        expect(prompt).toContain('JSON');
    });

    it('ComparisonTable prompt includes options/columns/verdict structure', () => {
        const prompt = getBlockPrompt('ComparisonTable', ctx)!;
        expect(prompt).toContain('options');
        expect(prompt).toContain('columns');
        expect(prompt).toContain('verdict');
        expect(prompt).toContain('scores');
    });

    it('QuoteCalculator prompt includes inputs/outputs/formula', () => {
        const prompt = getBlockPrompt('QuoteCalculator', ctx)!;
        expect(prompt).toContain('inputs');
        expect(prompt).toContain('outputs');
        expect(prompt).toContain('formula');
        expect(prompt).toContain('assumptions');
    });

    it('CostBreakdown prompt includes ranges and factors', () => {
        const prompt = getBlockPrompt('CostBreakdown', ctx)!;
        expect(prompt).toContain('ranges');
        expect(prompt).toContain('factors');
        expect(prompt).toContain('low');
        expect(prompt).toContain('high');
    });

    it('LeadForm prompt includes fields and consent', () => {
        const prompt = getBlockPrompt('LeadForm', ctx)!;
        expect(prompt).toContain('fields');
        expect(prompt).toContain('consentText');
        expect(prompt).toContain('successMessage');
    });

    it('Wizard prompt includes steps and resultRules', () => {
        const prompt = getBlockPrompt('Wizard', ctx)!;
        expect(prompt).toContain('steps');
        expect(prompt).toContain('resultRules');
        expect(prompt).toContain('condition');
        expect(prompt).toContain('resultTemplate');
    });

    it('StatGrid prompt includes items with metrics', () => {
        const prompt = getBlockPrompt('StatGrid', ctx)!;
        expect(prompt).toContain('items');
        expect(prompt).toContain('metricValue');
        expect(prompt).toContain('group');
    });

    it('InteractiveMap prompt includes regions', () => {
        const prompt = getBlockPrompt('InteractiveMap', ctx)!;
        expect(prompt).toContain('regions');
        expect(prompt).toContain('defaultRegion');
    });

    it('CitationBlock prompt includes sources', () => {
        const prompt = getBlockPrompt('CitationBlock', ctx)!;
        expect(prompt).toContain('sources');
        expect(prompt).toContain('publisher');
    });

    it('RankingList prompt includes ranked items', () => {
        const prompt = getBlockPrompt('RankingList', ctx)!;
        expect(prompt).toContain('rank');
        expect(prompt).toContain('rating');
    });

    it('ProsConsCard prompt includes pros/cons', () => {
        const prompt = getBlockPrompt('ProsConsCard', ctx)!;
        expect(prompt).toContain('pros');
        expect(prompt).toContain('cons');
        expect(prompt).toContain('rating');
    });

    it('PricingTable prompt includes plans', () => {
        const prompt = getBlockPrompt('PricingTable', ctx)!;
        expect(prompt).toContain('plans');
        expect(prompt).toContain('features');
        expect(prompt).toContain('highlighted');
    });

    it('DataTable prompt includes headers and rows', () => {
        const prompt = getBlockPrompt('DataTable', ctx)!;
        expect(prompt).toContain('headers');
        expect(prompt).toContain('rows');
        expect(prompt).toContain('caption');
    });

    it('VsCard prompt includes itemA/itemB/verdict', () => {
        const prompt = getBlockPrompt('VsCard', ctx)!;
        expect(prompt).toContain('itemA');
        expect(prompt).toContain('itemB');
        expect(prompt).toContain('verdict');
    });

    it('TestimonialGrid prompt includes testimonials', () => {
        const prompt = getBlockPrompt('TestimonialGrid', ctx)!;
        expect(prompt).toContain('testimonials');
        expect(prompt).toContain('quote');
        expect(prompt).toContain('author');
    });

    it('prompts include research data when provided', () => {
        const prompt = getBlockPrompt('FAQ', ctx)!;
        expect(prompt).toContain('43% of claims denied');
    });

    it('prompts work without research data', () => {
        const ctxNoResearch = makeCtx({ researchData: null });
        const prompt = getBlockPrompt('FAQ', ctxNoResearch)!;
        expect(prompt).toBeDefined();
        expect(prompt.length).toBeGreaterThan(50);
    });
});

// ============================================================
// isAiGeneratableBlock
// ============================================================

describe('isAiGeneratableBlock', () => {
    it('returns true for content blocks', () => {
        expect(isAiGeneratableBlock('Hero')).toBe(true);
        expect(isAiGeneratableBlock('ArticleBody')).toBe(true);
        expect(isAiGeneratableBlock('FAQ')).toBe(true);
        expect(isAiGeneratableBlock('ComparisonTable')).toBe(true);
        expect(isAiGeneratableBlock('Wizard')).toBe(true);
    });

    it('returns false for structural blocks', () => {
        expect(isAiGeneratableBlock('Header')).toBe(false);
        expect(isAiGeneratableBlock('Footer')).toBe(false);
        expect(isAiGeneratableBlock('Sidebar')).toBe(false);
    });

    it('AI_GENERATABLE_BLOCK_TYPES has no overlap with STRUCTURAL_BLOCK_TYPES', () => {
        for (const type of AI_GENERATABLE_BLOCK_TYPES) {
            expect(STRUCTURAL_BLOCK_TYPES).not.toContain(type);
        }
    });

    it('AI_GENERATABLE_BLOCK_TYPES covers all expected content blocks', () => {
        const expected: BlockType[] = [
            'Hero', 'ArticleBody', 'FAQ', 'ComparisonTable', 'QuoteCalculator',
            'CostBreakdown', 'LeadForm', 'CTABanner', 'Wizard', 'StatGrid',
            'InteractiveMap', 'CitationBlock', 'RankingList', 'ProsConsCard',
            'TestimonialGrid', 'PricingTable', 'DataTable', 'VsCard',
            'Checklist', 'AuthorBio', 'TrustBadges', 'MedicalDisclaimer',
        ];
        for (const type of expected) {
            expect(AI_GENERATABLE_BLOCK_TYPES).toContain(type);
        }
    });
});
