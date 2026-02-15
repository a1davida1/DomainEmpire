import { NextRequest, NextResponse } from 'next/server';
import { gte, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import {
    db,
    domainFinanceLedgerEntries,
    domains,
    revenueSnapshots,
} from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { scoreDomainRoiPriority } from '@/lib/domain/roi-prioritization';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const roiPriorityLimiter = createRateLimiter('domain_roi_priority', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

function parseLimit(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.max(1, Math.min(parsed, 200));
}

function parseWindowDays(value: string | null): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(7, Math.min(parsed, 120));
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = request.headers.get('x-user-id') || 'unknown';
    const rate = roiPriorityLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many ROI priority requests. Please retry shortly.' },
            {
                status: 429,
                headers: rate.headers,
            },
        );
    }

    try {
        const limit = parseLimit(request.nextUrl.searchParams.get('limit'));
        const windowDays = parseWindowDays(request.nextUrl.searchParams.get('windowDays'));
        const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

        const domainRows = await db.select({
            id: domains.id,
            domain: domains.domain,
            lifecycleState: domains.lifecycleState,
            status: domains.status,
            updatedAt: domains.updatedAt,
        })
            .from(domains)
            .where(notDeleted(domains))
            .limit(5000);

        const ledgerRollups = await db.select({
            domainId: domainFinanceLedgerEntries.domainId,
            revenue30d: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            cost30d: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'cost' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
        })
            .from(domainFinanceLedgerEntries)
            .where(gte(domainFinanceLedgerEntries.entryDate, windowStart))
            .groupBy(domainFinanceLedgerEntries.domainId);

        const trafficRollups = await db.select({
            domainId: revenueSnapshots.domainId,
            pageviews30d: sql<number>`sum(coalesce(${revenueSnapshots.pageviews}, 0))::int`,
            clicks30d: sql<number>`sum(coalesce(${revenueSnapshots.clicks}, 0))::int`,
        })
            .from(revenueSnapshots)
            .where(gte(revenueSnapshots.snapshotDate, windowStart))
            .groupBy(revenueSnapshots.domainId);

        const ledgerByDomain = new Map(ledgerRollups.map((row) => [row.domainId, row]));
        const trafficByDomain = new Map(trafficRollups.map((row) => [row.domainId, row]));

        const prioritized = domainRows.map((domainRow) => {
            const ledger = ledgerByDomain.get(domainRow.id);
            const traffic = trafficByDomain.get(domainRow.id);

            const score = scoreDomainRoiPriority({
                lifecycleState: domainRow.lifecycleState,
                revenue30d: Number(ledger?.revenue30d ?? 0),
                cost30d: Number(ledger?.cost30d ?? 0),
                pageviews30d: Number(traffic?.pageviews30d ?? 0),
                clicks30d: Number(traffic?.clicks30d ?? 0),
            });

            return {
                domainId: domainRow.id,
                domain: domainRow.domain,
                lifecycleState: domainRow.lifecycleState,
                status: domainRow.status,
                updatedAt: domainRow.updatedAt,
                score: score.score,
                action: score.action,
                reasons: score.reasons,
                revenue30d: Number(ledger?.revenue30d ?? 0),
                cost30d: Number(ledger?.cost30d ?? 0),
                net30d: score.net30d,
                roiPct: score.roiPct,
                pageviews30d: Number(traffic?.pageviews30d ?? 0),
                clicks30d: Number(traffic?.clicks30d ?? 0),
                ctrPct: score.ctrPct,
            };
        })
            .sort((left, right) => right.score - left.score)
            .slice(0, limit);

        const actionCounts = prioritized.reduce<Record<string, number>>((acc, row) => {
            acc[row.action] = (acc[row.action] || 0) + 1;
            return acc;
        }, {});

        return NextResponse.json({
            windowDays,
            count: prioritized.length,
            actionCounts,
            priorities: prioritized,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to load domain ROI priorities:', error);
        return NextResponse.json(
            { error: 'Failed to load domain ROI priorities' },
            { status: 500 },
        );
    }
}
