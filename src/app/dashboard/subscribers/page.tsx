import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Download, Users, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { db, subscribers, domains } from '@/lib/db';
import { eq, count, desc } from 'drizzle-orm';
import { getSubscriberStats } from '@/lib/subscribers';
import { DataLoadError } from '@/components/dashboard/DataLoadError';
import { getAuthUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

async function getDomainOptions() {
    try {
        const result = await db
            .select({ id: domains.id, domain: domains.domain })
            .from(domains)
            .orderBy(domains.domain);
        return { data: result, error: null };
    } catch (err) {
        console.error('[Subscribers] Failed to load domain options:', err);
        return { data: [], error: err instanceof Error ? err.message : 'Failed to load domains' };
    }
}

async function getRecentSubscribers(domainId?: string, page = 1) {
    const limit = 50;
    const offset = (page - 1) * limit;
    const where = domainId ? eq(subscribers.domainId, domainId) : undefined;

    try {
        const [rows, totalResult] = await Promise.all([
            db
                .select({
                    id: subscribers.id,
                    email: subscribers.email,
                    name: subscribers.name,
                    source: subscribers.source,
                    status: subscribers.status,
                    estimatedValue: subscribers.estimatedValue,
                    domain: domains.domain,
                    createdAt: subscribers.createdAt,
                })
                .from(subscribers)
                .leftJoin(domains, eq(subscribers.domainId, domains.id))
                .where(where)
                .orderBy(desc(subscribers.createdAt))
                .limit(limit)
                .offset(offset),
            db.select({ count: count() }).from(subscribers).where(where),
        ]);
        return { rows, total: totalResult[0]?.count ?? 0, error: null as string | null };
    } catch (err) {
        console.error('[Subscribers] Failed to load subscribers:', err);
        return { rows: [], total: 0, error: err instanceof Error ? err.message : 'Failed to load subscribers' };
    }
}

const SOURCE_COLORS: Record<string, string> = {
    lead_form: 'bg-blue-100 text-blue-800',
    newsletter: 'bg-green-100 text-green-800',
    wizard: 'bg-purple-100 text-purple-800',
    popup: 'bg-orange-100 text-orange-800',
    scroll_cta: 'bg-pink-100 text-pink-800',
};

export default async function SubscribersPage({
    searchParams,
}: {
    searchParams: Promise<{ domainId?: string; page?: string }>;
}) {
    const user = await getAuthUser();
    if (!user || user.role !== 'admin') {
        redirect('/dashboard');
    }

    const params = await searchParams;
    const domainId = params.domainId;
    const rawPage = parseInt(params.page || '1', 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;

    const [domainOptionsResult, stats, subscribersResult] = await Promise.all([
        getDomainOptions(),
        getSubscriberStats(domainId),
        getRecentSubscribers(domainId, page),
    ]);
    const domainOptions = domainOptionsResult.data;
    const { rows, total, error: subscribersError } = subscribersResult;

    const totalPages = Math.ceil(total / 50);

    return (
        <div className="space-y-6">
            {(domainOptionsResult.error || subscribersError) && (
                <DataLoadError
                    message="Failed to load subscriber data"
                    detail={domainOptionsResult.error || subscribersError || undefined}
                />
            )}
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Subscribers</h1>
                    <p className="text-muted-foreground">Email captures from deployed sites</p>
                </div>
                <div className="flex gap-2">
                    <a href={`/api/subscribers/export${domainId ? `?domainId=${domainId}` : ''}`}>
                        <Button variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            Export CSV
                        </Button>
                    </a>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Total Subscribers</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{stats.total.toLocaleString('en-US')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Last 30 Days</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{stats.last30d.toLocaleString('en-US')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Top Source</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">
                            {Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Est. Value</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-green-600">
                            ${stats.estimatedTotalValue.toLocaleString('en-US')}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-sm font-medium">Filter by domain:</span>
                        <div className="flex gap-2 flex-wrap">
                            <Link href="/dashboard/subscribers">
                                <Button variant={!domainId ? 'default' : 'outline'} size="sm">All</Button>
                            </Link>
                            {domainOptions.map(d => (
                                <Link key={d.id} href={`/dashboard/subscribers?domainId=${d.id}`}>
                                    <Button
                                        variant={domainId === d.id ? 'default' : 'outline'}
                                        size="sm"
                                    >
                                        {d.domain}
                                    </Button>
                                </Link>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle>
                        {total.toLocaleString('en-US')} subscriber{total !== 1 ? 's' : ''}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            No subscribers yet. Deploy sites with lead capture forms to start collecting emails.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-2 font-medium">Email</th>
                                        <th className="text-left py-3 px-2 font-medium">Name</th>
                                        <th className="text-left py-3 px-2 font-medium">Source</th>
                                        <th className="text-left py-3 px-2 font-medium">Domain</th>
                                        <th className="text-left py-3 px-2 font-medium">Value</th>
                                        <th className="text-left py-3 px-2 font-medium">Status</th>
                                        <th className="text-left py-3 px-2 font-medium">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(sub => (
                                        <tr key={sub.id} className="border-b last:border-0 hover:bg-accent/50">
                                            <td className="py-3 px-2 font-mono text-xs">{sub.email}</td>
                                            <td className="py-3 px-2">{sub.name || '—'}</td>
                                            <td className="py-3 px-2">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[sub.source] || 'bg-gray-100'}`}>
                                                    {sub.source.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 text-xs">{sub.domain || '—'}</td>
                                            <td className="py-3 px-2 text-green-600">
                                                {sub.estimatedValue ? `$${sub.estimatedValue}` : '—'}
                                            </td>
                                            <td className="py-3 px-2">
                                                <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                                                    {sub.status}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-2 text-xs text-muted-foreground">
                                                {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString('en-US', { timeZone: 'UTC' }) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <span className="text-sm text-muted-foreground">
                                Page {page} of {totalPages}
                            </span>
                            <div className="flex gap-2">
                                {page > 1 && (
                                    <Link href={`/dashboard/subscribers?${domainId ? `domainId=${domainId}&` : ''}page=${page - 1}`}>
                                        <Button variant="outline" size="sm">Previous</Button>
                                    </Link>
                                )}
                                {page < totalPages && (
                                    <Link href={`/dashboard/subscribers?${domainId ? `domainId=${domainId}&` : ''}page=${page + 1}`}>
                                        <Button variant="outline" size="sm">Next</Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
