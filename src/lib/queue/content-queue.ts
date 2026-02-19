import { Redis } from '@upstash/redis';
import { db, contentQueue, type DbOrTx } from '@/lib/db';

export type ContentQueueInsert = typeof contentQueue.$inferInsert;
export type QueueBackendName = 'postgres' | 'redis';

type QueueInsertExecutor = DbOrTx;

export interface ContentQueueBackendHealth {
    mode: 'postgres' | 'redis_dispatch';
    selectedBackend: QueueBackendName;
    activeBackend: QueueBackendName;
    redisConfigured: boolean;
    redisStatus: 'disabled' | 'healthy' | 'degraded' | 'unavailable';
    queueEventKey: string;
    queuePendingKey: string;
    redisPendingDepth: number | null;
    fallbackReason: string | null;
    lastRedisErrorAt: string | null;
    lastRedisErrorMessage: string | null;
}

const DEFAULT_EVENT_KEY = 'domain-empire:content-queue:events';
const DEFAULT_PENDING_KEY = 'domain-empire:content-queue:pending';
const DEFAULT_EVENT_MAX = 2000;
const REDIS_TIMEOUT_MS = 1500;
const READY_TOLERANCE_MS = 1000;

const queueEventKey = process.env.QUEUE_REDIS_EVENT_KEY || DEFAULT_EVENT_KEY;
const queuePendingKey = process.env.QUEUE_REDIS_PENDING_KEY || DEFAULT_PENDING_KEY;
const queueEventMax = Number.isFinite(Number.parseInt(process.env.QUEUE_REDIS_EVENT_MAX || '', 10))
    ? Math.max(100, Number.parseInt(process.env.QUEUE_REDIS_EVENT_MAX || '', 10))
    : DEFAULT_EVENT_MAX;

let redisClient: Redis | null = null;
let runtimeFallbackReason: string | null = null;
let lastRedisErrorAt: string | null = null;
let lastRedisErrorMessage: string | null = null;

function selectedBackend(): QueueBackendName {
    return process.env.QUEUE_BACKEND?.toLowerCase() === 'redis' ? 'redis' : 'postgres';
}

