import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TableHead } from '@/components/ui/table';
import { Plus, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { db, domains } from '@/lib/db';
import { isNull } from 'drizzle-orm';
import { formatDate } from '@/lib/format-utils';
import { DeployAllButton } from '@/components/dashboard/DeployAllButton';
import { BulkNameserverCutoverButton } from '@/components/dashboard/BulkNameserverCutoverButton';
import { DomainSearch } from '@/components/dashboard/DomainSearch';
import { DomainsTableClient } from '@/components/dashboard/DomainsTableClient';
import { getDomainRoiPriorities } from '@/lib/domain/roi-priority-service';
import { RoiCampaignAutoplanButton } from '@/components/dashboard/RoiCampaignAutoplanButton';
import { getCampaignLaunchReviewSlaSummary } from '@/lib/review/campaign-launch-sla';
import { ClassifyDomainsButton } from '@/components/dashboard/ClassifyDomainsButton';

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

interface DomainsPageProps {
    readonly searchParams: Promise<{
        readonly q?: string; readonly status?: string; readonly tier?: string;
        readonly page?: string; readonly sort?: string; readonly dir?: string;
    }>;
}

function isSortColumn(v: string | undefined): v is SortColumn {
    return !!v && (SORT_COLUMNS as readonly string[]).includes(v);
}

function SortIndicator({ col, activeCol, activeDir }: { col: SortColumn; activeCol: SortColumn; activeDir: SortDir }) {
    if (activeCol !== col) return <ChevronsUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return activeDir === 'asc'
        ? <ChevronUp className="ml-1 inline h-3 w-3" />
        : <ChevronDown className="ml-1 inline h-3 w-3" />;
}

async function getDomains(filters: { q?: string; status?: string; tier?: string; sort?: string; dir?: string; page?: string }) {
    try {
        let allDomains = await db.select().from(domains).where(isNull(domains.deletedAt));

        if (filters.q) {
            const query = filters.q.toLowerCase();
            allDomains = allDomains.filter(d => d.domain.toLowerCase().includes(query) || d.niche?.toLowerCase().includes(query));
        }
        if (filters.status) {
            allDomains = allDomains.filter(d => d.status === filters.status);
        }
        if (filters.tier) {
            const tier = Number.parseInt(filters.tier, 10);
            if (!Number.isNaN(tier)) {
                allDomains = allDomains.filter(d => d.tier === tier);
            }
        }

        const sortCol: SortColumn = isSortColumn(filters.sort) ? filters.sort : 'tier';
        const sortDir: SortDir = filters.dir === 'desc' ? 'desc' : 'asc';
        allDomains.sort((a, b) => {
            let av: string | number | boolean | Date | null = a[sortCol as keyof typeof a] as string | number | boolean | Date | null;
            let bv: string | number | boolean | Date | null = b[sortCol as keyof typeof b] as string | number | boolean | Date | null;
            if (av instanceof Date) av = av.getTime();
            if (bv instanceof Date) bv = bv.getTime();
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'boolean') av = av ? 1 : 0;
            if (typeof bv === 'boolean') bv = bv ? 1 : 0;
            const cmp = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv));
            return sortDir === 'desc' ? -cmp : cmp;
        });

        const totalCount = allDomains.length;
        const page = Math.max(1, Number.parseInt(filters.page || '1', 10) || 1);
        const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
        const safePage = Math.min(page, totalPages);
        const paginated = allDomains.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

        return { data: paginated, totalCount, page: safePage, totalPages, error: null };
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
        p.set('sort', col);
        p.set('dir', newDir);
        return `/dashboard/domains?${p.toString()}`;
    }

    function pageHref(pg: number) {
        const p = new URLSearchParams();
        if (params.q) p.set('q', params.q);
        if (params.status) p.set('status', params.status);
        if (params.tier) p.set('tier', params.tier);
        if (params.sort) p.set('sort', params.sort);
        if (params.dir) p.set('dir', params.dir);
        p.set('page', String(pg));
        return `/dashboard/domains?${p.toString()}`;
    }

    const roiPriority = await getRoiPriorityPreview();
    const launchReviewSummary = await getCampaignLaunchReviewSummaryPreview();

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
                    <BulkNameserverCutoverButton domainIds={allDomains.filter(d => d.registrar === 'godaddy').map(d => d.id)} />
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
                                    These domains have no niche, tier, or site template assigned. Use AI to classify them automatically.
                                </p>
                            </div>
                            <ClassifyDomainsButton mode="all" label={`Classify ${uncategorized.length} Domains`} />
                        </CardContent>
                    </Card>
                );
            })()}

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

            {/* Domains Table */}
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
                        }))}
                        hasFilters={!!(params.q || params.status || params.tier)}
                        headerSlot={
                            <>
                                <TableHead><Link href={sortHref('domain')} className="inline-flex items-center hover:text-foreground">Domain<SortIndicator col="domain" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead><Link href={sortHref('status')} className="inline-flex items-center hover:text-foreground">Status<SortIndicator col="status" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead><Link href={sortHref('tier')} className="inline-flex items-center hover:text-foreground">Tier<SortIndicator col="tier" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead><Link href={sortHref('niche')} className="inline-flex items-center hover:text-foreground">Niche<SortIndicator col="niche" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead>Template</TableHead>
                                <TableHead><Link href={sortHref('isDeployed')} className="inline-flex items-center hover:text-foreground">Deployed<SortIndicator col="isDeployed" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
                                <TableHead><Link href={sortHref('renewalDate')} className="inline-flex items-center hover:text-foreground">Renewal<SortIndicator col="renewalDate" activeCol={sortCol} activeDir={sortDir} /></Link></TableHead>
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
                        {page < totalPages && (
                            <Link href={pageHref(page + 1)}>
                                <Button variant="outline" size="sm">Next →</Button>
                            </Link>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
