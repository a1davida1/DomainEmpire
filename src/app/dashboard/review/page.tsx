import { db } from '@/lib/db';
import { articles, domains, qaChecklistResults, reviewEvents, reviewTasks } from '@/lib/db/schema';
import { eq, inArray, asc, and, isNull, count } from 'drizzle-orm';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/auth';
import { getCampaignLaunchReviewSlaSummary } from '@/lib/review/campaign-launch-sla';
import { ClipboardCheck, ShoppingCart, Rocket, FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

const YMYL_COLORS: Record<string, string> = {
    high: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
    low: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    none: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

async function approveAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) throw new Error('Unauthorized');
    if (!['admin', 'reviewer', 'editor'].includes(user.role)) throw new Error('Forbidden');

    const articleId = formData.get('articleId') as string;
    if (!articleId) return;

    await db.transaction(async (tx) => {
        await tx.update(articles).set({
            status: 'approved',
            lastReviewedAt: new Date(),
        }).where(eq(articles.id, articleId));

        await tx.insert(reviewEvents).values({
            articleId,
            actorId: user.id,
            actorRole: user.role,
            eventType: 'approved',
        });
    });
    revalidatePath('/dashboard/review');
}

async function rejectAction(formData: FormData) {
    'use server';
    const user = await getAuthUser();
    if (!user) throw new Error('Unauthorized');
    if (!['admin', 'reviewer'].includes(user.role)) throw new Error('Forbidden');

    const articleId = formData.get('articleId') as string;
    if (!articleId) return;

    await db.transaction(async (tx) => {
        await tx.update(articles).set({
            status: 'draft',
            lastReviewedAt: new Date(),
        }).where(eq(articles.id, articleId));

        await tx.insert(reviewEvents).values({
            articleId,
            actorId: user.id,
            actorRole: user.role,
            eventType: 'rejected',
        });
    });
    revalidatePath('/dashboard/review');
}