function isRedisConfigured(): boolean {
    return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getRedisClient(): Redis | null {
    if (!isRedisConfigured()) {
        return null;
    }

    if (redisClient) {
        return redisClient;
    }

    redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    return redisClient;
}

function recordRedisError(reason: string, error?: unknown): void {
    runtimeFallbackReason = reason;
    lastRedisErrorAt = new Date().toISOString();
    lastRedisErrorMessage = error instanceof Error ? error.message : (typeof error === 'string' ? error : String(error));
}

function clearRedisError(): void {
    runtimeFallbackReason = null;
    lastRedisErrorAt = null;
    lastRedisErrorMessage = null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
                timeout.unref();
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

function normalizeIdList(raw: unknown): string[] {
    if (!raw) {
        return [];
    }

    if (Array.isArray(raw)) {
        return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
    }

    if (typeof raw === 'string' && raw.length > 0) {
        return [raw];
    }

    return [];
}

function parseScheduledFor(value: ContentQueueInsert['scheduledFor']): Date | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    try {
        const parsed = new Date(value as string);
        if (!Number.isFinite(parsed.getTime())) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function isReadyForImmediateDispatch(job: ContentQueueInsert): boolean {
    const scheduledFor = parseScheduledFor(job.scheduledFor);
    if (!scheduledFor) {
        return true;
    }

    return scheduledFor.getTime() <= Date.now() + READY_TOLERANCE_MS;
}

async function insertPostgres(job: ContentQueueInsert, executor: QueueInsertExecutor): Promise<string> {
    const [inserted] = await executor
        .insert(contentQueue)
        .values({
            ...job,
            status: job.status ?? 'pending',
        })
        .returning({ id: contentQueue.id });

    if (!inserted) {
        throw new Error('Failed to enqueue content job');
    }

    return inserted.id;
}

async function insertPostgresMany(jobs: ContentQueueInsert[], executor: QueueInsertExecutor): Promise<string[]> {
    if (jobs.length === 0) {
        return [];
    }

    const inserted = await executor
        .insert(contentQueue)
        .values(jobs.map((job) => ({
            ...job,
            status: job.status ?? 'pending',
        })))
        .returning({ id: contentQueue.id });

    return inserted.map((row) => row.id);
}

async function publishRedisEnqueue(jobIds: string[], events: Array<Record<string, unknown>>): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
        throw new Error('QUEUE_BACKEND is redis but Upstash credentials are not configured');
    }

    if (jobIds.length > 0) {
        await withTimeout(redis.rpush(queuePendingKey, ...jobIds), REDIS_TIMEOUT_MS);
    }

    if (events.length > 0) {
        const payloads = events.map((event) => JSON.stringify(event));
        await withTimeout(redis.rpush(queueEventKey, ...payloads), REDIS_TIMEOUT_MS);
        await withTimeout(redis.ltrim(queueEventKey, -queueEventMax, -1), REDIS_TIMEOUT_MS);
    }
}

/**
 * Canonical enqueue helper for content_queue jobs.
 *
 * - If called inside a transaction (executor provided), always writes to Postgres.
 * - If QUEUE_BACKEND=postgres (default), writes to Postgres.
 * - If QUEUE_BACKEND=redis, writes to Postgres and publishes ready job IDs to Redis pending list.
 *   If Redis fails, Postgres still succeeds and runtime fallback is recorded.
 */
export async function enqueueContentJob(
    job: ContentQueueInsert,
    executor?: QueueInsertExecutor,
): Promise<string> {
    if (executor) {
        return insertPostgres(job, executor);
    }

    const id = await insertPostgres(job, db);

    if (selectedBackend() !== 'redis') {
        return id;
    }

    const event = {
        id,
        jobType: job.jobType,
        domainId: job.domainId ?? null,
        articleId: job.articleId ?? null,
        priority: job.priority ?? 0,
        scheduledFor: job.scheduledFor ? new Date(job.scheduledFor).toISOString() : null,
        enqueuedAt: new Date().toISOString(),
    };

    const dispatchIds = isReadyForImmediateDispatch(job) ? [id] : [];

    try {
        await publishRedisEnqueue(dispatchIds, [event]);
        clearRedisError();
    } catch (error) {
        recordRedisError('Redis publish failed; using PostgreSQL enqueue only', error);
    }

    return id;
}

export async function enqueueContentJobs(
    jobs: ContentQueueInsert[],
    executor?: QueueInsertExecutor,
): Promise<string[]> {
    if (executor) {
        return insertPostgresMany(jobs, executor);
    }

    const ids = await insertPostgresMany(jobs, db);

    if (selectedBackend() !== 'redis' || jobs.length === 0) {
        return ids;
    }

    const nowIso = new Date().toISOString();
    const events = ids.map((id, index) => {
        const job = jobs[index];
        return {
            id,
            jobType: job.jobType,
            domainId: job.domainId ?? null,
            articleId: job.articleId ?? null,
            priority: job.priority ?? 0,
            scheduledFor: job.scheduledFor ? new Date(job.scheduledFor).toISOString() : null,
            enqueuedAt: nowIso,
        };
    });

    const dispatchIds = ids.filter((_, index) => isReadyForImmediateDispatch(jobs[index]));

    try {
        await publishRedisEnqueue(dispatchIds, events);
        clearRedisError();
    } catch (error) {
        recordRedisError('Redis publish failed for batch enqueue; using PostgreSQL enqueue only', error);
    }

    return ids;
}

/**
 * Dequeue ready job IDs from Redis pending list.
 * Returns empty array if Redis mode is disabled/unavailable.
 */
export async function dequeueContentJobIds(maxIds = 20): Promise<string[]> {
    if (selectedBackend() !== 'redis') {
        return [];
    }

    const redis = getRedisClient();
    if (!redis) {
        recordRedisError('Redis dequeue skipped; Upstash credentials are missing');
        return [];
    }

    const count = Math.max(1, Math.min(maxIds, 200));

    try {
        const raw = await withTimeout(redis.lpop<string | string[]>(queuePendingKey, count), REDIS_TIMEOUT_MS);
        clearRedisError();
        return normalizeIdList(raw);
    } catch (error) {
        recordRedisError('Redis dequeue failed; worker will fall back to PostgreSQL scanning', error);
        return [];
    }
}

/**
 * Requeue pending job IDs back to Redis pending list.
 */
export async function requeueContentJobIds(jobIds: string[]): Promise<void> {
    if (selectedBackend() !== 'redis' || jobIds.length === 0) {
        return;
    }

    const redis = getRedisClient();
    if (!redis) {
        recordRedisError('Redis requeue skipped; Upstash credentials are missing');
        return;
    }

    try {
        await withTimeout(redis.rpush(queuePendingKey, ...jobIds), REDIS_TIMEOUT_MS);
        clearRedisError();
    } catch (error) {
        recordRedisError('Redis requeue failed; job IDs may be recovered by PostgreSQL scanner', error);
    }
}

export async function getContentQueueBackendHealth(): Promise<ContentQueueBackendHealth> {
    const selected = selectedBackend();
    const redisConfigured = isRedisConfigured();

    if (selected !== 'redis') {
        return {
            mode: 'postgres',
            selectedBackend: selected,
            activeBackend: 'postgres',
            redisConfigured,
            redisStatus: 'disabled',
            queueEventKey,
            queuePendingKey,
            redisPendingDepth: null,
            fallbackReason: null,
            lastRedisErrorAt,
            lastRedisErrorMessage,
        };
    }

    if (!redisConfigured) {
        return {
            mode: 'redis_dispatch',
            selectedBackend: selected,
            activeBackend: 'postgres',
            redisConfigured,
            redisStatus: 'unavailable',
            queueEventKey,
            queuePendingKey,
            redisPendingDepth: null,
            fallbackReason: runtimeFallbackReason ?? 'QUEUE_BACKEND=redis but Upstash credentials are missing',
            lastRedisErrorAt,
            lastRedisErrorMessage,
        };
    }

    try {
        const redis = getRedisClient();
        if (!redis) {
            throw new Error('Redis client not available');
        }

        const [_, depth] = await Promise.all([
            withTimeout(redis.ping(), REDIS_TIMEOUT_MS),
            withTimeout(redis.llen(queuePendingKey), REDIS_TIMEOUT_MS),
        ]);

        return {
            mode: 'redis_dispatch',
            selectedBackend: selected,
            activeBackend: 'redis',
            redisConfigured,
            redisStatus: runtimeFallbackReason ? 'degraded' : 'healthy',
            queueEventKey,
            queuePendingKey,
            redisPendingDepth: depth,
            fallbackReason: runtimeFallbackReason,
            lastRedisErrorAt,
            lastRedisErrorMessage,
        };
    } catch (error) {
        recordRedisError('Redis health check failed; worker will fall back to PostgreSQL scanning', error);
        return {
            mode: 'redis_dispatch',
            selectedBackend: selected,
            activeBackend: 'postgres',
            redisConfigured,
            redisStatus: 'degraded',
            queueEventKey,
            queuePendingKey,
            redisPendingDepth: null,
            fallbackReason: runtimeFallbackReason,
            lastRedisErrorAt,
            lastRedisErrorMessage,
        };
    }
}
