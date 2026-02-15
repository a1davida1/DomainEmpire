import { describe, expect, it } from 'vitest';
import { scoreDomainRoiPriority } from '@/lib/domain/roi-prioritization';

describe('domain roi prioritization', () => {
    it('recommends scale for high-performing monetized domains', () => {
        const result = scoreDomainRoiPriority({
            lifecycleState: 'monetized',
            revenue30d: 3200,
            cost30d: 900,
            pageviews30d: 12000,
            clicks30d: 520,
        });

        expect(result.action).toBe('scale');
        expect(result.score).toBeGreaterThanOrEqual(75);
        expect(result.net30d).toBeGreaterThan(0);
    });

    it('recommends recover for negative net but high traffic', () => {
        const result = scoreDomainRoiPriority({
            lifecycleState: 'growth',
            revenue30d: 300,
            cost30d: 1200,
            pageviews30d: 8000,
            clicks30d: 120,
        });

        expect(result.action).toBe('recover');
        expect(result.net30d).toBeLessThan(0);
    });
});
