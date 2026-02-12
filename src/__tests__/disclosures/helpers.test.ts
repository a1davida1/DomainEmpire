import { describe, it, expect } from 'vitest';
import { getRequiredDisclosures } from '@/lib/disclosures';

describe('getRequiredDisclosures', () => {
    it('returns affiliate disclosure when has affiliate links', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'none', hasAffiliateLinks: true });
        expect(result).toContain('affiliate');
    });

    it('returns ad disclosure when has ads', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'none', hasAds: true });
        expect(result).toContain('ad');
    });

    it('returns not_advice for high YMYL', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'high' });
        expect(result).toContain('not_advice');
    });

    it('returns not_advice for medium YMYL', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'medium' });
        expect(result).toContain('not_advice');
    });

    it('does not return not_advice for low YMYL', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'low' });
        expect(result).not.toContain('not_advice');
    });

    it('does not return not_advice for none YMYL', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'none' });
        expect(result).not.toContain('not_advice');
    });

    it('returns empty array when no disclosures needed', () => {
        const result = getRequiredDisclosures({ ymylLevel: 'none' });
        expect(result).toEqual([]);
    });

    it('returns multiple disclosures when all apply', () => {
        const result = getRequiredDisclosures({
            ymylLevel: 'high',
            hasAffiliateLinks: true,
            hasAds: true,
        });
        expect(result).toContain('affiliate');
        expect(result).toContain('ad');
        expect(result).toContain('not_advice');
        expect(result).toHaveLength(3);
    });
});
