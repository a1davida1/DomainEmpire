import { describe, expect, it } from 'vitest';
import {
    computeStdDev,
    evaluateSeoDomainObservability,
} from '@/lib/growth/seo-observability';

describe('growth seo observability', () => {
    it('computes standard deviation for ranking series', () => {
        const stdDev = computeStdDev([10, 12, 8, 11, 9]);
        expect(stdDev).toBeGreaterThan(0);
    });

    it('flags ranking volatility and conversion drop', () => {
        const result = evaluateSeoDomainObservability({
            impressionsCurrent: 1200,
            clicksCurrent: 110,
            currentConversions: 20,
            priorConversions: 60,
            runtimeFailures: 0,
            latestAvgPosition: 18,
            priorAvgPosition: 10,
            stdDevPosition: 9.5,
        });

        expect(result.flags).toContain('ranking_volatility');
        expect(result.flags).toContain('conversion_drop');
    });

    it('flags runtime failures and low indexation', () => {
        const result = evaluateSeoDomainObservability({
            impressionsCurrent: 40,
            clicksCurrent: 2,
            currentConversions: 0,
            priorConversions: 0,
            runtimeFailures: 4,
            latestAvgPosition: null,
            priorAvgPosition: null,
            stdDevPosition: 0,
        });

        expect(result.flags).toContain('runtime_failures');
        expect(result.flags).toContain('indexation_low');
    });
});
