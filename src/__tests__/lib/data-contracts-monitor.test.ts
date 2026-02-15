import { describe, expect, it } from 'vitest';
import { classifyRevenueContractDomain } from '@/lib/data/contracts-monitor';

describe('data contracts monitor', () => {
    it('returns critical when rollup is critical', () => {
        const status = classifyRevenueContractDomain({
            rollupStatus: 'critical',
            rowViolationCount: 0,
        });
        expect(status).toBe('critical');
    });

    it('returns warning when row violations exist despite matched rollup', () => {
        const status = classifyRevenueContractDomain({
            rollupStatus: 'matched',
            rowViolationCount: 2,
        });
        expect(status).toBe('warning');
    });

    it('returns pass when no row issues and rollup matched', () => {
        const status = classifyRevenueContractDomain({
            rollupStatus: 'matched',
            rowViolationCount: 0,
        });
        expect(status).toBe('pass');
    });
});
