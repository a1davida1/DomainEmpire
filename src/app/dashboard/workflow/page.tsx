import Link from 'next/link';
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    articles,
    contentQueue,
    db,
    domainLifecycleEvents,
    domainResearch,
    domains,
    integrationConnections,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DomainRow = {
    id: string;
    domain: string;
    lifecycleState: string;
    status: string;
    isDeployed: boolean | null;
    purchaseDate: Date | null;
    createdAt: Date | null;
};

type DomainActionType =
    | 'research'
    | 'acquire'
    | 'seed'
    | 'deploy'
    | 'queue_failed'
    | 'queue_active';

type DomainAction = {
    domainId: string;
    domain: string;
    action: DomainActionType;
    summary: string;
    details: string;
    href: string;
    priority: number;
};

type GlobalBlocker = {
    key: string;
    title: string;
    detail: string;
    severity: 'critical' | 'warning' | 'info';
    owner: 'Ops' | 'Research' | 'Acquisition' | 'Content' | 'Deploy' | 'Integrations';
    href: string;
    actionLabel: string;
};

type DailyBlockerTrend = {
    dayKey: string;
    label: string;
    failedJobs: number;
    completedJobs: number;
    researchAdded: number;
    lifecycleMoves: number;
};

const ACTION_META: Record<DomainActionType, { label: string; className: string }> = {
    research: { label: 'Research', className: 'bg-blue-100 text-blue-800' },
    acquire: { label: 'Acquire', className: 'bg-violet-100 text-violet-800' },
    seed: { label: 'Seed Content', className: 'bg-amber-100 text-amber-800' },
    deploy: { label: 'Deploy', className: 'bg-emerald-100 text-emerald-800' },
    queue_failed: { label: 'Fix Queue', className: 'bg-red-100 text-red-800' },
    queue_active: { label: 'In Progress', className: 'bg-slate-100 text-slate-800' },
};

const SOURCE_STATES = new Set(['sourced', 'underwriting']);
const ACQUIRE_STATES = new Set(['approved']);
const BUILD_STATES = new Set(['acquired', 'build']);
const GROWTH_STATES = new Set(['growth', 'monetized', 'hold', 'sell', 'sunset']);
const BLOCKER_OWNERS = ['Ops', 'Research', 'Acquisition', 'Content', 'Deploy', 'Integrations'] as const;
type BlockerOwner = (typeof BLOCKER_OWNERS)[number];

function dayKeyUtc(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function buildRecentDayKeys(days: number): string[] {
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    const values: string[] = [];
    for (let offset = days - 1; offset >= 0; offset--) {
        const current = new Date(cursor);
        current.setUTCDate(current.getUTCDate() - offset);
        values.push(dayKeyUtc(current));
    }
    return values;
}

function formatDayLabel(dayKey: string): string {
    const parsed = new Date(`${dayKey}T00:00:00Z`);
    return Number.isFinite(parsed.getTime())
        ? parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : dayKey;
}

function ownerBadgeClass(owner: GlobalBlocker['owner']): string {
    switch (owner) {
        case 'Ops':
            return 'bg-red-100 text-red-800 border-red-200';
        case 'Research':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'Acquisition':
            return 'bg-violet-100 text-violet-800 border-violet-200';
        case 'Content':
            return 'bg-amber-100 text-amber-900 border-amber-200';
        case 'Deploy':
            return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'Integrations':
            return 'bg-slate-100 text-slate-800 border-slate-300';
        default:
            return 'bg-slate-100 text-slate-800 border-slate-300';
    }
}

function parseOwnerFilter(value: string | string[] | undefined): BlockerOwner | 'all' {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw || raw === 'all') return 'all';
    return BLOCKER_OWNERS.includes(raw as BlockerOwner)
        ? raw as BlockerOwner
        : 'all';
}

function queueStatusCount(
    map: Map<string, Record<string, number>>,
    domainId: string,
    status: 'pending' | 'processing' | 'failed',
): number {
    return map.get(domainId)?.[status] ?? 0;
}

