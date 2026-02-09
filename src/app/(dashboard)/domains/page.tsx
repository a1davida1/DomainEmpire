import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Plus, Search, Filter, ExternalLink, MoreHorizontal } from 'lucide-react';
import { db, domains } from '@/lib/db';

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

async function getDomains() {
    try {
        const allDomains = await db.select().from(domains).orderBy(domains.tier, domains.domain);
        return { data: allDomains, error: null };
    } catch (error) {
        console.error('Failed to fetch domains:', error);
        return { data: [], error: 'Failed to load domains. Please try again later.' };
    }
}

export default async function DomainsPage() {
    const { data: allDomains, error } = await getDomains();

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

    // Group by status for summary
    const statusCounts = allDomains.reduce((acc, d) => {
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
                        Manage your domain portfolio ({allDomains.length} total)
                    </p>
                </div>
                <div className="flex gap-2">
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
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search domains..."
                        className="pl-9"
                    />
                </div>
                <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                </Button>
            </div>

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
                                        <p className="text-muted-foreground">No domains yet.</p>
                                        <Link href="/dashboard/domains/new">
                                            <Button variant="link" className="mt-2">
                                                Add your first domain
                                            </Button>
                                        </Link>
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
                                                className={`${statusColors[domain.status] || 'bg-gray-500'} text-white`}
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
                                            {domain.renewalDate ? (
                                                <span className="text-sm">
                                                    {new Date(domain.renewalDate).toLocaleDateString()}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
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
