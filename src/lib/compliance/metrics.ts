import { db } from '@/lib/db';
import { articles, reviewEvents, qaChecklistResults, contentRevisions, citations, complianceSnapshots, disclosureConfigs, domains } from '@/lib/db/schema';
import { eq, sql, and, gte, isNull } from 'drizzle-orm';

export type ComplianceMetrics = {
    ymylApprovalRate: number;
    citationCoverageRatio: number;
    avgTimeInReview: number;
    articlesWithExpertReview: number;
    articlesWithQaPassed: number;
    disclosureComplianceRate: number;
    meaningfulEditRatio: number;
    totalPublished: number;
    totalInReview: number;
};

export async function calculateComplianceMetrics(domainId?: string): Promise<ComplianceMetrics> {
    const articleDomainFilter = domainId ? eq(articles.domainId, domainId) : sql`true`;

    // Core stats
    const [stats] = await db.select({
        totalPublished: sql<number>`count(*) filter (where ${articles.status} = 'published')::int`,
        totalInReview: sql<number>`count(*) filter (where ${articles.status} IN ('review', 'approved'))::int`,
        ymylPublished: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.ymylLevel} IN ('medium', 'high'))::int`,
    }).from(articles).where(articleDomainFilter);

    const totalPublished = stats?.totalPublished || 0;

    // Articles with citations (domain-scoped)
    const [citationStats] = await db.select({
        count: sql<number>`count(distinct ${citations.articleId})::int`,
    }).from(citations)
        .innerJoin(articles, eq(articles.id, citations.articleId))
        .where(and(articleDomainFilter, eq(articles.status, 'published')));

    const citationCoverageRatio = totalPublished > 0
        ? (citationStats?.count || 0) / totalPublished
        : 0;

    // Articles with passed QA (domain-scoped)
    const [qaStats] = await db.select({
        passed: sql<number>`count(distinct ${qaChecklistResults.articleId}) filter (where ${qaChecklistResults.allPassed} = true)::int`,
    }).from(qaChecklistResults)
        .innerJoin(articles, eq(articles.id, qaChecklistResults.articleId))
        .where(articleDomainFilter);

    // Articles with expert review events (domain-scoped)
    const [expertStats] = await db.select({
        count: sql<number>`count(distinct ${reviewEvents.articleId}) filter (where ${reviewEvents.eventType} = 'expert_signed')::int`,
    }).from(reviewEvents)
        .innerJoin(articles, eq(articles.id, reviewEvents.articleId))
        .where(articleDomainFilter);

    // Manual edit ratio (domain-scoped)
    const [revisionStats] = await db.select({
        total: sql<number>`count(*)::int`,
        manualEdits: sql<number>`count(*) filter (where ${contentRevisions.changeType} = 'manual_edit')::int`,
    }).from(contentRevisions)
        .innerJoin(articles, eq(articles.id, contentRevisions.articleId))
        .where(articleDomainFilter);

    const meaningfulEditRatio = (revisionStats?.total || 0) > 0
        ? (revisionStats?.manualEdits || 0) / (revisionStats?.total || 1)
        : 0;

    // YMYL approval rate: published YMYL articles with approval events (distinct article count)
    const ymylPublished = stats?.ymylPublished || 0;
    const [ymylApproved] = await db.select({
        count: sql<number>`count(distinct ${reviewEvents.articleId})::int`,
    }).from(reviewEvents)
        .innerJoin(articles, eq(articles.id, reviewEvents.articleId))
        .where(and(
            articleDomainFilter,
            eq(articles.status, 'published'),
            eq(reviewEvents.eventType, 'approved'),
            sql`${articles.ymylLevel} IN ('medium', 'high')`
        ));

    const ymylApprovalRate = ymylPublished > 0
        ? Math.min((ymylApproved?.count || 0) / ymylPublished, 1)
        : 1;

    // Average time in review: pair each submission with the SUBSEQUENT approval
    const submitEvents = db.select({
        articleId: reviewEvents.articleId,
        createdAt: reviewEvents.createdAt
    })
        .from(reviewEvents)
        .innerJoin(articles, eq(articles.id, reviewEvents.articleId))
        .where(and(eq(reviewEvents.eventType, 'submitted_for_review'), articleDomainFilter))
        .as('submit_events');

    const [reviewTimeStats] = await db.select({
        avgHours: sql<number>`coalesce(
            avg(extract(epoch from (approved_events.created_at - submit_events.created_at)) / 3600),
            0
        )::float`,
    }).from(submitEvents)
        .innerJoin(
            sql`lateral (
            select ${reviewEvents.createdAt} as created_at
            from ${reviewEvents}
            where ${reviewEvents.articleId} = submit_events.article_id
              and ${reviewEvents.eventType} = 'approved'
              and ${reviewEvents.createdAt} > submit_events.created_at
            order by ${reviewEvents.createdAt} asc
            limit 1
        ) approved_events`,
            sql`true`
        );

    const avgTimeInReview = reviewTimeStats?.avgHours || 0;

    // Disclosure compliance: ratio of domains with disclosure configs (domain-scoped)
    const domainStatusFilter = domainId
        ? and(eq(domains.id, domainId), eq(domains.status, 'active'))
        : eq(domains.status, 'active');

    const [disclosureStats] = await db.select({
        totalActive: sql<number>`count(distinct ${domains.id})::int`,
        withDisclosure: sql<number>`count(distinct ${disclosureConfigs.domainId})::int`,
    }).from(domains)
        .leftJoin(disclosureConfigs, eq(disclosureConfigs.domainId, domains.id))
        .where(domainStatusFilter);

    const disclosureComplianceRate = (disclosureStats?.totalActive || 0) > 0
        ? (disclosureStats?.withDisclosure || 0) / (disclosureStats?.totalActive || 1)
        : 1;

    return {
        ymylApprovalRate,
        citationCoverageRatio,
        avgTimeInReview,
        articlesWithExpertReview: expertStats?.count || 0,
        articlesWithQaPassed: qaStats?.passed || 0,
        disclosureComplianceRate,
        meaningfulEditRatio,
        totalPublished,
        totalInReview: stats?.totalInReview || 0,
    };
}

export async function snapshotCompliance(domainId?: string): Promise<void> {
    const metrics = await calculateComplianceMetrics(domainId);

    await db.insert(complianceSnapshots).values({
        domainId: domainId || null,
        snapshotDate: new Date(),
        metrics: {
            ymylApprovalRate: metrics.ymylApprovalRate,
            citationCoverageRatio: metrics.citationCoverageRatio,
            avgTimeInReviewHours: metrics.avgTimeInReview,
            articlesWithExpertReview: metrics.articlesWithExpertReview,
            articlesWithQaPassed: metrics.articlesWithQaPassed,
            disclosureComplianceRate: metrics.disclosureComplianceRate,
            meaningfulEditRatio: metrics.meaningfulEditRatio,
            totalPublished: metrics.totalPublished,
            totalInReview: metrics.totalInReview,
        },
    });
}

export async function getComplianceTrend(domainId?: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const filter = domainId
        ? and(eq(complianceSnapshots.domainId, domainId), gte(complianceSnapshots.snapshotDate, since))
        : and(isNull(complianceSnapshots.domainId), gte(complianceSnapshots.snapshotDate, since));

    return db.select()
        .from(complianceSnapshots)
        .where(filter)
        .orderBy(complianceSnapshots.snapshotDate);
}
