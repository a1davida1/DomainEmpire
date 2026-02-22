
import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq, and, inArray, sql, isNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { enqueueContentJob } from '@/lib/queue/content-queue';

type ScheduleFrequency = 'daily' | 'weekly' | 'sporadic';
type ScheduleTimeOfDay = 'morning' | 'evening' | 'random';
type DomainBucket = 'build' | 'redirect' | 'park' | 'defensive';

type BucketCadenceProfile = {
    fallbackFrequency: ScheduleFrequency;
    timeWindows: Array<{ startHour: number; endHour: number; weight: number }>;
    gapMultiplier: number;
    phaseShiftHours: number;
};

const BUCKET_CADENCE_PROFILES: Record<DomainBucket, BucketCadenceProfile> = {
    build: {
        fallbackFrequency: 'sporadic',
        timeWindows: [
            { startHour: 6, endHour: 10, weight: 0.35 },
            { startHour: 11, endHour: 15, weight: 0.4 },
            { startHour: 18, endHour: 22, weight: 0.25 },
        ],
        gapMultiplier: 1,
        phaseShiftHours: 0,
    },
    redirect: {
        fallbackFrequency: 'weekly',
        timeWindows: [
            { startHour: 7, endHour: 10, weight: 0.45 },
            { startHour: 16, endHour: 20, weight: 0.55 },
        ],
        gapMultiplier: 1.4,
        phaseShiftHours: 2,
    },
    park: {
        fallbackFrequency: 'sporadic',
        timeWindows: [
            { startHour: 8, endHour: 11, weight: 0.5 },
            { startHour: 17, endHour: 21, weight: 0.5 },
        ],
        gapMultiplier: 1.9,
        phaseShiftHours: 4,
    },
    defensive: {
        fallbackFrequency: 'weekly',
        timeWindows: [
            { startHour: 9, endHour: 12, weight: 0.55 },
            { startHour: 19, endHour: 22, weight: 0.45 },
        ],
        gapMultiplier: 2.4,
        phaseShiftHours: 6,
    },
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeBucket(value: unknown): DomainBucket {
    if (value === 'build' || value === 'redirect' || value === 'park' || value === 'defensive') {
        return value;
    }
    return 'build';
}

function stableRandom(seed: string, offset = 0): number {
    const hash = createHash('sha256').update(seed).digest();
    const value = hash.readUInt32BE(offset % (hash.length - 4));
    return value / 0xffffffff;
}

function resolveScheduleFromConfig(
    config: unknown,
    fallbackFrequency: ScheduleFrequency,
): {
    frequency: ScheduleFrequency;
    timeOfDay: ScheduleTimeOfDay;
} {
    const defaultSchedule = {
        frequency: fallbackFrequency,
        timeOfDay: 'random' as ScheduleTimeOfDay,
    };
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return defaultSchedule;
    }

    const schedule = (config as Record<string, unknown>).schedule;
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
        return defaultSchedule;
    }

    const frequencyRaw = (schedule as Record<string, unknown>).frequency;
    const timeOfDayRaw = (schedule as Record<string, unknown>).timeOfDay;

    const frequency: ScheduleFrequency =
        frequencyRaw === 'daily' || frequencyRaw === 'weekly' || frequencyRaw === 'sporadic'
            ? frequencyRaw
            : fallbackFrequency;
    const timeOfDay: ScheduleTimeOfDay =
        timeOfDayRaw === 'morning' || timeOfDayRaw === 'evening' || timeOfDayRaw === 'random'
            ? timeOfDayRaw
            : 'random';

    return { frequency, timeOfDay };
}

function computeGapDays(
    frequency: ScheduleFrequency,
    bucketProfile: BucketCadenceProfile,
    seed: string,
): number {
    const random = stableRandom(`${seed}:gap`);
    let baseDays: number;

    if (frequency === 'daily') {
        baseDays = 0.75 + random * 0.9;
    } else if (frequency === 'weekly') {
        baseDays = 5.5 + random * 3.5;
    } else {
        baseDays = 1.5 + random * 4.5;
    }

    // Bucket multiplier keeps different portfolio buckets naturally desynchronized.
    return baseDays * bucketProfile.gapMultiplier;
}

function pickWeightedWindow(
    windows: BucketCadenceProfile['timeWindows'],
    seed: string,
): { startHour: number; endHour: number } {
    const totalWeight = windows.reduce((sum, window) => sum + window.weight, 0);
    const ticket = stableRandom(`${seed}:window`) * totalWeight;
    let running = 0;
    for (const window of windows) {
        running += window.weight;
        if (ticket <= running) {
            return window;
        }
    }
    return windows[0];
}

