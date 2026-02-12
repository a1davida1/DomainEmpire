import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ArrowLeft,
    ExternalLink,
    Edit,
    Globe,
    Calendar,
    DollarSign,
    Tag,
    FileText,
    BarChart3,
    Trash2
} from 'lucide-react';
import { db, domains, articles, keywords } from '@/lib/db';
import { eq, sql, and, isNull } from 'drizzle-orm';

interface PageProps {
    params: Promise<{ id: string }>;
}

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

async function getDomain(id: string) {
    try {
        const result = await db.select().from(domains).where(and(eq(domains.id, id), isNull(domains.deletedAt))).limit(1);
        return result[0] || null;
    } catch {
        return null;
    }
}

async function getDomainStats(domainId: string) {
    try {
        const [articleCount, keywordCount] = await Promise.all([
            db.select({ count: sql<number>`count(*)::int` }).from(articles).where(and(eq(articles.domainId, domainId), isNull(articles.deletedAt))),
            db.select({ count: sql<number>`count(*)::int` }).from(keywords).where(eq(keywords.domainId, domainId)),
        ]);
        return {
            articles: articleCount[0]?.count ?? 0,
            keywords: keywordCount[0]?.count ?? 0,
        };
    } catch {
        return { articles: 0, keywords: 0 };
    }
}

async function getRecentArticles(domainId: string) {
    try {
        return await db
            .select({
                id: articles.id,
                title: articles.title,
                status: articles.status,
                wordCount: articles.wordCount,
                createdAt: articles.createdAt,
            })
            .from(articles)
            .where(and(eq(articles.domainId, domainId), isNull(articles.deletedAt)))
            .orderBy(articles.createdAt)
            .limit(5);
    } catch {
        return [];
    }
}

export default async function DomainDetailPage({ params }: PageProps) {
    const { id } = await params;
    const domain = await getDomain(id);

    if (!domain) {
        notFound();
    }

    const [stats, recentArticles] = await Promise.all([
        getDomainStats(id),
        getRecentArticles(id),
    ]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/domains">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">{domain.domain}</h1>
                            <Badge className={`${statusColors[domain.status]} text-white`}>
                                {domain.status}
                            </Badge>
                            {domain.isDeployed && (
                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                    Live
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            Added {domain.createdAt ? new Date(domain.createdAt).toLocaleDateString() : 'Unknown'}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    {domain.isDeployed && (
                        <a href={`https://${domain.domain}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Visit Site
                            </Button>
                        </a>
                    )}
                    <Link href={`/dashboard/domains/${id}/edit`}>
                        <Button variant="outline">
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-primary/10 p-2">
                                <FileText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.articles}</p>
                                <p className="text-sm text-muted-foreground">Articles</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-blue-500/10 p-2">
                                <Tag className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.keywords}</p>
                                <p className="text-sm text-muted-foreground">Keywords</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-green-500/10 p-2">
                                <DollarSign className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    ${domain.purchasePrice?.toFixed(2) || '0.00'}
                                </p>
                                <p className="text-sm text-muted-foreground">Purchase Price</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-orange-500/10 p-2">
                                <BarChart3 className="h-5 w-5 text-orange-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">T{domain.tier}</p>
                                <p className="text-sm text-muted-foreground">{tierLabels[domain.tier || 3]}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Domain Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5" />
                            Domain Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">TLD</p>
                                <p className="font-medium">.{domain.tld}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Registrar</p>
                                <p className="font-medium capitalize">{domain.registrar}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Bucket</p>
                                <Badge variant="outline" className="capitalize">{domain.bucket}</Badge>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Template</p>
                                <p className="font-medium capitalize">{domain.siteTemplate || 'Not set'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Niche</p>
                                <p className="font-medium capitalize">{domain.niche || 'Not set'}</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Sub-Niche</p>
                                <p className="font-medium capitalize">{domain.subNiche || 'Not set'}</p>
                            </div>
                        </div>

                        {domain.tags && domain.tags.length > 0 && (
                            <div>
                                <p className="mb-2 text-sm font-medium text-muted-foreground">Tags</p>
                                <div className="flex flex-wrap gap-2">
                                    {domain.tags.map((tag) => (
                                        <Badge key={tag} variant="secondary">{tag}</Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        {domain.notes && (
                            <div>
                                <p className="mb-1 text-sm font-medium text-muted-foreground">Notes</p>
                                <p className="text-sm whitespace-pre-wrap">{domain.notes}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Financial Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Financial & Dates
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Purchase Date</p>
                                <p className="font-medium">
                                    {domain.purchaseDate
                                        ? new Date(domain.purchaseDate).toLocaleDateString()
                                        : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Purchase Price</p>
                                <p className="font-medium">
                                    {domain.purchasePrice ? `$${domain.purchasePrice.toFixed(2)}` : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Renewal Date</p>
                                <p className="font-medium">
                                    {domain.renewalDate
                                        ? new Date(domain.renewalDate).toLocaleDateString()
                                        : 'Not set'}
                                </p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Renewal Price</p>
                                <p className="font-medium">
                                    {domain.renewalPrice ? `$${domain.renewalPrice.toFixed(2)}` : 'Not set'}
                                </p>
                            </div>
                        </div>

                        {(domain.estimatedFlipValueLow || domain.estimatedMonthlyRevenueLow) && (
                            <div className="mt-4 border-t pt-4">
                                <p className="mb-3 text-sm font-medium">Valuation Estimates</p>
                                <div className="grid grid-cols-2 gap-4">
                                    {domain.estimatedFlipValueLow && (
                                        <div>
                                            <p className="text-sm text-muted-foreground">Flip Value</p>
                                            <p className="font-medium">
                                                ${domain.estimatedFlipValueLow.toLocaleString()} - ${domain.estimatedFlipValueHigh?.toLocaleString() || '?'}
                                            </p>
                                        </div>
                                    )}
                                    {domain.estimatedMonthlyRevenueLow && (
                                        <div>
                                            <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                                            <p className="font-medium">
                                                ${domain.estimatedMonthlyRevenueLow.toLocaleString()} - ${domain.estimatedMonthlyRevenueHigh?.toLocaleString() || '?'}/mo
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent Articles */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Recent Articles</CardTitle>
                        <CardDescription>Content generated for this domain</CardDescription>
                    </div>
                    <Button size="sm">
                        Generate Article
                    </Button>
                </CardHeader>
                <CardContent>
                    {recentArticles.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-muted-foreground">No articles yet.</p>
                            <Button variant="link">Generate your first article</Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {recentArticles.map((article) => (
                                <div
                                    key={article.id}
                                    className="flex items-center justify-between rounded-lg border p-3"
                                >
                                    <div>
                                        <p className="font-medium">{article.title}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {article.wordCount || 0} words • {article.createdAt && new Date(article.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="capitalize">{article.status}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <Trash2 className="h-5 w-5" />
                        Danger Zone
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-4 text-sm text-muted-foreground">
                        Deleting this domain will also delete all associated articles, keywords, and analytics data.
                        This action cannot be undone.
                    </p>
                    <Button variant="destructive">
                        Delete Domain
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
