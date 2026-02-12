/**
 * Content Queue Worker
 * 
 * Processes pending jobs from the content_queue table.
 * This runs as a separate process or can be triggered via API.
 * 
 * Features:
 * - Atomic job locking with pessimistic row-level locks
 * - Exponential backoff on retry (2^attempts minutes)
 * - Stale lock recovery (auto-unlocks jobs locked > LOCK_DURATION_MS)
 * - Dead letter queue (jobs exceeding maxAttempts are permanently failed)
 * - Per-job timeout enforcement
 * - Concurrency-safe: multiple workers can run simultaneously
 * 
 * Job Types:
 * - generate_outline: Create article outline with AI
 * - generate_draft: Write article from outline
 * - humanize: Make AI content sound natural
 * - seo_optimize: Add SEO elements
 * - generate_meta: Create meta tags
 * - deploy: Push to GitHub/Cloudflare
 * - keyword_research: Research keywords for domain
 * - bulk_seed: Seed articles for domain
 * - fetch_analytics: Pull analytics data
 */

import { db, contentQueue, articles, domains, keywords } from '@/lib/db';
import { eq, and, lte, gt, isNull, or, sql, asc, desc, count, inArray } from 'drizzle-orm';
import { processOutlineJob, processDraftJob, processHumanizeJob, processSeoOptimizeJob, processMetaJob, processKeywordResearchJob, processResearchJob } from './pipeline';
import { processDeployJob } from '@/lib/deploy/processor';
import { checkContentSchedule } from './scheduler';
import { evaluateDomain } from '@/lib/evaluation/evaluator';
import { checkAndRefreshStaleContent } from '@/lib/content/refresh';
import { checkRenewals } from '@/lib/domain/renewals';
import { checkBacklinks } from '@/lib/analytics/backlinks';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';
import { snapshotCompliance } from '@/lib/compliance/metrics';
import { purgeExpiredSessions } from '@/lib/auth';
import { checkStaleDatasets } from '@/lib/datasets/freshness';
import { runAllMonitoringChecks } from '@/lib/monitoring/triggers';

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per job
const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 5000;
const STALE_LOCK_CHECK_INTERVAL = 60_000; // Check for stale locks every 60s
const SCHEDULER_CHECK_INTERVAL = 60 * 60 * 1000; // Run scheduler every hour

interface WorkerOptions {
    continuous?: boolean;
    maxJobs?: number;
    jobTypes?: string[];
}

interface WorkerResult {
    processed: number;
    failed: number;
    staleLocksCleaned: number;
    stats: QueueStats;
}

interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
}

/**
 * Recover stale locks — jobs that were locked but the worker crashed.
 * These get reset to 'pending' so they can be picked up again.
 */
async function recoverStaleLocks(): Promise<number> {
    const now = new Date();

    // Find jobs that are still marked as 'processing' but whose lock has expired
    const staleJobs = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            lockedUntil: null,
            errorMessage: 'Worker crashed or timed out — auto-recovered',
        })
        .where(
            and(
                eq(contentQueue.status, 'processing'),
                lte(contentQueue.lockedUntil, now)
            )
        )
        .returning({ id: contentQueue.id });

    if (staleJobs.length > 0) {
        console.warn(`Recovered ${staleJobs.length} stale locks: ${staleJobs.map(j => j.id).join(', ')}`);
    }

    return staleJobs.length;
}

/**
 * Acquires pending jobs that are ready to process using atomic UPDATE...RETURNING
 * to prevent race conditions between multiple workers.
 */
async function acquireJobs(limit: number, jobTypes?: string[]) {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // Use a single atomic UPDATE...WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
    // This prevents race conditions between multiple workers entirely.
    const jobTypeFilter = jobTypes?.length
        ? sql`AND ${contentQueue.jobType} IN (${sql.join(jobTypes.map(t => sql`${t}`), sql`, `)})`
        : sql``;

    const lockedJobs = await db.execute<typeof contentQueue.$inferSelect>(sql`
        UPDATE ${contentQueue}
        SET status = 'processing',
            locked_until = ${lockUntil},
            started_at = ${now}
        WHERE id IN (
            SELECT id FROM ${contentQueue}
            WHERE status = 'pending'
              AND scheduled_for <= ${now}
              AND (locked_until IS NULL OR locked_until <= ${now})
              ${jobTypeFilter}
            ORDER BY priority DESC, created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `);

    return Array.isArray(lockedJobs) ? lockedJobs : (lockedJobs as unknown as { rows: typeof contentQueue.$inferSelect[] }).rows ?? [];
}

