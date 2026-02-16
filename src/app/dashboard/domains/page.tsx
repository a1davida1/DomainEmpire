import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Plus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { db, domains } from '@/lib/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { articles, contentQueue } from '@/lib/db/schema';
import { formatDate } from '@/lib/format-utils';
import { DeployAllButton } from '@/components/dashboard/DeployAllButton';
import { BulkNameserverCutoverButton } from '@/components/dashboard/BulkNameserverCutoverButton';
import { DomainSearch } from '@/components/dashboard/DomainSearch';
import { DomainsTableClient } from '@/components/dashboard/DomainsTableClient';
import { getDomainRoiPriorities } from '@/lib/domain/roi-priority-service';
import { RoiCampaignAutoplanButton } from '@/components/dashboard/RoiCampaignAutoplanButton';
import { getCampaignLaunchReviewSlaSummary } from '@/lib/review/campaign-launch-sla';
import { ClassifyDomainsButton } from '@/components/dashboard/ClassifyDomainsButton';
import { QuickAddDomainFab } from '@/components/dashboard/QuickAddDomainFab';
import { StatusFilterChips } from '@/components/dashboard/StatusFilterChips';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export const dynamic = 'force-dynamic';

const statusConfig: Record<string, { color: string; label: string }> = {
    parked: { color: 'bg-gray-500', label: 'Parked' },
    active: { color: 'bg-emerald-600', label: 'Building' },
    redirect: { color: 'bg-blue-500', label: 'Redirect' },
    forsale: { color: 'bg-amber-500', label: 'For Sale' },
    defensive: { color: 'bg-purple-500', label: 'Defensive' },
};

const roiActionBadgeClasses: Record<string, string> = {
    scale: 'bg-emerald-600 text-white',
    optimize: 'bg-blue-600 text-white',
    recover: 'bg-amber-600 text-white',
    incubate: 'bg-violet-600 text-white',
    hold: 'bg-slate-500 text-white',
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
});

const PAGE_SIZE = 20;
const SORT_COLUMNS = ['domain', 'status', 'tier', 'niche', 'renewalDate', 'isDeployed'] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];
type SortDir = 'asc' | 'desc';

type DomainQueueHint = {
    pending: number;
    processing: number;
    failed: number;
    total: number;
};

type QueueSpotlight = {
    hintsByDomain: Record<string, DomainQueueHint>;
    activeByType: Array<{ jobType: string; count: number }>;
};

interface DomainsPageProps {
    readonly searchParams: Promise<{
        readonly q?: string; readonly status?: string; readonly tier?: string;
        readonly account?: string;
        readonly page?: string; readonly sort?: string; readonly dir?: string;
    }>;
}

function isSortColumn(v: string | undefined): v is SortColumn {
    return !!v && (SORT_COLUMNS as readonly string[]).includes(v);
}

