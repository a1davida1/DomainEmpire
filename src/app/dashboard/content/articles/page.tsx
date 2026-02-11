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
import { Search, Filter, Edit, ExternalLink, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { db, articles } from '@/lib/db';
import { desc, like, or, eq, and } from 'drizzle-orm';

interface PageProps {
    searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function ArticlesPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const query = params.q || '';
    const page = Math.max(1, Number.parseInt(params.page || '1') || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    // Build filter
    const filters = [];
    if (query) {
        filters.push(or(like(articles.title, `%${query}%`), like(articles.targetKeyword, `%${query}%`)));
    }
    if (params.status) {
        filters.push(eq(articles.status, params.status as any));
    }

    let whereClause = undefined;
    if (filters.length > 1) {
        whereClause = and(...filters);
    } else if (filters.length === 1) {
        whereClause = filters[0];
    }


    const allArticles = await db.query.articles.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [desc(articles.createdAt)],
        with: {
            domain: true,
        },
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Content Library</h1>
                    <p className="text-muted-foreground">
                        Manage articles across all domains
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

            <form className="flex gap-4" action="/dashboard/content/articles" method="get">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        name="q"
                        placeholder="Search articles..."
                        defaultValue={query}
                        className="pl-9"
                    />
                    {params.status && <input type="hidden" name="status" value={params.status} />}
                </div>
                <Button type="submit" variant="outline">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                </Button>
            </form>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Title</TableHead>
                                <TableHead>Domain</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Words</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allArticles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        No articles found.
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
                                            <Badge variant="outline">{article.domain?.domain || 'Unknown'}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize">
                                                {article.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{article.wordCount || '-'}</TableCell>
                                        <TableCell>
                                            {article.createdAt && new Date(article.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link href={`/dashboard/content/articles/${article.id}`}>
                                                    <Button variant="ghost" size="icon" aria-label={`Edit article ${article.title}`}>
                                                        <Edit className="h-4 w-4" />
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

            {/* Pagination */}
            <div className="flex items-center justify-end gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    asChild={page > 1}
                >
                    {page > 1 ? (
                        <Link href={`/dashboard/content/articles?page=${page - 1}&q=${encodeURIComponent(query)}${params.status ? `&status=${params.status}` : ''}`}>
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
                        <Link href={`/dashboard/content/articles?page=${page + 1}&q=${encodeURIComponent(query)}${params.status ? `&status=${params.status}` : ''}`}>
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