function actionOwner(action: DomainActionType): BlockerOwner {
    switch (action) {
        case 'research':
            return 'Research';
        case 'acquire':
            return 'Acquisition';
        case 'seed':
            return 'Content';
        case 'deploy':
            return 'Deploy';
        case 'queue_failed':
        case 'queue_active':
            return 'Ops';
        default:
            return 'Ops';
    }
}

function computeDomainAction(input: {
    domain: DomainRow;
    hasResearch: boolean;
    articleCount: number;
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
}): DomainAction | null {
    const { domain, hasResearch, articleCount, pendingJobs, processingJobs, failedJobs } = input;

    if (failedJobs > 0) {
        return {
            domainId: domain.id,
            domain: domain.domain,
            action: 'queue_failed',
            summary: 'Queue jobs are failing',
            details: `${failedJobs} failed jobs need review.`,
            href: `/dashboard/queue?domainId=${domain.id}`,
            priority: 100,
        };
    }

    if (SOURCE_STATES.has(domain.lifecycleState) && !hasResearch) {
        return {
            domainId: domain.id,
            domain: domain.domain,
            action: 'research',
            summary: 'No underwriting research',
            details: 'Run domain research before approval or acquisition.',
            href: '/dashboard/research',
            priority: 95,
        };
    }

    if (ACQUIRE_STATES.has(domain.lifecycleState) && !domain.purchaseDate) {
        return {
            domainId: domain.id,
            domain: domain.domain,
            action: 'acquire',
            summary: 'Approved but not acquired',
            details: 'Record purchase details and move to acquired/build.',
            href: `/dashboard/domains/${domain.id}/edit`,
            priority: 90,
        };
    }

    if (BUILD_STATES.has(domain.lifecycleState) && articleCount === 0 && pendingJobs === 0 && processingJobs === 0) {
        return {
            domainId: domain.id,
            domain: domain.domain,
            action: 'seed',
            summary: 'No content pipeline active',
            details: 'Seed keyword research/content to start build-out.',
            href: '/dashboard/content',
            priority: 80,
        };
    }

    if ((BUILD_STATES.has(domain.lifecycleState) || GROWTH_STATES.has(domain.lifecycleState))
        && articleCount > 0
        && !domain.isDeployed) {
        return {
            domainId: domain.id,
            domain: domain.domain,
            action: 'deploy',
            summary: 'Content exists but site is not deployed',
            details: `${articleCount} article${articleCount === 1 ? '' : 's'} ready for deploy.`,
            href: '/dashboard/deploy',
            priority: 75,
        };
    }

    if (pendingJobs > 0 || processingJobs > 0) {
        return {
            domainId: domain.id,
            domain: domain.domain,
            action: 'queue_active',
            summary: 'Pipeline is running',
            details: `${processingJobs} processing, ${pendingJobs} pending.`,
            href: `/dashboard/queue?domainId=${domain.id}`,
            priority: 20,
        };
    }

    return null;
}

