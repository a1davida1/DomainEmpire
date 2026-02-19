import Link from 'next/link';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, articles, domains } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToolReviewPanel } from '@/components/dashboard/ToolReviewPanel';
import { cn } from '@/lib/utils';
import { ClipboardCheck, ExternalLink, FileText, Wrench } from 'lucide-react';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TOOL_CONTENT_TYPES = [
    'calculator',
    'wizard',
    'configurator',
    'quiz',
    'survey',
    'assessment',
    'interactive_infographic',
    'interactive_map',
] as const;

type ViewMode = 'tools' | 'all';
type StatusMode = 'review' | 'approved' | 'all';

function normalizeView(value: string | undefined): ViewMode {
    return value === 'all' ? 'all' : 'tools';
}

function normalizeStatus(value: string | undefined): StatusMode {
    if (value === 'approved') return 'approved';
    if (value === 'all') return 'all';
    return 'review';
}

function makeHref(opts: { articleId?: string; view: ViewMode; status: StatusMode }) {
    const sp = new URLSearchParams();
    if (opts.articleId) sp.set('articleId', opts.articleId);
    if (opts.view !== 'tools') sp.set('view', opts.view);
    if (opts.status !== 'review') sp.set('status', opts.status);
    const qs = sp.toString();
    return `/dashboard/reviewer${qs ? `?${qs}` : ''}`;
}

interface PageProps {
    searchParams: Promise<{ articleId?: string; view?: string; status?: string }>;
}

export default async function ReviewerWorkbenchPage({ searchParams }: PageProps) {
    const { articleId, view, status } = await searchParams;
    const viewMode = normalizeView(view);
    const statusMode = normalizeStatus(status);

    const statuses = statusMode === 'all' ? (['review', 'approved'] as const) : ([statusMode] as const);
    const baseWhere = and(inArray(articles.status, statuses), isNull(articles.deletedAt));
    const where = viewMode === 'tools'
        ? and(baseWhere, inArray(articles.contentType, TOOL_CONTENT_TYPES))
        : baseWhere;

    const list = await db
        .select({
            id: articles.id,
            title: articles.title,
            status: articles.status,
            domainId: articles.domainId,
            contentType: articles.contentType,
            ymylLevel: articles.ymylLevel,
            reviewRequestedAt: articles.reviewRequestedAt,
            updatedAt: articles.updatedAt,
        })
        .from(articles)
        .where(where)
        .orderBy(desc(articles.reviewRequestedAt), desc(articles.updatedAt))
        .limit(250);

    const selected = articleId && UUID_RE.test(articleId)
        ? await db
            .select({
                id: articles.id,
                title: articles.title,
                status: articles.status,
                domainId: articles.domainId,
                contentType: articles.contentType,
                ymylLevel: articles.ymylLevel,
                reviewRequestedAt: articles.reviewRequestedAt,
                updatedAt: articles.updatedAt,
            })
            .from(articles)
            .where(and(eq(articles.id, articleId), isNull(articles.deletedAt)))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : (list[0] ?? null);

    if (!selected) {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Reviewer Workbench</h1>
                        <p className="text-sm text-muted-foreground">No items match the current filters.</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button asChild variant="secondary" size="sm">
                        <Link href={makeHref({ view: 'tools', status: 'review' })}>Show tools needing review</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                        <Link href={makeHref({ view: 'all', status: 'all' })}>Show everything</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const domainIds = [...new Set([selected.domainId, ...list.map((i) => i.domainId)])];
    const domainRows = await db
        .select({ id: domains.id, domain: domains.domain })
        .from(domains)
        .where(inArray(domains.id, domainIds))
        .limit(Math.max(10, domainIds.length));
    const domainMap = new Map(domainRows.map((d) => [d.id, d.domain]));

    const previewUrl = `/api/domains/${selected.domainId}/preview?articleId=${selected.id}`;
    const domainPreviewHref = `/dashboard/domains/${selected.domainId}/preview?articleId=${selected.id}&tab=review`;

    return (
        <div className="flex h-[calc(100vh-9rem)] flex-col gap-0">
            <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Reviewer Workbench</h1>
                        <p className="text-sm text-muted-foreground">
                            Test the tool in preview, complete QA, then approve/send back.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button
                        asChild
                        size="sm"
                        variant={viewMode === 'tools' ? 'default' : 'outline'}
                    >
                        <Link href={makeHref({ articleId: selected.id, view: 'tools', status: statusMode })}>
                            <Wrench className="mr-2 h-4 w-4" />
                            Tools
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant={viewMode === 'all' ? 'default' : 'outline'}
                    >
                        <Link href={makeHref({ articleId: selected.id, view: 'all', status: statusMode })}>
                            <FileText className="mr-2 h-4 w-4" />
                            All content
                        </Link>
                    </Button>
                    <div className="h-9 w-px bg-border mx-1 hidden sm:block" />
                    <Button
                        asChild
                        size="sm"
                        variant={statusMode === 'review' ? 'secondary' : 'outline'}
                    >
                        <Link href={makeHref({ articleId: selected.id, view: viewMode, status: 'review' })}>Review</Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant={statusMode === 'approved' ? 'secondary' : 'outline'}
                    >
                        <Link href={makeHref({ articleId: selected.id, view: viewMode, status: 'approved' })}>Approved</Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant={statusMode === 'all' ? 'secondary' : 'outline'}
                    >
                        <Link href={makeHref({ articleId: selected.id, view: viewMode, status: 'all' })}>All</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                        <Link href={domainPreviewHref}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Domain preview
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                <aside className="w-80 shrink-0 overflow-y-auto border-r bg-muted/30">
                    <div className="p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Queue ({list.length})
                        </p>
                        <div className="space-y-1">
                            {list.map((item) => {
                                const active = item.id === selected.id;
                                const domainName = domainMap.get(item.domainId) || '—';
                                const type = (item.contentType || 'article').replaceAll('_', ' ');
                                return (
                                    <Link
                                        key={item.id}
                                        href={makeHref({ articleId: item.id, view: viewMode, status: statusMode })}
                                        className={cn(
                                            'block rounded-md border px-3 py-2 text-xs transition-colors',
                                            active ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted',
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="line-clamp-2 font-medium leading-tight">
                                                {item.title || 'Untitled'}
                                            </span>
                                            <Badge variant="outline" className="capitalize text-[10px]">
                                                {item.status || 'draft'}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                            <span className="truncate">{domainName}</span>
                                            <span className="text-muted-foreground/40">·</span>
                                            <span className="capitalize">{type}</span>
                                            {item.ymylLevel && item.ymylLevel !== 'none' && (
                                                <>
                                                    <span className="text-muted-foreground/40">·</span>
                                                    <span className="capitalize">YMYL {item.ymylLevel}</span>
                                                </>
                                            )}
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </aside>

                <section className="flex-1 overflow-hidden bg-white dark:bg-zinc-900">
                    <iframe
                        src={previewUrl}
                        className="h-full w-full border-0"
                        title="Tool Preview"
                        sandbox="allow-scripts allow-forms"
                    />
                </section>

                <aside className="w-[26rem] shrink-0 overflow-y-auto border-l bg-muted/30">
                    <ToolReviewPanel articleId={selected.id} />
                </aside>
            </div>
        </div>
    );
}

