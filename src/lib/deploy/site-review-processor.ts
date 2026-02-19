import { db, contentQueue, domains } from '@/lib/db';
import { and, eq, isNull } from 'drizzle-orm';
import { reviewSite } from './site-review';

/**
 * Background processor for `content_queue.jobType = "domain_site_review"`.
 *
 * Runs the deterministic+AI site review and persists the report on the domain record.
 * The job is marked completed with a small summary result payload.
 */
export async function processDomainSiteReviewJob(jobId: string): Promise<void> {
    const jobRows = await db
        .select({
            id: contentQueue.id,
            domainId: contentQueue.domainId,
            attempts: contentQueue.attempts,
        })
        .from(contentQueue)
        .where(eq(contentQueue.id, jobId))
        .limit(1);

    const job = jobRows[0];
    if (!job) {
        throw new Error(`Site review job not found: ${jobId}`);
    }
    if (!job.domainId) {
        throw new Error(`Site review job ${jobId} missing domainId`);
    }

    const domainRows = await db
        .select({
            id: domains.id,
            domain: domains.domain,
        })
        .from(domains)
        .where(and(eq(domains.id, job.domainId), isNull(domains.deletedAt)))
        .limit(1);

    const domain = domainRows[0];
    if (!domain) {
        throw new Error(`Domain not found for site review job: ${job.domainId}`);
    }

    const report = await reviewSite(job.domainId);
    const scoreRounded = Math.round(report.overallScore);

    await db.update(domains).set({
        lastReviewResult: report,
        lastReviewScore: scoreRounded,
        lastReviewedAt: new Date(report.reviewedAt),
        updatedAt: new Date(),
    }).where(eq(domains.id, job.domainId));

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        lockedUntil: null,
        errorMessage: null,
        result: {
            message: `Site review completed: ${scoreRounded} (${report.verdict})`,
            reviewScore: scoreRounded,
            verdict: report.verdict,
            reviewedAt: report.reviewedAt,
            criticalIssueCount: report.criticalIssues.length,
        },
        attempts: job.attempts ?? 0,
    }).where(eq(contentQueue.id, jobId));
}