async function getQueueSpotlight(domainIds: string[]): Promise<QueueSpotlight> {
    const uniqueDomainIds = [...new Set(domainIds)].filter((value) => value.length > 0);
    if (uniqueDomainIds.length === 0) {
        return {
            hintsByDomain: {},
            activeByType: [],
        };
    }

    const domainScope = sql`coalesce(${contentQueue.domainId}, ${articles.domainId}) in (${sql.join(uniqueDomainIds.map((value) => sql`${value}`), sql`, `)})`;
    const activeStatuses = ['pending', 'processing', 'failed'] as const;

    const [statusRows, jobTypeRows] = await Promise.all([
        db.select({
            domainId: sql<string | null>`coalesce(${contentQueue.domainId}, ${articles.domainId})`,
            status: contentQueue.status,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .leftJoin(articles, eq(contentQueue.articleId, articles.id))
            .where(and(
                inArray(contentQueue.status, activeStatuses),
                domainScope,
            ))
            .groupBy(sql`coalesce(${contentQueue.domainId}, ${articles.domainId})`, contentQueue.status),
        db.select({
            jobType: contentQueue.jobType,
            count: sql<number>`count(*)::int`,
        })
            .from(contentQueue)
            .leftJoin(articles, eq(contentQueue.articleId, articles.id))
            .where(and(
                inArray(contentQueue.status, activeStatuses),
                domainScope,
            ))
            .groupBy(contentQueue.jobType)
            .orderBy(sql`count(*) desc`, contentQueue.jobType)
            .limit(8),
    ]);

    const hintsByDomain: Record<string, DomainQueueHint> = {};
    for (const row of statusRows) {
        if (!row.domainId || !row.status) continue;
        if (!hintsByDomain[row.domainId]) {
            hintsByDomain[row.domainId] = {
                pending: 0,
                processing: 0,
                failed: 0,
                total: 0,
            };
        }
        const next = hintsByDomain[row.domainId];
        if (row.status === 'pending') next.pending = row.count;
        if (row.status === 'processing') next.processing = row.count;
        if (row.status === 'failed') next.failed = row.count;
        next.total += row.count;
    }

    return {
        hintsByDomain,
        activeByType: jobTypeRows
            .filter((row) => typeof row.jobType === 'string' && row.jobType.length > 0)
            .map((row) => ({ jobType: row.jobType, count: row.count })),
    };
}

function SortIndicator({ col, activeCol, activeDir }: { col: SortColumn; activeCol: SortColumn; activeDir: SortDir }) {
    if (activeCol !== col) return <ChevronsUpDown className="ml-1 inline h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />;
    return activeDir === 'asc'
        ? <ChevronUp className="ml-1 inline h-3 w-3 text-primary" />
        : <ChevronDown className="ml-1 inline h-3 w-3 text-primary" />;
}

async function getDomains(filters: { q?: string; status?: string; tier?: string; account?: string; sort?: string; dir?: string; page?: string }) {
    try {
        // Build SQL WHERE conditions
        const conditions = [isNull(domains.deletedAt)];
        if (filters.q) {
            const query = `%${filters.q.toLowerCase()}%`;
            conditions.push(sql`(lower(${domains.domain}) like ${query} OR lower(${domains.niche}) like ${query})`);
        }
        if (filters.status) {
            conditions.push(sql`${domains.status} = ${filters.status}`);
        }
        if (filters.tier) {
            const tier = Number.parseInt(filters.tier, 10);
            if (!Number.isNaN(tier)) {
                conditions.push(eq(domains.tier, tier));
            }
        }
        if (filters.account) {
            if (filters.account === '_none') {
                conditions.push(isNull(domains.cloudflareAccount));
            } else {
                conditions.push(eq(domains.cloudflareAccount, filters.account));
            }
        }

        const whereClause = and(...conditions);

        // Count total matching rows
        const [{ count: totalCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(domains).where(whereClause);

        // Build ORDER BY
        const sortCol: SortColumn = isSortColumn(filters.sort) ? filters.sort : 'tier';
        const sortDir: SortDir = filters.dir === 'desc' ? 'desc' : 'asc';
        const columnMap: Record<SortColumn, ReturnType<typeof sql>> = {
            domain: sql`${domains.domain}`,
            status: sql`${domains.status}`,
            tier: sql`${domains.tier}`,
            niche: sql`${domains.niche}`,
            isDeployed: sql`${domains.isDeployed}`,
            renewalDate: sql`${domains.renewalDate}`,
        };
        const orderCol = columnMap[sortCol] ?? sql`${domains.tier}`;
        const orderExpr = sortDir === 'desc'
            ? sql`${orderCol} desc nulls last`
            : sql`${orderCol} asc nulls last`;

        // Paginate
        const page = Math.max(1, Number.parseInt(filters.page || '1', 10) || 1);
        const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        const safePage = Math.min(page, totalPages);
        const offset = (safePage - 1) * PAGE_SIZE;

        const allDomains = await db.select().from(domains)
            .where(whereClause)
            .orderBy(orderExpr)
            .limit(PAGE_SIZE)
            .offset(offset);

        return { data: allDomains, totalCount, page: safePage, totalPages, error: null };
    } catch (error) {
        console.error('Failed to fetch domains:', error);
        return { data: [], totalCount: 0, page: 1, totalPages: 1, error: 'Failed to load domains. Please try again later.' };
    }
}

async function getRoiPriorityPreview() {
    try {
        return await getDomainRoiPriorities({
            limit: 8,
            windowDays: 30,
        });
    } catch (error) {
        console.error('Failed to load ROI priority preview:', error);
        return null;
    }
}

async function getCampaignLaunchReviewSummaryPreview() {
    try {
        return await getCampaignLaunchReviewSlaSummary({
            limit: 250,
            topIssueLimit: 3,
        });
    } catch (error) {
        console.error('Failed to load campaign launch review summary preview:', error);
        return null;
    }
}

export default async function DomainsPage(props: Readonly<DomainsPageProps>) {
    const { searchParams } = props;
    const params = await searchParams;
    const { data: allDomains, totalCount: filteredCount, page, totalPages, error } = await getDomains(params);
    const sortCol = isSortColumn(params.sort) ? params.sort : 'tier';
    const sortDir: SortDir = params.dir === 'desc' ? 'desc' : 'asc';

    function sortHref(col: SortColumn) {
        const newDir = sortCol === col && sortDir === 'asc' ? 'desc' : 'asc';
        const p = new URLSearchParams();
        if (params.q) p.set('q', params.q);
        if (params.status) p.set('status', params.status);
        if (params.tier) p.set('tier', params.tier);
        if (params.account) p.set('account', params.account);
        p.set('sort', col);
        p.set('dir', newDir);
        return `/dashboard/domains?${p.toString()}`;
    }

    function pageHref(pg: number) {
        const p = new URLSearchParams();
        if (params.q) p.set('q', params.q);
        if (params.status) p.set('status', params.status);
        if (params.tier) p.set('tier', params.tier);
        if (params.account) p.set('account', params.account);
        if (params.sort) p.set('sort', params.sort);
        if (params.dir) p.set('dir', params.dir);
        p.set('page', String(pg));
        return `/dashboard/domains?${p.toString()}#domains-table`;
    }

    const roiPriority = await getRoiPriorityPreview();
    const launchReviewSummary = await getCampaignLaunchReviewSummaryPreview();
    const queueSpotlight = await getQueueSpotlight(allDomains.map((domain) => domain.id));
    const topQueuedDomains = allDomains
        .map((domain) => ({
            domainId: domain.id,
            domain: domain.domain,
            stats: queueSpotlight.hintsByDomain[domain.id] ?? {
                pending: 0,
                processing: 0,
                failed: 0,
                total: 0,
            },
        }))
        .filter((row) => row.stats.total > 0)
        .sort((left, right) => {
            if (left.stats.failed !== right.stats.failed) {
                return right.stats.failed - left.stats.failed;
            }
            if (left.stats.processing !== right.stats.processing) {
                return right.stats.processing - left.stats.processing;
            }
            if (left.stats.pending !== right.stats.pending) {
                return right.stats.pending - left.stats.pending;
            }
            return left.domain.localeCompare(right.domain);
        })
        .slice(0, 8);

    if (error) {
        return (
            <div className="p-6 text-center">
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                    <p className="font-medium">Error loading domains</p>
                    <p className="text-sm">{error}</p>
                </div>
            </div>
        );
    }

    // Count all domains for summary (unfiltered)
    const unfilteredDomains = await db.select().from(domains).where(isNull(domains.deletedAt));
    const statusCounts = unfilteredDomains.reduce((acc, d) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    // Distinct Cloudflare accounts for filter with NS status breakdown
    const accountStats = unfilteredDomains.reduce((acc, d) => {
        const key = d.cloudflareAccount || '_none';
        if (!acc[key]) acc[key] = { total: 0, deployed: 0, cfProject: 0, unpointed: 0 };
        acc[key].total += 1;
        if (d.isDeployed) acc[key].deployed += 1;
        else if (d.cloudflareProject) acc[key].cfProject += 1;
        else acc[key].unpointed += 1;
        return acc;
    }, {} as Record<string, { total: number; deployed: number; cfProject: number; unpointed: number }>);
    const cfAccounts = Object.entries(accountStats)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([account, stats]) => ({ account, count: stats.total, ...stats }));
    const totalDeployed = unfilteredDomains.filter(d => d.isDeployed).length;
    const totalUnpointed = unfilteredDomains.filter(d => d.cloudflareAccount && !d.isDeployed && !d.cloudflareProject).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Domains</h1>
                    <p className="text-muted-foreground">
                        Manage your domain portfolio ({unfilteredDomains.length} total)
                    </p>
                </div>
                <div className="flex gap-2">
                    <ClassifyDomainsButton mode="all" />
                    <DeployAllButton domainIds={allDomains.filter(d => !d.isDeployed).map(d => d.id)} />
                    <BulkNameserverCutoverButton
                        domainIds={allDomains
                            .filter((d) => ['godaddy', 'namecheap'].includes((d.registrar || '').toLowerCase()))
                            .map((d) => d.id)}
                    />
                    <Link href="/dashboard/domains/import">
                        <Button variant="outline">
                            Import CSV
                        </Button>
                    </Link>
                    <Link href="/dashboard/domains/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Domain
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Status Summary Cards */}
            <div className="grid gap-4 md:grid-cols-5">
                {['active', 'parked', 'redirect', 'forsale', 'defensive'].map((status) => {
                    const cfg = statusConfig[status] || { color: 'bg-gray-500', label: status };
                    return (
                        <Card key={status}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">{cfg.label}</p>
                                        <p className="text-2xl font-bold">{statusCounts[status] || 0}</p>
                                    </div>
                                    <div className={`h-3 w-3 rounded-full ${cfg.color}`} />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Uncategorized Warning */}
            {(() => {
                const uncategorized = allDomains.filter(d => !d.niche);
                if (uncategorized.length === 0) return null;
                return (
                    <Card className="border-amber-200 bg-amber-50">
                        <CardContent className="flex items-center justify-between p-4">
                            <div>
                                <p className="font-medium text-amber-900">
                                    {uncategorized.length} domain{uncategorized.length === 1 ? '' : 's'} need classification
                                </p>
                                <p className="text-sm text-amber-800/80">
                                    These domains have no niche assigned. Use AI to classify them automatically.
                                </p>
                            </div>
                            <ClassifyDomainsButton mode="all" label={`Classify ${uncategorized.length} Domains`} />
                        </CardContent>
                    </Card>
                );
            })()}

            {/* Status Filter Chips */}
            <StatusFilterChips />

            {/* Cloudflare Account Filter */}
            {cfAccounts.length > 1 && (
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Account:</span>
                        <Link
                            href={(() => {
                                const p = new URLSearchParams();
                                if (params.q) p.set('q', params.q);
                                if (params.status) p.set('status', params.status);
                                if (params.tier) p.set('tier', params.tier);
                                return `/dashboard/domains?${p.toString()}`;
                            })()}
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                !params.account ? 'bg-foreground text-background' : 'hover:bg-muted'
                            }`}
                            {...(!params.account ? { 'aria-current': 'page' as const } : {})}
                        >
                            All ({unfilteredDomains.length})
                        </Link>
                        {cfAccounts.map(({ account, count, deployed, unpointed }) => {
                            const label = account === '_none' ? 'Unassigned' : account;
                            const isActive = params.account === account;
                            const p = new URLSearchParams();
                            if (params.q) p.set('q', params.q);
                            if (params.status) p.set('status', params.status);
                            if (params.tier) p.set('tier', params.tier);
                            p.set('account', account);
                            return (
                                <Link
                                    key={account}
                                    href={`/dashboard/domains?${p.toString()}`}
                                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                        isActive ? 'bg-foreground text-background' : 'hover:bg-muted'
                                    }`}
                                    {...(isActive ? { 'aria-current': 'page' as const } : {})}
                                >
                                    {label} ({count})
                                    {account !== '_none' && deployed > 0 && (
                                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" title={`${deployed} deployed`} />
                                    )}
                                    {account !== '_none' && unpointed > 0 && (
                                        <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-gray-300" title={`${unpointed} not pointed`} />
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 cursor-help"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> NS active ({totalDeployed})</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">Site is deployed to Cloudflare Pages AND nameservers are pointed to Cloudflare. The site is fully live and serving traffic.</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 cursor-help"><span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500" /> CF project only</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">A Cloudflare Pages project exists but the domain hasn&apos;t been deployed yet. The project is ready to receive a build.</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 cursor-help"><span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300" /> Not pointed ({totalUnpointed})</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">Domain is assigned to a Cloudflare account but nameservers haven&apos;t been updated at the registrar. The site won&apos;t resolve until NS records are changed.</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            )}

            {/* Search and Filter */}
            <Suspense>
                <DomainSearch />
            </Suspense>

            {/* ROI Priority Queue */}
            <Card>
                <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-sm font-semibold">ROI Priority Queue</h2>
                            <p className="text-xs text-muted-foreground">
                                Top domains to revisit based on 30-day revenue, cost, and traffic signals.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {roiPriority ? (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    {Object.entries(roiPriority.actionCounts).map(([action, count]) => (
                                        <Badge key={action} variant="outline">
                                            {action}: {count}
                                        </Badge>
                                    ))}
                                </div>
                            ) : null}
                            {roiPriority && roiPriority.priorities.length > 0 ? (
                                <RoiCampaignAutoplanButton
                                    limit={Math.min(roiPriority.priorities.length, 25)}
                                    windowDays={roiPriority.windowDays}
                                />
                            ) : null}
                        </div>
                    </div>

                    {!roiPriority || roiPriority.priorities.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            ROI queue is not available yet. Add ledger and traffic snapshots to activate prioritization.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {roiPriority.priorities.map((priority) => (
                                <div
                                    key={priority.domainId}
                                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <Link
                                            href={`/dashboard/domains/${priority.domainId}`}
                                            className="font-medium hover:underline"
                                        >
                                            {priority.domain}
                                        </Link>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {priority.reasons[0] || 'No primary signal available'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <Badge className={roiActionBadgeClasses[priority.action] || roiActionBadgeClasses.hold}>
                                            {priority.action}
                                        </Badge>
                                        <Badge variant="outline">
                                            Score {priority.score}
                                        </Badge>
                                        <span className="text-muted-foreground">
                                            Net {currencyFormatter.format(priority.net30d)}
                                        </span>
                                        <span className="text-muted-foreground">
                                            ROI {priority.roiPct === null ? 'N/A' : `${priority.roiPct.toFixed(1)}%`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {launchReviewSummary && launchReviewSummary.pendingCount > 0 ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-amber-900">Launch Review Queue</span>
                                <Badge variant="outline">Pending {launchReviewSummary.pendingCount}</Badge>
                                <Badge variant="outline">SLA breached {launchReviewSummary.dueBreachedCount}</Badge>
                                <Badge variant="outline">Escalated {launchReviewSummary.escalatedCount}</Badge>
                            </div>
                            {launchReviewSummary.topOverdue.length > 0 ? (
                                <div className="space-y-1">
                                    {launchReviewSummary.topOverdue.map((item) => (
                                        <div key={item.taskId} className="flex flex-wrap items-center gap-2 text-amber-900">
                                            <span className="font-medium">{item.domain}</span>
                                            <span className="text-amber-800/80">Task {item.taskId.slice(0, 8)}</span>
                                            <span className="text-amber-800/80">
                                                Due {formatDate(item.dueAt)}
                                            </span>
                                            <span className="text-amber-800/80">
                                                Escalate {formatDate(item.escalateAt)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-sm font-semibold">Queue Spotlight</h2>
                            <p className="text-xs text-muted-foreground">
                                Active queue load for domains in this view, with direct drilldowns.
                            </p>
                        </div>
                        <Link href="/dashboard/queue">
                            <Button variant="outline" size="sm">Open Queue Dashboard</Button>
                        </Link>
                    </div>

                    {topQueuedDomains.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No pending, processing, or failed jobs for domains in this list.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {topQueuedDomains.map((row) => (
                                <div key={row.domainId} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <Link href={`/dashboard/domains/${row.domainId}`} className="font-medium hover:underline">
                                            {row.domain}
                                        </Link>
                                        <p className="text-xs text-muted-foreground">
                                            {row.stats.total} active queue job{row.stats.total === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        {row.stats.failed > 0 ? <Badge className="bg-red-100 text-red-900">Failed {row.stats.failed}</Badge> : null}
                                        {row.stats.processing > 0 ? <Badge className="bg-blue-100 text-blue-900">Processing {row.stats.processing}</Badge> : null}
                                        {row.stats.pending > 0 ? <Badge className="bg-yellow-100 text-yellow-900">Pending {row.stats.pending}</Badge> : null}
                                        <Link href={`/dashboard/queue?domainId=${row.domainId}`}>
                                            <Button size="sm" variant="outline">Inspect</Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {queueSpotlight.activeByType.length > 0 ? (
                        <div className="rounded-md border p-3">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">Most active job types (this view)</p>
                            <div className="flex flex-wrap gap-2">
                                {queueSpotlight.activeByType.map((row) => (
                                    <Link
                                        key={row.jobType}
                                        href={`/dashboard/queue?jobTypes=${encodeURIComponent(row.jobType)}`}
                                        className="rounded-full border px-3 py-1 text-xs hover:bg-muted"
                                    >
                                        <span className="font-mono">{row.jobType}</span>: {row.count}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </CardContent>
            </Card>

            {/* Domains Table */}
            <div id="domains-table" />
            <Card>
                <CardContent className="p-0">
                    <DomainsTableClient
                        domains={allDomains.map(d => ({
                            id: d.id,
                            domain: d.domain,
                            status: d.status,
                            tier: d.tier,
                            niche: d.niche,
                            siteTemplate: d.siteTemplate,
                            isDeployed: d.isDeployed,
                            registrar: d.registrar,
                            renewalDate: formatDate(d.renewalDate),
                            cloudflareAccount: d.cloudflareAccount,
                            cloudflareProject: d.cloudflareProject,
                        }))}
                        queueHints={queueSpotlight.hintsByDomain}
                        hasFilters={!!(params.q || params.status || params.tier || params.account)}
                        headerSlot={
                            <>
                                <TableHead><Link href={sortHref('domain')} className="group inline-flex items-center hover:text-foreground cursor-pointer hover:underline underline-offset-2">Domain<SortIndicator col="domain" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link href={sortHref('status')} className="group inline-flex items-center hover:text-foreground cursor-pointer hover:underline underline-offset-2">Status<SortIndicator col="status" activeCol={sortCol} activeDir={sortDir} /></Link>
                                        </TooltipTrigger>
                                        <TooltipContent>Operational status: parked (inactive), active (building content), redirect, for-sale, or defensive (brand protection).</TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link href={sortHref('tier')} className="group inline-flex items-center hover:text-foreground cursor-pointer hover:underline underline-offset-2">Tier<SortIndicator col="tier" activeCol={sortCol} activeDir={sortDir} /></Link>
                                        </TooltipTrigger>
                                        <TooltipContent>Investment priority: Tier 1 = highest value (most content, best keywords), Tier 3 = lowest.</TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead><Link href={sortHref('niche')} className="group inline-flex items-center hover:text-foreground cursor-pointer hover:underline underline-offset-2">Niche<SortIndicator col="niche" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="cursor-help">Template</span>
                                        </TooltipTrigger>
                                        <TooltipContent>Site layout template (authority, affiliate, magazine, etc.) used when generating and deploying the static site.</TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Link href={sortHref('isDeployed')} className="group inline-flex items-center hover:text-foreground cursor-pointer hover:underline underline-offset-2">Deployed<SortIndicator col="isDeployed" activeCol={sortCol} activeDir={sortDir} /></Link>
                                        </TooltipTrigger>
                                        <TooltipContent>Whether a static site has been built and uploaded to Cloudflare Pages. &quot;Deployed&quot; means the site is live if nameservers are pointed.</TooltipContent>
                                    </Tooltip>
                                </TableHead>
                                <TableHead><Link href={sortHref('renewalDate')} className="group inline-flex items-center hover:text-foreground cursor-pointer hover:underline underline-offset-2">Renewal<SortIndicator col="renewalDate" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead className="w-12"></TableHead>
                            </>
                        }
                    />
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCount)} of {filteredCount}
                    </p>
                    <div className="flex gap-1">
                        {page > 1 && (
                            <Link href={pageHref(page - 1)}>
                                <Button variant="outline" size="sm">← Prev</Button>
                            </Link>
                        )}
                        {/* Full pagination on desktop */}
                        <span className="hidden sm:flex gap-1">
                            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                let pg: number;
                                if (totalPages <= 7) {
                                    pg = i + 1;
                                } else if (page <= 4) {
                                    pg = i + 1;
                                } else if (page >= totalPages - 3) {
                                    pg = totalPages - 6 + i;
                                } else {
                                    pg = page - 3 + i;
                                }
                                return (
                                    <Link key={pg} href={pageHref(pg)}>
                                        <Button variant={pg === page ? 'default' : 'outline'} size="sm" className="min-w-[2rem]">
                                            {pg}
                                        </Button>
                                    </Link>
                                );
                            })}
                        </span>
                        {/* Compact pagination on mobile */}
                        <span className="flex sm:hidden items-center gap-1 text-xs text-muted-foreground tabular-nums">
                            {page} / {totalPages}
                        </span>
                        {page < totalPages && (
                            <Link href={pageHref(page + 1)}>
                                <Button variant="outline" size="sm">Next →</Button>
                            </Link>
                        )}
                    </div>
                </div>
            )}
            <QuickAddDomainFab />
        </div>
    );
}
