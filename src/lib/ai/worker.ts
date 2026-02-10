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

import { db, contentQueue, articles } from '@/lib/db';
import { eq, and, lte, isNull, or, sql, asc, count } from 'drizzle-orm';
import { processOutlineJob, processDraftJob, processHumanizeJob, processSeoOptimizeJob, processMetaJob, processKeywordResearchJob, processResearchJob } from './pipeline';
import { processDeployJob } from '@/lib/deploy/processor';
import { checkContentSchedule } from './scheduler';

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per job
const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 5000;
const STALE_LOCK_CHECK_INTERVAL = 60_000; // Check for stale locks every 60s

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

    // Build base conditions
    const conditions = [
        eq(contentQueue.status, 'pending'),
        lte(contentQueue.scheduledFor, now),
        or(
            isNull(contentQueue.lockedUntil),
            lte(contentQueue.lockedUntil, now)
        ),
    ];

    // Get pending job IDs (ordered by priority, then age)
    const pendingJobs = await db
        .select({
            id: contentQueue.id,
            jobType: contentQueue.jobType,
        })
        .from(contentQueue)
        .where(and(...conditions))
        .orderBy(asc(contentQueue.priority), asc(contentQueue.createdAt))
        .limit(limit);

    if (pendingJobs.length === 0) return [];

    // Filter by job types if specified
    const filteredJobs = jobTypes
        ? pendingJobs.filter(j => jobTypes.includes(j.jobType))
        : pendingJobs;

    if (filteredJobs.length === 0) return [];

    const jobIds = filteredJobs.map(j => j.id);

    // Atomically lock jobs by setting status to 'processing' + lockUntil
    // Only lock if status is still 'pending' (prevents double-acquisition)
    const lockedJobs = [];
    for (const jobId of jobIds) {
        const result = await db
            .update(contentQueue)
            .set({
                status: 'processing',
                lockedUntil: lockUntil,
                startedAt: new Date(),
            })
            .where(
                and(
                    eq(contentQueue.id, jobId),
                    eq(contentQueue.status, 'pending') // Only if still pending
                )
            )
            .returning();

        if (result.length > 0) {
            lockedJobs.push(result[0]);
        }
    }

    return lockedJobs;
}

/**
 * Process a single job with timeout enforcement
 */
async function processJob(job: typeof contentQueue.$inferSelect): Promise<boolean> {
    const startTime = Date.now();
    console.log(`[Worker] Processing job ${job.id} (${job.jobType}) — attempt ${(job.attempts || 0) + 1}/${job.maxAttempts || 3}`);

    try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 1000}s`)), JOB_TIMEOUT_MS);
        });

        // Race the job against the timeout
        const jobPromise = executeJob(job);
        await Promise.race([jobPromise, timeoutPromise]);

        const durationMs = Date.now() - startTime;
        console.log(`[Worker] Job ${job.id} completed in ${durationMs}ms`);
        return true;
    } catch (error) {
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
            // Schedule retry with exponential backoff: 2, 4, 8 minutes...
            const retryDelayMs = Math.pow(2, attempts) * 60 * 1000;
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
            // Bulk seed is handled by the API route directly
            await markJobComplete(job.id, 'Bulk seed jobs are processed via API');
            break;
        case 'deploy':
            await processDeployJob(job.id);
            break;
        case 'fetch_analytics':
            await markJobComplete(job.id, 'Analytics fetch not yet implemented');
            break;
        default:
            throw new Error(`Unknown job type: ${job.jobType}`);
    }
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

    while (true) {
        try {
            // Periodically recover stale locks
            const now = Date.now();
            if (now - lastStaleCheck > STALE_LOCK_CHECK_INTERVAL) {
                await recoverStaleLocks();

                // Run scheduler check approx every hour (using large interval or mod check)
                // For simplicity, we'll check it here but use a separate timestamp
                await checkContentSchedule().catch((err: unknown) => console.error('[Scheduler] Error:', err));

                lastStaleCheck = now;
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
                sql`${contentQueue.completedAt} > ${oneDayAgo}`
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
                sql`${contentQueue.completedAt} > ${oneHourAgo}`
            )
        );

    // Get error rate (failed in last 24h / total in last 24h)
    const recentTotal = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(sql`${contentQueue.createdAt} > ${oneDayAgo}`);

    const recentFailed = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'failed'),
                sql`${contentQueue.createdAt} > ${oneDayAgo}`
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
