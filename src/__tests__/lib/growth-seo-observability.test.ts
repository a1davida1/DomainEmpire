import { describe, expect, it } from 'vitest';
import {
    computeStdDev,
    evaluateSeoDomainObservability,
    resolveSeoObservabilityRemediations,
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
        expect(result.remediations.map((item) => item.playbookId)).toEqual(
            expect.arrayContaining(['SEO-002', 'SEO-004']),
        );
    });

    it('returns deterministic remediation mapping for unique flags', () => {
        const remediations = resolveSeoObservabilityRemediations([
            'runtime_failures',
            'runtime_failures',
            'conversion_drop',
        ]);

        expect(remediations).toHaveLength(2);
        expect(remediations[0].playbookId).toBe('SEO-004');
        expect(remediations[1].playbookId).toBe('SEO-003');
        expect(remediations[0].runbookUrl).toContain('/docs/ops/seo-observability-playbooks.md#');
    });
});
