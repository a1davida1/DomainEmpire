import { describe, it, expect } from 'vitest';
import { detectNiche, getNicheProfile, estimateRevenue, detectSubNiche } from '@/lib/evaluation/niche-data';

describe('detectNiche', () => {
    it('detects legal niche from domain with legal keywords', () => {
        expect(detectNiche('personalinjurylawyer.com')).toBe('legal');
        expect(detectNiche('injury-claim-help.com')).toBe('legal');
    });

    it('detects insurance niche', () => {
        expect(detectNiche('autoinsurancequotes.com')).toBe('insurance');
        expect(detectNiche('best-coverage-plans.com')).toBe('insurance');
    });

    it('detects health niche', () => {
        expect(detectNiche('healthwellness.com')).toBe('health');
        expect(detectNiche('mental-health-therapy.com')).toBe('health');
    });

    it('detects finance niche', () => {
        expect(detectNiche('investingfortomorrow.com')).toBe('finance');
        expect(detectNiche('credit-score-tips.com')).toBe('finance');
    });

    it('detects tech niche', () => {
        expect(detectNiche('cybersecurityguide.com')).toBe('tech');
        expect(detectNiche('best-saas-tools.com')).toBe('tech');
    });

    it('returns general for unrecognized domains', () => {
        expect(detectNiche('xyzabc123.com')).toBe('general');
        expect(detectNiche('randomdomain.io')).toBe('general');
    });

    it('does not false-positive short keywords', () => {
        // "ai" should not match in "claim" (middle of word)
        // But should match in "ai-tools"
        const claimResult = detectNiche('claimhelp.com');
        expect(claimResult).not.toBe('tech'); // "ai" is inside "claim"

        const aiResult = detectNiche('ai-tools.com');
        expect(aiResult).toBe('tech');
    });

    it('handles multi-keyword domains correctly', () => {
        // Domain with keywords from multiple niches — should pick the one with most matches
        expect(detectNiche('health-insurance-quotes.com')).toBe('insurance');
    });
});

describe('detectSubNiche', () => {
    it('detects personal injury sub-niche', () => {
        expect(detectSubNiche('injuryaccidentclaim.com', 'legal')).toBe('personal-injury');
    });

    it('detects auto insurance sub-niche', () => {
        expect(detectSubNiche('carinsurance.com', 'insurance')).toBe('auto-insurance');
    });

    it('detects cybersecurity sub-niche', () => {
        expect(detectSubNiche('cybersecurityvpn.com', 'tech')).toBe('cybersecurity');
    });

    it('returns undefined for unknown sub-niche', () => {
        expect(detectSubNiche('randomstuff.com', 'legal')).toBeUndefined();
    });

    it('returns undefined for niche without sub-niche map', () => {
        expect(detectSubNiche('anything.com', 'general')).toBeUndefined();
    });
});

describe('getNicheProfile', () => {
    it('returns correct profile for known niches', () => {
        const legal = getNicheProfile('legal');
        expect(legal.ymyl).toBe(true);
        expect(legal.rpmRange[0]).toBeGreaterThan(0);
    });

    it('falls back to general for unknown niche', () => {
        const profile = getNicheProfile('nonexistent');
        expect(profile).toBeDefined();
        expect(profile.rpmRange).toBeDefined();
    });
});

describe('estimateRevenue', () => {
    it('returns positive revenue for reasonable traffic', () => {
        const revenue = estimateRevenue('tech', 10000);
        expect(revenue.total).toBeGreaterThan(0);
        expect(revenue.display).toBeGreaterThanOrEqual(0);
        expect(revenue.affiliate).toBeGreaterThanOrEqual(0);
        expect(revenue.leadgen).toBeGreaterThanOrEqual(0);
    });

    it('returns zero for zero traffic', () => {
        const revenue = estimateRevenue('legal', 0);
        expect(revenue.total).toBe(0);
    });

    it('high-RPM niches yield higher revenue than low-RPM', () => {
        const legalRev = estimateRevenue('legal', 10000);
        const generalRev = estimateRevenue('general', 10000);
        expect(legalRev.total).toBeGreaterThan(generalRev.total);
    });

    it('primary model gets higher weight than secondary', () => {
        // Legal niche: bestModels = ['leadgen', 'display', 'affiliate']
        // leadgen should be weighted at 100%, display at 40%
        const rev = estimateRevenue('legal', 10000);
        expect(rev.leadgen).toBeGreaterThan(rev.display);
    });
});
