import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { contentRevisions } from '@/lib/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export type ChangeType = 'ai_generated' | 'ai_refined' | 'manual_edit' | 'status_change' | 'bulk_refresh';

export async function createRevision(opts: {
    articleId: string;
    title: string | null;
    contentMarkdown: string | null;
    metaDescription: string | null;
    changeType: ChangeType;
    changeSummary?: string;
    createdById?: string | null;
    tx?: any;
}): Promise<string> {
    const dbClient = opts.tx || db;
    // Get next revision number
    const [latest] = await dbClient.select({
        maxRev: sql<number>`coalesce(max(${contentRevisions.revisionNumber}), 0)`,
    }).from(contentRevisions).where(eq(contentRevisions.articleId, opts.articleId));

    const revisionNumber = (latest?.maxRev || 0) + 1;
    const content = opts.contentMarkdown || '';
    const contentHash = createHash('sha256').update(content).digest('hex');
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    const [revision] = await dbClient.insert(contentRevisions).values({
        articleId: opts.articleId,
        revisionNumber,
        title: opts.title,
        contentMarkdown: opts.contentMarkdown,
        metaDescription: opts.metaDescription,
        contentHash,
        wordCount,
        changeType: opts.changeType,
        changeSummary: opts.changeSummary || null,
        createdById: opts.createdById || null,
    }).returning({ id: contentRevisions.id });

    return revision.id;
}

export async function getRevisions(articleId: string) {
    return db.select({
        id: contentRevisions.id,
        revisionNumber: contentRevisions.revisionNumber,
        title: contentRevisions.title,
        contentHash: contentRevisions.contentHash,
        wordCount: contentRevisions.wordCount,
        changeType: contentRevisions.changeType,
        changeSummary: contentRevisions.changeSummary,
        createdById: contentRevisions.createdById,
        createdAt: contentRevisions.createdAt,
    }).from(contentRevisions)
        .where(eq(contentRevisions.articleId, articleId))
        .orderBy(desc(contentRevisions.revisionNumber));
}

export async function getRevisionById(revisionId: string) {
    const [revision] = await db.select()
        .from(contentRevisions)
        .where(eq(contentRevisions.id, revisionId))
        .limit(1);
    return revision || null;
}

export async function getLatestRevision(articleId: string) {
    const [revision] = await db.select()
        .from(contentRevisions)
        .where(eq(contentRevisions.articleId, articleId))
        .orderBy(desc(contentRevisions.revisionNumber))
        .limit(1);
    return revision || null;
}

export async function getRevisionPair(articleId: string, revisionNumber: number) {
    const revisions = await db.select()
        .from(contentRevisions)
        .where(
            and(
                eq(contentRevisions.articleId, articleId),
                sql`${contentRevisions.revisionNumber} IN (${revisionNumber}, ${revisionNumber - 1})`
            )
        )
        .orderBy(contentRevisions.revisionNumber);

    const older = revisions.find(r => r.revisionNumber === revisionNumber - 1) || null;
    const newer = revisions.find(r => r.revisionNumber === revisionNumber) || null;
    return { older, newer };
}

export function lcsDiff(a: string, b: string): { type: 'same' | 'add' | 'remove'; line: string }[] {
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const m = aLines.length;
    const n = bLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (aLines[i - 1] === bLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to produce diff
    const result: { type: 'same' | 'add' | 'remove'; line: string }[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
            result.push({ type: 'same', line: aLines[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.push({ type: 'add', line: bLines[j - 1] });
            j--;
        } else {
            result.push({ type: 'remove', line: aLines[i - 1] });
            i--;
        }
    }

    return result.reverse();
}
