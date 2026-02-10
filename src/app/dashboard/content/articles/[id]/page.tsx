import { notFound } from 'next/navigation';
import { db, articles } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { InterlinkManager } from '@/components/content/InterlinkManager';
import { ContentEditor } from '@/components/content/ContentEditor';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';

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
                            <Badge variant="outline" className={`${article.status === 'published' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : ''
                                } capitalize`}>
                                {article.status}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm">
                            {article.domain.domain} • {article.wordCount || 0} words
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
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
                    <InterlinkManager articleId={id} />

                    <Card>
                        <CardHeader>
                            <CardTitle>Performance</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Pageviews (30d)</span>
                                <span className="font-bold">{article.pageviews30d || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Unique Visitors</span>
                                <span className="font-bold">{article.uniqueVisitors30d || 0}</span>
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
