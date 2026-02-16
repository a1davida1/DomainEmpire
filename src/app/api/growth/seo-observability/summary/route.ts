import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import {
    db,
    domainResearch,
    domains,
    notifications,
    promotionCampaigns,
    promotionEvents,
    revenueSnapshots,
} from '@/lib/db';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { computeStdDev, evaluateSeoDomainObservability } from '@/lib/growth/seo-observability';

const seoObservabilityLimiter = createRateLimiter('growth_seo_observability_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

type ConversionRow = {
    domainId: string;
    period: 'current' | 'prior';
    conversions: number;
};

function parseWindowDays(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(7, Math.min(parsed, 120));
}

function parseLimit(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 100;
    return Math.max(1, Math.min(parsed, 500));
}

function parseDate(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function parseOptionalNumeric(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function parseNotificationDomainId(value: unknown): string | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const raw = record.domainId;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = seoObservabilityLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many SEO observability requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const windowDays = parseWindowDays(request.nextUrl.searchParams.get('windowDays'));
        const limit = parseLimit(request.nextUrl.searchParams.get('limit'));

        const endDate = parseDate(new Date());
        const currentStart = new Date(endDate.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
        const priorStart = new Date(currentStart.getTime() - windowDays * 24 * 60 * 60 * 1000);
        const priorEnd = new Date(currentStart.getTime() - 1);

        const domainRows = await db.select({
            id: domains.id,
            domain: domains.domain,
            createdAt: domains.createdAt,
        })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)))
            .orderBy(desc(domains.createdAt))
            .limit(1000);

        if (domainRows.length === 0) {
            return NextResponse.json({
                windowDays,
                count: 0,
                domains: [],
                summary: {
                    flagCounts: {
                        ranking_volatility: 0,
                        indexation_low: 0,
                        conversion_drop: 0,
                        runtime_failures: 0,
                    },
                    remediationCounts: {},
                },
                generatedAt: new Date().toISOString(),
            }, { headers: rate.headers });
        }

        const domainIds = domainRows.map((row) => row.id);
        const [snapshotRows, conversionRows, runtimeFailureRows] = await Promise.all([
            db.select({
                domainId: revenueSnapshots.domainId,
                snapshotDate: revenueSnapshots.snapshotDate,
                avgPosition: revenueSnapshots.avgPosition,
                impressions: revenueSnapshots.impressions,
                clicks: revenueSnapshots.clicks,
            })
                .from(revenueSnapshots)
                .where(and(
                    inArray(revenueSnapshots.domainId, domainIds),
                    gte(revenueSnapshots.snapshotDate, priorStart),
                    lte(revenueSnapshots.snapshotDate, endDate),
                ))
                .orderBy(desc(revenueSnapshots.snapshotDate))
                .limit(100000),
            db.select({
                domainId: domainResearch.domainId,
                period: sql<'current' | 'prior'>`case when ${promotionEvents.occurredAt} >= ${currentStart} then 'current' else 'prior' end`,
                conversions: sql<number>`sum(case when ${promotionEvents.eventType} = 'conversion' then 1 else 0 end)::int`,
            })
                .from(promotionEvents)
                .innerJoin(promotionCampaigns, eq(promotionEvents.campaignId, promotionCampaigns.id))
                .innerJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
                .where(and(
                    inArray(domainResearch.domainId, domainIds),
                    gte(promotionEvents.occurredAt, priorStart),
                    lte(promotionEvents.occurredAt, endDate),
                    eq(promotionEvents.eventType, 'conversion'),
                ))
                .groupBy(domainResearch.domainId, sql`case when ${promotionEvents.occurredAt} >= ${currentStart} then 'current' else 'prior' end`) as Promise<ConversionRow[]>,
            db.select({
                domainId: notifications.domainId,
                metadata: notifications.metadata,
                count: sql<number>`count(*)::int`,
            })
                .from(notifications)
                .where(and(
                    eq(notifications.type, 'deploy_failed'),
                    gte(notifications.createdAt, currentStart),
                    or(
                        inArray(notifications.domainId, domainIds),
                        and(
                            isNull(notifications.domainId),
                            inArray(sql<string>`${notifications.metadata} ->> 'domainId'`, domainIds),
                        ),
                    ),
                ))
                .groupBy(notifications.domainId, notifications.metadata),
        ]);

        const snapshotByDomain = new Map<string, typeof snapshotRows>();
        for (const row of snapshotRows) {
            if (!snapshotByDomain.has(row.domainId)) {
                snapshotByDomain.set(row.domainId, []);
            }
            snapshotByDomain.get(row.domainId)!.push(row);
        }

        const conversionsByDomain = new Map<string, { current: number; prior: number }>();
        for (const row of conversionRows) {
            if (!row.domainId) continue;
            if (!conversionsByDomain.has(row.domainId)) {
                conversionsByDomain.set(row.domainId, { current: 0, prior: 0 });
            }
            const baseline = conversionsByDomain.get(row.domainId)!;
            if (row.period === 'current') {
                baseline.current = Number(row.conversions) || 0;
            } else {
                baseline.prior = Number(row.conversions) || 0;
            }
        }

        const runtimeFailuresByDomain = new Map<string, number>();
        for (const row of runtimeFailureRows) {
            const directDomainId = row.domainId;
            const metadataDomainId = parseNotificationDomainId(row.metadata);
            const domainId = directDomainId ?? metadataDomainId;
            if (!domainId) continue;
            runtimeFailuresByDomain.set(
                domainId,
                (runtimeFailuresByDomain.get(domainId) || 0) + (Number(row.count) || 0),
            );
        }

        const domainsSummary = domainRows.map((domainRow) => {
            const domainSnapshots = snapshotByDomain.get(domainRow.id) ?? [];
            const currentSnapshots = domainSnapshots.filter((row) => row.snapshotDate >= currentStart);
            const priorSnapshots = domainSnapshots.filter((row) => row.snapshotDate >= priorStart && row.snapshotDate <= priorEnd);

            const currentPositions = currentSnapshots
                .map((row) => parseOptionalNumeric(row.avgPosition))
                .filter((value): value is number => value !== null);
            const priorPositions = priorSnapshots
                .map((row) => parseOptionalNumeric(row.avgPosition))
                .filter((value): value is number => value !== null);

            const latestSnapshot = currentSnapshots[0] ?? null;
            const latestAvgPosition = latestSnapshot ? parseOptionalNumeric(latestSnapshot.avgPosition) : null;
            const priorAvgPosition = priorPositions.length > 0
                ? priorPositions.reduce((sum, value) => sum + value, 0) / priorPositions.length
                : null;

            const impressionsCurrent = currentSnapshots.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
            const clicksCurrent = currentSnapshots.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
            const conversion = conversionsByDomain.get(domainRow.id) ?? { current: 0, prior: 0 };
            const runtimeFailures = runtimeFailuresByDomain.get(domainRow.id) ?? 0;
            const stdDevPosition = computeStdDev(currentPositions);

            const observability = evaluateSeoDomainObservability({
                impressionsCurrent,
                clicksCurrent,
                currentConversions: conversion.current,
                priorConversions: conversion.prior,
                runtimeFailures,
                latestAvgPosition,
                priorAvgPosition,
                stdDevPosition,
            });

            const priority = observability.flags.includes('runtime_failures')
                ? 100
                : observability.flags.includes('conversion_drop')
                    ? 90
                    : observability.flags.includes('ranking_volatility')
                        ? 70
                        : observability.flags.includes('indexation_low')
                            ? 50
                            : 10;

            return {
                domainId: domainRow.id,
                domain: domainRow.domain,
                ranking: {
                    stdDevPosition,
                    latestAvgPosition,
                    priorAvgPosition: priorAvgPosition !== null ? Number(priorAvgPosition.toFixed(3)) : null,
                    delta: observability.rankingDelta,
                },
                indexation: {
                    impressionsCurrent,
                    clicksCurrent,
                    ctrPct: observability.ctrPct,
                },
                conversion: {
                    currentConversions: conversion.current,
                    priorConversions: conversion.prior,
                    deltaPct: observability.conversionDeltaPct,
                },
                runtime: {
                    deployFailures: runtimeFailures,
                },
                flags: observability.flags,
                remediations: observability.remediations,
                priority,
            };
        })
            .sort((left, right) => right.priority - left.priority)
            .slice(0, limit);

        const flagCounts = domainsSummary.reduce<Record<string, number>>((acc, row) => {
            for (const flag of row.flags) {
                acc[flag] = (acc[flag] || 0) + 1;
            }
            return acc;
        }, {
            ranking_volatility: 0,
            indexation_low: 0,
            conversion_drop: 0,
            runtime_failures: 0,
        });

        const remediationCounts = domainsSummary.reduce<Record<string, number>>((acc, row) => {
            for (const remediation of row.remediations) {
                acc[remediation.playbookId] = (acc[remediation.playbookId] || 0) + 1;
            }
            return acc;
        }, {});

        return NextResponse.json({
            windowDays,
            count: domainsSummary.length,
            domains: domainsSummary,
            summary: {
                flagCounts,
                remediationCounts,
            },
            generatedAt: new Date().toISOString(),
        }, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to load SEO observability summary:', error);
        return NextResponse.json(
            { error: 'Failed to load SEO observability summary' },
            { status: 500, headers: rate.headers },
        );
    }
}
