/**
 * Block Content Generation Pipeline — Template System v2.
 *
 * Generates content for individual blocks in a page definition by:
 * 1. Looking up the block's prompt template
 * 2. Calling the AI with the prompt
 * 3. Parsing the JSON response
 * 4. Validating against the block's Zod schema
 * 5. Storing the validated content on the block envelope
 *
 * This replaces the monolithic article generation for v2 page definitions.
 */

import { db, pageDefinitions, domains, articles } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { getAIClient } from './openrouter';
import { getOrCreateVoiceSeed } from './voice-seed';
import { getDefaultBlockContent } from '@/lib/deploy/blocks/default-content';
import {
    validateBlock,
    type BlockType,
    type BlockEnvelope,
} from '@/lib/deploy/blocks/schemas';
import {
    getBlockPrompt,
    isAiGeneratableBlock,
    STRUCTURAL_BLOCK_TYPES,
    type BlockPromptContext,
} from './block-prompts';

// ============================================================
// Fallback citations by niche (used when AI refuses to generate)
// ============================================================

const NICHE_CITATIONS: Record<string, Array<{ title: string; url: string; publisher: string; retrievedAt: string; usage: string }>> = {
    'real estate': [
        { title: 'Housing Market Data', url: 'https://www.nar.realtor/research-and-statistics', publisher: 'National Association of Realtors', retrievedAt: '2026-01', usage: 'Housing market trends and median home prices' },
        { title: 'Home Mortgage Disclosure Act Data', url: 'https://www.consumerfinance.gov/data-research/hmda/', publisher: 'Consumer Financial Protection Bureau', retrievedAt: '2026-01', usage: 'Mortgage lending data and trends' },
        { title: 'Housing Vacancies and Homeownership', url: 'https://www.census.gov/housing/hvs', publisher: 'U.S. Census Bureau', retrievedAt: '2026-01', usage: 'Homeownership rates and vacancy statistics' },
        { title: 'House Price Index', url: 'https://www.fhfa.gov/data/hpi', publisher: 'Federal Housing Finance Agency', retrievedAt: '2026-01', usage: 'Home price appreciation trends by region' },
    ],
    'personal finance': [
        { title: 'Consumer Credit Outstanding', url: 'https://www.federalreserve.gov/releases/g19/current/', publisher: 'Federal Reserve', retrievedAt: '2026-01', usage: 'Total consumer credit and revolving debt data' },
        { title: 'Quarterly Report on Household Debt', url: 'https://www.newyorkfed.org/microeconomics/hhdc', publisher: 'Federal Reserve Bank of New York', retrievedAt: '2026-01', usage: 'Credit card balances and delinquency rates' },
        { title: 'Consumer Expenditure Surveys', url: 'https://www.bls.gov/cex/', publisher: 'Bureau of Labor Statistics', retrievedAt: '2026-01', usage: 'Average household spending patterns' },
        { title: 'Financial Literacy Resources', url: 'https://www.consumerfinance.gov/consumer-tools/', publisher: 'Consumer Financial Protection Bureau', retrievedAt: '2026-01', usage: 'Consumer financial education and tools' },
    ],
    'dental': [
        { title: 'Oral Health Surveillance Report', url: 'https://www.cdc.gov/oral-health/data-research/', publisher: 'Centers for Disease Control and Prevention', retrievedAt: '2026-01', usage: 'National oral health statistics and trends' },
        { title: 'Dental Expenditure Data', url: 'https://meps.ahrq.gov/mepsweb/data_stats/quick_tables.jsp', publisher: 'Agency for Healthcare Research and Quality', retrievedAt: '2026-01', usage: 'Average dental care costs and utilization' },
        { title: 'Consumer Guide to Dentistry', url: 'https://www.ada.org/resources/research/science-and-research-institute', publisher: 'American Dental Association', retrievedAt: '2026-01', usage: 'Evidence-based dental treatment guidelines' },
        { title: 'Children\'s Oral Health', url: 'https://www.nidcr.nih.gov/research/data-statistics', publisher: 'National Institute of Dental and Craniofacial Research', retrievedAt: '2026-01', usage: 'Dental health statistics and research findings' },
    ],
    'home improvement': [
        { title: 'Consumer Expenditure Surveys - Housing', url: 'https://www.bls.gov/cex/', publisher: 'Bureau of Labor Statistics', retrievedAt: '2026-01', usage: 'Average household spending on home improvements' },
        { title: 'American Housing Survey', url: 'https://www.census.gov/programs-surveys/ahs.html', publisher: 'U.S. Census Bureau', retrievedAt: '2026-01', usage: 'Home renovation frequency and cost data' },
        { title: 'Remodeling Impact Report', url: 'https://www.nar.realtor/research-and-statistics/research-reports/remodeling-impact', publisher: 'National Association of Realtors', retrievedAt: '2026-01', usage: 'ROI of common home renovation projects' },
        { title: 'Cost vs. Value Report', url: 'https://www.remodeling.hw.net/cost-vs-value/2025/', publisher: 'Remodeling Magazine', retrievedAt: '2026-01', usage: 'Regional cost data for major remodeling projects' },
    ],
};

