/**
 * Competitor Monitoring
 *
 * Tracks competitor domains and their search performance.
 * Uses AI to analyze competitor content strategies.
 */

import { db } from '@/lib/db';
import { competitors, competitorSnapshots, domains, keywords } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';

interface CompetitorAnalysis {
    estimatedTraffic: number;
    totalPages: number;
    avgContentLength: number;
    publishFrequency: string;
    topKeywords: Array<{ keyword: string; position: number; volume: number }>;
}

/**
 * Analyze a competitor domain using AI.
 * Uses Perplexity (online model) for real-time competitor data.
 */
async function analyzeCompetitor(competitorDomain: string, niche: string): Promise<CompetitorAnalysis | null> {
    try {
        const ai = getAIClient();

        const response = await ai.generateJSON<CompetitorAnalysis>(
            'research',
            `Analyze the website ${competitorDomain} as a competitor in the ${niche} niche.

Provide realistic estimates based on what you can determine:

Return JSON:
{
    "estimatedTraffic": <monthly organic traffic estimate>,
    "totalPages": <estimated indexed pages>,
    "avgContentLength": <average article word count>,
    "publishFrequency": "<e.g. '3 articles/week'>",
    "topKeywords": [
        { "keyword": "<keyword>", "position": <avg SERP position>, "volume": <monthly search volume> }
    ]
}

Include 5-10 top keywords. Be conservative with estimates.`
        );

        return response.data;
    } catch (error) {
        console.error(`Failed to analyze competitor ${competitorDomain}:`, error);
        return null;
    }
}

/**
 * Add a competitor to track for a domain.
 */
export async function addCompetitor(domainId: string, competitorDomain: string): Promise<string> {
    const domainRecord = await db.select({ niche: domains.niche })
        .from(domains).where(eq(domains.id, domainId)).limit(1);

    const niche = domainRecord[0]?.niche || 'general';

    const analysis = await analyzeCompetitor(competitorDomain, niche);

    const [record] = await db.insert(competitors).values({
        domainId,
        competitorDomain,
        estimatedTraffic: analysis?.estimatedTraffic ?? null,
        totalPages: analysis?.totalPages ?? null,
        avgContentLength: analysis?.avgContentLength ?? null,
        publishFrequency: analysis?.publishFrequency ?? null,
        topKeywords: analysis?.topKeywords ?? [],
        lastCheckedAt: new Date(),
    }).returning({ id: competitors.id });

    return record.id;
}

/**
 * Refresh competitor data.
 */
export async function refreshCompetitor(competitorId: string): Promise<void> {
    const record = await db.select()
        .from(competitors)
        .where(eq(competitors.id, competitorId))
        .limit(1);

    if (!record.length) return;

    const comp = record[0];
    const domainRecord = await db.select({ niche: domains.niche })
        .from(domains).where(eq(domains.id, comp.domainId)).limit(1);

    const niche = domainRecord[0]?.niche || 'general';
    const analysis = await analyzeCompetitor(comp.competitorDomain, niche);

    if (analysis) {
        // Snapshot current state before overwriting
        await db.insert(competitorSnapshots).values({
            competitorId,
            snapshotDate: new Date(),
            estimatedTraffic: comp.estimatedTraffic,
            domainAuthority: comp.domainAuthority,
            topKeywords: comp.topKeywords,
        });

        await db.update(competitors).set({
            estimatedTraffic: analysis.estimatedTraffic,
            totalPages: analysis.totalPages,
            avgContentLength: analysis.avgContentLength,
            publishFrequency: analysis.publishFrequency,
            topKeywords: analysis.topKeywords,
            lastCheckedAt: new Date(),
        }).where(eq(competitors.id, competitorId));
    }
}

/**
 * Get competitor history (snapshots over time).
 */
export async function getCompetitorHistory(competitorId: string, limit = 30) {
    return db.select()
        .from(competitorSnapshots)
        .where(eq(competitorSnapshots.competitorId, competitorId))
        .orderBy(desc(competitorSnapshots.snapshotDate))
        .limit(limit);
}

/**
 * Get all competitors for a domain.
 */
export async function getCompetitors(domainId: string) {
    return db.select()
        .from(competitors)
        .where(eq(competitors.domainId, domainId));
}

/**
 * Remove a competitor.
 */
export async function removeCompetitor(competitorId: string): Promise<boolean> {
    const result = await db.delete(competitors)
        .where(eq(competitors.id, competitorId))
        .returning({ id: competitors.id });
    return result.length > 0;
}

/**
 * Get keyword gaps — keywords competitors rank for that we don't target.
 * Compares competitor keywords against our tracked keywords for this domain.
 */
export async function findKeywordGaps(domainId: string): Promise<Array<{
    keyword: string;
    competitorDomain: string;
    position: number;
    volume: number;
}>> {
    const [comps, ourKeywords] = await Promise.all([
        getCompetitors(domainId),
        db.select({ keyword: keywords.keyword })
            .from(keywords)
            .where(eq(keywords.domainId, domainId)),
    ]);

    // Build a set of our keywords (lowercased for comparison)
    const ourKeywordSet = new Set(ourKeywords.map(k => k.keyword.toLowerCase()));

    const gaps: Array<{ keyword: string; competitorDomain: string; position: number; volume: number }> = [];

    for (const comp of comps) {
        const topKw = comp.topKeywords as Array<{ keyword: string; position: number; volume: number }>;
        for (const kw of topKw) {
            // Only include keywords we're NOT already targeting
            if (!ourKeywordSet.has(kw.keyword.toLowerCase())) {
                gaps.push({
                    keyword: kw.keyword,
                    competitorDomain: comp.competitorDomain,
                    position: kw.position,
                    volume: kw.volume,
                });
            }
        }
    }

    // Deduplicate by keyword (keep highest volume entry)
    const seen = new Map<string, typeof gaps[0]>();
    for (const gap of gaps) {
        const key = gap.keyword.toLowerCase();
        const existing = seen.get(key);
        if (!existing || gap.volume > existing.volume) {
            seen.set(key, gap);
        }
    }

    return Array.from(seen.values()).sort((a, b) => b.volume - a.volume);
}
