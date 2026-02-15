import { describe, expect, it } from 'vitest';
import {
    buildDomainMetricsWindow,
    deriveDomainMetricsTrend,
    pctDelta,
} from '@/lib/domain/metrics-pipeline';

describe('domain metrics pipeline', () => {
    it('builds normalized window metrics', () => {
        const window = buildDomainMetricsWindow({
            pageviews: 1000,
            clicks: 50,
            avgPositionSum: 120,
            avgPositionCount: 10,
            revenue: 123.456,
        });

        expect(window.pageviews).toBe(1000);
        expect(window.clicks).toBe(50);
        expect(window.ctr).toBe(0.05);
        expect(window.avgPosition).toBe(12);
        expect(window.revenue).toBe(123.46);
    });

    it('computes percent deltas safely', () => {
        expect(pctDelta(120, 100)).toBe(20);
        expect(pctDelta(0, 0)).toBe(0);
        expect(pctDelta(10, 0)).toBeNull();
    });

    it('labels a strong trend as surging', () => {
        const trend = deriveDomainMetricsTrend({
            current: {
                pageviews: 2000,
                clicks: 140,
                ctr: 0.07,
                avgPosition: 8,
                revenue: 500,
            },
            previous: {
                pageviews: 1200,
                clicks: 60,
                ctr: 0.05,
                avgPosition: 13,
                revenue: 250,
            },
        });

        expect(trend.status).toBe('surging');
        expect(trend.score).toBeGreaterThan(30);
    });
});
