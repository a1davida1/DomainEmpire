/**
 * Content Generation Pipeline
 * 
 * 6-stage AI pipeline for generating high-quality SEO content:
 * 1. Keyword Research (Grok fast)
 * 2. Outline Generation (Claude Sonnet)
 * 3. Draft Generation (Claude Sonnet)
 * 4. Humanization (Claude Sonnet)
 * 5. SEO Optimization (Claude Haiku)
 * 6. Meta Generation (Claude Haiku)
 */

import { db, articles, contentQueue, apiCallLogs, keywords, domains } from '@/lib/db';
import { getAIClient } from './openrouter';
import { eq, and } from 'drizzle-orm';
import { PROMPTS } from './prompts';
import { getOrCreateVoiceSeed } from './voice-seed';
import { createRevision } from '@/lib/audit/revisions';
import { classifyYmylLevel } from '@/lib/review/ymyl';
import { calculatorConfigSchema, comparisonDataSchema } from '@/lib/validation/articles';

// Helper to slugify string
function slugify(text: string) {
    return text.toString().toLowerCase()
        .replaceAll(/\s+/g, '-')           // Replace spaces with -
        .replaceAll(/[^\w-]+/g, '')        // Remove all non-word chars
        .replaceAll(/-+/g, '-')            // Replace multiple - with single -
        .replaceAll(/^-+/, '')             // Trim - from start of text
        .replaceAll(/-+$/, '');            // Trim - from end of text
}

// Content type enum values matching schema
type ContentType = 'article' | 'comparison' | 'calculator' | 'cost_guide' | 'lead_capture' | 'health_decision' | 'checklist' | 'faq' | 'review' | 'wizard';

// Helper: word-boundary test to avoid false positives like "Elvis" → "vs"
function wb(keyword: string, pattern: RegExp): boolean {
    return pattern.test(keyword);
}

// Helper to detect content type from keyword using word-boundary matching
export function getContentType(keyword: string): ContentType {
    const lower = keyword.toLowerCase();

    // Comparison: "vs", "versus", "compared to"
    if (wb(lower, /\bvs\b/) || wb(lower, /\bversus\b/) || lower.includes('compared to')) return 'comparison';

    // Calculator: exact tool-type words (not "tool" in "stool" or "toolkit")
    if (wb(lower, /\bcalculator\b/) || wb(lower, /\bestimator\b/) || wb(lower, /\bcompute\b/)) return 'calculator';
    if (wb(lower, /\btool\b/) && !wb(lower, /\btoolkit\b/) && !wb(lower, /\btoolbox\b/) && !wb(lower, /\btools\b/)) return 'calculator';

    // Cost guide
    if (wb(lower, /\bcost\b/) || wb(lower, /\bprice\b/) || lower.includes('how much') || wb(lower, /\bfee\b/)) return 'cost_guide';

    // Wizard: eligibility flows, decision trees, "which X is right for me"
    if (wb(lower, /\beligib/) || wb(lower, /\bqualify\b/) || lower.includes('find out if') || lower.includes('do i qualify')) return 'wizard';
    if (wb(lower, /\bwhich\b/) && lower.includes('right for')) return 'wizard';
    if (lower.includes('should i') && (lower.includes(' or ') || lower.includes('choose'))) return 'wizard';

    // Lead capture — exclude "case study", "showcase"
    if (wb(lower, /\blawyer\b/) || wb(lower, /\battorney\b/) || lower.includes('get a quote')) return 'lead_capture';
    if (wb(lower, /\bclaim\b/) && !lower.includes('claim to')) return 'lead_capture';
    if (wb(lower, /\bcase\b/) && !lower.includes('case study') && !lower.includes('showcase')) return 'lead_capture';

    // Health decision
    if (wb(lower, /\bsafe\b/) || lower.includes('side effects') || wb(lower, /\btreatment\b/) || wb(lower, /\bsymptom\b/) || wb(lower, /\bdiagnosis\b/)) return 'health_decision';

    // FAQ
    if (wb(lower, /\bfaq\b/) || wb(lower, /\bquestions\b/) || lower.includes('q&a') || wb(lower, /\banswered\b/)) return 'faq';

    // Checklist
    if (wb(lower, /\bchecklist\b/) || lower.includes('step by step') || lower.includes('steps to')) return 'checklist';

    // Review — exclude "best practices", "best way to"
    if (wb(lower, /\breview\b/)) return 'review';
    if (wb(lower, /\bbest\s/) && !lower.includes('best practice') && !lower.includes('best way to')) return 'review';
    if (wb(lower, /\btop\s\d/)) return 'review';

    return 'article';
}

