import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { db, domains, articles } from '@/lib/db';
import { BulkArticleActions } from '@/components/dashboard/BulkArticleActions';
import { ToolReviewPanel } from '@/components/dashboard/ToolReviewPanel';
import { cn } from '@/lib/utils';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ articleId?: string; tab?: string }>;
}

const statusConfig: Record<string, { label: string; color: string; icon: 'check' | 'clock' | 'alert' }> = {
    generating: { label: 'Generating', color: 'bg-yellow-100 text-yellow-800', icon: 'clock' },
    draft: { label: 'Draft', color: 'bg-blue-100 text-blue-800', icon: 'clock' },
    review: { label: 'In Review', color: 'bg-pink-100 text-pink-800', icon: 'alert' },
    approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-800', icon: 'check' },
    published: { label: 'Published', color: 'bg-green-100 text-green-800', icon: 'check' },
    archived: { label: 'Archived', color: 'bg-gray-100 text-gray-600', icon: 'clock' },
};

function StatusIcon({ status }: { status: string }) {
    const config = statusConfig[status];
    if (!config) return null;
    if (config.icon === 'check') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (config.icon === 'alert') return <AlertCircle className="h-3.5 w-3.5 text-pink-500" />;
    return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
}

export default async function PreviewPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const { articleId, tab } = await searchParams;
    const activeTab: 'content' | 'review' = tab === 'review' ? 'review' : 'content';

    const [domain] = await db.select({
        id: domains.id,
        domain: domains.domain,
        niche: domains.niche,
        themeStyle: domains.themeStyle,
        siteTemplate: domains.siteTemplate,
    })
        .from(domains)
        .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
        .limit(1);

    if (!domain) notFound();

    const allArticles = await db.select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        wordCount: articles.wordCount,
        targetKeyword: articles.targetKeyword,
        contentType: articles.contentType,
        createdAt: articles.createdAt,
    })
        .from(articles)
        .where(and(eq(articles.domainId, id), isNull(articles.deletedAt)))
        .orderBy(desc(articles.createdAt));

    const previewUrl = articleId
        ? `/api/domains/${id}/preview?articleId=${articleId}`
        : `/api/domains/${id}/preview`;

    const makeUrl = (opts: { articleId?: string; tab?: 'content' | 'review' }) => {
        const sp = new URLSearchParams();
        if (opts.articleId) sp.set('articleId', opts.articleId);
        if (opts.tab && opts.tab !== 'content') sp.set('tab', opts.tab);
        const qs = sp.toString();
        return `/dashboard/domains/${id}/preview${qs ? `?${qs}` : ''}`;
    };

    const statusCounts = allArticles.reduce((acc, a) => {
        const s = a.status || 'draft';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col gap-0">
            {/* Header Bar */}
            <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="flex items-center gap-3">
                    <Link href={`/dashboard/domains/${id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-sm font-semibold">{domain.domain}</h1>
                        <p className="text-xs text-muted-foreground">
                            Site Preview · {domain.themeStyle || 'default'} theme · {domain.siteTemplate || 'authority'} template
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {Object.entries(statusCounts).map(([status, count]) => (
                        <Badge key={status} variant="outline" className="text-[10px]">
                            {status}: {count}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Main Content: Sidebar + Preview */}
            <div className="flex flex-1 overflow-hidden">
                {/* Article Sidebar */}
                <div className={cn('shrink-0 overflow-y-auto border-r bg-muted/30', activeTab === 'review' ? 'w-96' : 'w-72')}>
                    <div className="p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 rounded-md border bg-card p-1">
                                <Link
                                    href={makeUrl({ articleId, tab: 'content' })}
                                    className={cn(
                                        'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                                        activeTab === 'content' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    Content
                                </Link>
                                <Link
                                    href={makeUrl({ articleId, tab: 'review' })}
                                    className={cn(
                                        'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                                        activeTab === 'review' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    Review
                                </Link>
                            </div>
                            {activeTab === 'content' && (
                                <span className="text-[10px] text-muted-foreground">
                                    {allArticles.length} items
                                </span>
                            )}
                        </div>

                        {activeTab === 'content' && (
                            <>
                                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Content ({allArticles.length})
                                </h2>
                                <BulkArticleActions articles={allArticles.map(a => ({ id: a.id, status: a.status }))} />

                        {/* Homepage link */}
                        <Link
                            href={makeUrl({ tab: 'content' })}
                            className={`mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
                                !articleId ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted'
                            }`}
                        >
                            <Eye className="h-3.5 w-3.5 text-blue-500" />
                            <span className="font-medium">Homepage</span>
                        </Link>

                        {/* Article List */}
                        <div className="space-y-1">
                            {allArticles.map((article) => {
                                const isActive = articleId === article.id;
                                const sc = statusConfig[article.status || 'draft'] || statusConfig.draft;
                                return (
                                    <div
                                        key={article.id}
                                        className={cn(
                                            'flex flex-col gap-2 rounded-md border px-3 py-2 text-xs transition-colors',
                                            isActive ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted',
                                        )}
                                    >
                                        <Link
                                            href={makeUrl({ articleId: article.id, tab: 'content' })}
                                            className="block"
                                        >
                                            <div className="flex items-start justify-between gap-1">
                                                <span className="line-clamp-2 font-medium leading-tight">{article.title}</span>
                                                <StatusIcon status={article.status || 'draft'} />
                                            </div>
                                            <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                                                <Badge className={`${sc.color} px-1 py-0 text-[9px]`}>{sc.label}</Badge>
                                                {article.wordCount && <span>{article.wordCount.toLocaleString('en-US')}w</span>}
                                            </div>
                                        </Link>
                                        <div className="flex flex-wrap gap-2">
                                            <Link
                                                href={makeUrl({ articleId: article.id, tab: 'review' })}
                                                className="text-[11px] text-primary hover:underline"
                                            >
                                                Review tool →
                                            </Link>
                                            <Link
                                                href={`/dashboard/content/articles/${article.id}/review`}
                                                className="text-[11px] text-muted-foreground hover:underline"
                                            >
                                                Full QA
                                            </Link>
                                        </div>
                                    </div>
                                );
                            })}
                            {allArticles.length === 0 && (
                                <div className="py-6 text-center text-xs text-muted-foreground">
                                    <FileText className="mx-auto mb-2 h-6 w-6 opacity-40" />
                                    No articles yet.
                                    <br />
                                    <Link href={`/dashboard/domains/${id}`} className="text-blue-600 hover:underline">
                                        Generate content →
                                    </Link>
                                </div>
                            )}
                        </div>
                            </>
                        )}

                        {activeTab === 'review' && (
                            <div className="space-y-3">
                                {!articleId ? (
                                    <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
                                        Select a tool/article from the Content tab, then come back here to review it side-by-side with the live preview.
                                    </div>
                                ) : (
                                    <ToolReviewPanel articleId={articleId} />
                                )}

                                <div className="rounded-md border bg-card p-3">
                                    <p className="text-xs font-semibold">Quick pick</p>
                                    <p className="mt-1 text-[11px] text-muted-foreground">
                                        Jump straight into review mode for another item.
                                    </p>
                                    <div className="mt-2 space-y-1 max-h-[220px] overflow-auto pr-1">
                                        {allArticles.slice(0, 40).map((a) => (
                                            <Link
                                                key={a.id}
                                                href={makeUrl({ articleId: a.id, tab: 'review' })}
                                                className={cn(
                                                    'block rounded-md border px-2 py-1.5 text-[11px] hover:bg-muted',
                                                    articleId === a.id && 'border-blue-300 bg-blue-50 dark:bg-blue-950/30',
                                                )}
                                            >
                                                <span className="font-medium">{a.title}</span>
                                                <span className="ml-2 text-muted-foreground">{(a.contentType || 'article').replaceAll('_', ' ')}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Preview iframe */}
                <div className="flex-1 overflow-hidden bg-white dark:bg-zinc-900">
                    <iframe
                        src={previewUrl}
                        className="h-full w-full border-0"
                        title="Site Preview"
                        sandbox="allow-scripts allow-forms"
                    />
                </div>
            </div>
        </div>
    );
}
