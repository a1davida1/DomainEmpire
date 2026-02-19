/**
 * Domain Enrichment — targeted AI calls to upgrade preset sites.
 *
 * Instead of regenerating every block, this makes 3-5 focused AI calls
 * per domain to fix the pieces that matter most:
 *   1. Hero headlines (domain-specific, not generic)
 *   2. Calculator/CostBreakdown inputs (niche-appropriate labels and ranges)
 *   3. FAQ items (real questions people search for)
 *   4. Meta descriptions (page-level SEO)
 *   5. Citations (fallback system, no AI needed)
 *
 * Cost: ~$0.15-0.25 per domain vs $1.50 for full block regeneration.
 */

import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';
import { getOrCreateVoiceSeed } from '@/lib/ai/voice-seed';
import { extractSiteTitle } from './templates/shared';
import type { BlockEnvelope } from './blocks/schemas';

// Niche-specific fallback citations (no AI call needed)
const NICHE_CITATIONS: Record<string, Array<{ title: string; url: string; publisher: string; retrievedAt: string; usage: string }>> = {
    'home improvement': [
        { title: 'Consumer Expenditure Surveys', url: 'https://www.bls.gov/cex/', publisher: 'Bureau of Labor Statistics', retrievedAt: '2026-01', usage: 'Average household spending on home improvements' },
        { title: 'American Housing Survey', url: 'https://www.census.gov/programs-surveys/ahs.html', publisher: 'U.S. Census Bureau', retrievedAt: '2026-01', usage: 'Home renovation frequency and cost data' },
        { title: 'Remodeling Impact Report', url: 'https://www.nar.realtor/research-and-statistics/research-reports/remodeling-impact', publisher: 'National Association of Realtors', retrievedAt: '2026-01', usage: 'ROI of common home renovation projects' },
        { title: 'Cost vs. Value Report', url: 'https://www.remodeling.hw.net/cost-vs-value/2025/', publisher: 'Remodeling Magazine', retrievedAt: '2026-01', usage: 'Regional cost data for major remodeling projects' },
    ],
    'personal finance': [
        { title: 'Consumer Credit Outstanding', url: 'https://www.federalreserve.gov/releases/g19/current/', publisher: 'Federal Reserve', retrievedAt: '2026-01', usage: 'Total consumer credit and revolving debt data' },
        { title: 'Quarterly Report on Household Debt', url: 'https://www.newyorkfed.org/microeconomics/hhdc', publisher: 'Federal Reserve Bank of New York', retrievedAt: '2026-01', usage: 'Credit card balances and delinquency rates' },
        { title: 'Consumer Expenditure Surveys', url: 'https://www.bls.gov/cex/', publisher: 'Bureau of Labor Statistics', retrievedAt: '2026-01', usage: 'Average household spending patterns' },
    ],
    'dental': [
        { title: 'Oral Health Surveillance Report', url: 'https://www.cdc.gov/oral-health/data-research/', publisher: 'CDC', retrievedAt: '2026-01', usage: 'National oral health statistics' },
        { title: 'Dental Expenditure Data', url: 'https://meps.ahrq.gov/mepsweb/data_stats/quick_tables.jsp', publisher: 'AHRQ', retrievedAt: '2026-01', usage: 'Average dental care costs' },
        { title: 'Consumer Guide to Dentistry', url: 'https://www.ada.org/resources/research/science-and-research-institute', publisher: 'American Dental Association', retrievedAt: '2026-01', usage: 'Evidence-based dental treatment guidelines' },
    ],
    'real estate': [
        { title: 'Housing Market Data', url: 'https://www.nar.realtor/research-and-statistics', publisher: 'National Association of Realtors', retrievedAt: '2026-01', usage: 'Housing market trends and median home prices' },
        { title: 'House Price Index', url: 'https://www.fhfa.gov/data/hpi', publisher: 'FHFA', retrievedAt: '2026-01', usage: 'Home price appreciation trends by region' },
        { title: 'Housing Vacancies and Homeownership', url: 'https://www.census.gov/housing/hvs', publisher: 'U.S. Census Bureau', retrievedAt: '2026-01', usage: 'Homeownership rates' },
    ],
    'insurance': [
        { title: 'Insurance Industry Data', url: 'https://content.naic.org/research-industry-data', publisher: 'NAIC', retrievedAt: '2026-01', usage: 'Insurance market statistics' },
        { title: 'Consumer Insurance Information', url: 'https://www.consumerfinance.gov/consumer-tools/insurance/', publisher: 'CFPB', retrievedAt: '2026-01', usage: 'Consumer insurance guidance' },
    ],
};

