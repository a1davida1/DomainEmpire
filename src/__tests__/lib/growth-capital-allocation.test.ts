import { describe, expect, it } from 'vitest';
import { evaluateCapitalAllocation } from '@/lib/growth/capital-allocation';

describe('growth capital allocation', () => {
    it('returns pause when hard loss limits are exceeded', () => {
        const result = evaluateCapitalAllocation({
            spend: 400,
            revenue: 100,
            leads: 10,
            clicks: 200,
            windowDays: 30,
            dailyLoss: 180,
            weeklyLoss: 900,
            dailyLossLimit: 150,
            weeklyLossLimit: 750,
        });

        expect(result.band).toBe('pause');
        expect(result.hardLimited).toBe(true);
        expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('returns scale for strong economics', () => {
        const result = evaluateCapitalAllocation({
            spend: 1200,
            revenue: 4200,
            leads: 80,
            clicks: 2000,
            windowDays: 30,
            dailyLoss: 0,
            weeklyLoss: 0,
            dailyLossLimit: 150,
            weeklyLossLimit: 750,
        });

        expect(result.band).toBe('scale');
        expect(result.cacLtvRatio).not.toBeNull();
        expect((result.cacLtvRatio ?? 0)).toBeLessThan(0.6);
    });

    it('returns optimize for marginal efficiency', () => {
        const result = evaluateCapitalAllocation({
            spend: 2000,
            revenue: 2200,
            leads: 40,
            clicks: 900,
            windowDays: 30,
            dailyLoss: 20,
            weeklyLoss: 90,
            dailyLossLimit: 150,
            weeklyLossLimit: 750,
        });

        expect(result.band).toBe('optimize');
        expect(result.hardLimited).toBe(false);
    });

    it('returns pause for zero leads with high spend', () => {
        const result = evaluateCapitalAllocation({
            spend: 100,
            revenue: 10,
            leads: 0,
            clicks: 200,
            windowDays: 30,
            dailyLoss: 60,
            weeklyLoss: 200,
            dailyLossLimit: 100,
            weeklyLossLimit: 500,
        });

        expect(result.band).toBe('pause');
        expect(result.hardLimited).toBe(false);
    });
});
