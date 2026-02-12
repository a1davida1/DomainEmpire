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
import { DomainSearch } from '@/components/dashboard/DomainSearch';
import { DomainActions } from '@/components/dashboard/DomainActions';

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

export default async function DomainsPage(props: Readonly<DomainsPageProps>) {
    const { searchParams } = props;
    const params = await searchParams;
    const { data: allDomains, error } = await getDomains(params);

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
