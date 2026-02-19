/**
 * Domain Enrichment — targeted AI calls to upgrade preset sites.
 *
 * Instead of regenerating every block, this makes focused AI calls
 * per domain to fix the pieces that matter most:
 *   1. Hero headlines (domain-specific, not generic)
 *   2. Calculator/CostBreakdown inputs (niche-appropriate labels and ranges)
 *   3. FAQ items (real questions people search for)
 *   4. Meta descriptions (page-level SEO)
 *   5. Citations (fallback system, no AI needed)
 *
 * All AI calls within a page are collected first and executed in parallel.
 * Pages are also processed in parallel (up to PARALLEL_PAGES at a time).
 */

import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';
import { getOrCreateVoiceSeed } from '@/lib/ai/voice-seed';
import { extractSiteTitle } from './templates/shared';
import type { BlockEnvelope } from './blocks/schemas';

const PARALLEL_PAGES = 4;
const PARALLEL_AI_CALLS_PER_PAGE = 5;

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
    articlesExpanded: number;
    comparisonsFixed: number;
    rankingsFixed: number;
    prosconsFixed: number;
    vscardsFixed: number;
    citationsFixed: number;
    metaFixed: number;
    totalAiCalls: number;
    totalCost: number;
    errors: string[];
}

// ── Generic content detection ────────────────────────────────────────────────

const GENERIC_COST_MARKERS = [
    'Basic Package', 'Standard Package', 'Premium Package',
    'Market Research Institute', 'Independent Research Group',
];
const GENERIC_RANGE_FINGERPRINT = new Set([500, 1200, 1500, 2000, 3000, 5000, 6000, 12000]);

const GENERIC_CALC_INPUT_LABELS = [
    'Size / Quantity', 'Size/Quantity', 'Quality Level', 'Location Type',
    'Service Type', 'Project Size', 'Basic', 'Standard', 'Premium',
];

function isGenericCostData(content: Record<string, unknown>): boolean {
    const str = JSON.stringify(content);
    if (GENERIC_COST_MARKERS.some(m => str.includes(m))) return true;
    if (GENERIC_CALC_INPUT_LABELS.some(m => str.includes(m))) return true;

    const ranges = content.ranges as Array<{ low?: number; high?: number; average?: number }> | undefined;
    if (Array.isArray(ranges) && ranges.length > 0) {
        const allNums = ranges.flatMap(r => [r.low, r.high, r.average].filter((n): n is number => typeof n === 'number'));
        const genericCount = allNums.filter(n => GENERIC_RANGE_FINGERPRINT.has(n)).length;
        if (genericCount >= 3) return true;
    }
    return false;
}

const SEVERE_GENERIC_FAQ_PHRASES = [
    'every situation is unique', 'individualized basis',
    'contact us for a personalized', 'get in touch with our team',
    'reach out to our team',
];

const GENERIC_FAQ_PHRASES = [
    'first-time buyer', 'experienced professional', 'verified customers',
    'right choice for you', 'best option for your needs', 'varies depending on',
    'depends on several factors',
    'costs vary widely', 'use our cost calculator', 'for a personalized estimate',
    'based on your requirements', 'specific needs, location',
    'consult with a professional',
    'varies based on', 'numerous factors',
];

const GENERIC_FAQ_MATCH_THRESHOLD = 3;

function isGenericFaqContent(items: unknown[] | undefined): boolean {
    if (!Array.isArray(items) || items.length === 0) return false;
    const text = JSON.stringify(items).toLowerCase();
    if (SEVERE_GENERIC_FAQ_PHRASES.some(p => text.includes(p.toLowerCase()))) return true;
    const genericHits = GENERIC_FAQ_PHRASES.filter(p => text.includes(p.toLowerCase()));
    return genericHits.length >= GENERIC_FAQ_MATCH_THRESHOLD;
}

// ── AI call helpers ──────────────────────────────────────────────────────────

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