// ===========================================
// PIPELINE PROCESSOR
// ===========================================

export async function processOutlineJob(jobId: string): Promise<void> {
    const ai = getAIClient();

    // Get job details (Worker handles missing job)
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];
    const payload = job.payload as { targetKeyword: string; secondaryKeywords: string[]; domainName: string };

    // Fetch article to get research data
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const article = articleRecord[0];
    const researchData = article?.researchData;

    // Detect content type early for outline customization
    const detectedType = getContentType(payload.targetKeyword);

    // Build content-type-specific outline instructions
    let typeSpecificInstructions = '';
    let typeSpecificJsonFields = '';

    if (detectedType === 'calculator') {
        typeSpecificInstructions = `
This is a CALCULATOR/TOOL page. In addition to the outline, design the calculator:
- Define input fields (what the user enters)
- Define output fields (what the calculator shows)
- Describe the formula/logic
- List key assumptions
- Include a methodology section explaining the math`;
        typeSpecificJsonFields = `,
  "calculatorConfig": {
    "inputs": [{ "id": "loan_amount", "label": "Loan Amount", "type": "number", "default": 250000, "min": 0, "max": 10000000, "step": 1000 }],
    "outputs": [{ "id": "monthly_payment", "label": "Monthly Payment", "format": "currency", "decimals": 2 }],
    "formula": "description of the formula logic",
    "assumptions": ["30-year fixed rate", "No PMI"],
    "methodology": "Explanation of how calculations work"
  }`;
    } else if (detectedType === 'comparison') {
        typeSpecificInstructions = `
This is a COMPARISON page. In addition to the outline, design the comparison table:
- Define 3-8 options being compared
- Define comparison columns/criteria
- Include a verdict/recommendation
- Each option should have scores for each column`;
        typeSpecificJsonFields = `,
  "comparisonData": {
    "options": [{ "name": "Option A", "badge": "Best Overall", "scores": { "price": 4, "features": 5 } }],
    "columns": [{ "key": "price", "label": "Price", "type": "rating", "sortable": true }],
    "defaultSort": "price",
    "verdict": "Our top pick is..."
  }`;
    }

    // Generate outline
    const outlinePrompt = `
You are an expert SEO content strategist. Create a detailed outline for:
KEYWORD: ${payload.targetKeyword}
CONTEXT: ${payload.domainName}

RESEARCH DATA (Use these facts):
${JSON.stringify(researchData || {})}
${typeSpecificInstructions}

Requirements:
1. Compelling H1 (with keyword)
2. 5-8 H2 sections (comprehensive)
3. 2-4 H3 subsections per H2
4. Intro & Conclusion
5. 3-5 FAQs (People Also Ask style)
6. Notes on where to add stats/examples from the research data

Respond with JSON:
{
  "title": "H1 title",
  "metaDescription": "155 char description",
  "outline": [
    { "heading": "H2", "level": 2, "subheadings": [{ "heading": "H3", "level": 3 }], "notes": "Notes" }
  ],
  "faqs": [{ "question": "Q", "answerHint": "A" }],
  "estimatedWordCount": 2500${typeSpecificJsonFields}
}`;

    const response = await ai.generateJSON<{
        title: string;
        metaDescription: string;
        outline: Array<{ heading: string; level: number; subheadings?: Array<{ heading: string; level: number }>; notes?: string }>;
        faqs: Array<{ question: string; answerHint: string }>;
        estimatedWordCount: number;
        calculatorConfig?: {
            inputs: Array<{ id: string; label: string; type: string; default?: number; min?: number; max?: number; step?: number; options?: Array<{ label: string; value: number }> }>;
            outputs: Array<{ id: string; label: string; format: string; decimals?: number }>;
            formula?: string;
            assumptions?: string[];
            methodology?: string;
        };
        comparisonData?: {
            options: Array<{ name: string; badge?: string; scores: Record<string, number> }>;
            columns: Array<{ key: string; label: string; type: string; sortable?: boolean }>;
            defaultSort?: string;
            verdict?: string;
        };
    }>(
        'outlineGeneration',
        outlinePrompt
    );

    // Log API call
    await db.insert(apiCallLogs).values({
        articleId: job.articleId,
        stage: 'outline',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    // Update article with outline data + content type + structured config
    const outlineUpdate: Record<string, unknown> = {
        title: response.data.title,
        metaDescription: response.data.metaDescription,
        headerStructure: response.data.outline,
        contentType: detectedType,
    };
    // Persist structured config from AI response if present (with validation)
    if (response.data.calculatorConfig) {
        const parsed = calculatorConfigSchema.safeParse(response.data.calculatorConfig);
        if (parsed.success) {
            outlineUpdate.calculatorConfig = parsed.data;
        } else {
            console.warn(`[Pipeline] Invalid calculatorConfig from AI for article ${job.articleId}:`, parsed.error.issues);
        }
    }
    if (response.data.comparisonData) {
        const parsed = comparisonDataSchema.safeParse(response.data.comparisonData);
        if (parsed.success) {
            outlineUpdate.comparisonData = parsed.data;
        } else {
            console.warn(`[Pipeline] Invalid comparisonData from AI for article ${job.articleId}:`, parsed.error.issues);
        }
    }
    await db.update(articles).set(outlineUpdate).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: response.data.title,
        contentMarkdown: null,
        metaDescription: response.data.metaDescription,
        changeType: 'ai_generated',
        changeSummary: 'Outline generated by AI',
    });

    // Mark job complete (Worker updates status, but Pipeline updates stats)
    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: response.data,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: String(response.cost.toFixed(2)),
    }).where(eq(contentQueue.id, jobId));

    // Queue next job (draft generation) - minimal payload
    await db.insert(contentQueue).values({
        jobType: 'generate_draft',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {
            targetKeyword: payload.targetKeyword,
            domainName: payload.domainName,
        },
        status: 'pending',
    });
}