export function getCitations(niche: string): Array<{ title: string; url: string; publisher: string; retrievedAt: string; usage: string }> {
    const lower = niche.toLowerCase();
    for (const [key, sources] of Object.entries(NICHE_CITATIONS)) {
        if (lower.includes(key) || key.includes(lower)) return sources;
    }
    return [
        { title: 'Consumer Information', url: 'https://www.usa.gov/consumer', publisher: 'USA.gov', retrievedAt: '2026-01', usage: 'Federal consumer information' },
        { title: 'Consumer Price Index', url: 'https://www.bls.gov/cpi/', publisher: 'Bureau of Labor Statistics', retrievedAt: '2026-01', usage: 'Price trends and inflation data' },
    ];
}

export interface EnrichResult {
    domain: string;
    heroesFixed: number;
    calculatorsFixed: number;
    faqsFixed: number;
    citationsFixed: number;
    metaFixed: number;
    totalAiCalls: number;
    totalCost: number;
    errors: string[];
}

async function aiCall(prompt: string): Promise<{ content: string; cost: number } | null> {
    try {
        const ai = getAIClient();
        const resp = await ai.generate('blockContent', prompt);
        return { content: resp.content, cost: resp.cost };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[enrichDomain] AI call failed:', message);
        return null;
    }
}

