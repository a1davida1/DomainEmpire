import { describe, expect, it } from 'vitest';
import {
    assessRevenueVariance,
    summarizePartnerMargins,
} from '@/lib/finance/reconciliation';

describe('finance reconciliation', () => {
    it('flags critical variance when outside double tolerance', () => {
        const assessment = assessRevenueVariance({
            ledgerTotal: 100,
            snapshotTotal: 140,
            toleranceFloor: 5,
            tolerancePct: 0.05,
        });

        expect(assessment.variance).toBe(40);
        expect(assessment.toleranceAmount).toBe(5);
        expect(assessment.status).toBe('critical');
    });

    it('returns null variancePct when ledger is zero and snapshot is non-zero', () => {
        const assessment = assessRevenueVariance({
            ledgerTotal: 0,
            snapshotTotal: 50,
        });

        expect(assessment.variancePct).toBeNull();
        expect(assessment.status).toBe('critical');
    });

    it('summarizes partner margins by partner/channel with deterministic ordering', () => {
        const summary = summarizePartnerMargins([
            { partner: 'Impact', channel: 'affiliate', impact: 'revenue', amount: 120 },
            { partner: 'impact', channel: 'affiliate', impact: 'cost', amount: 25 },
            { partner: 'Sedo', channel: 'parking', impact: 'revenue', amount: 80 },
            { partner: 'Sedo', channel: 'parking', impact: 'cost', amount: 95 },
            { partner: null, channel: null, impact: 'cost', amount: 10 },
        ]);

        expect(summary[0]).toMatchObject({
            partner: 'impact',
            channel: 'affiliate',
            revenue: 120,
            cost: 25,
            margin: 95,
            status: 'profitable',
        });
        expect(summary[1]).toMatchObject({
            partner: 'sedo',
            channel: 'parking',
            revenue: 80,
            cost: 95,
            margin: -15,
            status: 'loss',
        });
        expect(summary[2]).toMatchObject({
            partner: 'unknown',
            channel: null,
            revenue: 0,
            cost: 10,
            margin: -10,
            status: 'loss',
        });
    });
});