export async function processDraftJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];
    const payload = job.payload as { targetKeyword: string; domainName: string };

    // Load outline from DB to avoid payload bloat
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const article = articleRecord[0];

    if (!article) {
        throw new Error(`Article not found: ${job.articleId}`);
    }

    const outline = article.headerStructure as any; // Cast for prompt construction

    if (!outline) throw new Error('Outline not found for article');

    // Fetch domain for voice seed
    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId!)).limit(1);
    const domain = domainRecord[0];

    if (!domain) {
        throw new Error(`Domain not found: ${job.domainId}`);
    }

    const voiceSeed = await getOrCreateVoiceSeed(job.domainId!, domain.domain, domain.niche || 'general');

    // Use contentType already set by outline stage; fall back to re-detection
    const contentType = (article.contentType as ContentType) || getContentType(payload.targetKeyword);

    let prompt = '';

    if (contentType === 'calculator') {
        prompt = PROMPTS.calculator(payload.targetKeyword, article.researchData, voiceSeed);
    } else if (contentType === 'comparison') {
        prompt = PROMPTS.comparison(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else if (contentType === 'cost_guide') {
        prompt = PROMPTS.costGuide(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else if (contentType === 'lead_capture') {
        prompt = PROMPTS.leadCapture(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else if (contentType === 'health_decision') {
        prompt = PROMPTS.healthDecision(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else {
        prompt = PROMPTS.article(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    }

    const response = await ai.generate(
        'draftGeneration',
        prompt
    );

    // Log call
    await db.insert(apiCallLogs).values({
        articleId: job.articleId,
        stage: 'draft',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    const wordCount = response.content.split(/\s+/).filter(Boolean).length;
    if (wordCount < 100 && contentType !== 'calculator') {
        throw new Error(`AI generated suspiciously short content (${wordCount} words). This usually indicates an error or refusal.`);
    }

    // Update article
    await db.update(articles).set({
        contentMarkdown: response.content,
        wordCount,
        generationPasses: 1,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: article.title,
        contentMarkdown: response.content,
        metaDescription: article.metaDescription,
        changeType: 'ai_generated',
        changeSummary: `Draft generated (${wordCount} words)`,
    });

    // Complete job
    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));

    // Queue humanization
    await db.insert(contentQueue).values({
        jobType: 'humanize',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {}, // Minimal payload, next stage reads from DB
        status: 'pending',
    });
}

export async function processHumanizeJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];

    // Load draft from DB
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const draft = articleRecord[0]?.contentMarkdown;

    if (!draft) throw new Error('Draft not found for humanization');

    // Fetch domain for voice seed persistence
    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId!)).limit(1);
    const domain = domainRecord[0];

    if (!domain) {
        console.error(`[Pipeline] Domain lookup failed for jobId: ${job.id}, domainId: ${job.domainId}`);
        throw new Error(`Domain lookup failed for article: ${job.domainId}`);
    }

    const voiceSeed = await getOrCreateVoiceSeed(job.domainId!, domain.domain, domain.niche || 'general');

    const response = await ai.generate(
        'humanization',
        PROMPTS.humanize(draft, voiceSeed)
    );

    await db.insert(apiCallLogs).values({
        articleId: job.articleId,
        stage: 'humanize',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    const wordCount = response.content.split(/\s+/).filter(Boolean).length;

    await db.update(articles).set({
        contentMarkdown: response.content,
        wordCount,
        generationPasses: 2,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: articleRecord[0]?.title || null,
        contentMarkdown: response.content,
        metaDescription: articleRecord[0]?.metaDescription || null,
        changeType: 'ai_refined',
        changeSummary: `Humanized (${wordCount} words)`,
    });

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));

    await db.insert(contentQueue).values({
        jobType: 'seo_optimize',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {},
        status: 'pending',
    });
}

export async function processSeoOptimizeJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];

    // Get article for content and keyword info
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const article = articleRecord[0];

    if (!article.contentMarkdown) throw new Error('Content not found for SEO optimization');

    // Fetch available internal links
    const publishedArticles = await db.select({ title: articles.title, slug: articles.slug })
        .from(articles)
        .where(and(eq(articles.domainId, job.domainId!), eq(articles.status, 'published')))
        .limit(20);

    const availableLinks = publishedArticles.map(a => ({
        title: a.title,
        url: `/${a.slug}`
    }));

    const response = await ai.generate(
        'seoOptimize',
        PROMPTS.seoOptimize(article.contentMarkdown, article.targetKeyword || '', article.secondaryKeywords || [], availableLinks)
    );

    await db.insert(apiCallLogs).values({
        articleId: job.articleId,
        stage: 'seo',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    const wordCount = response.content.split(/\s+/).filter(Boolean).length;

    await db.update(articles).set({
        contentMarkdown: response.content,
        wordCount,
        generationPasses: 3,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: article.title,
        contentMarkdown: response.content,
        metaDescription: article.metaDescription,
        changeType: 'ai_refined',
        changeSummary: `SEO optimized (${wordCount} words)`,
    });

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));

    await db.insert(contentQueue).values({
        jobType: 'generate_meta',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {},
        status: 'pending',
    });
}

export async function processMetaJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];

    // Load content
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const article = articleRecord[0];

    if (!article.contentMarkdown) throw new Error('Content not found for meta generation');

    const response = await ai.generateJSON<{
        title: string;
        metaDescription: string;
        ogTitle: string;
        ogDescription: string;
        schemaType: string;
        suggestedSlug: string;
    }>(
        'seoOptimize', // Meta uses Haiku or similar
        PROMPTS.meta(article.contentMarkdown, article.targetKeyword || '')
    );

    await db.insert(apiCallLogs).values({
        articleId: job.articleId,
        stage: 'meta',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    let safeSlug = slugify(response.data.suggestedSlug || response.data.title || '');
    if (!safeSlug) {
        safeSlug = slugify(response.data.title || '') || 'untitled';
    }

    // Classify YMYL level
    const domainForYmyl = await db.select({ niche: domains.niche }).from(domains).where(eq(domains.id, job.domainId!)).limit(1);
    const ymylLevel = classifyYmylLevel({
        niche: domainForYmyl[0]?.niche,
        keyword: article.targetKeyword,
        contentMarkdown: article.contentMarkdown,
    });

    await db.update(articles).set({
        title: response.data.title,
        metaDescription: response.data.metaDescription,
        slug: safeSlug,
        status: 'review', // Ready for human review
        generationPasses: 4,
        ymylLevel,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: response.data.title,
        contentMarkdown: article.contentMarkdown,
        metaDescription: response.data.metaDescription,
        changeType: 'ai_refined',
        changeSummary: 'Meta generated, moved to review',
    });

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: response.data,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
}

export async function processResearchJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];
    const payload = job.payload as { targetKeyword: string; domainName: string };

    const response = await ai.generateJSON<{
        statistics: Array<{ stat: string; source: string; date: string }>;
        quotes: Array<{ quote: string; author: string; source: string }>;
        competitorHooks: string[];
        recentDevelopments: string[];
    }>(
        'research',
        PROMPTS.research(payload.targetKeyword, payload.domainName)
    );

    await db.insert(apiCallLogs).values({
        articleId: job.articleId,
        stage: 'research',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    await db.update(articles).set({
        researchData: response.data,
    }).where(eq(articles.id, job.articleId!));

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: response.data,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));

    await db.insert(contentQueue).values({
        jobType: 'generate_outline',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {
            targetKeyword: payload.targetKeyword,
            domainName: payload.domainName
        },
        status: 'pending',
    });
}

