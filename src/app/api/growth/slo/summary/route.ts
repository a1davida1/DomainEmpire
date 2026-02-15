import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
    evaluateGrowthLaunchFreeze,
    getGrowthLaunchFreezePostmortemSlaSummary,
    getGrowthSloWindowSummary,
} from '@/lib/growth/launch-freeze';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const sloSummaryLimiter = createRateLimiter('growth_slo_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function parseWindowHours(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 24 * 7;
    return Math.max(6, Math.min(parsed, 24 * 30));
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const rate = sloSummaryLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many SLO summary requests. Please retry shortly.' },
            {
                status: 429,
                headers: rate.headers,
            },
        );
    }

    try {
        const url = new URL(request.url);
        const windowHours = parseWindowHours(url.searchParams.get('windowHours'));
        const now = new Date();
        const [summary, launchFreeze, postmortemSla] = await Promise.all([
            getGrowthSloWindowSummary({ windowHours, now }),
            evaluateGrowthLaunchFreeze({ now }),
            getGrowthLaunchFreezePostmortemSlaSummary({ now }),
        ]);

        return NextResponse.json({
            windowHours,
            publish: summary.publish,
            moderation: summary.moderation,
            syncFreshness: summary.syncFreshness,
            overallStatus: summary.overallStatus,
            launchFreeze: {
                active: launchFreeze.active,
                rawActive: launchFreeze.rawActive,
                recoveryHoldActive: launchFreeze.recoveryHoldActive,
                recoveryHealthyWindows: launchFreeze.recoveryHealthyWindows,
                recoveryHealthyWindowsRequired: launchFreeze.recoveryHealthyWindowsRequired,
                level: launchFreeze.level,
                reasonCodes: launchFreeze.reasonCodes,
                blockedChannels: launchFreeze.blockedChannels,
                blockedActions: launchFreeze.blockedActions,
                overrideActive: launchFreeze.overrideActive,
                overrideId: launchFreeze.overrideId,
                overrideExpiresAt: launchFreeze.overrideExpiresAt,
                overrideReason: launchFreeze.overrideReason,
                windowHours: launchFreeze.windowSummaries.map((item) => item.windowHours),
            },
            postmortemSla,
            generatedAt: now.toISOString(),
        });
    } catch (error) {
        console.error('Failed to load growth SLO summary:', error);
        return NextResponse.json(
            { error: 'Failed to load growth SLO summary' },
            { status: 500 },
        );
    }
}
