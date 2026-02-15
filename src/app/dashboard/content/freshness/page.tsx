import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { db, articles, domains } from '@/lib/db';
import { eq, and, desc, isNull, gte, count, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function getStaleArticles(domainId?: string) {
    const conditions = [
        eq(articles.status, 'published'),
        isNull(articles.deletedAt),
    ];
    if (domainId) conditions.push(eq(articles.domainId, domainId));

    try {
        const rows = await db
            .select({
                id: articles.id,
                title: articles.title,
                domainId: articles.domainId,
                domain: domains.domain,
                stalenessScore: articles.stalenessScore,
                lastRefreshedAt: articles.lastRefreshedAt,
                publishedAt: articles.publishedAt,
                pageviews30d: articles.pageviews30d,
                updatedAt: articles.updatedAt,
            })
            .from(articles)
            .leftJoin(domains, eq(articles.domainId, domains.id))
            .where(and(...conditions))
            .orderBy(desc(articles.stalenessScore))
            .limit(100);

        return rows;
    } catch {
        return [];
    }
}

async function getFreshnessStats(domainId?: string) {
    const conditions = [eq(articles.status, 'published'), isNull(articles.deletedAt)];
    if (domainId) conditions.push(eq(articles.domainId, domainId));

    try {
        const [total, stale, avgScore] = await Promise.all([
            db.select({ count: count() }).from(articles).where(and(...conditions)),
            db.select({ count: count() }).from(articles).where(and(...conditions, gte(articles.stalenessScore, 0.6))),
            db.select({ avg: sql<number>`COALESCE(AVG(${articles.stalenessScore}::numeric), 0)` }).from(articles).where(and(...conditions)),
        ]);
        return {
            totalPublished: total[0]?.count ?? 0,
            staleCount: stale[0]?.count ?? 0,
            avgStaleness: Number(avgScore[0]?.avg ?? 0),
        };
    } catch {
        return { totalPublished: 0, staleCount: 0, avgStaleness: 0 };
    }
}

async function getDomainOptions() {
    try {
        return await db.select({ id: domains.id, domain: domains.domain }).from(domains).orderBy(domains.domain);
    } catch {
        return [];
    }
}

function getStalenessColor(score: number | string | null): string {
    const num = Number(score || 0);
    if (num >= 0.6) return 'bg-red-500';
    if (num >= 0.4) return 'bg-yellow-500';
    if (num >= 0.2) return 'bg-blue-500';
    return 'bg-green-500';
}

function getStalenessLabel(score: number | string | null): string {
    const num = Number(score || 0);
    if (num >= 0.6) return 'Stale';
    if (num >= 0.4) return 'Aging';
    if (num >= 0.2) return 'Okay';
    return 'Fresh';
}

export default async function FreshnessPage({
    searchParams,
}: {
    searchParams: Promise<{ domainId?: string }>;
}) {
    const params = await searchParams;
    const domainId = params.domainId;

    const [allArticles, stats, domainOptions] = await Promise.all([
        getStaleArticles(domainId),
        getFreshnessStats(domainId),
        getDomainOptions(),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Content Freshness</h1>
                    <p className="text-muted-foreground">Monitor and refresh stale content</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Published Articles</p>
                        <p className="mt-1 text-2xl font-bold">{stats.totalPublished}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Stale (score &ge; 0.6)</p>
                        <p className="mt-1 text-2xl font-bold text-red-600">{stats.staleCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground">Avg Staleness</p>
                        <p className="mt-1 text-2xl font-bold">{stats.avgStaleness.toFixed(2)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filter */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-sm font-medium">Domain:</span>
                        <div className="flex gap-2 flex-wrap">
                            <Link href="/dashboard/content/freshness">
                                <Button variant={!domainId ? 'default' : 'outline'} size="sm">All</Button>
                            </Link>
                            {domainOptions.map(d => (
                                <Link key={d.id} href={`/dashboard/content/freshness?domainId=${d.id}`}>
                                    <Button variant={domainId === d.id ? 'default' : 'outline'} size="sm">{d.domain}</Button>
                                </Link>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <RefreshCw className="h-5 w-5" />
                        Articles by Staleness
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {allArticles.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">No published articles found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-2 font-medium">Article</th>
                                        <th className="text-left py-3 px-2 font-medium">Domain</th>
                                        <th className="text-left py-3 px-2 font-medium">Staleness</th>
                                        <th className="text-left py-3 px-2 font-medium">Views (30d)</th>
                                        <th className="text-left py-3 px-2 font-medium">Last Refreshed</th>
                                        <th className="text-left py-3 px-2 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allArticles.map(a => {
                                        const score = Number(a.stalenessScore || 0);
                                        return (
                                            <tr key={a.id} className="border-b last:border-0 hover:bg-accent/50">
                                                <td className="py-3 px-2">
                                                    <Link href={`/dashboard/content/articles/${a.id}`} className="hover:underline font-medium">
                                                        {a.title}
                                                    </Link>
                                                </td>
                                                <td className="py-3 px-2 text-xs">{a.domain || '—'}</td>
                                                <td className="py-3 px-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${getStalenessColor(a.stalenessScore)}`}
                                                                style={{ width: `${Math.min(100, score * 100)}%` }}
                                                            />
                                                        </div>
                                                        <Badge variant={score >= 0.6 ? 'destructive' : 'secondary'} className="text-xs">
                                                            {getStalenessLabel(a.stalenessScore)}
                                                        </Badge>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-2">{a.pageviews30d ?? 0}</td>
                                                <td className="py-3 px-2 text-xs text-muted-foreground">
                                                    {a.lastRefreshedAt ? new Date(a.lastRefreshedAt).toLocaleDateString() : 'Never'}
                                                </td>
                                                <td className="py-3 px-2">
                                                    <Link href={`/dashboard/content/articles/${a.id}`}>
                                                        <Button variant="outline" size="sm">View</Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
