/**
 * Composite domain health scoring.
 * Returns 0-100 score based on 5 weighted categories:
 * - Content coverage (20%): published articles, type diversity, word count
 * - Traffic health (25%): 30d pageviews, organic ratio
 * - Revenue health (20%): 30d revenue vs expenses, trend
 * - SEO health (20%): backlink count, referring domains
 * - Infrastructure (15%): deployed, repo, renewal, niche
 */

import { db, domains, articles, revenueSnapshots, expenses, backlinkSnapshots } from '@/lib/db';
import { eq, and, count, sum, avg, gte, desc, isNull, sql } from 'drizzle-orm';

interface HealthBreakdown {
    content: number;
    traffic: number;
    revenue: number;
    seo: number;
    infrastructure: number;
}

interface HealthResult {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    breakdown: HealthBreakdown;
    recommendations: string[];
}

export async function calculateCompositeHealth(domainId: string): Promise<HealthResult> {
    const recommendations: string[] = [];

    // --- Content coverage (20%) ---
    const publishedCount = await db
        .select({ count: count() })
        .from(articles)
        .where(and(eq(articles.domainId, domainId), eq(articles.status, 'published'), isNull(articles.deletedAt)));

    const contentTypes = await db
        .select({ type: articles.contentType })
        .from(articles)
        .where(and(eq(articles.domainId, domainId), eq(articles.status, 'published'), isNull(articles.deletedAt)))
        .groupBy(articles.contentType);

    const avgWordCount = await db
        .select({ avg: sql<number>`COALESCE(AVG(${articles.wordCount}), 0)::int` })
        .from(articles)
        .where(and(eq(articles.domainId, domainId), eq(articles.status, 'published'), isNull(articles.deletedAt)));

    const numArticles = publishedCount[0]?.count ?? 0;
    const numTypes = contentTypes.length;
    const avgWords = avgWordCount[0]?.avg ?? 0;

    let contentScore = 0;
    contentScore += Math.min(40, (numArticles / 20) * 40); // Up to 40 pts for 20+ articles
    contentScore += Math.min(30, (numTypes / 5) * 30); // Up to 30 pts for 5+ content types
    contentScore += Math.min(30, (avgWords / 1500) * 30); // Up to 30 pts for 1500+ avg words

    if (numArticles < 5) recommendations.push('Publish more articles (target 20+)');
    if (numTypes < 3) recommendations.push('Diversify content types (calculators, FAQs, guides)');

    // --- Traffic health (25%) ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trafficResult = await db
        .select({
            totalPv: sql<number>`COALESCE(SUM(${revenueSnapshots.pageviews}), 0)::int`,
            totalOrganic: sql<number>`COALESCE(SUM(${revenueSnapshots.organicVisitors}), 0)::int`,
        })
        .from(revenueSnapshots)
        .where(and(eq(revenueSnapshots.domainId, domainId), gte(revenueSnapshots.snapshotDate, thirtyDaysAgo)));

    const totalPv = trafficResult[0]?.totalPv ?? 0;
    const totalOrganic = trafficResult[0]?.totalOrganic ?? 0;
    const organicRatio = totalPv > 0 ? totalOrganic / totalPv : 0;

    let trafficScore = 0;
    trafficScore += Math.min(60, (totalPv / 5000) * 60); // Up to 60 pts for 5000+ pageviews
    trafficScore += Math.min(40, organicRatio * 40); // Up to 40 pts for high organic ratio

    if (totalPv < 100) recommendations.push('Drive more traffic (target 5000+ monthly pageviews)');

    // --- Revenue health (20%) ---
    const revenueResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${revenueSnapshots.totalRevenue}::numeric), 0)::real` })
        .from(revenueSnapshots)
        .where(and(eq(revenueSnapshots.domainId, domainId), gte(revenueSnapshots.snapshotDate, thirtyDaysAgo)));

    const expenseResult = await db
        .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}::numeric), 0)::real` })
        .from(expenses)
        .where(and(eq(expenses.domainId, domainId), gte(expenses.expenseDate, thirtyDaysAgo)));

    const rev30d = revenueResult[0]?.total ?? 0;
    const exp30d = expenseResult[0]?.total ?? 0;
    const profit = rev30d - exp30d;

    let revenueScore = 0;
    revenueScore += Math.min(50, (rev30d / 500) * 50); // Up to 50 pts for $500+ revenue
    revenueScore += profit > 0 ? 50 : Math.max(0, 25 + (profit / exp30d) * 25); // Profitability bonus

    if (rev30d < 10) recommendations.push('Set up monetization (ads, affiliates, or lead gen)');

    // --- SEO health (20%) ---
    const latestBacklinks = await db
        .select()
        .from(backlinkSnapshots)
        .where(eq(backlinkSnapshots.domainId, domainId))
        .orderBy(desc(backlinkSnapshots.snapshotDate))
        .limit(1);

    const blCount = latestBacklinks[0]?.totalBacklinks ?? 0;
    const rdCount = latestBacklinks[0]?.referringDomains ?? 0;

    let seoScore = 0;
    seoScore += Math.min(50, (blCount / 100) * 50); // Up to 50 pts for 100+ backlinks
    seoScore += Math.min(50, (rdCount / 30) * 50); // Up to 50 pts for 30+ referring domains

    if (rdCount < 5) recommendations.push('Build backlinks (target 30+ referring domains)');

    // --- Infrastructure (15%) ---
    const domain = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    const d = domain[0];

    let infraScore = 0;
    if (d) {
        if (d.isDeployed) infraScore += 25;
        else recommendations.push('Deploy the site');
        if (d.githubRepo) infraScore += 25;
        else recommendations.push('Set up a GitHub repository');
        if (d.renewalDate) infraScore += 25;
        else recommendations.push('Set renewal date');
        if (d.niche) infraScore += 25;
        else recommendations.push('Assign a niche');
    }

    // --- Composite ---
    const score = Math.round(
        (contentScore / 100) * 20 +
        (trafficScore / 100) * 25 +
        (revenueScore / 100) * 20 +
        (seoScore / 100) * 20 +
        (infraScore / 100) * 15
    );

    const status = score >= 70 ? 'healthy' : score >= 40 ? 'warning' : 'critical';

    // Update the domain's cached health score
    await db.update(domains).set({
        healthScore: score,
        healthUpdatedAt: new Date(),
    }).where(eq(domains.id, domainId));

    return {
        score,
        status,
        breakdown: {
            content: Math.round(contentScore),
            traffic: Math.round(trafficScore),
            revenue: Math.round(revenueScore),
            seo: Math.round(seoScore),
            infrastructure: Math.round(infraScore),
        },
        recommendations: recommendations.slice(0, 5),
    };
}
