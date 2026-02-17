import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { db, domains, articles } from '@/lib/db';
import { ArticleReviewActions } from '@/components/dashboard/ArticleReviewActions';
import { BulkArticleActions } from '@/components/dashboard/BulkArticleActions';

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ articleId?: string }>;
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
    const { articleId } = await searchParams;

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
                <div className="w-72 shrink-0 overflow-y-auto border-r bg-muted/30">
                    <div className="p-3">
                        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Content ({allArticles.length})
                        </h2>
                        <BulkArticleActions articles={allArticles.map(a => ({ id: a.id, status: a.status }))} />

                        {/* Homepage link */}
                        <Link
                            href={`/dashboard/domains/${id}/preview`}
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
                                    <Link
                                        key={article.id}
                                        href={`/dashboard/domains/${id}/preview?articleId=${article.id}`}
                                        className={`flex flex-col gap-1 rounded-md border px-3 py-2 text-xs transition-colors ${
                                            isActive ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-1">
                                            <span className="line-clamp-2 font-medium leading-tight">{article.title}</span>
                                            <StatusIcon status={article.status || 'draft'} />
                                        </div>
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            <Badge className={`${sc.color} px-1 py-0 text-[9px]`}>{sc.label}</Badge>
                                            {article.wordCount && <span>{article.wordCount.toLocaleString('en-US')}w</span>}
                                        </div>
                                        <ArticleReviewActions articleId={article.id} currentStatus={article.status || 'draft'} />
                                    </Link>
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