const DEFAULT_CITATIONS = [
    { title: 'Consumer Information', url: 'https://www.usa.gov/consumer', publisher: 'USA.gov', retrievedAt: '2026-01', usage: 'Federal consumer protection and information resources' },
    { title: 'Consumer Price Index', url: 'https://www.bls.gov/cpi/', publisher: 'Bureau of Labor Statistics', retrievedAt: '2026-01', usage: 'Price trends and inflation data' },
    { title: 'Consumer Financial Protection', url: 'https://www.consumerfinance.gov/', publisher: 'CFPB', retrievedAt: '2026-01', usage: 'Consumer financial education and complaint data' },
];

function generateFallbackCitations(niche: string): Record<string, unknown> {
    const lower = niche.toLowerCase();
    for (const [key, sources] of Object.entries(NICHE_CITATIONS)) {
        if (lower.includes(key) || key.includes(lower)) {
            return { sources };
        }
    }
    return { sources: DEFAULT_CITATIONS };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeGeneratedWithDefaults(generated: unknown, defaults: unknown): unknown {
    if (generated === undefined || generated === null) {
        return defaults;
    }

    if (Array.isArray(generated)) {
        if (generated.length === 0 && Array.isArray(defaults) && defaults.length > 0) {
            return defaults;
        }
        return generated;
    }

    if (isRecord(generated) && isRecord(defaults)) {
        const merged: Record<string, unknown> = { ...defaults };
        for (const [key, value] of Object.entries(generated)) {
            merged[key] = mergeGeneratedWithDefaults(value, defaults[key]);
        }
        return merged;
    }

    return generated;
}

function applyBlockContentDefaults(
    block: BlockEnvelope,
    content: Record<string, unknown>,
    ctx: BlockPromptContext,
): Record<string, unknown> {
    const defaults = getDefaultBlockContent(
        block.type,
        ctx.domainName,
        ctx.niche,
        block.variant,
    ).content;

    if (!defaults || Object.keys(defaults).length === 0) {
        return content;
    }

    return mergeGeneratedWithDefaults(content, defaults) as Record<string, unknown>;
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }
    if (isRecord(a) && isRecord(b)) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        for (const key of aKeys) {
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return false;
}

function hasPlaceholderMarkers(content: Record<string, unknown>): boolean {
    const blob = JSON.stringify(content);
    return /top choice [a-z]|option [a-z]|tier name|item name|product\/service name|example\.com|lorem ipsum|\btodo\b|\breplace\b|\[insert|\[your/i.test(blob);
}

// ============================================================
// Semantic Validation — detect and auto-repair low-quality AI output
// ============================================================

interface SemanticIssue {
    field: string;
    reason: string;
}

const GENERIC_NAME_PATTERNS = [
    /^(top\s+)?choice\s+[a-z0-9]/i,
    /^option\s+[a-z0-9]/i,
    /^(product|service|provider|item|plan|tier)\s+[a-z0-9]/i,
    /^(company|brand)\s+[a-z0-9]/i,
    /^(best|top)\s+(overall|pick|choice)$/i,
    /^placeholder/i,
    /^example/i,
    /^my\s+(site|company|brand|product)/i,
    /^acme\b/i,
    /^lorem/i,
    /^test\s/i,
    /^\[.*\]$/,
];

const GENERIC_VERDICT_PATTERNS = [
    /choice [a-z]\b/i,
    /option [a-z]\b/i,
    /product [a-z]\b/i,
    /\[insert/i,
    /\[your/i,
    /lorem ipsum/i,
];

const PLACEHOLDER_URL_PATTERNS = [
    /^#$/,
    /example\.com/i,
    /placeholder/i,
    /test\.com/i,
];

function isGenericName(name: unknown): boolean {
    if (typeof name !== 'string') return false;
    return GENERIC_NAME_PATTERNS.some(p => p.test(name.trim()));
}

function isGenericVerdict(verdict: unknown): boolean {
    if (typeof verdict !== 'string' || verdict.length < 10) return true;
    return GENERIC_VERDICT_PATTERNS.some(p => p.test(verdict));
}

function isPlaceholderUrl(url: unknown): boolean {
    if (typeof url !== 'string' || !url) return false;
    return PLACEHOLDER_URL_PATTERNS.some(p => p.test(url.trim()));
}

function semanticValidateBlock(
    blockType: string,
    content: Record<string, unknown>,
): SemanticIssue[] {
    const issues: SemanticIssue[] = [];

    // Check ComparisonTable options
    if (blockType === 'ComparisonTable') {
        const options = content.options;
        if (Array.isArray(options)) {
            for (let i = 0; i < options.length; i++) {
                const opt = options[i] as Record<string, unknown>;
                if (isGenericName(opt?.name)) {
                    issues.push({ field: `options[${i}].name`, reason: `Generic name: "${opt.name}"` });
                }
            }
        }
        if (isGenericVerdict(content.verdict)) {
            issues.push({ field: 'verdict', reason: 'Generic or too-short verdict' });
        }
    }

    // Check RankingList items
    if (blockType === 'RankingList') {
        const items = content.items;
        if (Array.isArray(items)) {
            for (let i = 0; i < items.length; i++) {
                const item = items[i] as Record<string, unknown>;
                if (isGenericName(item?.name)) {
                    issues.push({ field: `items[${i}].name`, reason: `Generic name: "${item.name}"` });
                }
            }
            if (items.length === 0) {
                issues.push({ field: 'items', reason: 'Empty ranking list' });
            }
        }
    }

    // Check ProsConsCard
    if (blockType === 'ProsConsCard') {
        if (isGenericName(content.name)) {
            issues.push({ field: 'name', reason: `Generic product name: "${content.name}"` });
        }
        const pros = content.pros;
        const cons = content.cons;
        if (Array.isArray(pros) && pros.length === 0) {
            issues.push({ field: 'pros', reason: 'Empty pros list' });
        }
        if (Array.isArray(cons) && cons.length === 0) {
            issues.push({ field: 'cons', reason: 'Empty cons list' });
        }
    }

    // Check VsCard
    if (blockType === 'VsCard') {
        const itemA = content.itemA as Record<string, unknown> | undefined;
        const itemB = content.itemB as Record<string, unknown> | undefined;
        if (itemA && isGenericName(itemA.name)) {
            issues.push({ field: 'itemA.name', reason: `Generic name: "${itemA.name}"` });
        }
        if (itemB && isGenericName(itemB.name)) {
            issues.push({ field: 'itemB.name', reason: `Generic name: "${itemB.name}"` });
        }
        if (isGenericVerdict(content.verdict)) {
            issues.push({ field: 'verdict', reason: 'Generic or too-short verdict' });
        }
    }

    // Check Hero
    if (blockType === 'Hero') {
        if (typeof content.heading === 'string' && content.heading.length < 5) {
            issues.push({ field: 'heading', reason: 'Heading too short' });
        }
        if (typeof content.ctaUrl === 'string' && isPlaceholderUrl(content.ctaUrl)) {
            issues.push({ field: 'ctaUrl', reason: 'Placeholder CTA URL' });
        }
    }

    // Check FAQ
    if (blockType === 'FAQ') {
        const items = content.items;
        if (Array.isArray(items) && items.length === 0) {
            issues.push({ field: 'items', reason: 'Empty FAQ list' });
        }
    }

    // Check TestimonialGrid
    if (blockType === 'TestimonialGrid') {
        const testimonials = content.testimonials;
        if (Array.isArray(testimonials)) {
            for (let i = 0; i < testimonials.length; i++) {
                const t = testimonials[i] as Record<string, unknown>;
                if (typeof t?.quote === 'string' && t.quote.length < 15) {
                    issues.push({ field: `testimonials[${i}].quote`, reason: 'Quote too short' });
                }
            }
        }
    }

    // Check PricingTable
    if (blockType === 'PricingTable') {
        const plans = content.plans;
        if (Array.isArray(plans)) {
            for (let i = 0; i < plans.length; i++) {
                const plan = plans[i] as Record<string, unknown>;
                if (isGenericName(plan?.name)) {
                    issues.push({ field: `plans[${i}].name`, reason: `Generic plan name: "${plan.name}"` });
                }
            }
        }
    }

    // Global: check for placeholder URLs in any string field
    const blob = JSON.stringify(content);
    if (/example\.com/i.test(blob)) {
        issues.push({ field: '_global', reason: 'Contains example.com placeholder URL' });
    }

    return issues;
}

/**
 * Auto-repair semantically invalid content by merging in niche-aware defaults
 * for the flagged fields. Only patches the broken fields, preserving the rest.
 */
function semanticRepairBlock(
    blockType: string,
    content: Record<string, unknown>,
    ctx: BlockPromptContext,
): Record<string, unknown> {
    const defaults = getDefaultBlockContent(
        blockType,
        ctx.domainName,
        ctx.niche,
    ).content;

    if (!defaults) return content;

    const repaired = { ...content };

    if (blockType === 'ComparisonTable' && defaults.options) {
        const options = repaired.options;
        const defOptions = defaults.options as Array<Record<string, unknown>>;
        if (Array.isArray(options)) {
            repaired.options = options.map((opt, i) => {
                const o = opt as Record<string, unknown>;
                const d = defOptions[i] || defOptions[0];
                if (d && isGenericName(o.name)) {
                    return { ...o, name: d.name, badge: o.badge || d.badge };
                }
                return o;
            });
        }
        if (isGenericVerdict(repaired.verdict) && defaults.verdict) {
            repaired.verdict = defaults.verdict;
        }
    }

    if (blockType === 'RankingList' && defaults.items) {
        const items = repaired.items;
        const defItems = defaults.items as Array<Record<string, unknown>>;
        if (Array.isArray(items)) {
            repaired.items = items.map((item, i) => {
                const it = item as Record<string, unknown>;
                const d = defItems[i] || defItems[0];
                if (d && isGenericName(it.name)) {
                    return { ...it, name: d.name, badge: it.badge || d.badge };
                }
                return it;
            });
        }
    }

    if (blockType === 'ProsConsCard') {
        if (isGenericName(repaired.name) && defaults.name) {
            repaired.name = defaults.name;
        }
        if (Array.isArray(repaired.pros) && (repaired.pros as unknown[]).length === 0 && defaults.pros) {
            repaired.pros = defaults.pros;
        }
        if (Array.isArray(repaired.cons) && (repaired.cons as unknown[]).length === 0 && defaults.cons) {
            repaired.cons = defaults.cons;
        }
    }

    if (blockType === 'VsCard') {
        const defA = (defaults.itemA || {}) as Record<string, unknown>;
        const defB = (defaults.itemB || {}) as Record<string, unknown>;
        const itemA = repaired.itemA as Record<string, unknown> | undefined;
        const itemB = repaired.itemB as Record<string, unknown> | undefined;
        if (itemA && isGenericName(itemA.name) && defA.name) {
            repaired.itemA = { ...itemA, name: defA.name };
        }
        if (itemB && isGenericName(itemB.name) && defB.name) {
            repaired.itemB = { ...itemB, name: defB.name };
        }
        if (isGenericVerdict(repaired.verdict) && defaults.verdict) {
            repaired.verdict = defaults.verdict;
        }
    }

    // Replace placeholder URLs globally
    const blob = JSON.stringify(repaired);
    if (/example\.com/i.test(blob)) {
        const fixed = blob.replace(/https?:\/\/example\.com\/?/gi, '/guides');
        try { return JSON.parse(fixed); } catch { /* keep repaired */ }
    }

    return repaired;
}

function shouldSkipGenerationForExistingContent(block: BlockEnvelope, ctx: BlockPromptContext): boolean {
    const existing = block.content;
    if (!existing || !isRecord(existing) || Object.keys(existing).length === 0) return false;

    const defaults = getDefaultBlockContent(
        block.type,
        ctx.domainName,
        ctx.niche,
        block.variant,
    ).content;

    const isDefaultMatch = defaults ? deepEqual(existing, defaults) : false;
    const isPlaceholderHeavy = hasPlaceholderMarkers(existing);

    // If content appears to be seeded defaults or placeholders, regenerate.
    if (isDefaultMatch || isPlaceholderHeavy) {
        return false;
    }

    // Otherwise preserve existing authored content.
    return true;
}

// ============================================================
// Types
// ============================================================

export interface BlockGenerationResult {
    blockId: string;
    blockType: BlockType;
    success: boolean;
    skipped?: boolean;
    content?: Record<string, unknown>;
    error?: string;
    tokensUsed?: number;
    cost?: number;
    durationMs?: number;
}

export interface PageGenerationResult {
    pageDefinitionId: string;
    route: string;
    blocks: BlockGenerationResult[];
    totalTokens: number;
    totalCost: number;
    totalDurationMs: number;
    successCount: number;
    failureCount: number;
    skippedCount: number;
}

// ============================================================
// Core generation logic
// ============================================================

/**
 * Generate AI content for a single block.
 * Returns the generated content or an error.
 */
export async function generateBlockContent(
    block: BlockEnvelope,
    ctx: BlockPromptContext,
): Promise<BlockGenerationResult> {
    const blockType = block.type as BlockType;
    const startMs = Date.now();

    // Skip structural blocks — they don't need AI content
    if (STRUCTURAL_BLOCK_TYPES.includes(blockType)) {
        return {
            blockId: block.id,
            blockType,
            success: true,
            skipped: true,
            content: block.content as Record<string, unknown> | undefined,
        };
    }

    // Skip blocks that already have meaningful authored content (don't overwrite).
    // But do regenerate placeholder/default-seeded content for quality upgrades.
    if (shouldSkipGenerationForExistingContent(block, ctx)) {
        return {
            blockId: block.id,
            blockType,
            success: true,
            skipped: true,
            content: block.content as Record<string, unknown>,
        };
    }

    // Check if this block type supports AI generation
    if (!isAiGeneratableBlock(blockType)) {
        return {
            blockId: block.id,
            blockType,
            success: true,
            skipped: true,
        };
    }

    // Get the prompt
    const prompt = getBlockPrompt(blockType, ctx);
    if (!prompt) {
        return {
            blockId: block.id,
            blockType,
            success: false,
            error: `No prompt template for block type: ${blockType}`,
        };
    }

    try {
        const ai = getAIClient();
        const response = await ai.generate('blockContent', prompt);
        const durationMs = Date.now() - startMs;

        // Parse JSON from response with repair for common AI output issues
        let parsed: Record<string, unknown>;
        try {
            let raw = response.content.trim();
            // Strip markdown code fences
            if (raw.startsWith('```')) {
                raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
            }
            // Strip leading text before first { (AI sometimes adds preamble)
            const firstBrace = raw.indexOf('{');
            if (firstBrace > 0 && firstBrace < 100) {
                raw = raw.slice(firstBrace);
            }
            // Try direct parse first
            try {
                parsed = JSON.parse(raw);
            } catch {
                // Repair: fix unescaped newlines and control chars inside JSON string values
                const repaired = raw
                    .replace(/(?<=:\s*")([\s\S]*?)(?="(?:\s*[,}]))/g, (_match, content: string) => {
                        return content
                            .replace(/\\/g, '\\\\')
                            .replace(/\n/g, '\\n')
                            .replace(/\r/g, '\\r')
                            .replace(/\t/g, '\\t')
                            .replace(/(?<!\\)"/g, '\\"');
                    });
                try {
                    parsed = JSON.parse(repaired);
                } catch {
                    // Last resort: extract markdown field if this is an ArticleBody
                    if (blockType === 'ArticleBody') {
                        const mdMatch = raw.match(/"markdown"\s*:\s*"([\s\S]+)"\s*[,}]/);
                        const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
                        if (mdMatch) {
                            parsed = {
                                markdown: mdMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                                ...(titleMatch ? { title: titleMatch[1] } : {}),
                            };
                        } else {
                            throw new Error('Could not extract markdown from ArticleBody response');
                        }
                    } else if (blockType === 'CitationBlock') {
                        parsed = generateFallbackCitations(ctx.niche);
                    } else {
                        throw new Error('JSON repair failed');
                    }
                }
            }
        } catch (parseErr) {
            if (blockType === 'CitationBlock') {
                parsed = generateFallbackCitations(ctx.niche);
            } else {
                return {
                    blockId: block.id,
                    blockType,
                    success: false,
                    error: `Failed to parse AI response as JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
                    tokensUsed: response.inputTokens + response.outputTokens,
                    cost: response.cost,
                    durationMs,
                };
            }
        }

        if (!isRecord(parsed)) {
            return {
                blockId: block.id,
                blockType,
                success: false,
                error: `AI response for ${blockType} was not a JSON object`,
                tokensUsed: response.inputTokens + response.outputTokens,
                cost: response.cost,
                durationMs,
            };
        }

        const normalizedContent = applyBlockContentDefaults(block, parsed, ctx);

        // Validate against block schema
        const validation = validateBlock({
            id: block.id,
            type: blockType,
            content: normalizedContent,
        });

        if (!validation.success) {
            const defaults = getDefaultBlockContent(
                block.type,
                ctx.domainName,
                ctx.niche,
                block.variant,
            ).content as Record<string, unknown> | undefined;

            if (defaults && Object.keys(defaults).length > 0) {
                const fallbackValidation = validateBlock({
                    id: block.id,
                    type: blockType,
                    content: defaults,
                });

                if (fallbackValidation.success) {
                    console.warn(
                        `[block-pipeline] Invalid ${blockType} AI output for block ${block.id}; using defaults. Errors:`,
                        validation.errors,
                    );

                    return {
                        blockId: block.id,
                        blockType,
                        success: true,
                        content: defaults,
                        tokensUsed: response.inputTokens + response.outputTokens,
                        cost: response.cost,
                        durationMs,
                    };
                }
            }

            return {
                blockId: block.id,
                blockType,
                success: false,
                error: `Schema validation failed: ${validation.errors?.join('; ') || 'unknown error'}`,
                tokensUsed: response.inputTokens + response.outputTokens,
                cost: response.cost,
                durationMs,
            };
        }

        // Semantic validation — detect and auto-repair generic/placeholder content
        const semanticIssues = semanticValidateBlock(blockType, normalizedContent);
        let finalContent = normalizedContent;
        if (semanticIssues.length > 0) {
            console.warn(
                `[block-pipeline] Semantic issues in ${blockType} block ${block.id}:`,
                semanticIssues.map(i => `${i.field}: ${i.reason}`).join('; '),
            );
            finalContent = semanticRepairBlock(blockType, normalizedContent, ctx);
        }

        return {
            blockId: block.id,
            blockType,
            success: true,
            content: finalContent,
            tokensUsed: response.inputTokens + response.outputTokens,
            cost: response.cost,
            durationMs,
        };
    } catch (err) {
        return {
            blockId: block.id,
            blockType,
            success: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startMs,
        };
    }
}

/**
 * Generate AI content for all blocks in a page definition.
 * Processes blocks sequentially to avoid rate limits and maintain context.
 */
export async function generatePageBlockContent(
    pageDefId: string,
): Promise<PageGenerationResult> {
    // Load page definition
    const pageDefs = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.id, pageDefId))
        .limit(1);

    if (pageDefs.length === 0) {
        throw new Error(`Page definition not found: ${pageDefId}`);
    }

    const pageDef = pageDefs[0];
    const blocks = (pageDef.blocks || []) as BlockEnvelope[];

    // Load domain info
    const domainRows = await db.select().from(domains)
        .where(eq(domains.id, pageDef.domainId))
        .limit(1);

    if (domainRows.length === 0) {
        throw new Error(`Domain not found: ${pageDef.domainId}`);
    }

    const domain = domainRows[0];

    // Get voice seed
    const voiceSeed = await getOrCreateVoiceSeed(
        domain.id,
        domain.domain,
        domain.niche || 'general',
    );

    // Load any published articles for research data context
    const publishedArticles = await db.select()
        .from(articles)
        .where(and(eq(articles.domainId, domain.id), eq(articles.status, 'published')))
        .limit(1);

    const researchData = publishedArticles[0]?.researchData as Record<string, unknown> | null;

    // Build prompt context
    const ctx: BlockPromptContext = {
        keyword: pageDef.title || domain.niche || 'general topic',
        domainName: domain.domain,
        niche: domain.niche || 'general',
        siteTitle: pageDef.title || domain.domain,
        researchData,
        voiceSeed,
    };

    // Generate content for each block
    const results: BlockGenerationResult[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let totalDurationMs = 0;
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    const updatedBlocks: BlockEnvelope[] = [];

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const blockCtx: BlockPromptContext = {
            ...ctx,
            existingBlocks: [
                ...updatedBlocks,
                ...blocks.slice(i + 1),
            ].map(b => ({
                type: b.type,
                content: isRecord(b.content) ? b.content : undefined,
            })),
        };

        const result = await generateBlockContent(block, blockCtx);
        results.push(result);

        if (result.skipped) {
            skippedCount++;
            updatedBlocks.push(block);
        } else if (result.success) {
            successCount++;
            updatedBlocks.push({
                ...block,
                content: result.content || block.content,
            } as BlockEnvelope);
        } else {
            failureCount++;
            updatedBlocks.push(block);
            console.error(
                `[block-pipeline] Failed to generate content for ${block.type} block ${block.id}: ${result.error}`,
            );
        }

        if (result.tokensUsed) totalTokens += result.tokensUsed;
        if (result.cost) totalCost += result.cost;
        if (result.durationMs) totalDurationMs += result.durationMs;
    }

    // Update the page definition with generated content
    await db.update(pageDefinitions).set({
        blocks: updatedBlocks as typeof pageDef.blocks,
        version: pageDef.version + 1,
        updatedAt: new Date(),
    }).where(eq(pageDefinitions.id, pageDefId));

    return {
        pageDefinitionId: pageDefId,
        route: pageDef.route,
        blocks: results,
        totalTokens,
        totalCost,
        totalDurationMs,
        successCount,
        failureCount,
        skippedCount,
    };
}

/**
 * Regenerate content for a single block within a page definition.
 * Used when a reviewer rejects a specific block and wants it re-generated.
 */
export async function regenerateBlockContent(
    pageDefId: string,
    blockId: string,
): Promise<BlockGenerationResult> {
    // Load page definition
    const pageDefs = await db.select().from(pageDefinitions)
        .where(eq(pageDefinitions.id, pageDefId))
        .limit(1);

    if (pageDefs.length === 0) {
        throw new Error(`Page definition not found: ${pageDefId}`);
    }

    const pageDef = pageDefs[0];
    const blocks = (pageDef.blocks || []) as BlockEnvelope[];
    const blockIndex = blocks.findIndex(b => b.id === blockId);

    if (blockIndex === -1) {
        throw new Error(`Block not found: ${blockId} in page ${pageDefId}`);
    }

    const block = blocks[blockIndex];

    // Load domain info
    const domainRows = await db.select().from(domains)
        .where(eq(domains.id, pageDef.domainId))
        .limit(1);

    if (domainRows.length === 0) {
        throw new Error(`Domain not found: ${pageDef.domainId}`);
    }

    const domain = domainRows[0];
    const voiceSeed = await getOrCreateVoiceSeed(
        domain.id,
        domain.domain,
        domain.niche || 'general',
    );

    // Force regeneration by clearing existing content
    const blockForRegen: BlockEnvelope = {
        ...block,
        content: undefined,
    };

    const ctx: BlockPromptContext = {
        keyword: pageDef.title || domain.niche || 'general topic',
        domainName: domain.domain,
        niche: domain.niche || 'general',
        siteTitle: pageDef.title || domain.domain,
        voiceSeed,
    };

    const result = await generateBlockContent(blockForRegen, {
        ...ctx,
        existingBlocks: blocks
            .filter(b => b.id !== blockId)
            .map(b => ({
                type: b.type,
                content: isRecord(b.content) ? b.content : undefined,
            })),
    });

    if (result.success && result.content) {
        // Update only this block in the page definition
        const updatedBlocks = [...blocks];
        updatedBlocks[blockIndex] = {
            ...block,
            content: result.content,
        } as BlockEnvelope;

        await db.update(pageDefinitions).set({
            blocks: updatedBlocks as typeof pageDef.blocks,
            version: pageDef.version + 1,
            updatedAt: new Date(),
        }).where(eq(pageDefinitions.id, pageDefId));
    }

    return result;
}
