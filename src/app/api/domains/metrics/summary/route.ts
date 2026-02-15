import { NextRequest, NextResponse } from 'next/server';
import { and, asc, gte, inArray, lte } from 'drizzle-orm';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, domains, revenueSnapshots } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
    buildDomainMetricsWindow,
    deriveDomainMetricsTrend,
    pctDelta,
} from '@/lib/domain/metrics-pipeline';

const metricsLimiter = createRateLimiter('domain_metrics_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

const DOMAIN_QUERY_LIMIT = 5000;
const SNAPSHOT_DOMAIN_CHUNK_SIZE = 500;

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function asNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = getRequestUser(request).id.trim();
    if (!userId) {
        return NextResponse.json(
            { error: 'Missing authenticated user identity' },
            { status: 401 },
        );
    }

    const rate = metricsLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many metrics summary requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const windowDays = parseIntParam(request.nextUrl.searchParams.get('windowDays'), 30, 7, 120);
        const limit = parseIntParam(request.nextUrl.searchParams.get('limit'), 100, 1, 500);

        const now = new Date();
        const currentStart = new Date(now.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
        const priorEnd = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
        const priorStart = new Date(priorEnd.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);

        const domainRows = await db.select({
            id: domains.id,
            domain: domains.domain,
            lifecycleState: domains.lifecycleState,
            status: domains.status,
            niche: domains.niche,
        })
            .from(domains)
            .where(notDeleted(domains))
            .orderBy(asc(domains.id))
            .limit(DOMAIN_QUERY_LIMIT);

        const domainsTruncated = domainRows.length >= DOMAIN_QUERY_LIMIT;

        if (domainRows.length === 0) {
            return NextResponse.json({
                windowDays,
                count: 0,
                domainsTruncated: false,
                domains: [],
                summary: {
                    statusCounts: {
                        surging: 0,
                        improving: 0,
                        steady: 0,
                        declining: 0,
                    },
                },
                generatedAt: new Date().toISOString(),
            }, { headers: rate.headers });
        }

        const domainIds = domainRows.map((row) => row.id);
        const snapshotRows: Array<{
            domainId: string;
            snapshotDate: Date;
            pageviews: number | null;
            clicks: number | null;
            avgPosition: string | number | null;
            totalRevenue: string | number | null;
        }> = [];

        for (let start = 0; start < domainIds.length; start += SNAPSHOT_DOMAIN_CHUNK_SIZE) {
            const chunk = domainIds.slice(start, start + SNAPSHOT_DOMAIN_CHUNK_SIZE);
            if (chunk.length === 0) continue;

            const chunkRows = await db.select({
                domainId: revenueSnapshots.domainId,
                snapshotDate: revenueSnapshots.snapshotDate,
                pageviews: revenueSnapshots.pageviews,
                clicks: revenueSnapshots.clicks,
                avgPosition: revenueSnapshots.avgPosition,
                totalRevenue: revenueSnapshots.totalRevenue,
            })
                .from(revenueSnapshots)
                .where(and(
                    inArray(revenueSnapshots.domainId, chunk),
                    gte(revenueSnapshots.snapshotDate, priorStart),
                    lte(revenueSnapshots.snapshotDate, now),
                ));

            snapshotRows.push(...chunkRows);
        }

        const byDomain = new Map<string, typeof snapshotRows>();
        for (const row of snapshotRows) {
            if (!byDomain.has(row.domainId)) byDomain.set(row.domainId, []);
            byDomain.get(row.domainId)!.push(row);
        }

        const rows = domainRows.map((domainRow) => {
            const snapshots = byDomain.get(domainRow.id) ?? [];

            let currentPageviews = 0;
            let currentClicks = 0;
            let currentAvgPositionSum = 0;
            let currentAvgPositionCount = 0;
            let currentRevenue = 0;

            let priorPageviews = 0;
            let priorClicks = 0;
            let priorAvgPositionSum = 0;
            let priorAvgPositionCount = 0;
            let priorRevenue = 0;

            for (const snapshot of snapshots) {
                const ts = snapshot.snapshotDate.getTime();
                const pageviews = Number(snapshot.pageviews ?? 0);
                const clicks = Number(snapshot.clicks ?? 0);
                const avgPosition = asNumber(snapshot.avgPosition);
                const hasAvgPosition = snapshot.avgPosition !== null && snapshot.avgPosition !== undefined;
                const revenue = asNumber(snapshot.totalRevenue);

                if (ts >= currentStart.getTime() && ts <= now.getTime()) {
                    currentPageviews += pageviews;
                    currentClicks += clicks;
                    currentRevenue += revenue;
                    if (hasAvgPosition) {
                        currentAvgPositionSum += avgPosition;
                        currentAvgPositionCount += 1;
                    }
                } else if (ts >= priorStart.getTime() && ts <= priorEnd.getTime()) {
                    priorPageviews += pageviews;
                    priorClicks += clicks;
                    priorRevenue += revenue;
                    if (hasAvgPosition) {
                        priorAvgPositionSum += avgPosition;
                        priorAvgPositionCount += 1;
                    }
                }
            }

            const currentWindow = buildDomainMetricsWindow({
                pageviews: currentPageviews,
                clicks: currentClicks,
                avgPositionSum: currentAvgPositionSum,
                avgPositionCount: currentAvgPositionCount,
                revenue: currentRevenue,
            });
            const priorWindow = buildDomainMetricsWindow({
                pageviews: priorPageviews,
                clicks: priorClicks,
                avgPositionSum: priorAvgPositionSum,
                avgPositionCount: priorAvgPositionCount,
                revenue: priorRevenue,
            });

            const trend = deriveDomainMetricsTrend({
                current: currentWindow,
                previous: priorWindow,
            });

            return {
                domainId: domainRow.id,
                domain: domainRow.domain,
                niche: domainRow.niche,
                lifecycleState: domainRow.lifecycleState,
                status: domainRow.status,
                current: currentWindow,
                previous: priorWindow,
                deltas: {
                    pageviewsPct: pctDelta(currentWindow.pageviews, priorWindow.pageviews),
                    clicksPct: pctDelta(currentWindow.clicks, priorWindow.clicks),
                    ctrPct: pctDelta(currentWindow.ctr, priorWindow.ctr),
                    avgPositionDelta: currentWindow.avgPosition !== null && priorWindow.avgPosition !== null
                        ? round(priorWindow.avgPosition - currentWindow.avgPosition, 2)
                        : null,
                    revenuePct: pctDelta(currentWindow.revenue, priorWindow.revenue),
                },
                trend,
            };
        });

        const sortedRows = rows
            .sort((left, right) => right.trend.score - left.trend.score);

        const statusCounts = sortedRows.reduce<Record<'surging' | 'improving' | 'steady' | 'declining', number>>((acc, row) => {
            acc[row.trend.status] += 1;
            return acc;
        }, {
            surging: 0,
            improving: 0,
            steady: 0,
            declining: 0,
        });

        const rowsLimited = sortedRows.slice(0, limit);

        return NextResponse.json({
            windowDays,
            count: rowsLimited.length,
            domainsTruncated,
            domains: rowsLimited,
            summary: {
                statusCounts,
            },
            generatedAt: new Date().toISOString(),
        }, { headers: rate.headers });
    } catch (error) {
        console.error('Failed to generate domain metrics summary:', error);
        return NextResponse.json(
            { error: 'Failed to generate domain metrics summary' },
            { status: 500, headers: rate.headers },
        );
    }
}
