import { db, domainKnowledge } from '@/lib/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

type KnowledgeCategory = 'statistic' | 'fact' | 'quote' | 'development' | 'source';

interface ResearchData {
    statistics?: Array<{ stat: string; source: string; date?: string }>;
    quotes?: Array<{ quote: string; author: string; source?: string }>;
    competitorHooks?: string[];
    recentDevelopments?: string[];
}

function contentHash(text: string): string {
    return createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * Extract discrete knowledge entries from article research data
 * and upsert them into the domain_knowledge table.
 */
export async function extractKnowledgeFromResearch(
    domainId: string,
    articleId: string,
    researchData: unknown,
): Promise<number> {
    const data = researchData as ResearchData | null;
    if (!data) return 0;

    const entries: Array<{
        category: KnowledgeCategory;
        content: string;
        sourceUrl?: string;
        sourceTitle?: string;
        confidence: number;
    }> = [];

    // Extract statistics
    if (Array.isArray(data.statistics)) {
        for (const stat of data.statistics) {
            if (typeof stat.stat === 'string' && stat.stat.trim()) {
                entries.push({
                    category: 'statistic',
                    content: stat.stat.trim(),
                    sourceTitle: stat.source,
                    confidence: 0.8,
                });
            }
        }
    }

    // Extract quotes
    if (Array.isArray(data.quotes)) {
        for (const q of data.quotes) {
            if (typeof q.quote === 'string' && q.quote.trim()) {
                entries.push({
                    category: 'quote',
                    content: `"${q.quote.trim()}" - ${q.author || 'Unknown'}`,
                    sourceTitle: q.source,
                    confidence: 0.75,
                });
            }
        }
    }

    // Extract recent developments
    if (Array.isArray(data.recentDevelopments)) {
        for (const dev of data.recentDevelopments) {
            if (typeof dev === 'string' && dev.trim()) {
                entries.push({
                    category: 'development',
                    content: dev.trim(),
                    confidence: 0.7,
                });
            }
        }
    }

    // Extract competitor hooks as facts
    if (Array.isArray(data.competitorHooks)) {
        for (const hook of data.competitorHooks) {
            if (typeof hook === 'string' && hook.trim()) {
                entries.push({
                    category: 'fact',
                    content: hook.trim(),
                    confidence: 0.6,
                });
            }
        }
    }

    let upserted = 0;
    for (const entry of entries) {
        const hash = contentHash(entry.content);
        try {
            await db
                .insert(domainKnowledge)
                .values({
                    domainId,
                    category: entry.category,
                    content: entry.content,
                    contentHash: hash,
                    sourceUrl: entry.sourceUrl,
                    sourceTitle: entry.sourceTitle,
                    confidence: entry.confidence,
                    firstSeenArticleId: articleId,
                })
                .onConflictDoUpdate({
                    target: [domainKnowledge.domainId, domainKnowledge.contentHash],
                    set: {
                        useCount: sql`${domainKnowledge.useCount} + 1`,
                        lastUsedAt: new Date(),
                        updatedAt: new Date(),
                        // Increase confidence slightly each time the same fact is seen
                        confidence: sql`LEAST(1.0, ${domainKnowledge.confidence}::numeric + 0.05)`,
                    },
                });
            upserted++;
        } catch (err) {
            console.warn(`[DomainKnowledge] Failed to upsert knowledge entry for domain ${domainId}:`, err);
        }
    }

    return upserted;
}

interface GetKnowledgeOptions {
    category?: KnowledgeCategory;
    limit?: number;
    minConfidence?: number;
}

/**
 * Retrieve accumulated domain knowledge, ranked by confidence and recency.
 */
export async function getDomainKnowledge(
    domainId: string,
    options: GetKnowledgeOptions = {},
): Promise<Array<{ category: string; content: string; confidence: number; useCount: number }>> {
    const limit = options.limit ?? 30;
    const minConfidence = options.minConfidence ?? 0.5;

    const conditions = [
        eq(domainKnowledge.domainId, domainId),
        sql`${domainKnowledge.confidence}::numeric >= ${minConfidence}`,
    ];

    if (options.category) {
        conditions.push(eq(domainKnowledge.category, options.category));
    }

    const rows = await db
        .select({
            category: domainKnowledge.category,
            content: domainKnowledge.content,
            confidence: domainKnowledge.confidence,
            useCount: domainKnowledge.useCount,
        })
        .from(domainKnowledge)
        .where(and(...conditions))
        .orderBy(desc(domainKnowledge.confidence), desc(domainKnowledge.lastUsedAt))
        .limit(limit);

    return rows;
}

/**
 * Format domain knowledge into a prompt section for article generation.
 */
export function formatKnowledgeForPrompt(
    knowledge: Array<{ category: string; content: string; confidence: number }>,
): string {
    if (knowledge.length === 0) return '';

    const grouped = new Map<string, string[]>();
    for (const k of knowledge) {
        const list = grouped.get(k.category) ?? [];
        list.push(k.content);
        grouped.set(k.category, list);
    }

    const sections: string[] = [];

    const categoryLabels: Record<string, string> = {
        statistic: 'Verified Statistics',
        fact: 'Known Facts',
        quote: 'Expert Quotes',
        development: 'Recent Developments',
        source: 'Authoritative Sources',
    };

    for (const [category, items] of grouped) {
        const label = categoryLabels[category] || category;
        sections.push(`${label}:\n${items.map((item) => `- ${item}`).join('\n')}`);
    }

    return `\nDOMAIN KNOWLEDGE BASE (verified facts from previous research on this domain):\n${sections.join('\n\n')}\n\nUse these verified data points in the article where relevant. Do NOT contradict these facts.\n`;
}
