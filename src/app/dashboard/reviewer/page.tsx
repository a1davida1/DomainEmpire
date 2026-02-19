import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { db, articles, domains, reviewTasks, users } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToolReviewPanel } from '@/components/dashboard/ToolReviewPanel';
import { cn } from '@/lib/utils';
import { ClipboardCheck, ExternalLink, FileText, Search, Wrench } from 'lucide-react';
import { ReviewTaskAssignmentControls } from '@/components/dashboard/ReviewTaskAssignmentControls';

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
type MineMode = 'mine' | 'all';

function normalizeView(value: string | undefined): ViewMode {
    return value === 'all' ? 'all' : 'tools';
}

function normalizeMine(value: string | undefined): MineMode {
    return value === 'mine' ? 'mine' : 'all';
}

function makeHref(opts: { taskId?: string; view: ViewMode; mine: MineMode; q?: string }) {
    const sp = new URLSearchParams();
    if (opts.taskId) sp.set('taskId', opts.taskId);
    if (opts.view !== 'tools') sp.set('view', opts.view);
    if (opts.mine !== 'all') sp.set('mine', opts.mine);
    if (opts.q) sp.set('q', opts.q);
    const qs = sp.toString();
    return `/dashboard/reviewer${qs ? `?${qs}` : ''}`;
}

interface PageProps {
    searchParams: Promise<{ taskId?: string; view?: string; mine?: string; q?: string }>;
}

