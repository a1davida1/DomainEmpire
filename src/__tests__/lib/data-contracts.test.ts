import { describe, expect, it } from 'vitest';
import {
    evaluateRevenueRollupContract,
    evaluateRevenueSnapshotRowContract,
} from '@/lib/data/contracts';

describe('data contracts', () => {
    it('detects row-level revenue component mismatches', () => {
        const row = evaluateRevenueSnapshotRowContract({
            adRevenue: 10,
            affiliateRevenue: 10,
            leadGenRevenue: 5,
            totalRevenue: 40,
            clicks: 50,
            impressions: 100,
        });

        expect(row.valid).toBe(false);
        expect(row.violations).toContain('revenue_components_mismatch');
    });

    it('detects invalid traffic metrics', () => {
        const row = evaluateRevenueSnapshotRowContract({
            adRevenue: 10,
            affiliateRevenue: 10,
            leadGenRevenue: 5,
            totalRevenue: 25,
            clicks: 120,
            impressions: 100,
        });

        expect(row.valid).toBe(false);
        expect(row.violations).toContain('clicks_exceed_impressions');
    });

    it('returns critical rollup status for large variance', () => {
        const rollup = evaluateRevenueRollupContract({
            ledgerTotal: 100,
            snapshotTotal: 180,
            toleranceFloor: 5,
            tolerancePct: 0.05,
        });

        expect(rollup.status).toBe('critical');
        expect(rollup.variance).toBe(80);
    });
});
