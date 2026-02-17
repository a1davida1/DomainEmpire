import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Search, Filter, Edit, ExternalLink, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { db, articles } from '@/lib/db';
import { desc, like, or, eq, and, isNull, inArray, sql, type SQL } from 'drizzle-orm';
import { formatDate, formatNumber } from '@/lib/format-utils';
import { domains } from '@/lib/db/schema';

interface PageProps {
    readonly searchParams: Promise<{
        readonly q?: string;
        readonly status?: string;
        readonly contentType?: string;
        readonly page?: string;
        readonly domainId?: string;
    }>;
}

export const dynamic = 'force-dynamic';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ARTICLE_STATUS_VALUES = ['generating', 'draft', 'review', 'approved', 'published', 'archived'] as const;
type ArticleStatus = (typeof ARTICLE_STATUS_VALUES)[number];

const CONTENT_TYPE_VALUES = [
    'article',
    'comparison',
    'calculator',
    'cost_guide',
    'lead_capture',
    'health_decision',
    'checklist',
    'faq',
    'review',
    'wizard',
    'configurator',
    'quiz',
    'survey',
    'assessment',
    'interactive_infographic',
    'interactive_map',
] as const;
type ContentTypeValue = (typeof CONTENT_TYPE_VALUES)[number];
type ContentTypeFilter = '' | ContentTypeValue | 'interactive';

const INTERACTIVE_CONTENT_TYPES: ContentTypeValue[] = [
    'wizard',
    'configurator',
    'quiz',
    'survey',
    'assessment',
    'interactive_infographic',
    'interactive_map',
];

const CONTENT_TYPE_FILTER_OPTIONS: Array<{ value: ContentTypeFilter; label: string }> = [
    { value: '', label: 'All types' },
    { value: 'article', label: 'Article' },
    { value: 'calculator', label: 'Calculator' },
    { value: 'interactive', label: 'Interactive' },
    { value: 'comparison', label: 'Comparison' },
    { value: 'cost_guide', label: 'Cost Guide' },
    { value: 'lead_capture', label: 'Lead Capture' },
    { value: 'review', label: 'Review' },
    { value: 'faq', label: 'FAQ' },
];

function isArticleStatus(value: string | undefined): value is ArticleStatus {
    return !!value && (ARTICLE_STATUS_VALUES as readonly string[]).includes(value);
}

function isContentTypeValue(value: string | undefined): value is ContentTypeValue {
    return !!value && (CONTENT_TYPE_VALUES as readonly string[]).includes(value);
}

function normalizeContentTypeFilter(value: string | undefined): ContentTypeFilter {
    if (!value) return '';
    if (value === 'interactive') return 'interactive';
    if (isContentTypeValue(value)) return value;
    return '';
}

function formatContentTypeLabel(contentType: string | null): string {
    if (!contentType) return 'article';
    return contentType.replaceAll('_', ' ');
}

function escapeLikeWildcard(value: string): string {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
}