const KEYWORD_RESEARCH_PROMPT = (domain: string, niche: string | null, subNiche: string | null, targetCount: number) => `
You are an SEO keyword research expert. Generate ${targetCount} high-value keyword opportunities for this website:

DOMAIN: ${domain}
NICHE: ${niche || 'General'}
SUB-NICHE: ${subNiche || 'Not specified'}

For each keyword, provide:
1. The exact keyword phrase (2-5 words preferred for long-tail)
2. Estimated monthly search volume (be realistic)
3. Keyword difficulty score (1-100)
4. Search intent: informational, commercial, transactional, or navigational
5. 2-3 variations or related keywords

Focus on:
- Long-tail keywords with clear commercial or informational intent
- Keywords a small authority site could realistically rank for (difficulty < 50)
- Mix of informational content (how-to, guides) and commercial (best, reviews)
- Keywords that suggest user readiness to take action

Return as JSON:
{
  "keywords": [
    {
      "keyword": "primary keyword phrase",
      "searchVolume": 1200,
      "difficulty": 35,
      "intent": "informational",
      "variations": ["variation 1", "variation 2"]
    }
  ]
}
`;

export async function processKeywordResearchJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];
    const payload = job.payload as { domain: string; niche: string | null; subNiche: string | null; targetCount: number };

    const response = await ai.generateJSON<{
        keywords: Array<{
            keyword: string;
            searchVolume: number;
            difficulty: number;
            intent: string;
            variations: string[];
        }>;
    }>(
        'keywordResearch',
        KEYWORD_RESEARCH_PROMPT(payload.domain, payload.niche, payload.subNiche, payload.targetCount)
    );

    // Track costs
    await db.insert(apiCallLogs).values({
        stage: 'keyword_research',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost.toFixed(4),
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    for (const kw of response.data.keywords) {
        const intent = ['informational', 'transactional', 'navigational', 'commercial'].includes(kw.intent)
            ? kw.intent as 'informational' | 'transactional' | 'navigational' | 'commercial'
            : 'informational';

        await db.insert(keywords).values({
            domainId: job.domainId!,
            keyword: kw.keyword,
            monthlyVolume: kw.searchVolume,
            difficulty: kw.difficulty,
            intent,
            status: 'queued',
        });
    }

    if (response.data.keywords.length > 0) {
        const sortedKeywords = [...response.data.keywords].sort((a, b) => {
            return (b.searchVolume / (b.difficulty || 1)) - (a.searchVolume / (a.difficulty || 1));
        });
        const bestKeyword = sortedKeywords[0];

        const newArticle = await db.insert(articles).values({
            domainId: job.domainId!,
            targetKeyword: bestKeyword.keyword,
            secondaryKeywords: bestKeyword.variations,
            title: bestKeyword.keyword,
            slug: slugify(bestKeyword.keyword),
            status: 'draft',
        }).returning({ id: articles.id });

        await db.insert(contentQueue).values({
            jobType: 'research', // Now using proper Research stage
            domainId: job.domainId!,
            articleId: newArticle[0].id,
            payload: {
                targetKeyword: bestKeyword.keyword,
                domainName: payload.domain,
            },
            status: 'pending',
            priority: 1,
        });
    }

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: { keywordsGenerated: response.data.keywords.length },
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
}

// Export all pipeline processors
export const pipelineProcessors = {
    generate_outline: processOutlineJob,
    generate_draft: processDraftJob,
    humanize: processHumanizeJob,
    seo_optimize: processSeoOptimizeJob,
    generate_meta: processMetaJob,
    keyword_research: processKeywordResearchJob,
    research: processResearchJob,
};
