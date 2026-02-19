/**
 * Backfill pending content_publish review tasks for any articles currently in "review".
 *
 * Safe-by-default: runs in dry-run mode unless you pass --apply.
 *
 * Usage:
 *   npx -y tsx src/scripts/backfill-content-review-tasks.ts           # dry run
 *   npx -y tsx src/scripts/backfill-content-review-tasks.ts --apply   # create tasks
 *   npx -y tsx src/scripts/backfill-content-review-tasks.ts --apply --limit 200
 *   npx -y tsx src/scripts/backfill-content-review-tasks.ts --apply --domainId <uuid>
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { articles, reviewTasks } from '@/lib/db/schema';
import { ensureContentPublishTask } from '@/lib/review/content-review-tasks';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getArg(name: string): string | null {
    const idx = process.argv.indexOf(name);
    if (idx === -1) return null;
    const value = process.argv[idx + 1];
    return value && !value.startsWith('--') ? value : null;
}

function getIntArg(name: string, defaultValue: number): number {
    const raw = getArg(name);
    if (!raw) return defaultValue;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const limit = Math.max(1, Math.min(getIntArg('--limit', 500), 5000));
    const domainId = getArg('--domainId');

    if (domainId && !UUID_RE.test(domainId)) {
        throw new Error(`Invalid --domainId (expected UUID): ${domainId}`);
    }

    const where = [
        eq(articles.status, 'review'),
        isNull(articles.deletedAt),
        isNull(reviewTasks.id),
    ];
    if (domainId) {
        where.push(eq(articles.domainId, domainId));
    }

    const missing = await db
        .select({
            articleId: articles.id,
            domainId: articles.domainId,
            title: articles.title,
            reviewRequestedAt: articles.reviewRequestedAt,
        })
        .from(articles)
        .leftJoin(
            reviewTasks,
            and(
                eq(reviewTasks.articleId, articles.id),
                eq(reviewTasks.taskType, 'content_publish'),
                eq(reviewTasks.status, 'pending'),
            ),
        )
        .where(and(...where))
        .limit(limit);

    console.log(`[Backfill] Found ${missing.length} review article(s) missing a pending content_publish task (limit=${limit}, apply=${apply}).`);
    if (missing.length === 0) return;

    const sample = missing.slice(0, 10).map((m) => ({
        articleId: m.articleId,
        domainId: m.domainId,
        title: m.title,
        reviewRequestedAt: m.reviewRequestedAt ? new Date(m.reviewRequestedAt).toISOString() : null,
    }));
    console.log('[Backfill] Sample:', sample);

    if (!apply) {
        console.log('[Backfill] Dry run only. Re-run with --apply to create tasks.');
        return;
    }

    let created = 0;
    for (const row of missing) {
        await db.transaction(async (tx) => {
            await ensureContentPublishTask(tx, {
                articleId: row.articleId,
                domainId: row.domainId,
                createdBy: null,
            });
        });
        created++;
    }

    console.log(`[Backfill] Created/ensured tasks for ${created}/${missing.length} article(s).`);
}

void main().catch((err) => {
    console.error('[Backfill] Failed:', err);
    process.exitCode = 1;
});

