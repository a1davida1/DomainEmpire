import { describe, expect, it } from 'vitest';
import { evaluateExperimentDecision } from '@/lib/ab-testing/decision-gates';

describe('ab decision gates', () => {
    it('recommends scale_winner for significant positive lift', () => {
        const decision = evaluateExperimentDecision({
            variants: [
                { id: 'control', value: 'A', impressions: 10000, clicks: 1200, conversions: 800 },
                { id: 'variant', value: 'B', impressions: 10000, clicks: 1400, conversions: 960 },
            ],
            startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        });

        expect(decision.action).toBe('scale_winner');
        expect(decision.liftPct).toBeGreaterThan(5);
        expect(decision.confidencePct).toBeGreaterThan(95);
    });

    it('recommends stop_loser for significant negative lift', () => {
        const decision = evaluateExperimentDecision({
            variants: [
                { id: 'control', value: 'A', impressions: 10000, clicks: 1500, conversions: 1000 },
                { id: 'variant', value: 'B', impressions: 10000, clicks: 1200, conversions: 850 },
            ],
            startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        });

        expect(decision.action).toBe('stop_loser');
        expect(decision.liftPct).toBeLessThan(-5);
        expect(decision.confidencePct).toBeGreaterThan(95);
    });

    it('recommends continue_collecting when sample is too small', () => {
        const decision = evaluateExperimentDecision({
            variants: [
                { id: 'control', value: 'A', impressions: 120, clicks: 20, conversions: 8 },
                { id: 'variant', value: 'B', impressions: 120, clicks: 24, conversions: 11 },
            ],
            startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        });

        expect(decision.action).toBe('continue_collecting');
        expect(typeof decision.reason).toBe('string');
        expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('recommends rebalance_holdout when holdout share is too low', () => {
        const decision = evaluateExperimentDecision({
            variants: [
                { id: 'control', value: 'A', impressions: 220, clicks: 22, conversions: 10 },
                { id: 'variant', value: 'B', impressions: 5200, clicks: 650, conversions: 300 },
            ],
            startedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        });

        expect(decision.totalImpressions).toBeGreaterThanOrEqual(1000);
        expect(decision.holdoutSharePct).toBeLessThan(10);
        expect(decision.action).toBe('rebalance_holdout');
    });

    it('sanitizes NaN config overrides instead of propagating invalid thresholds', () => {
        const decision = evaluateExperimentDecision({
            variants: [
                { id: 'control', value: 'A', impressions: 500, clicks: 55, conversions: 22 },
                { id: 'variant', value: 'B', impressions: 500, clicks: 60, conversions: 24 },
            ],
            startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            config: {
                minTotalImpressions: Number.NaN,
                minVariantImpressions: Number.NaN,
                maxDurationDays: Number.NaN,
            },
        });

        expect(decision.action).toBe('continue_collecting');
        expect(typeof decision.reason).toBe('string');
        expect(decision.reason.length).toBeGreaterThan(0);
    });

    it('throws when duplicate variant ids are provided', () => {
        expect(() => evaluateExperimentDecision({
            variants: [
                { id: 'dup', value: 'A', impressions: 1000, clicks: 100, conversions: 50 },
                { id: 'dup', value: 'B', impressions: 1000, clicks: 110, conversions: 55 },
            ],
            startedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        })).toThrow(/Duplicate variant id detected/);
    });
});
