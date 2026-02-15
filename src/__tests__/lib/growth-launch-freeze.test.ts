import { describe, expect, it } from 'vitest';
import {
    applyGrowthLaunchFreezeRecoveryPolicy,
    deriveGrowthLaunchFreezeState,
    resolveGrowthLaunchFreezeConfig,
    shouldBlockGrowthLaunchForScope,
    type GrowthSloWindowSummary,
} from '@/lib/growth/launch-freeze';

function buildWindowSummary(overrides?: Partial<GrowthSloWindowSummary>): GrowthSloWindowSummary {
    return {
        windowHours: 24,
        publish: {
            targetSuccessRate: 0.97,
            evaluatedCount: 100,
            publishedCount: 95,
            blockedCount: 3,
            failedCount: 2,
            successRate: 0.95,
            failureRate: 0.05,
            burnPct: 60,
            status: 'warning',
        },
        moderation: {
            targetOnTimeRate: 0.95,
            dueCount: 20,
            onTimeCount: 19,
            lateCount: 1,
            onTimeRate: 0.95,
            lateRate: 0.05,
            burnPct: 100,
            status: 'warning',
        },
        syncFreshness: {
            maxLagHours: 6,
            latestCompletedAt: null,
            lagHours: 4,
            burnPct: 66.67,
            status: 'warning',
        },
        overallStatus: 'warning',
        generatedAt: '2026-02-15T00:00:00.000Z',
        ...(overrides || {}),
    };
}

describe('growth launch freeze', () => {
    it('resolves safe launch-freeze defaults', () => {
        const config = resolveGrowthLaunchFreezeConfig({});
        expect(config.enabled).toBe(true);
        expect(config.warningBurnPct).toBe(50);
        expect(config.criticalBurnPct).toBe(100);
        expect(config.windowHours).toEqual([24, 168]);
        expect(config.blockedChannels).toEqual(['pinterest', 'youtube_shorts']);
        expect(config.blockedActions).toEqual(['scale', 'optimize', 'recover', 'incubate']);
        expect(config.recoveryHealthyWindowsRequired).toBe(2);
    });

    it('activates freeze when burn exceeds the critical threshold', () => {
        const state = deriveGrowthLaunchFreezeState({
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['pinterest', 'youtube_shorts'],
                blockedActions: ['scale', 'optimize', 'recover', 'incubate'],
                recoveryHealthyWindowsRequired: 2,
            },
            windowSummaries: [
                buildWindowSummary({
                    publish: {
                        targetSuccessRate: 0.97,
                        evaluatedCount: 100,
                        publishedCount: 90,
                        blockedCount: 5,
                        failedCount: 5,
                        successRate: 0.9,
                        failureRate: 0.1,
                        burnPct: 333.33,
                        status: 'critical',
                    },
                }),
            ],
        });

        expect(state.active).toBe(true);
        expect(state.rawActive).toBe(true);
        expect(state.level).toBe('critical');
        expect(state.reasonCodes).toContain('publish_burn_critical_24h');
    });

    it('stays unfrozen when only warning burn is present', () => {
        const state = deriveGrowthLaunchFreezeState({
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['pinterest', 'youtube_shorts'],
                blockedActions: ['scale', 'optimize', 'recover', 'incubate'],
                recoveryHealthyWindowsRequired: 2,
            },
            windowSummaries: [buildWindowSummary()],
        });

        expect(state.active).toBe(false);
        expect(state.rawActive).toBe(false);
        expect(state.level).toBe('warning');
        expect(state.reasonCodes).toContain('publish_burn_warning_24h');
    });

    it('keeps freeze active during recovery hold until required healthy windows pass', () => {
        const rawState = deriveGrowthLaunchFreezeState({
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['pinterest', 'youtube_shorts'],
                blockedActions: ['scale', 'optimize', 'recover', 'incubate'],
                recoveryHealthyWindowsRequired: 2,
            },
            windowSummaries: [buildWindowSummary()],
        });

        const held = applyGrowthLaunchFreezeRecoveryPolicy({
            rawState,
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['pinterest', 'youtube_shorts'],
                blockedActions: ['scale', 'optimize', 'recover', 'incubate'],
                recoveryHealthyWindowsRequired: 2,
            },
            previousAudit: {
                active: true,
                rawActive: true,
                recoveryHoldActive: false,
                recoveryHealthyWindows: 0,
                level: 'critical',
                reasonCodes: ['publish_burn_critical_24h'],
                recordedAt: '2026-02-15T00:00:00.000Z',
            },
        });

        expect(held.active).toBe(true);
        expect(held.recoveryHoldActive).toBe(true);
        expect(held.recoveryHealthyWindows).toBe(1);
        expect(held.reasonCodes).toContain('recovery_hold');
    });

    it('applies scope policy to freeze blocking decisions', () => {
        const state = deriveGrowthLaunchFreezeState({
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['youtube_shorts'],
                blockedActions: ['scale'],
                recoveryHealthyWindowsRequired: 2,
            },
            windowSummaries: [
                buildWindowSummary({
                    publish: {
                        targetSuccessRate: 0.97,
                        evaluatedCount: 100,
                        publishedCount: 90,
                        blockedCount: 5,
                        failedCount: 5,
                        successRate: 0.9,
                        failureRate: 0.1,
                        burnPct: 333.33,
                        status: 'critical',
                    },
                }),
            ],
        });

        const blocked = shouldBlockGrowthLaunchForScope({
            state,
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['youtube_shorts'],
                blockedActions: ['scale'],
                recoveryHealthyWindowsRequired: 2,
            },
            scope: {
                channels: ['youtube_shorts'],
                action: 'scale',
            },
        });
        const allowed = shouldBlockGrowthLaunchForScope({
            state,
            config: {
                enabled: true,
                warningBurnPct: 50,
                criticalBurnPct: 100,
                windowHours: [24],
                blockedChannels: ['youtube_shorts'],
                blockedActions: ['scale'],
                recoveryHealthyWindowsRequired: 2,
            },
            scope: {
                channels: ['pinterest'],
                action: 'recover',
            },
        });

        expect(blocked).toBe(true);
        expect(allowed).toBe(false);
    });
});