export default async function ReviewQueuePage() {
    const [reviewArticles, domainBuyCount, launchReviewSummary] = await Promise.all([
        db.select({
            id: articles.id,
            title: articles.title,
            status: articles.status,
            ymylLevel: articles.ymylLevel,
            domainId: articles.domainId,
            targetKeyword: articles.targetKeyword,
            updatedAt: articles.updatedAt,
            lastReviewedAt: articles.lastReviewedAt,
            reviewRequestedAt: articles.reviewRequestedAt,
        }).from(articles)
            .where(and(inArray(articles.status, ['review', 'approved']), isNull(articles.deletedAt)))
            .orderBy(asc(articles.updatedAt)),

        db.select({ count: count() })
            .from(reviewTasks)
            .where(and(eq(reviewTasks.taskType, 'domain_buy'), eq(reviewTasks.status, 'pending')))
            .then(r => r[0]?.count ?? 0)
            .catch(() => 0),

        getCampaignLaunchReviewSlaSummary({ limit: 250, topIssueLimit: 3 })
            .catch((error) => {
                console.error('Failed to load campaign launch review summary:', error);
                return null;
            }),
    ]);

    // Fetch domain names
    const domainIds = [...new Set(reviewArticles.map(a => a.domainId))];
    const domainList = domainIds.length > 0
        ? await db.select({ id: domains.id, domain: domains.domain }).from(domains).where(inArray(domains.id, domainIds))
        : [];
    const domainMap = new Map(domainList.map(d => [d.id, d.domain]));

    // Fetch QA status for each article
    const articleIds = reviewArticles.map(a => a.id);
    const qaResults = articleIds.length > 0
        ? await db.select({
            articleId: qaChecklistResults.articleId,
            allPassed: qaChecklistResults.allPassed,
            results: qaChecklistResults.results,
        }).from(qaChecklistResults).where(inArray(qaChecklistResults.articleId, articleIds))
        : [];
    const qaMap = new Map(qaResults.map(q => {
        const results = (q.results && typeof q.results === 'object' && !Array.isArray(q.results))
            ? q.results as Record<string, { checked: boolean }>
            : null;

        const entries = results ? Object.values(results) : [];
        const validEntries = entries.filter(r => r && typeof r.checked === 'boolean');
        const passed = validEntries.filter(r => r.checked).length;
        const total = validEntries.length;
        return [q.articleId, { allPassed: q.allPassed, passed, total }];
    }));

    // eslint-disable-next-line react-hooks/purity
    const now = Date.now(); // Server Component — runs once at render time
    const pendingContentCount = reviewArticles.filter(a => a.status === 'review').length;
    const approvedContentCount = reviewArticles.filter(a => a.status === 'approved').length;
    const campaignPendingCount = launchReviewSummary?.pendingCount ?? 0;
    const campaignBreachedCount = launchReviewSummary?.dueBreachedCount ?? 0;
    const campaignEscalatedCount = launchReviewSummary?.escalatedCount ?? 0;
    const totalPending = pendingContentCount + (domainBuyCount as number) + campaignPendingCount;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Review Center</h1>
                        <p className="text-sm text-muted-foreground">
                            {totalPending > 0 ? `${totalPending} items awaiting review` : 'All queues clear'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Queue Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <Link
                    href="/dashboard/review#content"
                    className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950">
                                <FileText className="h-4.5 w-4.5 text-amber-700 dark:text-amber-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Content Review</p>
                                <p className="text-xs text-muted-foreground">Articles & pages</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold tabular-nums">{pendingContentCount}</p>
                            <p className="text-[10px] text-muted-foreground">pending</p>
                        </div>
                    </div>
                    {approvedContentCount > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {approvedContentCount} approved, ready to publish
                        </div>
                    )}
                </Link>

                <Link
                    href="/dashboard/review/domain-buy"
                    className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                                <ShoppingCart className="h-4.5 w-4.5 text-blue-700 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Domain Buy</p>
                                <p className="text-xs text-muted-foreground">Acquisition gate</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold tabular-nums">{domainBuyCount}</p>
                            <p className="text-[10px] text-muted-foreground">pending</p>
                        </div>
                    </div>
                </Link>

                <Link
                    href="/dashboard/review/campaign-launch"
                    className="group relative rounded-xl border bg-card p-4 transition-all hover:shadow-md hover:border-primary/30"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-950">
                                <Rocket className="h-4.5 w-4.5 text-violet-700 dark:text-violet-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Campaign Launch</p>
                                <p className="text-xs text-muted-foreground">Launch handoff</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold tabular-nums">{campaignPendingCount}</p>
                            <p className="text-[10px] text-muted-foreground">pending</p>
                        </div>
                    </div>
                    {(campaignBreachedCount > 0 || campaignEscalatedCount > 0) && (
                        <div className="mt-3 flex items-center gap-3 text-xs">
                            {campaignBreachedCount > 0 && (
                                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <Clock className="h-3 w-3" />
                                    {campaignBreachedCount} SLA breached
                                </span>
                            )}
                            {campaignEscalatedCount > 0 && (
                                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                    <AlertTriangle className="h-3 w-3" />
                                    {campaignEscalatedCount} escalated
                                </span>
                            )}
                        </div>
                    )}
                </Link>
            </div>

            {/* Content Review Section */}
            <div id="content" className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Content Review Queue</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {reviewArticles.length} total &middot; {pendingContentCount} pending &middot; {approvedContentCount} approved
                    </span>
                </div>

                {reviewArticles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 py-16 px-8 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                            <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <p className="text-base font-medium mb-1">No articles awaiting review</p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            Articles will appear here when they reach the review stage in the content pipeline.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Article</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Domain</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">YMYL</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">QA</th>
                                        <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Waiting</th>
                                        <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {reviewArticles.map(article => {
                                        const qa = qaMap.get(article.id);
                                        const waitingSince = article.reviewRequestedAt ? new Date(article.reviewRequestedAt) : null;
                                        const waitingDays = waitingSince
                                            ? Math.floor((now - waitingSince.getTime()) / (1000 * 60 * 60 * 24))
                                            : null;
                                        const isUrgent = waitingDays !== null && waitingDays > 7;

                                        return (
                                            <tr key={article.id} className={`transition-colors hover:bg-muted/30 ${isUrgent ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/dashboard/content/articles/${article.id}/review`}
                                                        className="group"
                                                    >
                                                        <div className="font-medium group-hover:text-primary transition-colors">
                                                            {article.title || 'Untitled'}
                                                        </div>
                                                        {article.targetKeyword && (
                                                            <div className="text-xs text-muted-foreground mt-0.5">{article.targetKeyword}</div>
                                                        )}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-muted-foreground text-xs">
                                                        {domainMap.get(article.domainId) || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${article.status === 'approved'
                                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                                        }`}>
                                                        {article.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${YMYL_COLORS[article.ymylLevel || 'none']}`}>
                                                        {article.ymylLevel || 'none'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {qa ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all ${qa.passed === qa.total ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                                                    style={{ width: `${qa.total > 0 ? (qa.passed / qa.total) * 100 : 0}%` }}
                                                                />
                                                            </div>
                                                            <span className={`text-xs tabular-nums ${qa.passed === qa.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                                {qa.passed}/{qa.total}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {waitingDays !== null ? (
                                                        <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${waitingDays > 7
                                                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                                                : waitingDays > 3
                                                                    ? 'text-amber-600 dark:text-amber-400 font-medium'
                                                                    : 'text-muted-foreground'
                                                            }`}>
                                                            {waitingDays > 7 && <AlertTriangle className="h-3 w-3" />}
                                                            {waitingDays === 0 ? 'Today' : `${waitingDays}d`}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {article.status === 'review' && (
                                                            <>
                                                                <form action={approveAction}>
                                                                    <input type="hidden" name="articleId" value={article.id} />
                                                                    <button
                                                                        type="submit"
                                                                        className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                                                                    >
                                                                        Approve
                                                                    </button>
                                                                </form>
                                                                <form action={rejectAction}>
                                                                    <input type="hidden" name="articleId" value={article.id} />
                                                                    <button
                                                                        type="submit"
                                                                        className="inline-flex items-center px-2.5 py-1 rounded-md border border-red-200 text-red-600 dark:border-red-800 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                                                    >
                                                                        Reject
                                                                    </button>
                                                                </form>
                                                            </>
                                                        )}
                                                        <Link
                                                            href={`/dashboard/content/articles/${article.id}/review`}
                                                            className="inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium hover:bg-muted transition-colors"
                                                        >
                                                            Open
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
