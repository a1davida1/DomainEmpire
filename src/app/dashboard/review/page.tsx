import { db } from '@/lib/db';
import { articles, domains, qaChecklistResults, reviewEvents } from '@/lib/db/schema';
import { eq, inArray, asc, and, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/auth';

const YMYL_COLORS: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
    none: 'bg-gray-100 text-gray-600',
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
    const reviewArticles = await db.select({
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
        .orderBy(asc(articles.updatedAt));

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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Review Queue</h1>
                    <div className="text-sm text-muted-foreground">
                        {reviewArticles.filter(a => a.status === 'review').length} pending content reviews
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/review/domain-buy"
                        className="px-3 py-2 rounded-md border text-sm hover:bg-muted"
                    >
                        Domain Buy Queue
                    </Link>
                    <div className="text-sm text-muted-foreground">
                        Content gate
                    </div>
                </div>
            </div>

            {reviewArticles.length === 0 ? (
                <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground">
                    <p className="text-lg mb-2">No articles awaiting review</p>
                    <p className="text-sm">Articles will appear here when they reach the review stage.</p>
                </div>
            ) : (
                <div className="bg-card rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left p-3">Article</th>
                                    <th className="text-left p-3">Domain</th>
                                    <th className="text-left p-3">Status</th>
                                    <th className="text-left p-3">YMYL</th>
                                    <th className="text-left p-3">QA</th>
                                    <th className="text-left p-3">Time in Review</th>
                                    <th className="text-right p-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reviewArticles.map(article => {
                                    const qa = qaMap.get(article.id);
                                    const waitingSince = article.reviewRequestedAt ? new Date(article.reviewRequestedAt) : null;
                                    const waitingDays = waitingSince
                                        ? Math.floor((now - waitingSince.getTime()) / (1000 * 60 * 60 * 24))
                                        : null;

                                    return (
                                        <tr key={article.id} className="border-t">
                                            <td className="p-3">
                                                <div className="font-medium">{article.title || 'Untitled'}</div>
                                                {article.targetKeyword && (
                                                    <div className="text-xs text-muted-foreground">{article.targetKeyword}</div>
                                                )}
                                            </td>
                                            <td className="p-3 text-muted-foreground">
                                                {domainMap.get(article.domainId) || '—'}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${article.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'
                                                    }`}>
                                                    {article.status}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${YMYL_COLORS[article.ymylLevel || 'none']}`}>
                                                    {article.ymylLevel || 'none'}
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                {qa ? (
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${qa.passed === qa.total
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-orange-100 text-orange-800'
                                                        }`}>
                                                        {qa.passed}/{qa.total}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                {waitingDays !== null ? (
                                                    <span className={`text-xs ${waitingDays > 7 ? 'text-red-600 font-medium' : waitingDays > 3 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                                                        {waitingDays === 0 ? 'Today' : `${waitingDays}d`}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    {article.status === 'review' && (
                                                        <>
                                                            <form action={approveAction}>
                                                                <input type="hidden" name="articleId" value={article.id} />
                                                                <button
                                                                    type="submit"
                                                                    className="px-2 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
                                                                >
                                                                    Approve
                                                                </button>
                                                            </form>
                                                            <form action={rejectAction}>
                                                                <input type="hidden" name="articleId" value={article.id} />
                                                                <button
                                                                    type="submit"
                                                                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </form>
                                                        </>
                                                    )}
                                                    <Link
                                                        href={`/dashboard/content/articles/${article.id}/review`}
                                                        className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:opacity-90"
                                                    >
                                                        Review
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
    );
}
