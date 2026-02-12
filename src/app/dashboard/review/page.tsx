import { db } from '@/lib/db';
import { articles, domains } from '@/lib/db/schema';
import { eq, inArray, asc, and, isNull } from 'drizzle-orm';
import Link from 'next/link';

const YMYL_COLORS: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-blue-100 text-blue-800',
    none: 'bg-gray-100 text-gray-600',
};

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
    }).from(articles)
        .where(and(inArray(articles.status, ['review', 'approved']), isNull(articles.deletedAt)))
        .orderBy(asc(articles.updatedAt));

    // Fetch domain names
    const domainIds = [...new Set(reviewArticles.map(a => a.domainId))];
    const domainList = domainIds.length > 0
        ? await db.select({ id: domains.id, domain: domains.domain }).from(domains).where(inArray(domains.id, domainIds))
        : [];
    const domainMap = new Map(domainList.map(d => [d.id, d.domain]));

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Review Queue</h1>

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
                                    <th className="text-left p-3">Waiting Since</th>
                                    <th className="text-right p-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reviewArticles.map(article => (
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
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                                article.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {article.status}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${YMYL_COLORS[article.ymylLevel || 'none']}`}>
                                                {article.ymylLevel || 'none'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <Link
                                                href={`/dashboard/content/articles/${article.id}/review`}
                                                className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:opacity-90"
                                            >
                                                Review
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
