
import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq, and, inArray, sql, gte, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

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
    const pendingJobs = await db
        .select({ domainId: contentQueue.domainId })
        .from(contentQueue)
        .where(
            and(
                inArray(contentQueue.domainId, activeDomainIds),
                sql`(${inArray(contentQueue.status, ['pending', 'processing'])} OR (${contentQueue.status} = 'completed' AND ${contentQueue.createdAt} >= ${recentCutoff}))`
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

    const lastDateMap = new Map(latestArticles.map(a => [a.domainId, a.lastDate]));

    // 4. Process each domain
    for (const domain of activeDomains) {
        if (busyDomainIds.has(domain.id)) continue;

        const lastDate = lastDateMap.get(domain.id) || new Date(0);

        // Use current time as base if last article is more than 30 days old (or non-existent) to avoid immediate burst
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const baseDate = lastDate < thirtyDaysAgo ? new Date() : lastDate;

        // Determine schedule config (use defaults if missing)
        const config = domain.contentConfig?.schedule || {
            frequency: 'sporadic',
            timeOfDay: 'random',
            wordCountRange: [800, 1500]
        };

        // Calculate Target Post Date
        let gapDays = 0;
        switch (config.frequency) {
            case 'daily':
                gapDays = 0.8 + Math.random() * 0.4;
                break;
            case 'weekly':
                gapDays = 6 + Math.random() * 2;
                break;
            case 'sporadic':
            default:
                gapDays = 1 + Math.random() * 4;
                break;
        }

        const nextPostDate = new Date(baseDate.getTime() + gapDays * 24 * 60 * 60 * 1000);

        // Adjust Time of Day
        const hour = nextPostDate.getHours();
        let targetHour = hour;

        if (config.timeOfDay === 'morning') {
            targetHour = 7 + Math.floor(Math.random() * 3);
        } else if (config.timeOfDay === 'evening') {
            targetHour = 19 + Math.floor(Math.random() * 4);
        } else {
            const r = Math.random();
            if (r < 0.33) targetHour = 7 + Math.floor(Math.random() * 3);
            else if (r < 0.66) targetHour = 11 + Math.floor(Math.random() * 3);
            else targetHour = 19 + Math.floor(Math.random() * 4);
        }

        nextPostDate.setHours(targetHour, Math.floor(Math.random() * 60), 0, 0);

        // Queue the Job
        console.log(`[Scheduler] Scheduling content for ${domain.domain} at ${nextPostDate.toISOString()}`);

        await db.insert(contentQueue).values({
            id: randomUUID(),
            jobType: 'keyword_research', // Start of pipeline
            domainId: domain.id,
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
