import { afterEach, describe, expect, it } from 'vitest';
import { evaluateGrowthPublishPolicy } from '@/lib/growth/policy';

const originalBannedTerms = process.env.GROWTH_POLICY_BANNED_TERMS;

afterEach(() => {
    process.env.GROWTH_POLICY_BANNED_TERMS = originalBannedTerms;
});

describe('growth publish policy', () => {
    it('normalizes em dash punctuation', () => {
        const result = evaluateGrowthPublishPolicy({
            channel: 'youtube_shorts',
            copy: 'Fast domain pitch — no fluff — clear CTA',
            destinationUrl: 'https://example.com',
        });

        expect(result.allowed).toBe(true);
        expect(result.normalizedCopy.includes('—')).toBe(false);
        expect(result.normalizedCopy).toContain('-');
        expect(result.changes.length).toBeGreaterThan(0);
    });

    it('blocks non-https destination URLs', () => {
        const result = evaluateGrowthPublishPolicy({
            channel: 'pinterest',
            copy: 'Valid copy for publish',
            destinationUrl: 'http://example.com',
        });

        expect(result.allowed).toBe(false);
        expect(result.blockReasons.join(' ')).toContain('https');
    });

    it('blocks banned policy terms', () => {
        process.env.GROWTH_POLICY_BANNED_TERMS = 'gambling, cash app';

        const result = evaluateGrowthPublishPolicy({
            channel: 'pinterest',
            copy: 'This cash app strategy is prohibited',
            destinationUrl: 'https://example.com',
        });

        expect(result.allowed).toBe(false);
        expect(result.blockReasons.join(' ')).toContain('cash app');
    });

    it('blocks excessive hashtags for youtube shorts', () => {
        const copy = '#a #b #c #d #e #f #g #h #i #j #k #l #m';
        const result = evaluateGrowthPublishPolicy({
            channel: 'youtube_shorts',
            copy,
            destinationUrl: 'https://example.com',
        });

        expect(result.allowed).toBe(false);
        expect(result.blockReasons.join(' ')).toContain('hashtags');
    });

    it('warns for high but not blocked hashtag count', () => {
        const copy = '#a #b #c #d #e #f #g';
        const result = evaluateGrowthPublishPolicy({
            channel: 'youtube_shorts',
            copy,
            destinationUrl: 'https://example.com',
        });

        expect(result.allowed).toBe(true);
        expect(result.warnings.join(' ')).toContain('hashtag');
    });
});

