import { describe, expect, it } from 'vitest';
import { computeRegistrarExpirationRisk } from '@/lib/domain/registrar-operations';

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
