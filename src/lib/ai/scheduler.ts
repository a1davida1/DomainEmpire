
import { db, domains, contentQueue, articles } from '@/lib/db';
import { eq, desc, and, or, isNull, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

/**
 * Check for domains that need new content and schedule jobs based on "human-like" patterns.
 */
export async function checkContentSchedule() {
    console.log('[Scheduler] Checking content schedules...');

    // 1. Get all active domains
    const activeDomains = await db.select().from(domains).where(eq(domains.status, 'active'));

    for (const domain of activeDomains) {
        // 2. Check if there are any pending/processing jobs for this domain
        // If so, we don't need to schedule another one yet.
        const pendingJobs = await db
            .select({ id: contentQueue.id })
            .from(contentQueue)
            .where(
                and(
                    eq(contentQueue.domainId, domain.id),
                    inArray(contentQueue.status, ['pending', 'processing'])
                )
            )
            .limit(1);

        if (pendingJobs.length > 0) {
            continue; // Already working on something
        }

        // 3. Get last article to calculate gap
        const lastArticle = await db
            .select()
            .from(articles)
            .where(eq(articles.domainId, domain.id))
            .orderBy(desc(articles.createdAt))
            .limit(1);

        const lastDate = lastArticle[0]?.createdAt || new Date(0); // Epoch if no articles

        // 4. Determine schedule config (use defaults if missing)
        const config = domain.contentConfig?.schedule || {
            frequency: 'sporadic',
            timeOfDay: 'random',
            wordCountRange: [800, 1500]
        };

        // 5. Calculate Target Post Date
        let gapDays = 0;
        switch (config.frequency) {
            case 'daily':
                gapDays = 0.8 + Math.random() * 0.4; // 0.8 - 1.2 days
                break;
            case 'weekly':
                gapDays = 6 + Math.random() * 2; // 6 - 8 days
                break;
            case 'sporadic':
            default:
                // Anti-AI pattern: 2, 4, 1, 5 days gaps
                gapDays = 1 + Math.random() * 4; // 1 - 5 days
                break;
        }

        const nextPostDate = new Date(lastDate.getTime() + gapDays * 24 * 60 * 60 * 1000);

        // 6. Adjust Time of Day (Human patterns)
        const hour = nextPostDate.getHours();
        let targetHour = hour;

        if (config.timeOfDay === 'morning') {
            // 7am - 9am
            targetHour = 7 + Math.floor(Math.random() * 3);
        } else if (config.timeOfDay === 'evening') {
            // 7pm - 10pm (19 - 22)
            targetHour = 19 + Math.floor(Math.random() * 4);
        } else {
            // Random human clusters: 7-9am, 11-1pm, 7-10pm
            const r = Math.random();
            if (r < 0.33) targetHour = 7 + Math.floor(Math.random() * 3);
            else if (r < 0.66) targetHour = 11 + Math.floor(Math.random() * 3);
            else targetHour = 19 + Math.floor(Math.random() * 4);
        }

        nextPostDate.setHours(targetHour, Math.floor(Math.random() * 60), 0, 0);

        // If calculated date is in the past, schedule it for "now" (plus small random delay)
        // or just keep it as is (Worker picks up passed dates)
        // But if it's WAY in the past (e.g. initial setup), spread them out?
        // For simplicity, just let the worker pick it up immediately if past.

        // 7. Queue the Job
        console.log(`[Scheduler] Scheduling content for ${domain.domain} at ${nextPostDate.toISOString()}`);

        await db.insert(contentQueue).values({
            id: randomUUID(),
            jobType: 'keyword_research', // Start of pipeline
            domainId: domain.id,
            payload: {
                domain: domain.domain,
                niche: domain.niche,
                targetCount: 1 // Just one article at a time
            },
            status: 'pending',
            priority: 2,
            scheduledFor: nextPostDate, // Delay execution until this time
        });
    }
}
