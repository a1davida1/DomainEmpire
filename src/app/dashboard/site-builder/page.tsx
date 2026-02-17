import Link from 'next/link';
import { db, domains, pageDefinitions } from '@/lib/db';
import { count, eq, isNull } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

async function getBuilderRows() {
    const activeDomains = await db.select({
        id: domains.id,
        domain: domains.domain,
        siteTemplate: domains.siteTemplate,
        isDeployed: domains.isDeployed,
    })
        .from(domains)
        .where(isNull(domains.deletedAt));

    const pageCounts = await db.select({
        domainId: pageDefinitions.domainId,
        total: count(),
    })
        .from(pageDefinitions)
        .groupBy(pageDefinitions.domainId);

    const publishedCounts = await db.select({
        domainId: pageDefinitions.domainId,
        total: count(),
    })
        .from(pageDefinitions)
        .where(eq(pageDefinitions.status, 'published'))
        .groupBy(pageDefinitions.domainId);

    const pageMap = new Map(pageCounts.map((row) => [row.domainId, row.total]));
    const publishedMap = new Map(publishedCounts.map((row) => [row.domainId, row.total]));

    return activeDomains.map((domain) => ({
        ...domain,
        pages: pageMap.get(domain.id) ?? 0,
        published: publishedMap.get(domain.id) ?? 0,
    }));
}

export default async function SiteBuilderPage() {
    const rows = await getBuilderRows();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Site Builder</h1>
                <p className="text-sm text-muted-foreground">Manage page systems across your entire portfolio from one place.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Portfolio Builder Status</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded border p-3 text-sm">
                        <div className="text-muted-foreground">Domains</div>
                        <div className="text-2xl font-semibold">{rows.length}</div>
                    </div>
                    <div className="rounded border p-3 text-sm">
                        <div className="text-muted-foreground">Domains with Pages</div>
                        <div className="text-2xl font-semibold">{rows.filter((r) => r.pages > 0).length}</div>
                    </div>
                    <div className="rounded border p-3 text-sm">
                        <div className="text-muted-foreground">Published Builder Pages</div>
                        <div className="text-2xl font-semibold">{rows.reduce((sum, row) => sum + row.published, 0)}</div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {rows.map((row) => (
                    <Card key={row.id}>
                        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{row.domain}</span>
                                    <Badge variant="outline">{row.siteTemplate || 'authority'}</Badge>
                                    {row.isDeployed ? (
                                        <Badge className="bg-green-600">Deployed</Badge>
                                    ) : (
                                        <Badge variant="secondary">Not Deployed</Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {row.pages} pages · {row.published} published
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button asChild size="sm" variant="outline">
                                    <Link href={`/dashboard/domains/${row.id}/pages`}>Open Builder</Link>
                                </Button>
                                <Button asChild size="sm" variant="outline">
                                    <Link href={`/dashboard/domains/${row.id}/preview`}>Preview Site</Link>
                                </Button>
                                <Button asChild size="sm">
                                    <Link href={`/dashboard/domains/${row.id}`}>Domain Control</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {rows.length === 0 && (
                    <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
                        No active domains yet.
                    </div>
                )}
            </div>
        </div>
    );
}