function resolveTargetHour(
    timeOfDay: ScheduleTimeOfDay,
    bucketProfile: BucketCadenceProfile,
    seed: string,
): number {
    if (timeOfDay === 'morning') {
        return 6 + Math.floor(stableRandom(`${seed}:morning`) * 5); // 6-10
    }
    if (timeOfDay === 'evening') {
        return 17 + Math.floor(stableRandom(`${seed}:evening`) * 6); // 17-22
    }

    const window = pickWeightedWindow(bucketProfile.timeWindows, seed);
    const width = Math.max(1, window.endHour - window.startHour + 1);
    return window.startHour + Math.floor(stableRandom(`${seed}:random-hour`) * width);
}

/**
 * Check for domains that need new content and schedule jobs based on "human-like" patterns.
 */
export async function checkContentSchedule() {
    console.log('[Scheduler] Checking content schedules...');

    // 1. Get all active domains (exclude soft-deleted)
    const activeDomains = await db.select().from(domains).where(and(eq(domains.status, 'active'), isNull(domains.deletedAt)));
    if (activeDomains.length === 0) return;

    const activeDomainIds = activeDomains.map(d => d.id);

    // 2. Bulk check pending/processing jobs AND recently scheduled jobs (last 24h)
    //    This prevents duplicate scheduling if the scheduler runs multiple times.
    const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCutoffIso = recentCutoff.toISOString();
    const pendingJobs = await db
        .select({ domainId: contentQueue.domainId })
        .from(contentQueue)
        .where(
            and(
                inArray(contentQueue.domainId, activeDomainIds),
                sql`(${inArray(contentQueue.status, ['pending', 'processing'])} OR (${contentQueue.status} = 'completed' AND ${contentQueue.createdAt} >= ${recentCutoffIso}::timestamp))`
            )
        );

    const busyDomainIds = new Set(pendingJobs.map(j => j.domainId));

    // 3. Bulk check latest articles
    const latestArticles = await db.select({
        domainId: articles.domainId,
        lastDate: sql<Date>`max(${articles.createdAt})`
    })
        .from(articles)
        .where(inArray(articles.domainId, activeDomainIds))
        .groupBy(articles.domainId);

    function coerceDate(value: unknown): Date {
        if (value instanceof Date) return value;
        if (typeof value === 'string' || typeof value === 'number') {
            const d = new Date(value);
            if (!Number.isNaN(d.getTime())) return d;
        }
        return new Date(0);
    }

    const lastDateMap = new Map(latestArticles.map(a => [a.domainId, coerceDate(a.lastDate)]));

    // 4. Process each domain
    for (const domain of activeDomains) {
        if (busyDomainIds.has(domain.id)) continue;

        const lastDate = lastDateMap.get(domain.id) || new Date(0);

        // Use current time as base if last article is more than 30 days old (or non-existent) to avoid immediate burst
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const baseDate = lastDate < thirtyDaysAgo ? new Date() : lastDate;

        const bucket = normalizeBucket(domain.bucket);
        const bucketProfile = BUCKET_CADENCE_PROFILES[bucket];
        const config = resolveScheduleFromConfig(domain.contentConfig, bucketProfile.fallbackFrequency);
        const seedBase = `${domain.id}:${domain.domain}:${bucket}:${baseDate.toISOString().slice(0, 10)}`;

        // Calculate target publish gap using bucket-specific multipliers.
        const gapDays = computeGapDays(config.frequency, bucketProfile, seedBase);

        const nextPostDate = new Date(baseDate.getTime() + gapDays * 24 * 60 * 60 * 1000);

        const rawHour = resolveTargetHour(config.timeOfDay, bucketProfile, seedBase) + bucketProfile.phaseShiftHours;
        const targetHour = ((rawHour % 24) + 24) % 24;
        const targetMinute = Math.floor(stableRandom(`${seedBase}:minute`) * 60);
        const targetSecond = Math.floor(stableRandom(`${seedBase}:second`) * 50);

        nextPostDate.setHours(targetHour, targetMinute, targetSecond, 0);

        // Ensure scheduled timestamp is not in the immediate past after hour/day adjustments.
        if (nextPostDate.getTime() <= Date.now() + 60_000) {
            nextPostDate.setMinutes(nextPostDate.getMinutes() + clamp(Math.floor(stableRandom(`${seedBase}:backoff`) * 45), 5, 45));
        }

        // Queue the Job
        console.log(
            `[Scheduler] Scheduling content for ${domain.domain} at ${nextPostDate.toISOString()} `
            + `(bucket=${bucket}, frequency=${config.frequency}, timeOfDay=${config.timeOfDay})`,
        );

        await enqueueContentJob({
            id: randomUUID(),
            jobType: 'keyword_research', // Start of pipeline
            domainId: domain.id,
            channel: 'maintain', // Scheduled content goes to maintain lane
            payload: {
                domain: domain.domain,
                niche: domain.niche,
                targetCount: 1
            },
            status: 'pending',
            priority: 2,
            scheduledFor: nextPostDate, // Delay execution until this time
        });
    }
}
