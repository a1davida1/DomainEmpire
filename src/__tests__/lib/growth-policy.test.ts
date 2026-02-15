import { afterEach, describe, expect, it } from 'vitest';
import { evaluateGrowthPublishPolicy } from '@/lib/growth/policy';

const originalBannedTerms = process.env.GROWTH_POLICY_BANNED_TERMS;
const originalDisclosureTokens = process.env.GROWTH_POLICY_DISCLOSURE_TOKENS;
const originalRequireDisclosure = process.env.GROWTH_POLICY_REQUIRE_DISCLOSURE;

afterEach(() => {
    process.env.GROWTH_POLICY_BANNED_TERMS = originalBannedTerms;
    process.env.GROWTH_POLICY_DISCLOSURE_TOKENS = originalDisclosureTokens;
    process.env.GROWTH_POLICY_REQUIRE_DISCLOSURE = originalRequireDisclosure;
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

    it('returns channel policy-pack metadata', () => {
        const result = evaluateGrowthPublishPolicy({
            channel: 'pinterest',
            copy: 'Transparent campaign copy with enough detail for compliance.',
            destinationUrl: 'https://example.com?utm_source=test&utm_medium=social',
        });

        expect(result.policyPackId).toBe('pinterest_core');
        expect(result.policyPackVersion.length).toBeGreaterThan(0);
        expect(result.checksApplied).toEqual(expect.arrayContaining(['hashtag_limits', 'monetization_disclosure']));
    });

    it('warns on monetization cues without disclosure tokens', () => {
        process.env.GROWTH_POLICY_REQUIRE_DISCLOSURE = 'false';
        process.env.GROWTH_POLICY_DISCLOSURE_TOKENS = '#ad,#sponsored';

        const result = evaluateGrowthPublishPolicy({
            channel: 'youtube_shorts',
            copy: 'Top affiliate picks with partner links for this niche.',
            destinationUrl: 'https://example.com?utm_source=test&utm_medium=social',
        });

        expect(result.allowed).toBe(true);
        expect(result.warnings.join(' ')).toContain('lacks explicit disclosure token');
    });

    it('blocks monetization cues when disclosure is required', () => {
        process.env.GROWTH_POLICY_REQUIRE_DISCLOSURE = 'true';
        process.env.GROWTH_POLICY_DISCLOSURE_TOKENS = '#ad,#sponsored';

        const result = evaluateGrowthPublishPolicy({
            channel: 'youtube_shorts',
            copy: 'Paid partnership picks for this week without any disclosure token.',
            destinationUrl: 'https://example.com?utm_source=test&utm_medium=social',
        });

        expect(result.allowed).toBe(false);
        expect(result.blockReasons.join(' ')).toContain('lacks explicit disclosure token');
    });
});