export default async function WorkflowPage({
    searchParams,
}: {
    searchParams?: Promise<{ owner?: string | string[] }>;
}) {
    const params = (await searchParams) ?? {};
    const ownerFilter = parseOwnerFilter(params.owner);
    const trendDays = buildRecentDayKeys(7);
    const trendWindowStart = new Date(`${trendDays[0]}T00:00:00Z`);

    const domainRows = await db
        .select({
            id: domains.id,
            domain: domains.domain,
            lifecycleState: domains.lifecycleState,
            status: domains.status,
            isDeployed: domains.isDeployed,
            purchaseDate: domains.purchaseDate,
            createdAt: domains.createdAt,
        })
        .from(domains)
        .where(isNull(domains.deletedAt))
        .orderBy(domains.createdAt);

    const domainIds = domainRows.map((row) => row.id);
    const domainNames = domainRows.map((row) => row.domain);

    const articleCountRows = domainIds.length > 0
        ? await db
            .select({
                domainId: articles.domainId,
                count: count(),
            })
            .from(articles)
            .where(and(inArray(articles.domainId, domainIds), isNull(articles.deletedAt)))
            .groupBy(articles.domainId)
        : [];
    const articleCountByDomain = new Map(articleCountRows.map((row) => [row.domainId, row.count]));

    const queueDomainExpr = sql<string | null>`coalesce(${contentQueue.domainId}, ${articles.domainId})`;
    const queueRows = domainIds.length > 0
        ? await db
            .select({
                domainId: queueDomainExpr,
                status: contentQueue.status,
                count: sql<number>`count(*)::int`,
            })
            .from(contentQueue)
            .leftJoin(articles, eq(contentQueue.articleId, articles.id))
            .where(and(
                or(
                    inArray(contentQueue.domainId, domainIds),
                    inArray(articles.domainId, domainIds),
                ),
                inArray(contentQueue.status, ['pending', 'processing', 'failed']),
            ))
            .groupBy(queueDomainExpr, contentQueue.status)
        : [];
    const queueByDomain = new Map<string, Record<string, number>>();
    for (const row of queueRows) {
        if (!row.domainId || !row.status) continue;
        const next = queueByDomain.get(row.domainId) ?? {};
        next[row.status] = row.count;
        queueByDomain.set(row.domainId, next);
    }

    const researchRows = domainNames.length > 0
        ? await db
            .select({
                domain: domainResearch.domain,
            })
            .from(domainResearch)
            .where(inArray(domainResearch.domain, domainNames))
        : [];
    const researchedDomains = new Set(researchRows.map((row) => row.domain));

    const connectedIntegrations = await db
        .select({
            provider: integrationConnections.provider,
            category: integrationConnections.category,
            count: count(),
        })
        .from(integrationConnections)
        .where(eq(integrationConnections.status, 'connected'))
        .groupBy(integrationConnections.provider, integrationConnections.category);

    const connectedCategories = new Set(connectedIntegrations.map((row) => row.category));
    const hasRegistrar = connectedCategories.has('registrar');
    const hasAnalytics = connectedCategories.has('analytics') || connectedCategories.has('seo');
    const hasHosting = connectedCategories.has('hosting');
    const [failedQueueDailyRows, completedQueueDailyRows, researchDailyRows, lifecycleDailyRows] = await Promise.all([
        db.select({
            dayKey: sql<string>`to_char(date_trunc('day', ${contentQueue.createdAt}), 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.status, 'failed'),
                sql`${contentQueue.createdAt} >= ${trendWindowStart}`,
            ))
            .groupBy(sql`date_trunc('day', ${contentQueue.createdAt})`)
            .orderBy(sql`date_trunc('day', ${contentQueue.createdAt}) asc`),
        db.select({
            dayKey: sql<string>`to_char(date_trunc('day', ${contentQueue.completedAt}), 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.status, 'completed'),
                sql`${contentQueue.completedAt} is not null`,
                sql`${contentQueue.completedAt} >= ${trendWindowStart}`,
            ))
            .groupBy(sql`date_trunc('day', ${contentQueue.completedAt})`)
            .orderBy(sql`date_trunc('day', ${contentQueue.completedAt}) asc`),
        db.select({
            dayKey: sql<string>`to_char(date_trunc('day', ${domainResearch.createdAt}), 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
            .from(domainResearch)
            .where(sql`${domainResearch.createdAt} >= ${trendWindowStart}`)
            .groupBy(sql`date_trunc('day', ${domainResearch.createdAt})`)
            .orderBy(sql`date_trunc('day', ${domainResearch.createdAt}) asc`),
        db.select({
            dayKey: sql<string>`to_char(date_trunc('day', ${domainLifecycleEvents.createdAt}), 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
            .from(domainLifecycleEvents)
            .where(sql`${domainLifecycleEvents.createdAt} >= ${trendWindowStart}`)
            .groupBy(sql`date_trunc('day', ${domainLifecycleEvents.createdAt})`)
            .orderBy(sql`date_trunc('day', ${domainLifecycleEvents.createdAt}) asc`),
    ]);

    const actions = domainRows
        .map((domain) => computeDomainAction({
            domain,
            hasResearch: researchedDomains.has(domain.domain),
            articleCount: articleCountByDomain.get(domain.id) ?? 0,
            pendingJobs: queueStatusCount(queueByDomain, domain.id, 'pending'),
            processingJobs: queueStatusCount(queueByDomain, domain.id, 'processing'),
            failedJobs: queueStatusCount(queueByDomain, domain.id, 'failed'),
        }))
        .filter((item): item is DomainAction => item !== null)
        .sort((left, right) => right.priority - left.priority || left.domain.localeCompare(right.domain));

    const pendingQueueTotal = queueRows
        .filter((row) => row.status === 'pending')
        .reduce((sum, row) => sum + row.count, 0);
    const processingQueueTotal = queueRows
        .filter((row) => row.status === 'processing')
        .reduce((sum, row) => sum + row.count, 0);
    const failedQueueTotal = queueRows
        .filter((row) => row.status === 'failed')
        .reduce((sum, row) => sum + row.count, 0);

    const lifecycleCounts = {
        sourced: domainRows.filter((row) => SOURCE_STATES.has(row.lifecycleState)).length,
        approved: domainRows.filter((row) => ACQUIRE_STATES.has(row.lifecycleState)).length,
        build: domainRows.filter((row) => BUILD_STATES.has(row.lifecycleState)).length,
        growth: domainRows.filter((row) => GROWTH_STATES.has(row.lifecycleState)).length,
    };

    const missingResearchCount = domainRows.filter((row) => SOURCE_STATES.has(row.lifecycleState) && !researchedDomains.has(row.domain)).length;
    const pendingAcquireCount = domainRows.filter((row) => ACQUIRE_STATES.has(row.lifecycleState) && !row.purchaseDate).length;
    const buildWithoutContentCount = domainRows.filter((row) => BUILD_STATES.has(row.lifecycleState) && (articleCountByDomain.get(row.id) ?? 0) === 0).length;
    const deployBlockedCount = domainRows.filter((row) => {
        const articleCount = articleCountByDomain.get(row.id) ?? 0;
        return (BUILD_STATES.has(row.lifecycleState) || GROWTH_STATES.has(row.lifecycleState))
            && articleCount > 0
            && !row.isDeployed;
    }).length;
    const stalledQueue = pendingQueueTotal > 0 && processingQueueTotal === 0;
    const missingIntegrationCount = Number(!hasRegistrar) + Number(!hasAnalytics) + Number(!hasHosting);

    const globalBlockers: GlobalBlocker[] = [];
    if (failedQueueTotal > 0) {
        globalBlockers.push({
            key: 'queue_failed',
            title: 'Queue failures need triage',
            detail: `${failedQueueTotal} failed queue jobs are blocking pipeline reliability.`,
            severity: 'critical',
            owner: 'Ops',
            href: '/dashboard/queue?preset=failures',
            actionLabel: 'Open Failures',
        });
    }
    if (stalledQueue) {
        globalBlockers.push({
            key: 'queue_stalled',
            title: 'Queue appears stalled',
            detail: `${pendingQueueTotal} jobs are pending with 0 processing workers.`,
            severity: 'critical',
            owner: 'Ops',
            href: '/dashboard/queue?preset=stalled',
            actionLabel: 'Open Stalled',
        });
    }
    if (missingResearchCount > 0) {
        globalBlockers.push({
            key: 'missing_research',
            title: 'Underwriting research missing',
            detail: `${missingResearchCount} sourced/underwriting domains lack research records.`,
            severity: 'warning',
            owner: 'Research',
            href: '/dashboard/research',
            actionLabel: 'Run Research',
        });
    }
    if (pendingAcquireCount > 0) {
        globalBlockers.push({
            key: 'pending_acquire',
            title: 'Approved domains not acquired',
            detail: `${pendingAcquireCount} approved domains still need purchase/ownership recording.`,
            severity: 'warning',
            owner: 'Acquisition',
            href: '/dashboard/domains?lifecycleState=approved',
            actionLabel: 'Open Approved',
        });
    }
    if (buildWithoutContentCount > 0) {
        globalBlockers.push({
            key: 'build_no_content',
            title: 'Build-stage domains have no content',
            detail: `${buildWithoutContentCount} domains in build phase have no article pipeline activity.`,
            severity: 'warning',
            owner: 'Content',
            href: '/dashboard/content',
            actionLabel: 'Seed Content',
        });
    }
    if (deployBlockedCount > 0) {
        globalBlockers.push({
            key: 'deploy_blocked',
            title: 'Ready-to-deploy domains not live',
            detail: `${deployBlockedCount} domains have content but are not deployed.`,
            severity: 'info',
            owner: 'Deploy',
            href: '/dashboard/deploy',
            actionLabel: 'Open Deploy',
        });
    }
    if (missingIntegrationCount > 0) {
        globalBlockers.push({
            key: 'missing_integrations',
            title: 'Core integrations missing',
            detail: `${missingIntegrationCount} critical integration categories are not connected.`,
            severity: 'warning',
            owner: 'Integrations',
            href: '/dashboard/integrations',
            actionLabel: 'Connect Integrations',
        });
    }
    const displayedGlobalBlockers = ownerFilter === 'all'
        ? globalBlockers
        : globalBlockers.filter((row) => row.owner === ownerFilter);
    const displayedActions = ownerFilter === 'all'
        ? actions
        : actions.filter((action) => actionOwner(action.action) === ownerFilter);

    const failedByDay = new Map(failedQueueDailyRows.map((row) => [row.dayKey, row.count]));
    const completedByDay = new Map(completedQueueDailyRows.map((row) => [row.dayKey, row.count]));
    const researchedByDay = new Map(researchDailyRows.map((row) => [row.dayKey, row.count]));
    const lifecycleByDay = new Map(lifecycleDailyRows.map((row) => [row.dayKey, row.count]));
    const blockerTrend: DailyBlockerTrend[] = trendDays.map((dayKey) => ({
        dayKey,
        label: formatDayLabel(dayKey),
        failedJobs: failedByDay.get(dayKey) ?? 0,
        completedJobs: completedByDay.get(dayKey) ?? 0,
        researchAdded: researchedByDay.get(dayKey) ?? 0,
        lifecycleMoves: lifecycleByDay.get(dayKey) ?? 0,
    }));

    const sumTrend = (rows: DailyBlockerTrend[], key: keyof DailyBlockerTrend): number => rows.reduce((sum, row) => {
        const value = row[key];
        return typeof value === 'number' ? sum + value : sum;
    }, 0);
    const recentWindow = blockerTrend.slice(-3);
    const priorWindow = blockerTrend.slice(-6, -3);
    const failedDelta = sumTrend(recentWindow, 'failedJobs') - sumTrend(priorWindow, 'failedJobs');
    const completedDelta = sumTrend(recentWindow, 'completedJobs') - sumTrend(priorWindow, 'completedJobs');
    const researchDelta = sumTrend(recentWindow, 'researchAdded') - sumTrend(priorWindow, 'researchAdded');

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Workflow</h1>
                    <p className="text-muted-foreground">
                        One place to run sourcing → build → deploy → growth operations.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/dashboard/queue">
                        <Button variant="outline">Queue</Button>
                    </Link>
                    <Link href="/dashboard/domains">
                        <Button variant="outline">Domains</Button>
                    </Link>
                    <Link href="/dashboard/deploy">
                        <Button>Deploy</Button>
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Sourcing</CardDescription>
                        <CardTitle className="text-2xl">{lifecycleCounts.sourced}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">Need research or underwriting.</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Approved</CardDescription>
                        <CardTitle className="text-2xl">{lifecycleCounts.approved}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">Ready for acquisition execution.</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Build</CardDescription>
                        <CardTitle className="text-2xl">{lifecycleCounts.build}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">Content + deployment workstream.</CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Growth</CardDescription>
                        <CardTitle className="text-2xl">{lifecycleCounts.growth}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">Monetization and optimization phase.</CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Global Blockers</CardTitle>
                    <CardDescription>Portfolio-level issues that stop execution velocity.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 pb-1">
                        <Link
                            href="/dashboard/workflow"
                            className={`rounded-full border px-2 py-1 text-xs ${ownerFilter === 'all' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                        >
                            All Owners
                        </Link>
                        {BLOCKER_OWNERS.map((owner) => (
                            <Link
                                key={owner}
                                href={`/dashboard/workflow?owner=${encodeURIComponent(owner)}`}
                                className={`rounded-full border px-2 py-1 text-xs ${ownerFilter === owner ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                            >
                                {owner}
                            </Link>
                        ))}
                    </div>
                    {globalBlockers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Showing {displayedGlobalBlockers.length} of {globalBlockers.length} blocker{globalBlockers.length === 1 ? '' : 's'}.
                        </p>
                    )}
                    {displayedGlobalBlockers.length === 0 ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                            No global blockers for this owner filter.
                        </div>
                    ) : (
                        displayedGlobalBlockers.map((blocker) => (
                            <div
                                key={blocker.key}
                                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
                                    blocker.severity === 'critical'
                                        ? 'border-red-200 bg-red-50'
                                        : blocker.severity === 'warning'
                                            ? 'border-amber-200 bg-amber-50'
                                            : 'border-blue-200 bg-blue-50'
                                }`}
                            >
                                <div>
                                    <div className="mb-1">
                                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${ownerBadgeClass(blocker.owner)}`}>
                                            Owner: {blocker.owner}
                                        </span>
                                    </div>
                                    <p
                                        className={`text-sm font-medium ${
                                            blocker.severity === 'critical'
                                                ? 'text-red-800'
                                                : blocker.severity === 'warning'
                                                    ? 'text-amber-900'
                                                    : 'text-blue-900'
                                        }`}
                                    >
                                        {blocker.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{blocker.detail}</p>
                                </div>
                                <Link href={blocker.href}>
                                    <Button size="sm" variant="outline">{blocker.actionLabel}</Button>
                                </Link>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Blocker Trend Snapshots (7d)</CardTitle>
                    <CardDescription>Daily trendline for queue failures, throughput, and workflow progress signals.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                        <TrendCard
                            label="Failed jobs (3d vs prior 3d)"
                            value={`${sumTrend(recentWindow, 'failedJobs')} vs ${sumTrend(priorWindow, 'failedJobs')}`}
                            delta={failedDelta}
                            invert
                        />
                        <TrendCard
                            label="Completed jobs (3d vs prior 3d)"
                            value={`${sumTrend(recentWindow, 'completedJobs')} vs ${sumTrend(priorWindow, 'completedJobs')}`}
                            delta={completedDelta}
                        />
                        <TrendCard
                            label="Research added (3d vs prior 3d)"
                            value={`${sumTrend(recentWindow, 'researchAdded')} vs ${sumTrend(priorWindow, 'researchAdded')}`}
                            delta={researchDelta}
                        />
                    </div>
                    <div className="overflow-x-auto rounded border">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/40">
                                <tr>
                                    <th className="p-2 text-left">Day</th>
                                    <th className="p-2 text-left">Failed Jobs</th>
                                    <th className="p-2 text-left">Completed Jobs</th>
                                    <th className="p-2 text-left">Research Added</th>
                                    <th className="p-2 text-left">Lifecycle Moves</th>
                                </tr>
                            </thead>
                            <tbody>
                                {blockerTrend.map((row) => (
                                    <tr key={row.dayKey} className="border-t">
                                        <td className="p-2">{row.label}</td>
                                        <td className="p-2">{row.failedJobs}</td>
                                        <td className="p-2">{row.completedJobs}</td>
                                        <td className="p-2">{row.researchAdded}</td>
                                        <td className="p-2">{row.lifecycleMoves}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Operational Health</CardTitle>
                    <CardDescription>Critical blockers that usually make the platform feel “broken.”</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <HealthItem
                        ok={!(pendingQueueTotal > 0 && processingQueueTotal === 0)}
                        okLabel="Queue is moving"
                        failLabel={`Queue stalled: ${pendingQueueTotal} pending, ${processingQueueTotal} processing`}
                        href="/dashboard/queue"
                        actionLabel="Open Queue"
                    />
                    <HealthItem
                        ok={hasRegistrar}
                        okLabel="Registrar integration connected"
                        failLabel="No registrar integration connected (GoDaddy/Namecheap)"
                        href="/dashboard/integrations"
                        actionLabel="Connect Registrar"
                    />
                    <HealthItem
                        ok={hasAnalytics}
                        okLabel="Analytics integration connected"
                        failLabel="Analytics sync missing (Cloudflare/Search Console/GA)"
                        href="/dashboard/integrations"
                        actionLabel="Connect Analytics"
                    />
                    <HealthItem
                        ok={hasHosting}
                        okLabel="Hosting integration connected"
                        failLabel="No hosting integration connected (Cloudflare/cPanel)"
                        href="/dashboard/integrations"
                        actionLabel="Connect Hosting"
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Next Actions</CardTitle>
                    <CardDescription>
                        Prioritized per-domain tasks. This is the primary execution queue.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {actions.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Showing {displayedActions.length} of {actions.length} action{actions.length === 1 ? '' : 's'}.
                        </p>
                    )}
                    {displayedActions.length === 0 ? (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm text-emerald-800">
                            {ownerFilter === 'all'
                                ? 'No immediate blockers found. Pipeline looks healthy.'
                                : 'No prioritized actions for this owner filter.'}
                        </div>
                    ) : (
                        displayedActions.slice(0, 40).map((action) => (
                            <div
                                key={`${action.domainId}:${action.action}`}
                                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Link href={`/dashboard/domains/${action.domainId}`} className="font-medium hover:underline">
                                            {action.domain}
                                        </Link>
                                        <Badge className={ACTION_META[action.action].className}>
                                            {ACTION_META[action.action].label}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{action.summary}</p>
                                    <p className="text-xs text-muted-foreground">{action.details}</p>
                                </div>
                                <Link href={action.href}>
                                    <Button variant="outline" size="sm">
                                        Do It
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function HealthItem(props: {
    ok: boolean;
    okLabel: string;
    failLabel: string;
    href: string;
    actionLabel: string;
}) {
    const Icon = props.ok ? CheckCircle2 : AlertTriangle;

    return (
        <div className={`flex items-center justify-between rounded-md border px-3 py-2 ${props.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center gap-2 text-sm">
                <Icon className={`h-4 w-4 ${props.ok ? 'text-emerald-600' : 'text-amber-600'}`} />
                <span className={props.ok ? 'text-emerald-800' : 'text-amber-800'}>
                    {props.ok ? props.okLabel : props.failLabel}
                </span>
            </div>
            <Link href={props.href}>
                <Button size="sm" variant="ghost">{props.actionLabel}</Button>
            </Link>
        </div>
    );
}

function TrendCard(props: {
    label: string;
    value: string;
    delta: number;
    invert?: boolean;
}) {
    const improving = props.invert ? props.delta <= 0 : props.delta >= 0;
    const deltaLabel = props.delta === 0
        ? 'no change'
        : `${props.delta > 0 ? '+' : ''}${props.delta}`;

    return (
        <div className={`rounded-md border px-3 py-2 ${improving ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className="text-xs text-muted-foreground">{props.label}</p>
            <p className="text-sm font-semibold">{props.value}</p>
            <p className={`text-xs ${improving ? 'text-emerald-800' : 'text-amber-900'}`}>
                {improving ? 'improving' : 'worsening'} ({deltaLabel})
            </p>
        </div>
    );
}
