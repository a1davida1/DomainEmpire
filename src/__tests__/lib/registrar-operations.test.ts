import { describe, expect, it } from 'vitest';
import {
    computeRegistrarExpirationRisk,
    computeRenewalRoiRecommendation,
} from '@/lib/domain/registrar-operations';

describe('computeRegistrarExpirationRisk', () => {
    it('returns unknown when renewal date is missing', () => {
        const result = computeRegistrarExpirationRisk({
            renewalDate: null,
            autoRenewEnabled: true,
            transferStatus: 'none',
            now: new Date('2026-02-15T00:00:00.000Z'),
        });

        expect(result.risk).toBe('unknown');
        expect(result.daysUntilRenewal).toBeNull();
    });

    it('returns critical risk when renewal is inside 7 days', () => {
        const result = computeRegistrarExpirationRisk({
            renewalDate: '2026-02-20T00:00:00.000Z',
            autoRenewEnabled: true,
            transferStatus: 'none',
            now: new Date('2026-02-15T00:00:00.000Z'),
        });

        expect(result.risk).toBe('critical');
        expect(result.daysUntilRenewal).toBe(5);
        expect(result.renewalWindow).toBe('within_7_days');
    });

    it('escalates risk when auto-renew is disabled and transfer is pending', () => {
        const result = computeRegistrarExpirationRisk({
            renewalDate: '2026-04-10T00:00:00.000Z',
            autoRenewEnabled: false,
            transferStatus: 'pending',
            now: new Date('2026-02-15T00:00:00.000Z'),
        });

        expect(result.risk).toBe('high');
        expect(result.riskScore).toBeGreaterThanOrEqual(70);
    });

    it('returns expired when renewal date is in the past', () => {
        const result = computeRegistrarExpirationRisk({
            renewalDate: '2026-02-10T00:00:00.000Z',
            autoRenewEnabled: false,
            transferStatus: 'none',
            now: new Date('2026-02-15T00:00:00.000Z'),
        });

        expect(result.risk).toBe('expired');
        expect(result.renewalWindow).toBe('expired');
        expect(result.riskScore).toBe(100);
    });
});

describe('computeRenewalRoiRecommendation', () => {
    it('returns renew when revenue coverage is strong', () => {
        const result = computeRenewalRoiRecommendation({
            renewalPrice: 20,
            trailingRevenue90d: 80,
            trailingCost90d: 10,
            risk: 'low',
            daysUntilRenewal: 40,
        });

        expect(result.band).toBe('renew');
        expect(result.coverageRatio).toBeGreaterThanOrEqual(2);
    });

    it('returns review when risk is critical even with moderate coverage', () => {
        const result = computeRenewalRoiRecommendation({
            renewalPrice: 25,
            trailingRevenue90d: 32,
            trailingCost90d: 5,
            risk: 'critical',
            daysUntilRenewal: 3,
        });

        expect(result.band).toBe('review');
    });

    it('returns insufficient_data when renewal price is missing', () => {
        const result = computeRenewalRoiRecommendation({
            renewalPrice: null,
            trailingRevenue90d: 50,
            trailingCost90d: 10,
            risk: 'unknown',
            daysUntilRenewal: null,
        });

        expect(result.band).toBe('insufficient_data');
        expect(result.coverageRatio).toBeNull();
    });
});
