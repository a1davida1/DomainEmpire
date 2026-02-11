import { db } from '@/lib/db';
import { citations } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function addCitation(opts: {
    articleId: string;
    claimText: string;
    sourceUrl: string;
    sourceTitle?: string;
    quotedSnippet?: string;
    notes?: string;
    createdById?: string;
}): Promise<string> {
    // Get next position
    const [latest] = await db.select({
        maxPos: sql<number>`coalesce(max(${citations.position}), 0)`,
    }).from(citations).where(eq(citations.articleId, opts.articleId));

    const [citation] = await db.insert(citations).values({
        articleId: opts.articleId,
        claimText: opts.claimText,
        sourceUrl: opts.sourceUrl,
        sourceTitle: opts.sourceTitle || null,
        retrievedAt: new Date(),
        quotedSnippet: opts.quotedSnippet || null,
        notes: opts.notes || null,
        position: (latest?.maxPos || 0) + 1,
        createdById: opts.createdById || null,
    }).returning({ id: citations.id });

    return citation.id;
}

export async function getCitations(articleId: string) {
    return db.select()
        .from(citations)
        .where(eq(citations.articleId, articleId))
        .orderBy(citations.position);
}

export async function updateCitation(citationId: string, updates: {
    claimText?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    quotedSnippet?: string;
    notes?: string;
}) {
    await db.update(citations).set(updates).where(eq(citations.id, citationId));
}

export async function removeCitation(citationId: string) {
    await db.delete(citations).where(eq(citations.id, citationId));
}

export async function getCitationCoverage(articleId: string): Promise<{ count: number; hasCitations: boolean }> {
    const [result] = await db.select({
        count: sql<number>`count(*)::int`,
    }).from(citations).where(eq(citations.articleId, articleId));

    const count = result?.count || 0;
    return { count, hasCitations: count > 0 };
}
