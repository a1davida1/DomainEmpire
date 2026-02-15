import { Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Plus, ExternalLink } from 'lucide-react';
import { db, domains } from '@/lib/db';
import { isNull } from 'drizzle-orm';
import { formatDate } from '@/lib/format-utils';
import { cn } from '@/lib/utils';
import { DeployAllButton } from '@/components/dashboard/DeployAllButton';
import { BulkNameserverCutoverButton } from '@/components/dashboard/BulkNameserverCutoverButton';
import { DomainSearch } from '@/components/dashboard/DomainSearch';
import { DomainActions } from '@/components/dashboard/DomainActions';
import { getDomainRoiPriorities } from '@/lib/domain/roi-priority-service';
import { RoiCampaignAutoplanButton } from '@/components/dashboard/RoiCampaignAutoplanButton';
import { getCampaignLaunchReviewSlaSummary } from '@/lib/review/campaign-launch-sla';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, string> = {
    parked: 'bg-gray-500',
    active: 'bg-green-500',
    redirect: 'bg-blue-500',
    forsale: 'bg-orange-500',
    defensive: 'bg-purple-500',
};

const tierLabels: Record<number, string> = {
    1: 'Priority',
    2: 'Secondary',
    3: 'Hold',
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

interface DomainsPageProps {
    readonly searchParams: Promise<{ readonly q?: string; readonly status?: string; readonly tier?: string }>;
}

async function getDomains(filters: { q?: string; status?: string; tier?: string }) {
    try {
        let allDomains = await db.select().from(domains).where(isNull(domains.deletedAt)).orderBy(domains.tier, domains.domain);

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

        return { data: allDomains, error: null };
    } catch (error) {
        console.error('Failed to fetch domains:', error);
        return { data: [], error: 'Failed to load domains. Please try again later.' };
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
    const { data: allDomains, error } = await getDomains(params);
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
    const totalCount = unfilteredDomains.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Domains</h1>
                    <p className="text-muted-foreground">
                        Manage your domain portfolio ({totalCount} total)
                    </p>
                </div>
                <div className="flex gap-2">
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
                {['active', 'parked', 'redirect', 'forsale', 'defensive'].map((status) => (
                    <Card key={status}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium capitalize text-muted-foreground">{status}</p>
                                    <p className="text-2xl font-bold">{statusCounts[status] || 0}</p>
                                </div>
                                <div className={`h-3 w-3 rounded-full ${statusColors[status]}`} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Domain</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Tier</TableHead>
                                <TableHead>Niche</TableHead>
                                <TableHead>Template</TableHead>
                                <TableHead>Deployed</TableHead>
                                <TableHead>Renewal</TableHead>
                                <TableHead className="w-12"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allDomains.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        <p className="text-muted-foreground">
                                            {params.q || params.status || params.tier
                                                ? 'No domains match your filters.'
                                                : 'No domains yet.'}
                                        </p>
                                        {!params.q && !params.status && !params.tier && (
                                            <Link href="/dashboard/domains/new">
                                                <Button variant="link" className="mt-2">
                                                    Add your first domain
                                                </Button>
                                            </Link>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                allDomains.map((domain) => (
                                    <TableRow key={domain.id}>
                                        <TableCell>
                                            <Link
                                                href={`/dashboard/domains/${domain.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {domain.domain}
                                            </Link>
                                            {domain.isDeployed && (
                                                <a
                                                    href={`https://${domain.domain}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-2 inline-flex"
                                                    aria-label={`Open ${domain.domain} in new tab`}
                                                >
                                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                                </a>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="secondary"
                                                className={cn(statusColors[domain.status] || 'bg-gray-500', 'text-white')}
                                            >
                                                {domain.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                T{domain.tier} - {tierLabels[domain.tier || 3]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-muted-foreground">
                                                {domain.niche || '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="capitalize text-muted-foreground">
                                                {domain.siteTemplate || '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {domain.isDeployed ? (
                                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                                    Live
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm">
                                                {formatDate(domain.renewalDate)}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <DomainActions
                                                domainId={domain.id}
                                                domainName={domain.domain}
                                                isDeployed={domain.isDeployed ?? false}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
