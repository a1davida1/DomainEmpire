import { NextRequest, NextResponse } from 'next/server';
import { and, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { getRequestUser, requireAuth } from '@/lib/auth';
import {
    db,
    integrationSyncRuns,
    mediaModerationTasks,
    promotionEvents,
} from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { assessMaxThresholdSlo, assessSuccessRateSlo, type SloStatus } from '@/lib/growth/slo';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const EVENT_TYPES = ['published', 'publish_blocked', 'publish_failed'] as const;
const sloSummaryLimiter = createRateLimiter('growth_slo_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function parseWindowHours(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 24 * 7;
    return Math.max(6, Math.min(parsed, 24 * 30));
}

function combineStatus(statuses: SloStatus[]): SloStatus {
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    if (statuses.includes('healthy')) return 'healthy';
    return 'unknown';
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
        const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

        const [eventCounts] = await db.select({
            publishedCount: sql<number>`count(*) filter (where ${promotionEvents.eventType} = 'published')::int`,
            blockedCount: sql<number>`count(*) filter (where ${promotionEvents.eventType} = 'publish_blocked')::int`,
            failedCount: sql<number>`count(*) filter (where ${promotionEvents.eventType} = 'publish_failed')::int`,
        })
            .from(promotionEvents)
            .where(and(
                gte(promotionEvents.occurredAt, windowStart),
                inArray(promotionEvents.eventType, EVENT_TYPES),
            ));

        const publishedCount = eventCounts?.publishedCount ?? 0;
        const blockedCount = eventCounts?.blockedCount ?? 0;
        const failedCount = eventCounts?.failedCount ?? 0;
        const evaluatedCount = publishedCount + blockedCount + failedCount;
        const publishSuccessRate = evaluatedCount > 0 ? publishedCount / evaluatedCount : null;

        const publishSlo = assessSuccessRateSlo({
            successRate: publishSuccessRate,
            target: 0.97,
        });

        const [moderationCounts] = await db.select({
            dueCount: sql<number>`count(*) filter (where ${mediaModerationTasks.dueAt} is not null)::int`,
            onTimeCount: sql<number>`count(*) filter (where ${mediaModerationTasks.dueAt} is not null and coalesce(${mediaModerationTasks.reviewedAt}, now()) <= ${mediaModerationTasks.dueAt})::int`,
            lateCount: sql<number>`count(*) filter (where ${mediaModerationTasks.dueAt} is not null and coalesce(${mediaModerationTasks.reviewedAt}, now()) > ${mediaModerationTasks.dueAt})::int`,
        })
            .from(mediaModerationTasks)
            .where(gte(mediaModerationTasks.createdAt, windowStart));

        const moderationDueCount = moderationCounts?.dueCount ?? 0;
        const moderationOnTimeCount = moderationCounts?.onTimeCount ?? 0;
        const moderationLateCount = moderationCounts?.lateCount ?? 0;
        const moderationOnTimeRate = moderationDueCount > 0
            ? moderationOnTimeCount / moderationDueCount
            : null;

        const moderationSlo = assessSuccessRateSlo({
            successRate: moderationOnTimeRate,
            target: 0.95,
        });

        const [syncLagRow] = await db.select({
            latestCompletedAt: sql<Date | null>`max(${integrationSyncRuns.completedAt})`,
        })
            .from(integrationSyncRuns)
            .where(isNotNull(integrationSyncRuns.completedAt));

        const latestCompletedAt = syncLagRow?.latestCompletedAt ?? null;
        const lagHours = latestCompletedAt
            ? Math.max(0, (now.getTime() - latestCompletedAt.getTime()) / (60 * 60 * 1000))
            : null;
        const freshnessSlo = assessMaxThresholdSlo({
            actual: lagHours,
            maxThreshold: 6,
        });

        const overallStatus = combineStatus([
            publishSlo.status,
            moderationSlo.status,
            freshnessSlo.status,
        ]);

        return NextResponse.json({
            windowHours,
            publish: {
                targetSuccessRate: publishSlo.target,
                evaluatedCount,
                publishedCount,
                blockedCount,
                failedCount,
                successRate: publishSlo.actual,
                failureRate: publishSlo.failureRate,
                burnPct: publishSlo.burnPct,
                status: publishSlo.status,
            },
            moderation: {
                targetOnTimeRate: moderationSlo.target,
                dueCount: moderationDueCount,
                onTimeCount: moderationOnTimeCount,
                lateCount: moderationLateCount,
                onTimeRate: moderationSlo.actual,
                lateRate: moderationSlo.failureRate,
                burnPct: moderationSlo.burnPct,
                status: moderationSlo.status,
            },
            syncFreshness: {
                maxLagHours: freshnessSlo.maxThreshold,
                latestCompletedAt: latestCompletedAt?.toISOString() ?? null,
                lagHours,
                burnPct: freshnessSlo.burnPct,
                status: freshnessSlo.status,
            },
            overallStatus,
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
