import { describe, it, expect } from 'vitest';
import { scoreBrandQuality } from '@/lib/evaluation/brand-scorer';

describe('scoreBrandQuality', () => {
    it('gives higher score to shorter, memorable domains', () => {
        const short = scoreBrandQuality('invest.com', 'finance');
        const long = scoreBrandQuality('best-personal-finance-investment-tips-online.com', 'finance');
        expect(short.score).toBeGreaterThan(long.score);
    });

    it('scores .com higher than unusual TLDs', () => {
        const com = scoreBrandQuality('legalhelp.com', 'legal');
        const xyz = scoreBrandQuality('legalhelp.xyz', 'legal');
        expect(com.score).toBeGreaterThanOrEqual(xyz.score);
    });

    it('returns score between 0 and 100', () => {
        const result = scoreBrandQuality('test-domain.com', 'general');
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('penalizes domains with many hyphens', () => {
        const noHyphens = scoreBrandQuality('healthguide.com', 'health');
        const manyHyphens = scoreBrandQuality('best-health-guide-tips-online.com', 'health');
        expect(noHyphens.score).toBeGreaterThan(manyHyphens.score);
    });

    it('handles niche keyword matching', () => {
        const withKeyword = scoreBrandQuality('legalhelp.com', 'legal');
        const withoutKeyword = scoreBrandQuality('bluesky.com', 'legal');
        // Keyword-rich domain should score higher due to keyword bonus
        expect(withKeyword.score).toBeGreaterThan(withoutKeyword.score);
    });
});
