/**
 * Content Refresh / Staleness Workflow
 *
 * Detects stale articles and queues them for AI-powered refresh.
 * Staleness is based on: article age, traffic decline, research data age, refresh history.
 */

import { db } from '@/lib/db';
import { articles, contentQueue, domains } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createNotification } from '@/lib/notifications';

interface StaleArticle {
    id: string;
    title: string;
    domainId: string;
    domain: string;
    stalenessScore: number;
    reasons: string[];
    publishedAt: Date;
    lastRefreshedAt: Date | null;
}

const STALENESS_CONFIG = {
    maxAgeDays: 180,
    refreshThreshold: 0.6,
    weights: { age: 0.35, trafficDecline: 0.30, researchAge: 0.20, noRecentRefresh: 0.15 },
};

function calculateStaleness(article: {
    publishedAt: Date | null;
    lastRefreshedAt: Date | null;
    pageviews30d: number | null;
    researchData: unknown;
    updatedAt: Date | null;
}): { score: number; reasons: string[] } {
    const now = Date.now();
    const reasons: string[] = [];
    let score = 0;

    // Age factor
    if (article.publishedAt) {
        const ageDays = (now - article.publishedAt.getTime()) / (24 * 60 * 60 * 1000);
        score += Math.min(ageDays / 365, 1) * STALENESS_CONFIG.weights.age;
        if (ageDays > STALENESS_CONFIG.maxAgeDays) {
            reasons.push(`Published ${Math.round(ageDays)} days ago`);
        }
    }

    // Traffic
    const views = article.pageviews30d ?? 0;
    if (views < 10) {
        score += STALENESS_CONFIG.weights.trafficDecline;
        reasons.push(`Only ${views} pageviews in last 30d`);
    } else if (views < 50) {
        score += STALENESS_CONFIG.weights.trafficDecline * 0.5;
        reasons.push(`Low traffic: ${views} pageviews in 30d`);
    }

    // Research age
    if (!article.researchData) {
        score += STALENESS_CONFIG.weights.researchAge;
        reasons.push('No research data');
    } else if (article.updatedAt) {
        const researchAgeDays = (now - article.updatedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (researchAgeDays > 180) {
            score += STALENESS_CONFIG.weights.researchAge;
            reasons.push(`Research data is ${Math.round(researchAgeDays)} days old`);
        }
    }

    // No recent refresh
    if (!article.lastRefreshedAt) {
        if (article.publishedAt && (now - article.publishedAt.getTime()) > 90 * 24 * 60 * 60 * 1000) {
            score += STALENESS_CONFIG.weights.noRecentRefresh;
            reasons.push('Never refreshed');
        }
    } else {
        const daysSinceRefresh = (now - article.lastRefreshedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceRefresh > 90) {
            score += STALENESS_CONFIG.weights.noRecentRefresh;
            reasons.push(`Last refreshed ${Math.round(daysSinceRefresh)} days ago`);
        }
    }

    return { score: Math.round(score * 100) / 100, reasons };
}

/**
 * Scan all published articles for staleness.
 */
export async function detectStaleArticles(threshold?: number): Promise<StaleArticle[]> {
    const minScore = threshold ?? STALENESS_CONFIG.refreshThreshold;

    const published = await db.select({
        id: articles.id, title: articles.title, domainId: articles.domainId,
        publishedAt: articles.publishedAt, lastRefreshedAt: articles.lastRefreshedAt,
        pageviews30d: articles.pageviews30d, researchData: articles.researchData,
        updatedAt: articles.updatedAt,
    }).from(articles).where(eq(articles.status, 'published'));

    const domainMap = new Map<string, string>();
    const allDomains = await db.select({ id: domains.id, domain: domains.domain }).from(domains);
    for (const d of allDomains) domainMap.set(d.id, d.domain);

    const stale: StaleArticle[] = [];

    for (const article of published) {
        const { score, reasons } = calculateStaleness(article);

        await db.update(articles).set({ stalenessScore: score }).where(eq(articles.id, article.id));

        if (score >= minScore) {
            stale.push({
                id: article.id, title: article.title, domainId: article.domainId,
                domain: domainMap.get(article.domainId) || 'unknown',
                stalenessScore: score, reasons,
                publishedAt: article.publishedAt!,
                lastRefreshedAt: article.lastRefreshedAt,
            });
        }
    }

    return stale.sort((a, b) => b.stalenessScore - a.stalenessScore);
}

/**
 * Queue a content refresh job for a stale article.
 */
export async function queueContentRefresh(articleId: string): Promise<string> {
    const articleRecord = await db.select({
        id: articles.id, title: articles.title, domainId: articles.domainId,
        targetKeyword: articles.targetKeyword,
    }).from(articles).where(eq(articles.id, articleId)).limit(1);

    if (!articleRecord.length) throw new Error('Article not found');
    const article = articleRecord[0];

    const domainRecord = await db.select({ domain: domains.domain })
        .from(domains).where(eq(domains.id, article.domainId)).limit(1);

    const [job] = await db.insert(contentQueue).values({
        jobType: 'content_refresh',
        domainId: article.domainId,
        articleId: article.id,
        priority: 3,
        payload: {
            targetKeyword: article.targetKeyword,
            domainName: domainRecord[0]?.domain || '',
            refreshType: 'full',
        },
        status: 'pending',
    }).returning({ id: contentQueue.id });

    return job.id;
}

/**
 * Run the full staleness check and queue refreshes.
 */
export async function checkAndRefreshStaleContent(): Promise<{
    staleFound: number;
    refreshQueued: number;
}> {
    const stale = await detectStaleArticles();
    let refreshQueued = 0;

    // Queue top 20 stale articles per run (sorted by staleness, most stale first)
    for (const article of stale.slice(0, 20)) {
        try {
            await queueContentRefresh(article.id);
            refreshQueued++;

            await createNotification({
                type: 'content_stale', severity: 'info',
                title: `Refreshing: ${article.title}`,
                message: `Staleness: ${article.stalenessScore}. ${article.reasons.join(', ')}`,
                domainId: article.domainId,
                actionUrl: `/dashboard/content/articles/${article.id}`,
            });
        } catch (error) {
            console.error(`Failed to queue refresh for ${article.id}:`, error);
        }
    }

    return { staleFound: stale.length, refreshQueued };
}
