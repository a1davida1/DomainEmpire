import { describe, expect, it } from 'vitest';
import { assessMaxThresholdSlo, assessSuccessRateSlo } from '@/lib/growth/slo';

describe('growth slo helpers', () => {
    it('marks success-rate SLO as healthy under 50% budget burn', () => {
        const result = assessSuccessRateSlo({
            successRate: 0.985,
            target: 0.97,
        });

        expect(result.status).toBe('healthy');
        expect(result.burnPct).not.toBeNull();
        expect((result.burnPct ?? 0) <= 50).toBe(true);
    });

    it('marks success-rate SLO as critical when budget burn exceeds 100%', () => {
        const result = assessSuccessRateSlo({
            successRate: 0.9,
            target: 0.97,
        });

        expect(result.status).toBe('critical');
        expect((result.burnPct ?? 0) > 100).toBe(true);
    });

    it('marks max-threshold SLO as warning within budget over 50%', () => {
        const result = assessMaxThresholdSlo({
            actual: 4,
            maxThreshold: 6,
        });

        expect(result.status).toBe('warning');
        expect((result.burnPct ?? 0) > 50).toBe(true);
        expect((result.burnPct ?? 0) <= 100).toBe(true);
    });
});
