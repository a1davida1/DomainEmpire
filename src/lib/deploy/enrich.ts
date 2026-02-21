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
import { inferSitePurpose } from './niche-registry';

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
    templatesRewritten: number;
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

// ── Template article boilerplate detection ───────────────────────────────────

const TEMPLATE_ARTICLE_FINGERPRINTS = [
    'encompasses a range of products, services, and solutions',
    'understanding the fundamentals will help you make better decisions',
    'studies show that consumers typically overpay by 15-30%',
    'getting quotes from at least 3-5 providers',
    'the single biggest mistake is choosing the first option you find',
    'research shows that comparing at least 3 providers saves an average of 20%',
    'don\'t accept the first price you\'re quoted',
    'off-peak periods typically see lower prices',
    'not all ${niche} options are created equal',
    'rushing into a decision without understanding your options',
    'free resources like our',
    'good decisions take time',
];
const TEMPLATE_MATCH_THRESHOLD = 2;

function isTemplateBoilerplate(markdown: string, niche: string): boolean {
    const normalized = markdown.toLowerCase();
    const nicheLower = niche.toLowerCase();
    let matches = 0;
    for (const fp of TEMPLATE_ARTICLE_FINGERPRINTS) {
        const fpResolved = fp.replace('${niche}', nicheLower);
        if (normalized.includes(fpResolved)) {
            matches++;
            if (matches >= TEMPLATE_MATCH_THRESHOLD) return true;
        }
    }
    return false;
}

const GENERIC_ARTICLE_BODY_PATTERNS = [
    /whether you're new to/i,
    /not all .{1,40} options are created equal/i,
    /studies show that consumers typically overpay/i,
    /our editorial team/i,
    /use our \[calculator\]/i,
    /use our \[comparison tool\]/i,
    /check our \[verified reviews\]/i,
    /we recommend providers that offer/i,
    /get everything in writing/i,
    /don't accept the first price/i,
];
const GENERIC_ARTICLE_BODY_THRESHOLD = 3;

function isGenericArticleBody(markdown: string): boolean {
    let matches = 0;
    for (const pattern of GENERIC_ARTICLE_BODY_PATTERNS) {
        if (pattern.test(markdown)) {
            matches++;
            if (matches >= GENERIC_ARTICLE_BODY_THRESHOLD) return true;
        }
    }
    return false;
}

function isGenericFaqContent(items: unknown[] | undefined): boolean {
    if (!Array.isArray(items) || items.length === 0) return false;
    const text = JSON.stringify(items).toLowerCase();
    if (SEVERE_GENERIC_FAQ_PHRASES.some(p => text.includes(p.toLowerCase()))) return true;
    const genericHits = GENERIC_FAQ_PHRASES.filter(p => text.includes(p.toLowerCase()));
    return genericHits.length >= GENERIC_FAQ_MATCH_THRESHOLD;
}

// ── AI call helpers ──────────────────────────────────────────────────────────

const ENRICH_CALL_TIMEOUT_MS = 30_000; // 30s max per enrichment AI call

async function aiCall(prompt: string): Promise<{ content: string; cost: number } | null> {
    try {
        const ai = getAIClient();
        const resp = await Promise.race([
            ai.generate('blockContent', prompt),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Enrichment AI call timed out after 30s')), ENRICH_CALL_TIMEOUT_MS),
            ),
        ]);
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

// inferSitePurpose is imported from niche-registry.ts (single source of truth)

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
    | { type: 'template-rewrite'; pageId: string; blockIdx: number; prompt: string; originalLength: number }
    | { type: 'comparison'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'ranking'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'proscons'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'vscard'; pageId: string; blockIdx: number; prompt: string }
    | { type: 'cta'; pageId: string; blockIdx: number; prompt: string }
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
    forceTemplateRewrites?: boolean;
    minArticleBodyWords?: number;
}

