import { db, domains, articles, keywords } from '@/lib/db';
import { eq, sql, and, isNull, desc } from 'drizzle-orm';

export async function getDomain(id: string) {
    try {
        const result = await db.select().from(domains).where(and(eq(domains.id, id), isNull(domains.deletedAt))).limit(1);
        return result[0] || null;
    } catch {
        return null;
    }
}

export async function getDomainStats(domainId: string): Promise<{ articles: number; keywords: number }> {
    try {
        const [articleCount, keywordCount] = await Promise.all([
            db.select({ count: sql<number>`count(*)::int` }).from(articles).where(and(eq(articles.domainId, domainId), isNull(articles.deletedAt))),
            db.select({ count: sql<number>`count(*)::int` }).from(keywords).where(eq(keywords.domainId, domainId)),
        ]);
        return {
            articles: articleCount[0]?.count ?? 0,
            keywords: keywordCount[0]?.count ?? 0,
        };
    } catch {
        return { articles: 0, keywords: 0 };
    }
}

export async function getRecentArticles(domainId: string) {
    try {
        return await db
            .select({
                id: articles.id,
                title: articles.title,
                status: articles.status,
                contentType: articles.contentType,
                wordCount: articles.wordCount,
                createdAt: articles.createdAt,
            })
            .from(articles)
            .where(and(eq(articles.domainId, domainId), isNull(articles.deletedAt)))
            .orderBy(desc(articles.createdAt))
            .limit(5);
    } catch {
        return [];
    }
}
