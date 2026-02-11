
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db, contentQueue } from '@/lib/db';
import { pipelineProcessors } from '@/lib/ai/pipeline';
import { checkContentSchedule } from '@/lib/ai/scheduler';
import { asc, desc, eq, inArray, lt, and, sql } from 'drizzle-orm';

const MAX_CONCURRENT_JOBS = 5;
const POLL_INTERVAL = 5000; // 5 seconds
const STALE_JOB_THRESHOLD_MINUTES = 30;
const SCHEDULER_INTERVAL = 60 * 60 * 1000; // 1 hour

async function checkStaleJobs() {
    console.log('[Worker] Checking for stale jobs...');
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MINUTES * 60 * 1000);

    const staleJobs = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            errorMessage: 'Job reset due to stale lock',
            // attempts: sql`${contentQueue.attempts} + 1` // Optional: verify if we want to count stale resets as attempts
        })
        .where(
            and(
                eq(contentQueue.status, 'processing'),
                lt(contentQueue.startedAt, staleThreshold)
            )
        )
        .returning();

    if (staleJobs.length > 0) {
        console.warn(`[Worker] Reset ${staleJobs.length} stale jobs`);
    }
}

async function acquireJobs(limit: number) {
    return await db.transaction(async (tx) => {
        // Find pending jobs
        // Sort by PRIORITY DESC (Higher is better), then Created ASC (FIFO)
        const pending = await tx
            .select()
            .from(contentQueue)
            .where(
                and(
                    eq(contentQueue.status, 'pending'),
                    lt(contentQueue.attempts, contentQueue.maxAttempts)
                )
            )
            .orderBy(desc(contentQueue.priority), asc(contentQueue.createdAt))
            .limit(limit) // Prefer locking only what we need
            .for('update', { skipLocked: true });

        if (pending.length === 0) return [];

        const ids = pending.map((j) => j.id);

        // Mark as processing
        await tx
            .update(contentQueue)
            .set({
                status: 'processing',
                startedAt: new Date(),
            })
            .where(inArray(contentQueue.id, ids));

        return pending;
    });
}

async function processJob(job: typeof contentQueue.$inferSelect) {
    console.log(`[Worker] Starting job ${job.id} (${job.jobType})`);

    let timeoutId: NodeJS.Timeout;

    try {
        const handler = pipelineProcessors[job.jobType as keyof typeof pipelineProcessors];
        if (!handler) {
            throw new Error(`No handler for job type: ${job.jobType}`);
        }

        // Race between handler and timeout
        await Promise.race([
            handler(job.id),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Job duration exceeded 10m limit')), 10 * 60 * 1000);
            })
        ]);

        console.log(`[Worker] Completed job ${job.id}`);
        // Note: Pipeline handlers mark the job as 'completed' and save results/costs.
        // We do NOT double-update here.

    } catch (error) {
        console.error(`[Worker] Failed job ${job.id}:`, error);

        // Worker handles failure updates (Single Source of Truth)
        // Conditional retry logic
        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = job.maxAttempts || 3;
        const nextStatus = attempts < maxAttempts ? 'pending' : 'failed';
        const retryTime = nextStatus === 'pending'
            ? new Date(Date.now() + Math.pow(2, attempts) * 60 * 1000)
            : undefined;

        await db
            .update(contentQueue)
            .set({
                status: nextStatus,
                errorMessage: error instanceof Error ? error.message : String(error),
                attempts: attempts,
                scheduledFor: retryTime,
                lockedUntil: null
            })
            .where(eq(contentQueue.id, job.id));

    } finally {
        // @ts-ignore - Create safe clearance
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function startWorker() {
    console.log('[Worker] Starting AI Content Pipeline Worker...');

    // Initial cleanup
    await checkStaleJobs();

    let lastScheduleCheck = 0;

    while (true) {
        try {
            // Run Scheduler periodically
            if (Date.now() - lastScheduleCheck > SCHEDULER_INTERVAL) {
                await checkContentSchedule();
                lastScheduleCheck = Date.now();
            }

            // Count active jobs
            const activeJobs = await db
                .select({ count: sql<number>`count(*)` })
                .from(contentQueue)
                .where(eq(contentQueue.status, 'processing'));

            const activeCount = Number(activeJobs[0]?.count || 0);
            const availableSlots = MAX_CONCURRENT_JOBS - activeCount;

            if (availableSlots > 0) {
                const jobs = await acquireJobs(availableSlots);

                if (jobs.length > 0) {
                    console.log(`[Worker] Acquired ${jobs.length} new jobs`);
                    // Process in parallel (fire and forget promise, verified by polling)
                    // Process in parallel and wait for all to settle
                    const results = await Promise.allSettled(jobs.map(job => processJob(job)));

                    // Log any unhandled rejections
                    results.forEach((result, index) => {
                        if (result.status === 'rejected') {
                            console.error(`[Worker] Unhandled error processing job ${jobs[index].id}:`, result.reason);
                        }
                    });
                }
            }

            // Periodic stale check (every ~minute)
            if (Date.now() % 60000 < POLL_INTERVAL) {
                await checkStaleJobs();
            }

        } catch (error) {
            console.error('[Worker] Loop error:', error);
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
}

// Start
startWorker().catch(console.error);