export async function enrichDomain(domainId: string, options: EnrichOptions = {}): Promise<EnrichResult> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) throw new Error('Domain not found');

    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));
    const niche = domain.subNiche || domain.niche || 'general';
    const siteName = extractSiteTitle(domain.domain);
    const voiceSeed = await getOrCreateVoiceSeed(domain.id, domain.domain, niche);
    const sitePurpose = inferSitePurpose(domain.domain, niche, siteName);

    const result: EnrichResult = {
        domain: domain.domain, heroesFixed: 0, calculatorsFixed: 0,
        faqsFixed: 0, articlesExpanded: 0, templatesRewritten: 0,
        comparisonsFixed: 0, rankingsFixed: 0, prosconsFixed: 0, vscardsFixed: 0,
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
                        prompt: `Generate a hero headline for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}

Page: ${pageContext}
Year: ${new Date().getFullYear()}

Write a headline that speaks directly to someone visiting THIS specific site. Not generic "${niche}" copy.

Return ONLY a JSON object:
{ "heading": "Specific compelling H1 (50-70 chars)", "subheading": "What this site helps you do (80-120 chars)", "badge": "Updated ${new Date().getFullYear()}" }`,
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
                        prompt: `Generate a ${block.type === 'QuoteCalculator' ? 'calculator' : 'cost breakdown'} for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}

CRITICAL RULES:
- Input fields must be specific to what THIS site calculates — NOT generic "Size/Quantity" or "Quality Level"
- Use real industry terminology that a consumer would recognize
- For select dropdowns, use options with real names (e.g., "Traditional Metal Braces" not "Basic")
- Formula must produce realistic dollar amounts for this specific domain
- Include 3-5 relevant input fields
- ${block.type === 'QuoteCalculator'
    ? 'Inputs can be: number (with min/max/step), select (with labeled options and numeric multiplier values), or range'
    : 'Each range needs a descriptive label, low/high/average dollar amounts that are realistic for this service'}

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
                        prompt: `Generate 5-7 FAQ items for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}
Page: ${page.title || page.route}

RULES:
- Questions should be what real people actually Google about this specific topic
- Answers MUST include specific numbers, dollar ranges, timelines, or concrete facts
- NEVER say "costs vary widely" or "depends on your needs" without immediately giving a real range
- If a question is about cost, give actual dollar amounts (e.g., "$3,000-$7,000" not "varies")
- Keep answers 2-3 sentences, directly useful — a reader should learn something concrete
- Do NOT use hedge language like "consult a professional" or "use our calculator"
- Do NOT reference other pages on the site — answer the question completely right here

Return ONLY valid JSON: { "items": [{ "question": "...", "answer": "..." }] }`,
                    });
                }
            }

            // Thin ArticleBody or template boilerplate rewrite
            if (block.type === 'ArticleBody') {
                const md = (content.markdown as string) || '';
                const wordCount = md.split(/\s+/).filter(Boolean).length;
                const minWords = (typeof options.minArticleBodyWords === 'number' && Number.isFinite(options.minArticleBodyWords))
                    ? Math.max(300, Math.floor(options.minArticleBodyWords))
                    : 300;
                const targetWords = Math.max(500, minWords);
                const isGeneric = isGenericArticleBody(md);
                if ((options.forceArticleBodies || wordCount < minWords || isGeneric) && wordCount > 20) {
                    const pageContext = page.title || niche;
                    const genericVoiceHint = voiceSeed && typeof voiceSeed === 'object' && 'name' in voiceSeed
                        ? `\nVOICE: ${(voiceSeed as Record<string, unknown>).name}, ${(voiceSeed as Record<string, unknown>).background}. ${(voiceSeed as Record<string, unknown>).formatting}`
                        : '';
                    const prompt = isGeneric
                        ? `Rewrite this article for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}
Page: ${pageContext}
Year: ${new Date().getFullYear()}

Write a COMPLETELY NEW article (at least 500 words) that is specifically about what THIS site covers.
Do NOT reuse any of the existing template text. Write original content with real facts, specific numbers, and actionable advice.
The tone should be conversational and authoritative — like a knowledgeable friend explaining this topic.${genericVoiceHint}

TOPIC TO COVER (use as a starting point, not as text to keep):
${md.substring(0, 200)}

Return ONLY a JSON object: { "markdown": "Full article in markdown" }`
                        : `Expand this article for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}
Page: ${pageContext}
Year: ${new Date().getFullYear()}

Expand to at least ${targetWords} words. Add real data, specific examples, and actionable advice relevant to THIS site's topic.
Do NOT use generic template language. Write as if you're an expert in this specific subject.

EXISTING CONTENT:
${md}

Return ONLY a JSON object: { "markdown": "Full expanded article in markdown" }`;
                    jobs.push({
                        type: isGeneric ? 'template-rewrite' : 'article',
                        pageId: page.id, blockIdx: i, originalLength: md.length,
                        prompt,
                    });
                } else if (wordCount >= 20 && (
                    options.forceTemplateRewrites
                    || content._templateSource
                    || isTemplateBoilerplate(md, niche)
                )) {
                    // Non-thin but template boilerplate — rewrite completely.
                    // Detection: explicit _templateSource tag (set by sub-page-presets),
                    // fingerprint matching (fallback for older articles), or force flag.
                    const pageContext = page.title || niche;
                    const voiceHint = voiceSeed && typeof voiceSeed === 'object' && 'name' in voiceSeed
                        ? `VOICE: ${(voiceSeed as Record<string, unknown>).name}, ${(voiceSeed as Record<string, unknown>).background}. ${(voiceSeed as Record<string, unknown>).formatting}`
                        : '';
                    jobs.push({
                        type: 'template-rewrite', pageId: page.id, blockIdx: i, originalLength: md.length,
                        prompt: `Rewrite this article for ${domain.domain}. The current text is generic template copy that is used across many sites.