function parseJson(raw: string): Record<string, unknown> | null {
    let text = raw.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const firstBrace = text.indexOf('{');
    if (firstBrace > 0 && firstBrace < 100) text = text.slice(firstBrace);
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export interface EnrichOptions {
    /** Limit enrichment to specific routes (e.g. ["/", "/calculator"]). */
    routes?: string[];
    /** Regenerate Hero even if already present. */
    forceHeroes?: boolean;
    /** Regenerate FAQ even if already present. */
    forceFaqs?: boolean;
    /** Regenerate meta descriptions even if already present. */
    forceMeta?: boolean;
}

export async function enrichDomain(domainId: string, options: EnrichOptions = {}): Promise<EnrichResult> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) throw new Error('Domain not found');

    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));
    const niche = domain.subNiche || domain.niche || 'general';
    const siteName = extractSiteTitle(domain.domain);
    const voiceSeed = await getOrCreateVoiceSeed(domain.id, domain.domain, niche);

    const result: EnrichResult = {
        domain: domain.domain, heroesFixed: 0, calculatorsFixed: 0,
        faqsFixed: 0, citationsFixed: 0, metaFixed: 0,
        totalAiCalls: 0, totalCost: 0, errors: [],
    };

    const skipRoutes = new Set(['/privacy-policy', '/privacy', '/terms', '/disclosure', '/medical-disclaimer', '/legal-disclaimer']);
    const routeAllow = options.routes && options.routes.length > 0 ? new Set(options.routes) : null;

    for (const page of pages) {
        if (skipRoutes.has(page.route)) continue;
        if (routeAllow && !routeAllow.has(page.route)) continue;
        const blocks = (page.blocks || []) as BlockEnvelope[];
        let changed = false;
        const updated = [...blocks];

        for (let i = 0; i < updated.length; i++) {
            const block = updated[i];

            // 1. Hero headlines — make them domain-specific
            if (block.type === 'Hero') {
                const content = (block.content || {}) as Record<string, unknown>;
                const heading = content.heading as string || '';
                const isGeneric = heading.startsWith('Your Trusted ') || heading.endsWith(' Resource');
                if (options.forceHeroes || !heading || heading.includes('Home Services') || heading.length < 10 || isGeneric) {
                    const pageContext = page.title || page.route.replace(/\//g, ' ').trim();
                    const resp = await aiCall(`Generate a hero headline for a ${niche} website.

Site:
- Domain: ${domain.domain}
- Site name: ${siteName}
- Page context: ${pageContext}
- Voice seed (for style/voice, not for factual claims): ${JSON.stringify(voiceSeed)}

Return ONLY a JSON object:
{ "heading": "Compelling H1 (50-70 chars)", "subheading": "Value proposition (80-120 chars)", "badge": "Updated 2026" }`);
                    result.totalAiCalls++;
                    if (resp) {
                        result.totalCost += resp.cost;
                        const parsed = parseJson(resp.content);
                        if (parsed?.heading) {
                            updated[i] = { ...block, content: { ...content, ...parsed } };
                            result.heroesFixed++;
                            changed = true;
                        } else {
                            result.errors.push(`[hero:${page.route}] Failed to parse JSON`);
                        }
                    } else {
                        result.errors.push(`[hero:${page.route}] AI call failed`);
                    }
                }
            }

            // 2. Calculator inputs — niche-specific labels and ranges
            if (block.type === 'QuoteCalculator' || block.type === 'CostBreakdown') {
                const content = (block.content || {}) as Record<string, unknown>;
                const inputs = content.inputs as unknown[];
                const ranges = content.ranges as unknown[];
                const needsFix = (block.type === 'QuoteCalculator' && (!inputs || inputs.length === 0))
                    || (block.type === 'CostBreakdown' && (!ranges || ranges.length === 0));

                if (needsFix) {
                    const schema = block.type === 'QuoteCalculator'
                        ? '{ "inputs": [{ "id": "field_id", "label": "Label", "type": "number", "default": 1000, "min": 0, "max": 100000, "step": 100 }], "outputs": [{ "id": "result", "label": "Estimated Cost", "format": "currency" }], "formula": "{ result: field_id * 1.5 }", "methodology": "How this works" }'
                        : '{ "ranges": [{ "label": "Category", "low": 500, "high": 5000, "average": 2000 }], "factors": [{ "name": "Factor", "impact": "high", "description": "Why it matters" }] }';

                    const resp = await aiCall(`Generate ${block.type === 'QuoteCalculator' ? 'calculator inputs and formula' : 'cost breakdown ranges'} for "${niche}" on ${domain.domain}.
Use realistic values for this specific niche. Return ONLY valid JSON: ${schema}`);
                    result.totalAiCalls++;
                    if (resp) {
                        result.totalCost += resp.cost;
                        const parsed = parseJson(resp.content);
                        if (parsed) {
                            updated[i] = { ...block, content: { ...content, ...parsed } };
                            result.calculatorsFixed++;
                            changed = true;
                        }
                    }
                }
            }

            // 3. FAQ items — domain-specific questions
            if (block.type === 'FAQ') {
                const content = (block.content || {}) as Record<string, unknown>;
                const items = content.items as unknown[];
                if (options.forceFaqs || !items || items.length === 0) {
                    const resp = await aiCall(`Generate 5-7 FAQ items for a ${niche} page on ${domain.domain}.

Site name: ${siteName}
Page context: ${page.title || page.route}
Voice seed: ${JSON.stringify(voiceSeed)}

Questions should be what real people search for. Answers: 2-3 sentences, factual.
Return ONLY valid JSON: { "items": [{ "question": "...", "answer": "..." }] }`);
                    result.totalAiCalls++;
                    if (resp) {
                        result.totalCost += resp.cost;
                        const parsed = parseJson(resp.content);
                        if (parsed?.items) {
                            updated[i] = { ...block, content: { ...content, ...parsed } };
                            result.faqsFixed++;
                            changed = true;
                        } else {
                            result.errors.push(`[faq:${page.route}] Failed to parse JSON`);
                        }
                    } else {
                        result.errors.push(`[faq:${page.route}] AI call failed`);
                    }
                }
            }

            // 4. Thin ArticleBody — expand if under 300 words
            if (block.type === 'ArticleBody') {
                const content = (block.content || {}) as Record<string, unknown>;
                const md = (content.markdown as string) || '';
                const wordCount = md.split(/\s+/).filter(Boolean).length;
                if (wordCount < 300 && wordCount > 20) {
                    const pageContext = page.title || niche;
                    const resp = await aiCall(`Expand this article about "${pageContext}" to at least 500 words. Keep the existing content and add more depth, examples, and actionable advice. Write naturally with personality.

EXISTING CONTENT:
${md}

Return ONLY a JSON object: { "markdown": "Full expanded article in markdown" }`);
                    result.totalAiCalls++;
                    if (resp) {
                        result.totalCost += resp.cost;
                        const parsed = parseJson(resp.content);
                        if (parsed?.markdown && (parsed.markdown as string).length > md.length) {
                            updated[i] = { ...block, content: { ...content, markdown: parsed.markdown } };
                            changed = true;
                        }
                    }
                }
            }

            // 5. Citations — use fallback system, zero AI calls
            if (block.type === 'CitationBlock') {
                const content = (block.content || {}) as Record<string, unknown>;
                const sources = content.sources as unknown[];
                if (!sources || sources.length === 0) {
                    updated[i] = { ...block, content: { sources: getCitations(niche) } };
                    result.citationsFixed++;
                    changed = true;
                }
            }
        }

        // 5. Meta description — if empty, generate one
        if (options.forceMeta || !page.metaDescription || page.metaDescription.includes('Expert guides about')) {
            const resp = await aiCall(`Write a specific ~150-character SEO meta description.

Site:
- Domain: ${domain.domain}
- Site name: ${siteName}
- Niche: ${niche}
- Page title: ${page.title || page.route}

Avoid generic filler like "Expert guides about...". Make it feel uniquely relevant.

Return ONLY JSON: { "metaDescription": "..." }`);
            result.totalAiCalls++;
            if (resp) {
                result.totalCost += resp.cost;
                const parsed = parseJson(resp.content);
                if (parsed?.metaDescription) {
                    await db.update(pageDefinitions).set({
                        metaDescription: parsed.metaDescription as string,
                        updatedAt: new Date(),
                    }).where(eq(pageDefinitions.id, page.id));
                    result.metaFixed++;
                } else {
                    result.errors.push(`[meta:${page.route}] Failed to parse JSON`);
                }
            } else {
                result.errors.push(`[meta:${page.route}] AI call failed`);
            }
        }

        if (changed) {
            await db.update(pageDefinitions).set({
                blocks: updated as typeof page.blocks,
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, page.id));
        }
    }

    return result;
}
