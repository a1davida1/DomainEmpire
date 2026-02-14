import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const returningMock = vi.fn();
const valuesMock = vi.fn(() => ({ returning: returningMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));
const dbMock = { insert: insertMock };
const contentQueueMock = { id: 'id' };

const redisMock = {
    rpush: vi.fn(),
    ltrim: vi.fn(),
    lpop: vi.fn(),
    ping: vi.fn(),
    llen: vi.fn(),
};
const redisCtorMock = vi.fn();
class RedisMockClass {
    rpush = redisMock.rpush;
    ltrim = redisMock.ltrim;
    lpop = redisMock.lpop;
    ping = redisMock.ping;
    llen = redisMock.llen;

    constructor(opts: unknown) {
        redisCtorMock(opts);
    }
}

vi.mock('@/lib/db', () => ({
    db: dbMock,
    contentQueue: contentQueueMock,
}));

vi.mock('@upstash/redis', () => ({
    Redis: RedisMockClass,
}));

const baseEnv = { ...process.env };

async function loadModule(env: Record<string, string | undefined> = {}) {
    const setEnv = (key: string, value: string | undefined) => {
        if (value === undefined) {
            delete process.env[key];
            return;
        }
        process.env[key] = value;
    };

    vi.resetModules();

    setEnv('QUEUE_BACKEND', env.QUEUE_BACKEND);
    setEnv('UPSTASH_REDIS_REST_URL', env.UPSTASH_REDIS_REST_URL);
    setEnv('UPSTASH_REDIS_REST_TOKEN', env.UPSTASH_REDIS_REST_TOKEN);
    setEnv('QUEUE_REDIS_EVENT_KEY', env.QUEUE_REDIS_EVENT_KEY);
    setEnv('QUEUE_REDIS_PENDING_KEY', env.QUEUE_REDIS_PENDING_KEY);
    setEnv('QUEUE_REDIS_EVENT_MAX', env.QUEUE_REDIS_EVENT_MAX);

    return await import('@/lib/queue/content-queue');
}

describe('content-queue backend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        returningMock.mockResolvedValue([{ id: 'job-1' }]);
        redisMock.rpush.mockResolvedValue(1);
        redisMock.ltrim.mockResolvedValue('OK');
        redisMock.lpop.mockResolvedValue(null);
        redisMock.ping.mockResolvedValue('PONG');
        redisMock.llen.mockResolvedValue(0);
    });

    afterEach(() => {
        process.env = { ...baseEnv };
    });

    it('enqueues to postgres by default', async () => {
        const queue = await loadModule();

        const id = await queue.enqueueContentJob({
            jobType: 'generate_outline',
            status: 'pending',
        });

        expect(id).toBe('job-1');
        expect(insertMock).toHaveBeenCalledTimes(1);
        expect(redisCtorMock).not.toHaveBeenCalled();
    });

    it('publishes ready jobs to redis pending list in redis mode', async () => {
        const queue = await loadModule({
            QUEUE_BACKEND: 'redis',
            UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'token',
            QUEUE_REDIS_EVENT_KEY: 'q:events',
            QUEUE_REDIS_PENDING_KEY: 'q:pending',
        });

        const id = await queue.enqueueContentJob({
            jobType: 'generate_outline',
            status: 'pending',
        });

        expect(id).toBe('job-1');
        expect(redisCtorMock).toHaveBeenCalledTimes(1);
        expect(redisMock.rpush).toHaveBeenCalledWith('q:pending', 'job-1');
        expect(redisMock.rpush.mock.calls.some((call) => call[0] === 'q:events')).toBe(true);
    });

    it('does not dispatch future-scheduled jobs to redis pending list', async () => {
        const queue = await loadModule({
            QUEUE_BACKEND: 'redis',
            UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'token',
            QUEUE_REDIS_EVENT_KEY: 'q:events',
            QUEUE_REDIS_PENDING_KEY: 'q:pending',
        });

        await queue.enqueueContentJob({
            jobType: 'generate_outline',
            status: 'pending',
            scheduledFor: new Date(Date.now() + 60_000),
        });

        expect(redisMock.rpush.mock.calls.some((call) => call[0] === 'q:pending')).toBe(false);
        expect(redisMock.rpush.mock.calls.some((call) => call[0] === 'q:events')).toBe(true);
    });

    it('dequeues redis job IDs when available', async () => {
        const queue = await loadModule({
            QUEUE_BACKEND: 'redis',
            UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'token',
            QUEUE_REDIS_PENDING_KEY: 'q:pending',
        });

        redisMock.lpop.mockResolvedValue(['job-1', 'job-2']);
        const ids = await queue.dequeueContentJobIds(5);

        expect(ids).toEqual(['job-1', 'job-2']);
        expect(redisMock.lpop).toHaveBeenCalledWith('q:pending', 5);
    });

    it('reports redis health with pending depth', async () => {
        const queue = await loadModule({
            QUEUE_BACKEND: 'redis',
            UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
            UPSTASH_REDIS_REST_TOKEN: 'token',
            QUEUE_REDIS_PENDING_KEY: 'q:pending',
            QUEUE_REDIS_EVENT_KEY: 'q:events',
        });

        redisMock.llen.mockResolvedValue(7);
        const health = await queue.getContentQueueBackendHealth();

        expect(health.mode).toBe('redis_dispatch');
        expect(health.activeBackend).toBe('redis');
        expect(health.redisPendingDepth).toBe(7);
        expect(health.queuePendingKey).toBe('q:pending');
        expect(health.queueEventKey).toBe('q:events');
    });
});