export default async function ArticlesPage(props: Readonly<PageProps>) {
    const { searchParams } = props;
    const params = await searchParams;

    const query = params.q?.trim() || '';
    const statusFilter: ArticleStatus | '' = isArticleStatus(params.status) ? params.status : '';
    const contentTypeFilter = normalizeContentTypeFilter(params.contentType);
    const domainIdFilter = typeof params.domainId === 'string' && UUID_REGEX.test(params.domainId.trim())
        ? params.domainId.trim()
        : null;
    const page = Math.max(1, Number.parseInt(params.page || '1', 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const createFilterUrl = (overrides: {
        q?: string;
        status?: ArticleStatus | '';
        contentType?: ContentTypeFilter;
        page?: number;
        domainId?: string | null;
    }) => {
        const sp = new URLSearchParams();
        const nextQ = overrides.q ?? query;
        const nextStatus = overrides.status ?? statusFilter;
        const nextContentType = overrides.contentType ?? contentTypeFilter;
        const nextPage = overrides.page ?? page;
        const nextDomainId = overrides.domainId === undefined ? domainIdFilter : overrides.domainId;

        if (nextQ) sp.set('q', nextQ);
        if (nextStatus) sp.set('status', nextStatus);
        if (nextContentType) sp.set('contentType', nextContentType);
        if (nextDomainId) sp.set('domainId', nextDomainId);
        if (nextPage > 1) sp.set('page', String(nextPage));
        return `/dashboard/content/articles${sp.toString() ? `?${sp.toString()}` : ''}`;
    };

    const baseFilters: SQL[] = [isNull(articles.deletedAt)];
    if (query) {
        const escapedQuery = escapeLikeWildcard(query);
        const searchFilter = or(
            like(articles.title, `%${escapedQuery}%`),
            like(articles.targetKeyword, `%${escapedQuery}%`),
            like(articles.slug, `%${escapedQuery}%`),
        );
        if (searchFilter) baseFilters.push(searchFilter);
    }
    if (statusFilter) {
        baseFilters.push(eq(articles.status, statusFilter));
    }
    if (domainIdFilter) {
        baseFilters.push(eq(articles.domainId, domainIdFilter));
    }

    const contentTypeClause = (() => {
        if (!contentTypeFilter) return undefined;
        if (contentTypeFilter === 'interactive') {
            return inArray(articles.contentType, INTERACTIVE_CONTENT_TYPES);
        }
        return eq(articles.contentType, contentTypeFilter);
    })();

    const whereClause = and(...baseFilters, ...(contentTypeClause ? [contentTypeClause] : []));
    const baseWhereClause = and(...baseFilters);

    const [domainFilterRecord, contentTypeRows, allArticles] = await Promise.all([
        domainIdFilter
            ? db.select({
                id: domains.id,
                domain: domains.domain,
            })
                .from(domains)
                .where(eq(domains.id, domainIdFilter))
                .limit(1)
            : Promise.resolve([]),
        db.select({
            contentType: articles.contentType,
            count: sql<number>`count(*)::int`,
        })
            .from(articles)
            .where(baseWhereClause)
            .groupBy(articles.contentType),
        db.query.articles.findMany({
            where: whereClause,
            limit,
            offset,
            orderBy: [desc(articles.createdAt)],
            with: {
                domain: true,
            },
        }),
    ]);

    const countByType = new Map<string, number>();
    for (const row of contentTypeRows) {
        countByType.set(row.contentType || 'article', row.count);
    }
    const totalForBase = contentTypeRows.reduce((sum, row) => sum + row.count, 0);
    const interactiveCount = INTERACTIVE_CONTENT_TYPES.reduce((sum, value) => sum + (countByType.get(value) ?? 0), 0);
    const calculatorCount = countByType.get('calculator') ?? 0;
    const articleCount = countByType.get('article') ?? 0;
    const comparisonCount = countByType.get('comparison') ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Content Library</h1>
                    <p className="text-muted-foreground">
                        {domainIdFilter && domainFilterRecord[0]
                            ? `Review content for ${domainFilterRecord[0].domain}`
                            : 'View and edit created articles, calculators, and interactive pages'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href="/dashboard/content/duplicates">
                        <Button variant="outline">
                            Check Duplicates
                        </Button>
                    </Link>
                    <Link href="/dashboard/content/new">
                        <Button>
                            <FileText className="mr-2 h-4 w-4" />
                            New Article
                        </Button>
                    </Link>
                </div>
            </div>

            <Card className="border-sky-200 bg-sky-50/40">
                <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-sky-900">Quick Content Views</p>
                        <p className="text-xs text-sky-900/80">
                            Total in scope: {totalForBase}. Articles: {articleCount}, Calculators: {calculatorCount}, Interactive: {interactiveCount}, Comparisons: {comparisonCount}.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href={createFilterUrl({ contentType: '', page: 1 })}>
                            <Button size="sm" variant={contentTypeFilter === '' ? 'default' : 'outline'}>
                                All ({totalForBase})
                            </Button>
                        </Link>
                        <Link href={createFilterUrl({ contentType: 'calculator', page: 1 })}>
                            <Button size="sm" variant={contentTypeFilter === 'calculator' ? 'default' : 'outline'}>
                                Calculators ({calculatorCount})
                            </Button>
                        </Link>
                        <Link href={createFilterUrl({ contentType: 'interactive', page: 1 })}>
                            <Button size="sm" variant={contentTypeFilter === 'interactive' ? 'default' : 'outline'}>
                                Interactive ({interactiveCount})
                            </Button>
                        </Link>
                        <Link href={createFilterUrl({ status: 'review', page: 1 })}>
                            <Button size="sm" variant={statusFilter === 'review' ? 'default' : 'outline'}>
                                Needs Review
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            <form className="grid gap-3 md:grid-cols-5" action="/dashboard/content/articles" method="get">
                <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        name="q"
                        placeholder="Search title, keyword, slug..."
                        defaultValue={query}
                        className="pl-9"
                    />
                </div>
                <select
                    name="status"
                    defaultValue={statusFilter}
                    aria-label="Status filter"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                >
                    <option value="">All statuses</option>
                    {ARTICLE_STATUS_VALUES.map((value) => (
                        <option key={value} value={value}>{value}</option>
                    ))}
                </select>
                <select
                    name="contentType"
                    defaultValue={contentTypeFilter}
                    aria-label="Content type filter"
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                >
                    {CONTENT_TYPE_FILTER_OPTIONS.map((option) => (
                        <option key={option.value || 'all'} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="flex gap-2">
                    {domainIdFilter && <input type="hidden" name="domainId" value={domainIdFilter} />}
                    <Button type="submit" variant="outline">
                        <Filter className="mr-2 h-4 w-4" />
                        Apply
                    </Button>
                    <Link href={createFilterUrl({ q: '', status: '', contentType: '', page: 1 })}>
                        <Button type="button" variant="ghost">Clear</Button>
                    </Link>
                </div>
            </form>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Domain</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>AI Score</TableHead>
                                <TableHead>Words</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allArticles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        No content found for this filter.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                allArticles.map((article) => (
                                    <TableRow key={article.id}>
                                        <TableCell>
                                            <div className="font-medium">{article.title}</div>
                                            <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                                                /{article.slug}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="capitalize">
                                                {formatContentTypeLabel(article.contentType)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{article.domain?.domain || 'Unknown'}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize">
                                                {article.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {article.aiDetectionScore != null ? (
                                                <span className={cn(
                                                    'inline-flex items-center gap-1.5 text-sm font-medium tabular-nums',
                                                    article.aiDetectionScore < 0.30 && 'text-green-600 dark:text-green-400',
                                                    article.aiDetectionScore >= 0.30 && article.aiDetectionScore < 0.50 && 'text-yellow-600 dark:text-yellow-400',
                                                    article.aiDetectionScore >= 0.50 && 'text-red-600 dark:text-red-400',
                                                )}>
                                                    <span className={cn(
                                                        'h-2 w-2 rounded-full',
                                                        article.aiDetectionScore < 0.30 && 'bg-green-500',
                                                        article.aiDetectionScore >= 0.30 && article.aiDetectionScore < 0.50 && 'bg-yellow-500',
                                                        article.aiDetectionScore >= 0.50 && 'bg-red-500',
                                                    )} />
                                                    {article.aiDetectionScore.toFixed(2)}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{formatNumber(article.wordCount)}</TableCell>
                                        <TableCell>{formatDate(article.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link href={`/dashboard/content/articles/${article.id}`}>
                                                    <Button variant="ghost" size="icon" aria-label={`Edit content ${article.title}`}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                {article.domainId ? (
                                                    <Link href={`/dashboard/domains/${article.domainId}/preview?articleId=${article.id}`}>
                                                        <Button variant="ghost" size="sm">
                                                            Preview
                                                        </Button>
                                                    </Link>
                                                ) : (
                                                    <Button variant="ghost" size="sm" disabled>
                                                        Preview
                                                    </Button>
                                                )}
                                                <Link href={`/dashboard/content/articles/${article.id}/review`}>
                                                    <Button variant="ghost" size="sm">
                                                        Review
                                                    </Button>
                                                </Link>
                                                {article.domain?.isDeployed && article.status === 'published' && (
                                                    <a
                                                        href={`https://${article.domain.domain}/${article.slug}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        aria-label={`View ${article.slug} on live site`}
                                                    >
                                                        <Button variant="ghost" size="icon">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </Button>
                                                    </a>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    asChild={page > 1}
                >
                    {page > 1 ? (
                        <Link href={createFilterUrl({ page: page - 1 })}>
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Previous
                        </Link>
                    ) : (
                        <span>
                            <ChevronLeft className="mr-2 h-4 w-4" />
                            Previous
                        </span>
                    )}
                </Button>
                <div className="text-sm text-muted-foreground">
                    Page {page}
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={allArticles.length < limit}
                    asChild={allArticles.length >= limit}
                >
                    {allArticles.length >= limit ? (
                        <Link href={createFilterUrl({ page: page + 1 })}>
                            Next
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    ) : (
                        <span>
                            Next
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </span>
                    )}
                </Button>
            </div>
        </div>
    );
}
