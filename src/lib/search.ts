/**
 * Full-text search across domains, articles, keywords, and pages.
 * Uses pg_trgm for fuzzy trigram matching with ILIKE and similarity().
 */

import { db, domains, articles, keywords, pageDefinitions } from '@/lib/db';
import { sql, and, or, isNull, ilike, desc } from 'drizzle-orm';

export type SearchResultType = 'domain' | 'article' | 'keyword' | 'page';

export type SearchResult = {
    type: SearchResultType;
    id: string;
    title: string;
    subtitle: string | null;
    url: string;
    similarity: number;
};

const MAX_RESULTS_PER_TYPE = 10;
const MIN_SIMILARITY = 0.15;

function escapeLike(input: string): string {
    return input.replaceAll(/([\\%_])/g, '\\$1');
}

/**
 * Search across all entity types with a single query string.
 * Returns results sorted by similarity score (best match first).
 */
export async function globalSearch(query: string, options?: {
    types?: SearchResultType[];
    limit?: number;
}): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const types = options?.types ?? ['domain', 'article', 'keyword', 'page'];
    const limit = Math.min(options?.limit ?? 20, 50);
    const pattern = `%${escapeLike(trimmed)}%`;

    const results: SearchResult[] = [];

    // Search domains
    if (types.includes('domain')) {
        const domainRows = await db
            .select({
                id: domains.id,
                domain: domains.domain,
                niche: domains.niche,
                status: domains.status,
                similarity: sql<number>`greatest(
                    similarity(${domains.domain}, ${trimmed}),
                    similarity(coalesce(${domains.niche}, ''), ${trimmed}),
                    similarity(coalesce(${domains.notes}, ''), ${trimmed})
                )`.as('sim'),
            })
            .from(domains)
            .where(and(
                isNull(domains.deletedAt),
                or(
                    ilike(domains.domain, pattern),
                    ilike(domains.niche, pattern),
                    ilike(domains.notes, pattern),
                    sql`similarity(${domains.domain}, ${trimmed}) > ${MIN_SIMILARITY}`,
                ),
            ))
            .orderBy(desc(sql`sim`))
            .limit(MAX_RESULTS_PER_TYPE);

        for (const row of domainRows) {
            results.push({
                type: 'domain',
                id: row.id,
                title: row.domain,
                subtitle: [row.niche, row.status].filter(Boolean).join(' · ') || null,
                url: `/dashboard/domains/${row.id}`,
                similarity: row.similarity ?? 0,
            });
        }
    }

    // Search articles
    if (types.includes('article')) {
        const articleRows = await db
            .select({
                id: articles.id,
                title: articles.title,
                slug: articles.slug,
                domainId: articles.domainId,
                targetKeyword: articles.targetKeyword,
                status: articles.status,
                similarity: sql<number>`greatest(
                    similarity(${articles.title}, ${trimmed}),
                    similarity(coalesce(${articles.targetKeyword}, ''), ${trimmed}),
                    similarity(${articles.slug}, ${trimmed})
                )`.as('sim'),
            })
            .from(articles)
            .where(and(
                isNull(articles.deletedAt),
                or(
                    ilike(articles.title, pattern),
                    ilike(articles.targetKeyword, pattern),
                    ilike(articles.slug, pattern),
                    sql`similarity(${articles.title}, ${trimmed}) > ${MIN_SIMILARITY}`,
                ),
            ))
            .orderBy(desc(sql`sim`))
            .limit(MAX_RESULTS_PER_TYPE);

        for (const row of articleRows) {
            results.push({
                type: 'article',
                id: row.id,
                title: row.title,
                subtitle: [row.targetKeyword, row.status].filter(Boolean).join(' · ') || null,
                url: `/dashboard/content/articles/${row.id}`,
                similarity: row.similarity ?? 0,
            });
        }
    }

    // Search keywords
    if (types.includes('keyword')) {
        const keywordRows = await db
            .select({
                id: keywords.id,
                keyword: keywords.keyword,
                domainId: keywords.domainId,
                intent: keywords.intent,
                monthlyVolume: keywords.monthlyVolume,
                similarity: sql<number>`similarity(${keywords.keyword}, ${trimmed})`.as('sim'),
            })
            .from(keywords)
            .where(or(
                ilike(keywords.keyword, pattern),
                sql`similarity(${keywords.keyword}, ${trimmed}) > ${MIN_SIMILARITY}`,
            ))
            .orderBy(desc(sql`sim`))
            .limit(MAX_RESULTS_PER_TYPE);

        for (const row of keywordRows) {
            results.push({
                type: 'keyword',
                id: row.id,
                title: row.keyword,
                subtitle: [row.intent, row.monthlyVolume ? `${row.monthlyVolume} vol/mo` : null].filter(Boolean).join(' · ') || null,
                url: `/dashboard/keywords?q=${encodeURIComponent(row.keyword)}`,
                similarity: row.similarity ?? 0,
            });
        }
    }

    // Search pages
    if (types.includes('page')) {
        const pageRows = await db
            .select({
                id: pageDefinitions.id,
                title: pageDefinitions.title,
                route: pageDefinitions.route,
                domainId: pageDefinitions.domainId,
                status: pageDefinitions.status,
                similarity: sql<number>`similarity(coalesce(${pageDefinitions.title}, ''), ${trimmed})`.as('sim'),
            })
            .from(pageDefinitions)
            .where(or(
                ilike(pageDefinitions.title, pattern),
                ilike(pageDefinitions.route, pattern),
                sql`similarity(coalesce(${pageDefinitions.title}, ''), ${trimmed}) > ${MIN_SIMILARITY}`,
            ))
            .orderBy(desc(sql`sim`))
            .limit(MAX_RESULTS_PER_TYPE);

        for (const row of pageRows) {
            results.push({
                type: 'page',
                id: row.id,
                title: row.title || row.route,
                subtitle: [row.route, row.status].filter(Boolean).join(' · ') || null,
                url: `/dashboard/domains/${row.domainId}/pages`,
                similarity: row.similarity ?? 0,
            });
        }
    }

    // Sort all results by similarity, take top N
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
}
