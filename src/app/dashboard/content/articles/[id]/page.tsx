import { notFound } from 'next/navigation';
import { db, articles } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { cn } from '@/lib/utils';
import { InterlinkManager } from '@/components/content/InterlinkManager';
import { ContentEditor } from '@/components/content/ContentEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { ArrowLeft, ExternalLink, History, ScrollText, ClipboardCheck, Quote, AlertTriangle, Eye } from 'lucide-react';
import Link from 'next/link';
import { formatNumber } from '@/lib/format-utils';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ArticlePage({ params }: PageProps) {
    const { id } = await params;

    const article = await db.query.articles.findFirst({
        where: eq(articles.id, id),
        with: {
            domain: true,
        },
    });

    if (!article) {
        notFound();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard/content/articles">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold truncate max-w-[500px]">{article.title}</h1>
                            <Badge variant="outline" className={cn(
                                article.status === 'published' && 'bg-green-500/10 text-green-500 hover:bg-green-500/20',
                                'capitalize'
                            )}>
                                {article.status}
                            </Badge>
                            {article.ymylLevel && article.ymylLevel !== 'none' && (
                                <Badge variant="outline" className={cn(
                                    article.ymylLevel === 'high' && 'bg-red-100 text-red-800 border-red-200',
                                    article.ymylLevel === 'medium' && 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                    article.ymylLevel === 'low' && 'bg-blue-100 text-blue-800 border-blue-200'
                                )}>
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    YMYL {article.ymylLevel}
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                            {article.domain.domain} • {formatNumber(article.wordCount)} words
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/dashboard/domains/${article.domain.id}/preview?articleId=${id}`}>
                        <Button variant="outline">
                            <Eye className="mr-2 h-4 w-4" />
                            Visual Site
                        </Button>
                    </Link>
                    <Link href={`/dashboard/content/articles/${id}/visual-review`}>
                        <Button variant="outline">
                            Visual Review
                        </Button>
                    </Link>
                    <Link href={`/dashboard/content/articles/${id}/review`}>
                        <Button variant="outline">
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            QA Review
                        </Button>
                    </Link>
                    {article.domain.isDeployed && article.status === 'published' && (
                        <a
                            href={`https://${article.domain.domain}/${article.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button variant="outline">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Live
                            </Button>
                        </a>
                    )}

                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <ContentEditor
                        articleId={id}
                        initialTitle={article.title}
                        initialSlug={article.slug}
                        initialContent={article.contentMarkdown || ''}
                        initialKeyword={article.targetKeyword || ''}
                        initialMetaDescription={article.metaDescription || ''}
                    />
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Article Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Link href={`/dashboard/content/articles/${id}/visual-review`} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm">
                                <Eye className="h-4 w-4 text-violet-600" />
                                Visual Review Workspace
                            </Link>
                            <Link href={`/dashboard/content/articles/${id}/review`} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm">
                                <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                                Review & QA Checklist
                            </Link>
                            <Link href={`/dashboard/content/articles/${id}/revisions`} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm">
                                <History className="h-4 w-4 text-blue-600" />
                                Revision History
                            </Link>
                            <Link href={`/dashboard/content/articles/${id}/audit`} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm">
                                <ScrollText className="h-4 w-4 text-purple-600" />
                                Audit Log
                            </Link>
                            <Link href={`/dashboard/content/articles/${id}/citations`} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted text-sm">
                                <Quote className="h-4 w-4 text-orange-600" />
                                Citations & Sources
                            </Link>
                        </CardContent>
                    </Card>

                    <InterlinkManager articleId={id} />

                    <Card>
                        <CardHeader>
                            <CardTitle>Performance</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Pageviews (30d)</span>
                                <span className="font-bold">{formatNumber(article.pageviews30d)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Unique Visitors</span>
                                <span className="font-bold">{formatNumber(article.uniqueVisitors30d)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Avg. Time</span>
                                <span className="font-bold">{article.avgTimeOnPage ? `${article.avgTimeOnPage}s` : '-'}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
