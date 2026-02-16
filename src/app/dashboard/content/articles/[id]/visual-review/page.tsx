import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, Eye, FileText, ClipboardCheck } from 'lucide-react';
import { db, articles } from '@/lib/db';
import { getChecklistForArticle, getLatestQaResult } from '@/lib/review/qa';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
    params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function VisualReviewPage({ params }: Readonly<PageProps>) {
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

    const [checklist, latestResult] = await Promise.all([
        getChecklistForArticle({
            contentType: article.contentType || undefined,
            ymylLevel: (article.ymylLevel as 'none' | 'low' | 'medium' | 'high' | undefined) || 'none',
        }),
        getLatestQaResult(id),
    ]);

    const latestChecks = (latestResult?.results || {}) as Record<string, { checked?: boolean }>;
    const requiredItems = checklist.items.filter((item) => item.required);
    const requiredPassed = requiredItems.filter((item) => !!latestChecks[item.id]?.checked).length;

    const previewUrl = `/api/domains/${article.domain.id}/preview?articleId=${id}`;
    const domainPreviewPageUrl = `/dashboard/domains/${article.domain.id}/preview?articleId=${id}`;
    const liveArticleUrl = `https://${article.domain.domain}/${article.slug}`;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <Link href={`/dashboard/content/articles/${id}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Article
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">{article.title}</h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="capitalize">{article.status}</Badge>
                            <Badge variant="secondary" className="capitalize">
                                {(article.contentType || 'article').replaceAll('_', ' ')}
                            </Badge>
                            <Badge variant="outline">{article.domain.domain}</Badge>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Link href={`/dashboard/content/articles/${id}`}>
                        <Button variant="outline" size="sm">
                            <FileText className="mr-2 h-4 w-4" />
                            Open Editor
                        </Button>
                    </Link>
                    <Link href={`/dashboard/content/articles/${id}/review`}>
                        <Button variant="outline" size="sm">
                            <ClipboardCheck className="mr-2 h-4 w-4" />
                            Full QA Review
                        </Button>
                    </Link>
                    <Link href={domainPreviewPageUrl}>
                        <Button variant="outline" size="sm">
                            <Eye className="mr-2 h-4 w-4" />
                            Visual Site
                        </Button>
                    </Link>
                    {article.domain.isDeployed && article.status === 'published' && (
                        <a href={liveArticleUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Live
                            </Button>
                        </a>
                    )}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-muted/30 py-3">
                        <CardTitle className="text-sm">Rendered Article Preview</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <iframe
                            src={previewUrl}
                            className="h-[75vh] w-full border-0 bg-white"
                            title={`Visual preview for ${article.title}`}
                            sandbox="allow-same-origin"
                        />
                    </CardContent>
                </Card>

                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">QA Snapshot</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                            <div className="rounded-md border bg-muted/30 p-3">
                                <p className="font-medium">
                                    Required checks passed: {requiredPassed}/{requiredItems.length}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {latestResult?.completedAt
                                        ? `Last QA run: ${new Date(latestResult.completedAt).toLocaleString('en-US', { timeZone: 'UTC' })}`
                                        : 'No QA run yet for this article.'}
                                </p>
                            </div>
                            <div className="max-h-[45vh] space-y-2 overflow-auto pr-1">
                                {checklist.items.map((item) => {
                                    const checked = !!latestChecks[item.id]?.checked;
                                    return (
                                        <div key={item.id} className="flex items-start gap-2 rounded-md border p-2">
                                            {checked ? (
                                                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                                            ) : (
                                                <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-sm leading-tight">{item.label}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {item.category}
                                                    {item.required ? ' • required' : ' • optional'}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <Link href={`/dashboard/content/articles/${id}/review`}>
                                <Button className="w-full">Open Full Review UI</Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
