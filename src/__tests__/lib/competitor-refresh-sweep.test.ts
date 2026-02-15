import { describe, expect, it } from 'vitest';
import {
    resolveCompetitorRefreshSweepConfig,
    runCompetitorRefreshSweep,
} from '@/lib/competitors/refresh-sweep';

describe('competitor refresh sweep', () => {
    it('resolves safe defaults', () => {
        const config = resolveCompetitorRefreshSweepConfig({});

        expect(config.enabled).toBe(false);
        expect(config.staleHours).toBe(48);
        expect(config.limit).toBe(20);
        expect(config.emitGapAlerts).toBe(true);
        expect(config.gapMinVolume).toBe(500);
        expect(config.gapTopN).toBe(5);
    });

    it('parses configured values', () => {
        const config = resolveCompetitorRefreshSweepConfig({
            GROWTH_COMPETITOR_SWEEP_ENABLED: 'true',
            GROWTH_COMPETITOR_SWEEP_STALE_HOURS: '72',
            GROWTH_COMPETITOR_SWEEP_LIMIT: '50',
            GROWTH_COMPETITOR_SWEEP_GAP_ALERTS_ENABLED: 'false',
            GROWTH_COMPETITOR_SWEEP_GAP_MIN_VOLUME: '900',
            GROWTH_COMPETITOR_SWEEP_GAP_TOP_N: '8',
        });

        expect(config.enabled).toBe(true);
        expect(config.staleHours).toBe(72);
        expect(config.limit).toBe(50);
        expect(config.emitGapAlerts).toBe(false);
        expect(config.gapMinVolume).toBe(900);
        expect(config.gapTopN).toBe(8);
    });

    it('short-circuits when disabled and not forced', async () => {
        const summary = await runCompetitorRefreshSweep({
            enabled: false,
            force: false,
        });

        expect(summary.enabled).toBe(false);
        expect(summary.scanned).toBe(0);
        expect(summary.refreshed).toBe(0);
        expect(summary.failed).toBe(0);
        expect(summary.gapAlerts).toBe(0);
    });
});