export default async function ReviewerWorkbenchPage({ searchParams }: PageProps) {
    const user = await getAuthUser();
    if (!user) {
        redirect('/login');
    }

    const { taskId, view, mine, q } = await searchParams;
    const viewMode = normalizeView(view);
    const mineMode = normalizeMine(mine);
    const search = typeof q === 'string' ? q.trim().slice(0, 80) : '';

    const taskWhere = [
        eq(reviewTasks.taskType, 'content_publish'),
        eq(reviewTasks.status, 'pending'),
        isNull(articles.deletedAt),
        isNull(domains.deletedAt),
    ];
    if (mineMode === 'mine') {
        taskWhere.push(eq(reviewTasks.reviewerId, user.id));
    }
    if (viewMode === 'tools') {
        taskWhere.push(inArray(articles.contentType, TOOL_CONTENT_TYPES));
    }
    if (search.length > 0) {
        const searchCondition = or(
            ilike(articles.title, `%${search}%`),
            ilike(domains.domain, `%${search}%`),
        );
        if (searchCondition) {
            taskWhere.push(searchCondition);
        }
    }

    const list = await db
        .select({
            taskId: reviewTasks.id,
            reviewerId: reviewTasks.reviewerId,
            createdAt: reviewTasks.createdAt,
            slaHours: reviewTasks.slaHours,
            escalateAfterHours: reviewTasks.escalateAfterHours,
            articleId: articles.id,
            articleTitle: articles.title,
            articleStatus: articles.status,
            contentType: articles.contentType,
            ymylLevel: articles.ymylLevel,
            reviewRequestedAt: articles.reviewRequestedAt,
            domainId: domains.id,
            domain: domains.domain,
            reviewerName: users.name,
            reviewerRole: users.role,
        })
        .from(reviewTasks)
        .innerJoin(articles, eq(reviewTasks.articleId, articles.id))
        .innerJoin(domains, eq(reviewTasks.domainId, domains.id))
        .leftJoin(users, eq(reviewTasks.reviewerId, users.id))
        .where(and(...taskWhere))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(250);

    const selected = taskId && UUID_RE.test(taskId)
        ? (list.find((t) => t.taskId === taskId) ?? list[0] ?? null)
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
                        <Link href={makeHref({ view: 'tools', mine: 'all' })}>Show tools needing review</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                        <Link href={makeHref({ view: 'all', mine: 'all' })}>Show everything</Link>
                    </Button>
                </div>
            </div>
        );
    }

    const selectedIndex = list.findIndex((t) => t.taskId === selected.taskId);
    const prevTask = selectedIndex > 0 ? list[selectedIndex - 1] : null;
    const nextTask = selectedIndex >= 0 && selectedIndex < list.length - 1 ? list[selectedIndex + 1] : null;

    const previewUrl = `/api/domains/${selected.domainId}/preview?articleId=${selected.articleId}`;
    const domainPreviewHref = `/dashboard/domains/${selected.domainId}/preview?articleId=${selected.articleId}&tab=review`;

    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now(); // Server Component — evaluated once per render

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
                        <Link href={makeHref({ taskId: selected.taskId, view: 'tools', mine: mineMode, q: search || undefined })}>
                            <Wrench className="mr-2 h-4 w-4" />
                            Tools
                        </Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant={viewMode === 'all' ? 'default' : 'outline'}
                    >
                        <Link href={makeHref({ taskId: selected.taskId, view: 'all', mine: mineMode, q: search || undefined })}>
                            <FileText className="mr-2 h-4 w-4" />
                            All content
                        </Link>
                    </Button>
                    <div className="h-9 w-px bg-border mx-1 hidden sm:block" />
                    <Button
                        asChild
                        size="sm"
                        variant={mineMode === 'all' ? 'secondary' : 'outline'}
                    >
                        <Link href={makeHref({ taskId: selected.taskId, view: viewMode, mine: 'all', q: search || undefined })}>All tasks</Link>
                    </Button>
                    <Button
                        asChild
                        size="sm"
                        variant={mineMode === 'mine' ? 'secondary' : 'outline'}
                    >
                        <Link href={makeHref({ taskId: selected.taskId, view: viewMode, mine: 'mine', q: search || undefined })}>My tasks</Link>
                    </Button>
                    <div className="h-9 w-px bg-border mx-1 hidden sm:block" />
                    <form action="/dashboard/reviewer" method="GET" className="flex items-center gap-2">
                        <input type="hidden" name="view" value={viewMode} />
                        {mineMode !== 'all' && <input type="hidden" name="mine" value={mineMode} />}
                        {selected.taskId && <input type="hidden" name="taskId" value={selected.taskId} />}
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                name="q"
                                defaultValue={search}
                                placeholder="Search title or domain..."
                                className="h-9 w-56 rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                        <Button type="submit" size="sm" variant="outline">Go</Button>
                    </form>
                    <div className="h-9 w-px bg-border mx-1 hidden sm:block" />
                    {prevTask ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={makeHref({ taskId: prevTask.taskId, view: viewMode, mine: mineMode, q: search || undefined })}>
                                Prev
                            </Link>
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" disabled>
                            Prev
                        </Button>
                    )}
                    {nextTask ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={makeHref({ taskId: nextTask.taskId, view: viewMode, mine: mineMode, q: search || undefined })}>
                                Next
                            </Link>
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" disabled>
                            Next
                        </Button>
                    )}
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
                        <div className="mb-3 rounded-md border bg-card p-2">
                            <p className="text-[11px] text-muted-foreground">
                                Selected task: <span className="font-medium text-foreground">{selected.articleTitle || 'Untitled'}</span>
                            </p>
                            <div className="mt-2">
                                <ReviewTaskAssignmentControls
                                    taskId={selected.taskId}
                                    reviewerId={selected.reviewerId}
                                    reviewerName={selected.reviewerName}
                                    currentUserId={user.id}
                                    currentUserRole={user.role}
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            {list.map((item) => {
                                const active = item.taskId === selected.taskId;
                                const type = (item.contentType || 'article').replaceAll('_', ' ');
                                const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : nowMs;
                                const ageHours = Math.max(0, Math.round(((nowMs - createdAt) / (1000 * 60 * 60)) * 10) / 10);
                                const slaHours = item.slaHours ?? null;
                                const escalateAfter = item.escalateAfterHours ?? null;
                                const slaBreached = slaHours !== null ? ageHours >= slaHours : false;
                                const escalated = escalateAfter !== null ? ageHours >= escalateAfter : false;
                                const assignmentLabel = item.reviewerId
                                    ? (item.reviewerId === user.id ? 'Mine' : 'Assigned')
                                    : 'Unassigned';

                                const ageBadgeClass = escalated
                                    ? 'border-red-300 text-red-700'
                                    : slaBreached
                                        ? 'border-amber-300 text-amber-700'
                                        : 'border-muted-foreground/30 text-muted-foreground';

                                return (
                                    <Link
                                        key={item.taskId}
                                        href={makeHref({ taskId: item.taskId, view: viewMode, mine: mineMode, q: search || undefined })}
                                        className={cn(
                                            'block rounded-md border px-3 py-2 text-xs transition-colors',
                                            active ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted',
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="line-clamp-2 font-medium leading-tight">
                                                {item.articleTitle || 'Untitled'}
                                            </span>
                                            <Badge variant="outline" className="capitalize text-[10px]">
                                                {assignmentLabel}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                            <span className="truncate">{item.domain || '—'}</span>
                                            <span className="text-muted-foreground/40">·</span>
                                            <span className="capitalize">{type}</span>
                                            {item.ymylLevel && item.ymylLevel !== 'none' && (
                                                <>
                                                    <span className="text-muted-foreground/40">·</span>
                                                    <span className="capitalize">YMYL {item.ymylLevel}</span>
                                                </>
                                            )}
                                            <span className="text-muted-foreground/40">·</span>
                                            <Badge variant="outline" className={cn('text-[10px]', ageBadgeClass)}>
                                                {ageHours}h
                                            </Badge>
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
                    <ToolReviewPanel
                        key={`${selected.articleId}:${selected.reviewerId ?? 'unassigned'}`}
                        articleId={selected.articleId}
                    />
                </aside>
            </div>
        </div>
    );
}