/**
 * Process a single job with timeout enforcement
 */
async function processJob(job: typeof contentQueue.$inferSelect): Promise<boolean> {
    const startTime = Date.now();
    console.log(`[Worker] Processing job ${job.id} (${job.jobType}) — attempt ${(job.attempts || 0) + 1}/${job.maxAttempts || 3}`);

    let timeoutId: ReturnType<typeof setTimeout>;

    try {
        // Create a timeout promise (cleared on success or failure to prevent leak)
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 1000}s`)), JOB_TIMEOUT_MS);
        });

        // Race the job against the timeout
        const jobPromise = executeJob(job);
        await Promise.race([jobPromise, timeoutPromise]);

        clearTimeout(timeoutId!);
        const durationMs = Date.now() - startTime;
        console.log(`[Worker] Job ${job.id} completed in ${durationMs}ms`);
        return true;
    } catch (error) {
        clearTimeout(timeoutId!);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - startTime;
        console.error(`[Worker] Job ${job.id} failed after ${durationMs}ms:`, errorMessage);

        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = job.maxAttempts || 3;

        if (attempts >= maxAttempts) {
            // Dead letter — permanently failed
            await markJobFailed(job.id, `Dead letter (${attempts}/${maxAttempts}): ${errorMessage}`);

            // Reset article status so user can manually retry
            if (job.articleId) {
                await db
                    .update(articles)
                    .set({ status: 'draft' })
                    .where(eq(articles.id, job.articleId));
            }
        } else {
            // Schedule retry with exponential backoff: 2, 4, 8 minutes... capped at 30 min
            const retryDelayMs = Math.min(Math.pow(2, attempts) * 60 * 1000, 30 * 60 * 1000);
            const scheduledFor = new Date(Date.now() + retryDelayMs);

            await db
                .update(contentQueue)
                .set({
                    status: 'pending',
                    attempts,
                    lockedUntil: null,
                    scheduledFor,
                    errorMessage: `Retry ${attempts}/${maxAttempts}: ${errorMessage}`,
                })
                .where(eq(contentQueue.id, job.id));

            console.log(`[Worker] Job ${job.id} scheduled for retry in ${retryDelayMs / 1000}s`);
        }

        return false;
    }
}

/**
 * Execute the actual job logic based on job type
 */
async function executeJob(job: typeof contentQueue.$inferSelect): Promise<void> {
    switch (job.jobType) {
        case 'generate_outline':
            await processOutlineJob(job.id);
            break;
        case 'generate_draft':
            await processDraftJob(job.id);
            break;
        case 'humanize':
            await processHumanizeJob(job.id);
            break;
        case 'seo_optimize':
            await processSeoOptimizeJob(job.id);
            break;
        case 'generate_meta':
            await processMetaJob(job.id);
            break;
        case 'keyword_research':
            await processKeywordResearchJob(job.id);
            break;
        case 'research':
            await processResearchJob(job.id);
            break;
        case 'bulk_seed':
            await processBulkSeedJob(job.id);
            break;
        case 'deploy':
            await processDeployJob(job.id);
            break;
        case 'evaluate': {
            const evalPayload = job.payload as { domain: string; acquisitionCost?: number; niche?: string } | undefined;

            if (!evalPayload || typeof evalPayload.domain !== 'string' || evalPayload.domain.trim() === '') {
                await markJobFailed(job.id, 'Failed: invalid payload - missing or invalid domain');
                break;
            }

            // Optional type checks for extra safety
            const acquisitionCost = typeof evalPayload.acquisitionCost === 'number' ? evalPayload.acquisitionCost : undefined;
            const niche = typeof evalPayload.niche === 'string' ? evalPayload.niche : undefined;

            try {
                const evalResult = await evaluateDomain(evalPayload.domain, {
                    acquisitionCost,
                    niche,
                });
                await markJobComplete(job.id, `Score: ${evalResult.compositeScore}/100 — ${evalResult.recommendation}`);
            } catch (err) {
                await markJobFailed(job.id, err instanceof Error ? err.message : String(err));
            }
            break;
        }
        case 'fetch_analytics': {
            // Fetch Cloudflare + GSC analytics for the domain
            if (job.domainId) {
                const domainRecord = await db.select({ domain: domains.domain })
                    .from(domains).where(eq(domains.id, job.domainId)).limit(1);
                if (domainRecord.length) {
                    const { getDomainAnalytics } = await import('@/lib/analytics/cloudflare');
                    const cfData = await getDomainAnalytics(domainRecord[0].domain);
                    const gscData = await getDomainGSCSummary(domainRecord[0].domain);
                    await markJobComplete(job.id, `CF: ${cfData.length} days, GSC: ${gscData ? 'ok' : 'n/a'}`);
                } else {
                    await markJobFailed(job.id, 'Domain not found');
                }
            } else {
                await markJobFailed(job.id, 'No domainId provided');
            }
            break;
        }
        case 'content_refresh': {
            // Refresh a stale article — re-run research + regeneration
            if (job.articleId) {
                const articleRecord = await db.select({ id: articles.id, domainId: articles.domainId, targetKeyword: articles.targetKeyword })
                    .from(articles).where(eq(articles.id, job.articleId)).limit(1);
                if (articleRecord.length) {
                    const article = articleRecord[0];
                    // Queue a research job which will chain into outline -> draft -> humanize -> SEO -> meta
                    const domainRecord = await db.select({ domain: domains.domain })
                        .from(domains).where(eq(domains.id, article.domainId)).limit(1);

                    if (!domainRecord.length) {
                        await markJobFailed(job.id, `Domain not found for article: ${article.domainId}`);
                        break;
                    }

                    // Guard against duplicate refresh pipelines
                    const existingJob = await db.select({ id: contentQueue.id })
                        .from(contentQueue)
                        .where(and(
                            eq(contentQueue.articleId, article.id),
                            eq(contentQueue.jobType, 'research'),
                            inArray(contentQueue.status, ['pending', 'processing'])
                        ))
                        .limit(1);

                    if (existingJob.length > 0) {
                        await markJobComplete(job.id, `Refresh already in progress for article ${article.id}`);
                        break;
                    }

                    await db.insert(contentQueue).values({
                        jobType: 'research',
                        domainId: article.domainId,
                        articleId: article.id,
                        payload: { targetKeyword: article.targetKeyword, domainName: domainRecord[0].domain },
                        status: 'pending',
                        priority: 3,
                    });

                    // Update refresh timestamp
                    await db.update(articles).set({ lastRefreshedAt: new Date() }).where(eq(articles.id, article.id));
                    await markJobComplete(job.id, `Queued refresh pipeline for article ${article.id}`);
                } else {
                    await markJobFailed(job.id, 'Article not found');
                }
            } else {
                await markJobFailed(job.id, 'No articleId provided');
            }
            break;
        }
        case 'fetch_gsc': {
            if (job.domainId) {
                const domainRecord = await db.select({ domain: domains.domain })
                    .from(domains).where(eq(domains.id, job.domainId)).limit(1);
                if (domainRecord.length) {
                    const summary = await getDomainGSCSummary(domainRecord[0].domain);
                    await markJobComplete(job.id, summary
                        ? `Clicks: ${summary.totalClicks}, Impressions: ${summary.totalImpressions}`
                        : 'GSC not configured or no data');
                } else {
                    await markJobFailed(job.id, 'Domain not found');
                }
            } else {
                await markJobFailed(job.id, 'No domainId provided');
            }
            break;
        }
        case 'check_backlinks': {
            if (job.domainId) {
                await checkBacklinks(job.domainId);
                await markJobComplete(job.id, 'Backlink snapshot saved');
            } else {
                await markJobFailed(job.id, 'No domainId provided');
            }
            break;
        }
        case 'check_renewals': {
            await checkRenewals();
            await markJobComplete(job.id, 'Renewal check complete');
            break;
        }
        case 'check_datasets': {
            const staleCount = await checkStaleDatasets();
            await markJobComplete(job.id, `Found ${staleCount} stale dataset(s)`);
            break;
        }
        default:
            throw new Error(`Unknown job type: ${job.jobType}`);
    }
}

/**
 * Process a bulk_seed job: queue keyword_research jobs for N articles on a domain.
 * The keyword_research pipeline will chain into outline -> draft -> humanize -> SEO.
 */
async function processBulkSeedJob(jobId: string) {
    const [job] = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (!job?.domainId) {
        await markJobFailed(jobId, 'No domainId provided');
        return;
    }

    const payload = job.payload as { domain?: string; niche?: string; subNiche?: string; articleCount?: number } | undefined;
    const articleCount = payload?.articleCount || 5;

    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId)).limit(1);
    if (!domainRecord.length) {
        await markJobFailed(jobId, 'Domain not found');
        return;
    }

    const domain = domainRecord[0];

    // Check for available unassigned keywords
    const availableKeywords = await db.select()
        .from(keywords)
        .where(and(eq(keywords.domainId, domain.id), isNull(keywords.articleId)))
        .limit(articleCount);

    // Queue keyword_research if we don't have enough keywords
    const keywordsNeeded = articleCount - availableKeywords.length;
    if (keywordsNeeded > 0) {
        await db.insert(contentQueue).values({
            jobType: 'keyword_research',
            domainId: domain.id,
            payload: {
                domain: domain.domain,
                niche: domain.niche,
                subNiche: domain.subNiche,
                targetCount: keywordsNeeded,
            },
            status: 'pending',
            priority: job.priority ?? 3,
        });
    }

    // Queue article generation for each available keyword
    let queued = 0;
    for (const kw of availableKeywords) {
        // Create article stub
        const slug = kw.keyword.toLowerCase().replaceAll(/\s+/g, '-').replaceAll(/[^a-z0-9-]/g, '').replaceAll(/-+/g, '-').replaceAll(/^-|-$/g, '') || `article-${kw.id.slice(0, 8)}`;
        const [article] = await db.insert(articles).values({
            domainId: domain.id,
            title: kw.keyword,
            slug,
            targetKeyword: kw.keyword,
            status: 'generating',
            isSeedArticle: true,
        }).returning();

        // Link keyword to article
        await db.update(keywords).set({ articleId: article.id, status: 'assigned' }).where(eq(keywords.id, kw.id));

        // Queue the generation pipeline
        await db.insert(contentQueue).values({
            jobType: 'research',
            domainId: domain.id,
            articleId: article.id,
            payload: { targetKeyword: kw.keyword, domainName: domain.domain },
            status: 'pending',
            priority: job.priority ?? 3,
        });
        queued++;
    }

    await markJobComplete(jobId, `Queued ${queued} article(s), ${keywordsNeeded > 0 ? `${keywordsNeeded} keyword research job(s)` : 'all keywords available'}`);
}

async function markJobComplete(jobId: string, result?: string) {
    await db
        .update(contentQueue)
        .set({
            status: 'completed',
            completedAt: new Date(),
            lockedUntil: null,
            result: result ? { message: result } : undefined,
        })
        .where(eq(contentQueue.id, jobId));
}

async function markJobFailed(jobId: string, errorMessage: string) {
    await db
        .update(contentQueue)
        .set({
            status: 'failed',
            errorMessage,
            lockedUntil: null,
            completedAt: new Date(),
        })
        .where(eq(contentQueue.id, jobId));
}

/**
 * Run the worker once (process available jobs and exit)
 */
export async function runWorkerOnce(options: WorkerOptions = {}): Promise<WorkerResult> {
    const maxJobs = options.maxJobs || BATCH_SIZE;

    // Step 1: Recover any stale locks from crashed workers
    const staleLocksCleaned = await recoverStaleLocks();

    // Step 2: Acquire and process jobs
    const jobs = await acquireJobs(maxJobs, options.jobTypes);

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
        const success = await processJob(job);
        if (success) {
            processed++;
        } else {
            failed++;
        }
    }

    // Step 3: Get current stats
    const stats = await getQueueStats();

    return { processed, failed, staleLocksCleaned, stats };
}

/**
 * Run the worker continuously (for production use with process manager)
 */
export async function runWorkerContinuously(options: WorkerOptions = {}): Promise<never> {
    console.log('[Worker] Starting continuous queue worker...');

    let lastStaleCheck = 0;
    let lastSchedulerCheck = 0;

    while (true) {
        try {
            const now = Date.now();

            // Periodically recover stale locks (every 60s)
            if (now - lastStaleCheck > STALE_LOCK_CHECK_INTERVAL) {
                await recoverStaleLocks();
                lastStaleCheck = now;
            }

            // Run scheduler check approximately every hour
            if (now - lastSchedulerCheck > SCHEDULER_CHECK_INTERVAL) {
                await checkContentSchedule().catch((err: unknown) => console.error('[Scheduler] Error:', err));
                await checkAndRefreshStaleContent().catch((err: unknown) => console.error('[ContentRefresh] Error:', err));
                await checkRenewals().catch((err: unknown) => console.error('[Renewals] Error:', err));
                await snapshotCompliance().catch((err: unknown) => console.error('[Compliance] Error:', err));
                await checkStaleDatasets().catch((err: unknown) => console.error('[DatasetFreshness] Error:', err));
                await purgeExpiredSessions().catch((err: unknown) => console.error('[SessionPurge] Error:', err));
                await runAllMonitoringChecks().catch((err: unknown) => console.error('[Monitoring] Error:', err));
                lastSchedulerCheck = now;
            }

            const result = await runWorkerOnce(options);

            if (result.processed > 0 || result.failed > 0) {
                console.log(
                    `[Worker] Batch: ${result.processed} processed, ${result.failed} failed, ` +
                    `${result.staleLocksCleaned} stale recovered | ` +
                    `Queue: ${result.stats.pending} pending, ${result.stats.failed} dead`
                );
            }
        } catch (error) {
            console.error('[Worker] Unexpected error:', error);
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
    const stats = await db
        .select({
            status: contentQueue.status,
            count: sql<number>`count(*)::int`,
        })
        .from(contentQueue)
        .groupBy(contentQueue.status);

    const byStatus: Record<string, number> = {};
    for (const row of stats) {
        if (row.status) {
            byStatus[row.status] = row.count;
        }
    }

    return {
        pending: byStatus['pending'] || 0,
        processing: byStatus['processing'] || 0,
        completed: byStatus['completed'] || 0,
        failed: byStatus['failed'] || 0,
        cancelled: byStatus['cancelled'] || 0,
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    };
}

/**
 * Get detailed queue health metrics
 */
export async function getQueueHealth() {
    const stats = await getQueueStats();

    // Get oldest pending job age
    const oldestPending = await db
        .select({ createdAt: contentQueue.createdAt })
        .from(contentQueue)
        .where(eq(contentQueue.status, 'pending'))
        .orderBy(asc(contentQueue.createdAt))
        .limit(1);

    // Get average processing time for completed jobs (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const avgDuration = await db
        .select({
            avgMs: sql<number>`avg(extract(epoch from (${contentQueue.completedAt} - ${contentQueue.startedAt})) * 1000)::int`,
        })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'completed'),
                lte(contentQueue.completedAt, new Date()),
                gt(contentQueue.completedAt, oneDayAgo)
            )
        );

    // Get throughput (completed jobs in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const throughput = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'completed'),
                gt(contentQueue.completedAt, oneHourAgo)
            )
        );

    // Get error rate (failed in last 24h / total in last 24h)
    const recentTotal = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(gt(contentQueue.createdAt, oneDayAgo));

    const recentFailed = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'failed'),
                gt(contentQueue.createdAt, oneDayAgo)
            )
        );

    const totalRecent = recentTotal[0]?.count || 0;
    const failedRecent = recentFailed[0]?.count || 0;

    return {
        ...stats,
        oldestPendingAge: oldestPending[0]?.createdAt
            ? Date.now() - oldestPending[0].createdAt.getTime()
            : null,
        avgProcessingTimeMs: avgDuration[0]?.avgMs || null,
        throughputPerHour: throughput[0]?.count || 0,
        errorRate24h: totalRecent > 0 ? Math.round((failedRecent / totalRecent) * 10000) / 100 : 0,
    };
}

/**
 * Retry failed jobs
 */
export async function retryFailedJobs(limit = 10): Promise<number> {
    const failedJobs = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(eq(contentQueue.status, 'failed'))
        .limit(limit);

    for (const job of failedJobs) {
        await db
            .update(contentQueue)
            .set({
                status: 'pending',
                attempts: 0,
                errorMessage: null,
                scheduledFor: new Date(),
                lockedUntil: null,
            })
            .where(eq(contentQueue.id, job.id));
    }

    return failedJobs.length;
}

/**
 * Cancel a pending job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
    const result = await db
        .update(contentQueue)
        .set({ status: 'cancelled' })
        .where(
            and(
                eq(contentQueue.id, jobId),
                eq(contentQueue.status, 'pending')
            )
        )
        .returning();

    return result.length > 0;
}

/**
 * Purge completed jobs older than N days
 */
export async function purgeOldJobs(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const deleted = await db
        .delete(contentQueue)
        .where(
            and(
                or(
                    eq(contentQueue.status, 'completed'),
                    eq(contentQueue.status, 'cancelled')
                ),
                lte(contentQueue.completedAt, cutoff)
            )
        )
        .returning({ id: contentQueue.id });

    if (deleted.length > 0) {
        console.log(`[Worker] Purged ${deleted.length} old completed/cancelled jobs`);
    }

    return deleted.length;
}