SITE PURPOSE: ${sitePurpose}
Page: ${pageContext} (${page.route})
Year: ${new Date().getFullYear()}

Write a completely original article about THIS specific topic as it relates to ${domain.domain}.
Target 500-700 words. Use specific data, real examples, and actionable advice.
Maintain the same H2/H3 heading structure but rewrite all body text to be unique and relevant.
${voiceHint}

EXISTING TEMPLATE (rewrite completely):
${md}

Return ONLY a JSON object: { "markdown": "Full rewritten article in markdown" }`,
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
                        prompt: `Generate a comparison table for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}

List 3-5 REAL, NAMED options that consumers of THIS specific site would compare.
Use actual product/service/provider/method names — NOT generic labels.
Include realistic pricing, genuine trade-offs, and honest quality ratings.

The column headers should make sense for what's being compared on THIS site.

Return ONLY valid JSON:
{
  "columns": [{ "key": "quality", "label": "Quality", "type": "rating", "sortable": true }, { "key": "value", "label": "Value", "type": "rating", "sortable": true }, { "key": "price", "label": "Price Range", "type": "text", "sortable": true }],
  "options": [{ "name": "Real Specific Name", "badge": "Editor's Pick", "scores": { "quality": 5, "value": 4, "price": "$X,000-$Y,000" } }],
  "verdict": "Specific recommendation with reasoning for THIS site's audience"
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
                        prompt: `Generate a ranking list for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}

List 3-5 REAL, NAMED options relevant to THIS site's audience. Use actual names consumers would recognize.

Return ONLY valid JSON:
{
  "title": "Top Picks for ${new Date().getFullYear()}",
  "items": [
    { "rank": 1, "name": "Real Specific Name", "description": "2-3 sentences with real details", "rating": 4.9, "badge": "Editor's Choice" },
    { "rank": 2, "name": "Real Specific Name", "description": "Specific strengths", "rating": 4.7 }
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
                        prompt: `Generate a pros/cons card for the #1 option on ${domain.domain}.

SITE PURPOSE: ${sitePurpose}

Use a REAL name. Pros/cons must be specific to this option — not generic "good quality" filler.

Return ONLY valid JSON:
{
  "name": "Real Specific Name",
  "rating": 4.8,
  "badge": "Editor's Choice",
  "pros": ["Specific factual pro with numbers where possible"],
  "cons": ["Honest specific con"],
  "summary": "2-3 sentence honest assessment specific to this option"
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
                        prompt: `Generate a head-to-head comparison for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}

Compare the two most common choices a visitor to THIS site would be deciding between. Use real names.

Return ONLY valid JSON:
{
  "itemA": { "name": "Real Name", "description": "1 sentence", "pros": ["specific pro"], "cons": ["specific con"], "rating": 4.8 },
  "itemB": { "name": "Real Name", "description": "1 sentence", "pros": ["specific pro"], "cons": ["specific con"], "rating": 4.3 },
  "verdict": "Specific recommendation for THIS site's audience"
}`,
                    });
                }
            }

            // CTABanner — needs site-specific call to action
            if (block.type === 'CTABanner') {
                const text = content.text as string || '';
                const isGeneric = !text || text.includes('Ready to find the best') || text.includes('Compare top-rated') || text.length < 10;
                if (isGeneric) {
                    jobs.push({
                        type: 'cta', pageId: page.id, blockIdx: i,
                        prompt: `Write a call-to-action banner for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}
Page: ${page.title || page.route}

The CTA should tell the visitor exactly what they'll get by clicking. Be specific to THIS site.

Return ONLY valid JSON:
{ "text": "One compelling sentence specific to this site", "buttonLabel": "Action verb + what they get (3-5 words)", "buttonUrl": "/calculator" }`,
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
                prompt: `Write a ~150-character SEO meta description for ${domain.domain}.

SITE PURPOSE: ${sitePurpose}
Page: ${page.title || page.route}

Write a description that tells a Google searcher exactly what they'll get on THIS page. Be specific, not generic.

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
                case 'template-rewrite':
                    if (parsed.markdown && (parsed.markdown as string).length > job.originalLength * 0.5) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), markdown: parsed.markdown } };
                        result.templatesRewritten++;
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
                case 'cta':
                    if (parsed.text && parsed.buttonLabel) {
                        updated[job.blockIdx] = { ...updated[job.blockIdx], content: { ...(updated[job.blockIdx].content as Record<string, unknown>), ...parsed } };
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