async function runParallel<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
    const results: T[] = [];
    let idx = 0;

    async function worker() {
        while (idx < tasks.length) {
            const taskIdx = idx++;
            results[taskIdx] = await tasks[taskIdx]();
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

// ── Enrichment job types ─────────────────────────────────────────────────────

type EnrichJob =
    | { type: 'hero'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'calculator'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'faq'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'article'; pageId: string; blockIdx: number; prompt: string; originalLength: number }
    | { type: 'comparison'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'ranking'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'proscons'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'vscard'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'meta'; pageId: string; prompt: string };

interface EnrichJobResult {
    job: EnrichJob;
    response: { content: string; cost: number } | null;
}

// ── Main enrichment function ─────────────────────────────────────────────────

export interface EnrichOptions {
    routes?: string[];
    forceHeroes?: boolean;
    forceFaqs?: boolean;
    forceMeta?: boolean;
    forceArticleBodies?: boolean;
    minArticleBodyWords?: number;
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
        faqsFixed: 0, articlesExpanded: 0, comparisonsFixed: 0,
        rankingsFixed: 0, prosconsFixed: 0, vscardsFixed: 0,
        citationsFixed: 0, metaFixed: 0,
        totalAiCalls: 0, totalCost: 0, errors: [],
    };

    const skipRoutes = new Set(['/privacy-policy', '/privacy', '/terms', '/disclosure', '/medical-disclaimer', '/legal-disclaimer']);
    const routeAllow = options.routes && options.routes.length > 0 ? new Set(options.routes) : null;
    const eligiblePages = pages.filter(p => !skipRoutes.has(p.route) && (!routeAllow || routeAllow.has(p.route)));

    // Phase 1: Collect all enrichment work needed (no AI calls yet)
    type PageWork = {
        page: typeof pages[number];
        blocks: BlockEnvelope[];
        jobs: EnrichJob[];
        syncChanges: Array<{ blockIdx: number; content: Record<string, unknown> }>;
    };

    const pageWorkList: PageWork[] = [];

    for (const page of eligiblePages) {
        const blocks = (page.blocks || []) as BlockEnvelope[];
        const jobs: EnrichJob[] = [];
        const syncChanges: Array<{ blockIdx: number; content: Record<string, unknown> }> = [];

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const content = (block.content || {}) as Record<string, unknown>;

            // Hero headlines
            if (block.type === 'Hero') {
                const heading = content.heading as string || '';
                const isGeneric = heading.startsWith('Your Trusted ')
                    || heading.endsWith(' Resource')
                    || heading.includes('first-time buyer')
                    || heading.includes('experienced professional')
                    || heading.includes('Whether you')
                    || heading.includes('right choice')
                    || heading.includes('Expert Guides');
                if (options.forceHeroes || !heading || heading.includes('Home Services') || heading.length < 10 || isGeneric) {
                    const pageContext = page.title || page.route.replace(/\//g, ' ').trim();
                    jobs.push({
                        type: 'hero', pageId: page.id, blockIdx: i,
                        prompt: `Generate a hero headline for a ${niche} website.

Site:
- Domain: ${domain.domain}
- Site name: ${siteName}
- Page context: ${pageContext}
- Voice seed (for style/voice, not for factual claims): ${JSON.stringify(voiceSeed)}

Return ONLY a JSON object:
{ "heading": "Compelling H1 (50-70 chars)", "subheading": "Value proposition (80-120 chars)", "badge": "Updated 2026" }`,
                    });
                }
            }

            // Calculator / CostBreakdown
            if (block.type === 'QuoteCalculator' || block.type === 'CostBreakdown') {
                const inputs = content.inputs as unknown[];
                const ranges = content.ranges as unknown[];
                const isEmpty = (block.type === 'QuoteCalculator' && (!inputs || inputs.length === 0))
                    || (block.type === 'CostBreakdown' && (!ranges || ranges.length === 0));
                const hasGenericPlaceholders = isGenericCostData(content);

                if (isEmpty || hasGenericPlaceholders) {
                    const schema = block.type === 'QuoteCalculator'
                        ? '{ "inputs": [{ "id": "field_id", "label": "Label", "type": "number", "default": 1000, "min": 0, "max": 100000, "step": 100 }], "outputs": [{ "id": "result", "label": "Estimated Cost", "format": "currency" }], "formula": "{ result: field_id * 1.5 }", "methodology": "How this works" }'
                        : '{ "ranges": [{ "label": "Category", "low": 500, "high": 5000, "average": 2000 }], "factors": [{ "name": "Factor", "impact": "high", "description": "Why it matters" }] }';
                    jobs.push({
                        type: 'calculator', pageId: page.id, blockIdx: i,
                        prompt: `Generate ${block.type === 'QuoteCalculator' ? 'calculator inputs and formula' : 'cost breakdown ranges'} for "${niche}" on ${domain.domain}.

IMPORTANT: Use REAL, RESEARCHED cost data specific to "${niche}". Do NOT use generic placeholder numbers.
For cost ranges, research actual market rates for this specific industry/service.
For calculator inputs, use fields that real consumers would care about in this niche.

Return ONLY valid JSON: ${schema}`,
                    });
                }
            }

            // FAQ
            if (block.type === 'FAQ') {
                const items = content.items as unknown[];
                const hasGenericFaq = isGenericFaqContent(items);
                if (options.forceFaqs || !items || items.length === 0 || hasGenericFaq) {
                    jobs.push({
                        type: 'faq', pageId: page.id, blockIdx: i,
                        prompt: `Generate 5-7 FAQ items for a ${niche} page on ${domain.domain}.

Site name: ${siteName}
Page context: ${page.title || page.route}
Voice seed: ${JSON.stringify(voiceSeed)}

RULES:
- Questions should be what real people actually Google about ${niche}
- Answers MUST include specific numbers, price ranges, or concrete facts — NEVER say "costs vary widely" or "depends on your needs" without giving a range
- If a question is about cost, give a real dollar range (e.g. "$3,000-$7,000 for traditional braces")
- Keep answers 2-3 sentences, factual, and genuinely useful to a reader
- Do NOT use hedge language like "consult a professional" or "use our calculator" — give the actual answer

Return ONLY valid JSON: { "items": [{ "question": "...", "answer": "..." }] }`,
                    });
                }
            }

            // Thin ArticleBody
            if (block.type === 'ArticleBody') {
                const md = (content.markdown as string) || '';
                const wordCount = md.split(/\s+/).filter(Boolean).length;
                const minWords = (typeof options.minArticleBodyWords === 'number' && Number.isFinite(options.minArticleBodyWords))
                    ? Math.max(300, Math.floor(options.minArticleBodyWords))
                    : 300;
                const targetWords = Math.max(500, minWords);
                if ((options.forceArticleBodies || wordCount < minWords) && wordCount > 20) {
                    const pageContext = page.title || niche;
                    jobs.push({
                        type: 'article', pageId: page.id, blockIdx: i, originalLength: md.length,
                        prompt: `Expand this article about "${pageContext}" to at least ${targetWords} words. Keep the existing content and add more depth, examples, and actionable advice. Write naturally with personality.

EXISTING CONTENT:
${md}

Return ONLY a JSON object: { "markdown": "Full expanded article in markdown" }`,
                    });
                }
            }

            // ComparisonTable — needs real product/service names and data
            if (block.type === 'ComparisonTable') {
                const options = content.options as unknown[];
                const isGeneric = !options || options.length === 0
                    || JSON.stringify(options).includes('Premium Choice')
                    || JSON.stringify(options).includes('Best Value')
                    || JSON.stringify(options).includes('Budget Option');
                if (isGeneric) {
                    jobs.push({
                        type: 'comparison', pageId: page.id, blockIdx: i,
                        prompt: `Generate a comparison table for "${niche}" on ${domain.domain}.

List 3-5 REAL, NAMED options that consumers actually choose between in the ${niche} industry.
Use real product/service/provider names — NOT generic labels like "Premium Choice" or "Option A".
Include realistic pricing, genuine pros/cons differences, and honest ratings.

For braces: "Traditional Metal Braces", "Ceramic Braces", "Invisalign Clear Aligners", "Lingual Braces"
For home renovation: "DIY Approach", "Budget Contractor", "Mid-Range Firm", "Premium Design-Build"

Return ONLY valid JSON:
{
  "columns": [{ "key": "quality", "label": "Quality", "type": "rating", "sortable": true }, { "key": "value", "label": "Value", "type": "rating", "sortable": true }, { "key": "price", "label": "Price Range", "type": "text", "sortable": true }],
  "options": [{ "name": "Real Product Name", "badge": "Editor's Pick", "scores": { "quality": 5, "value": 4, "price": "$3,000-$7,000" } }],
  "verdict": "Specific recommendation with reasoning"
}`,
                    });
                }
            }

            // RankingList — needs real named entries
            if (block.type === 'RankingList') {
                const items = content.items as unknown[];
                const isGeneric = !items || items.length === 0
                    || JSON.stringify(items).includes('Best Overall')
                    || JSON.stringify(items).includes('Runner Up')
                    || JSON.stringify(items).includes('Best Budget');
                if (isGeneric) {
                    jobs.push({
                        type: 'ranking', pageId: page.id, blockIdx: i,
                        prompt: `Generate a ranking list of the top 3-5 ${niche} options for ${domain.domain}.

Use REAL, NAMED products/services/providers — NOT generic labels.
Include specific strengths, realistic ratings, and why each earned its rank.

Return ONLY valid JSON:
{
  "title": "Top [Niche] Picks for ${new Date().getFullYear()}",
  "items": [
    { "rank": 1, "name": "Real Name", "description": "2-3 sentences explaining why #1", "rating": 4.9, "badge": "Editor's Choice" },
    { "rank": 2, "name": "Real Name", "description": "Why it's runner up", "rating": 4.7 }
  ]
}`,
                    });
                }
            }

            // ProsConsCard — needs real named product
            if (block.type === 'ProsConsCard') {
                const name = content.name as string || '';
                const isGeneric = !name || name.includes('Top-Rated') || name.includes('Option');
                if (isGeneric) {
                    jobs.push({
                        type: 'proscons', pageId: page.id, blockIdx: i,
                        prompt: `Generate a detailed pros/cons review card for the #1 recommended ${niche} option on ${domain.domain}.

Use a REAL product/service name. Give specific, honest pros and cons — not generic filler.

Return ONLY valid JSON:
{
  "name": "Real Product/Service Name",
  "rating": 4.8,
  "badge": "Editor's Choice",
  "pros": ["Specific pro 1", "Specific pro 2", "Specific pro 3", "Specific pro 4"],
  "cons": ["Honest con 1", "Honest con 2"],
  "summary": "2-3 sentence honest assessment"
}`,
                    });
                }
            }

            // VsCard — needs real named comparison
            if (block.type === 'VsCard') {
                const itemA = content.itemA as Record<string, unknown> | undefined;
                const isGeneric = !itemA || (itemA.name as string || '').includes('Option A');
                if (isGeneric) {
                    jobs.push({
                        type: 'vscard', pageId: page.id, blockIdx: i,
                        prompt: `Generate a head-to-head comparison card for the two most popular ${niche} options on ${domain.domain}.

Use REAL product/service names. Give specific, differentiated pros/cons.

Return ONLY valid JSON:
{
  "itemA": { "name": "Real Name A", "description": "1 sentence", "pros": ["specific pro"], "cons": ["specific con"], "rating": 4.8 },
  "itemB": { "name": "Real Name B", "description": "1 sentence", "pros": ["specific pro"], "cons": ["specific con"], "rating": 4.3 },
  "verdict": "Specific recommendation with reasoning"
}`,
                    });
                }
            }

            // Citations (sync — no AI needed)
            if (block.type === 'CitationBlock') {
                const sources = content.sources as unknown[];
                if (!sources || sources.length === 0) {
                    syncChanges.push({ blockIdx: i, content: { sources: getCitations(niche) } });
                }
            }
        }

        // Meta description
        if (options.forceMeta || !page.metaDescription || page.metaDescription.includes('Expert guides about')) {
            jobs.push({
                type: 'meta', pageId: page.id,
                prompt: `Write a specific ~150-character SEO meta description.

Site:
- Domain: ${domain.domain}
- Site name: ${siteName}
- Niche: ${niche}
- Page title: ${page.title || page.route}

Avoid generic filler like "Expert guides about...". Make it feel uniquely relevant.

Return ONLY JSON: { "metaDescription": "..." }`,
            });
        }

        if (jobs.length > 0 || syncChanges.length > 0) {
            pageWorkList.push({ page, blocks: [...blocks], jobs, syncChanges });
        }
    }

    const totalJobs = pageWorkList.reduce((sum, pw) => sum + pw.jobs.length, 0);
    console.log(`[enrichDomain] ${domain.domain}: ${pageWorkList.length} pages, ${totalJobs} AI jobs queued`);

    // Phase 2: Execute all AI calls in parallel (grouped by page, pages in parallel)
    async function processPage(pw: PageWork): Promise<void> {
        const updated = [...pw.blocks];
        let changed = false;

        // Apply sync changes first (citations — no AI)
        for (const sc of pw.syncChanges) {
            const block = updated[sc.blockIdx];
            updated[sc.blockIdx] = { ...block, content: { ...(block.content as Record<string, unknown>), ...sc.content } };
            result.citationsFixed++;
            changed = true;
        }

        // Fire all AI jobs for this page in parallel
        const jobResults: EnrichJobResult[] = await runParallel(
            pw.jobs.map(job => async (): Promise<EnrichJobResult> => {
                const response = await aiCall(job.prompt);
                result.totalAiCalls++;
                if (response) result.totalCost += response.cost;
                return { job, response };
            }),
            PARALLEL_AI_CALLS_PER_PAGE,
        );

        // Apply results
        let metaDescription: string | null = null;
        for (const { job, response } of jobResults) {
            if (!response) {
                result.errors.push(`[${job.type}:${pw.page.route}] AI call failed`);
                continue;
            }

            const parsed = parseJson(response.content);
            if (!parsed) {
                result.errors.push(`[${job.type}:${pw.page.route}] Failed to parse JSON`);
                continue;
            }

            switch (job.type) {
                case 'hero':
                    if (parsed.heading) {
                        const block = updated[job.blockIdx];
                        updated[job.blockIdx] = { ...block, content: { ...(block.content as Record<string, unknown>), ...parsed } };
                        result.heroesFixed++;
                        changed = true;
                    }
                    break;
                case 'calculator':
                    updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
                    result.calculatorsFixed++;
                    changed = true;
                    break;
                case 'faq':
                    if (parsed.items) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
                        result.faqsFixed++;
                        changed = true;
                    }
                    break;
                case 'article':
                    if (parsed.markdown && (parsed.markdown as string).length > job.originalLength) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), markdown: parsed.markdown } };
                        result.articlesExpanded++;
                        changed = true;
                    }
                    break;
                case 'comparison':
                    if (parsed.options && Array.isArray(parsed.options) && (parsed.options as unknown[]).length > 0) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
                        result.comparisonsFixed++;
                        changed = true;
                    }
                    break;
                case 'ranking':
                    if (parsed.items && Array.isArray(parsed.items) && (parsed.items as unknown[]).length > 0) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
                        result.rankingsFixed++;
                        changed = true;
                    }
                    break;
                case 'proscons':
                    if (parsed.name && parsed.pros) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
                        result.prosconsFixed++;
                        changed = true;
                    }
                    break;
                case 'vscard':
                    if (parsed.itemA && parsed.itemB) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
                        result.vscardsFixed++;
                        changed = true;
                    }
                    break;
                case 'meta':
                    if (parsed.metaDescription) {
                        metaDescription = parsed.metaDescription as string;
                        result.metaFixed++;
                    }
                    break;
            }
        }

        // Phase 3: Save to DB
        const dbUpdate: Record<string, unknown> = { updatedAt: new Date() };
        if (changed) dbUpdate.blocks = updated as typeof pw.page.blocks;
        if (metaDescription) dbUpdate.metaDescription = metaDescription;

        if (Object.keys(dbUpdate).length > 1) {
            await db.update(pageDefinitions).set(dbUpdate).where(eq(pageDefinitions.id, pw.page.id));
        }
    }

    // Process pages in parallel batches
    await runParallel(
        pageWorkList.map(pw => () => processPage(pw)),
        PARALLEL_PAGES,
    );

    return result;
}
