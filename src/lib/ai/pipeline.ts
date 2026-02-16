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
import { eq, and, sql } from 'drizzle-orm';
import { PROMPTS } from './prompts';
import { createHash } from 'node:crypto';
import { getOrCreateVoiceSeed } from './voice-seed';
import { createRevision } from '@/lib/audit/revisions';
import { classifyYmylLevel } from '@/lib/review/ymyl';
import {
    calculatorConfigSchema,
    comparisonDataSchema,
    wizardConfigSchema,
    geoDataSchema,
    isAllowedLeadEndpoint,
} from '@/lib/validation/articles';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { generateResearchWithCache } from '@/lib/ai/research-cache';
import { buildDomainDifferentiationInstructions, buildIntentCoverageGuidance } from '@/lib/ai/differentiation';
import { isInternalLinkingEnabled } from '@/lib/content/link-policy';

// Helper to slugify string
function slugify(text: string) {
    return text.toString().toLowerCase()
        .replaceAll(/\s+/g, '-')           // Replace spaces with -
        .replaceAll(/[^\w-]+/g, '')        // Remove all non-word chars
        .replaceAll(/-+/g, '-')            // Replace multiple - with single -
        .replace(/^-+/, '')                // Trim - from start of text
        .replace(/-+$/, '');               // Trim - from end of text
}

type AiReviewerVerdict = 'approve' | 'reject';

type AiReviewEvaluation = {
    verdict: AiReviewerVerdict;
    confidence: number;
    requiresHumanReview: boolean;
    failures: string[];
    summary: string;
};

type AiReviewEvaluationWithUsage = AiReviewEvaluation & {
    promptBody: string;
    modelKey: string;
    model: string;
    resolvedModel: string;
    promptVersion: string;
    routingVersion: string;
    fallbackUsed: boolean;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
};

const DEFAULT_OPUS_REVIEW_MODEL = process.env.OPENROUTER_OPUS_REVIEW_MODEL || 'anthropic/claude-opus-4.1';

function isAiReviewFallbackEnabled(): boolean {
    return process.env.AI_REVIEW_FALLBACK_ENABLED === 'true';
}

function stripEmDashes(content: string): { content: string; changed: boolean } {
    const sanitized = content.replace(/\u2014/g, ' - ');
    return {
        content: sanitized,
        changed: sanitized !== content,
    };
}

function assertAllowedCollectLeadEndpoint(endpoint: string, articleId: string): void {
    const normalized = endpoint.trim();
    if (isAllowedLeadEndpoint(normalized)) return;

    console.error(
        `[Pipeline] Invalid collectLead endpoint for article ${articleId}: ${normalized}. `
        + 'Only internal paths or hosts in ALLOWED_LEAD_DOMAINS are allowed.',
    );
    throw new Error(`Invalid collectLead endpoint for article ${articleId}`);
}

type ApiLogStage =
    | 'keyword_research'
    | 'outline'
    | 'draft'
    | 'humanize'
    | 'seo'
    | 'meta'
    | 'classify'
    | 'research';

type ApiCallUsage = {
    modelKey: string;
    model: string;
    resolvedModel: string;
    promptVersion: string;
    routingVersion: string;
    fallbackUsed: boolean;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
};

function normalizePromptBody(prompt: string): string {
    return prompt.replaceAll('\r\n', '\n');
}

function promptHash(promptBody: string): string {
    return createHash('sha256').update(promptBody).digest('hex');
}

async function logApiCallWithPrompt(args: {
    articleId?: string | null;
    domainId?: string | null;
    stage: ApiLogStage;
    prompt: string;
    usage: ApiCallUsage;
}): Promise<void> {
    const promptBody = normalizePromptBody(args.prompt);
    await db.insert(apiCallLogs).values({
        articleId: args.articleId ?? null,
        stage: args.stage,
        modelKey: args.usage.modelKey,
        model: args.usage.model,
        resolvedModel: args.usage.resolvedModel,
        promptVersion: args.usage.promptVersion,
        routingVersion: args.usage.routingVersion,
        promptHash: promptHash(promptBody),
        promptBody,
        fallbackUsed: args.usage.fallbackUsed,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        cost: Number(args.usage.cost.toFixed(4)),
        durationMs: args.usage.durationMs,
        domainId: args.domainId ?? null,
    });
}

async function evaluateWithAiReviewer(opts: {
    ai: ReturnType<typeof getAIClient>;
    contentMarkdown: string;
    keyword: string;
    title: string;
}): Promise<AiReviewEvaluationWithUsage> {
    const prompt = PROMPTS.aiReview(opts.contentMarkdown, opts.keyword, opts.title);
    const response = await opts.ai.generateJSON<AiReviewEvaluation>(
        'aiReview',
        prompt,
        {
            model: DEFAULT_OPUS_REVIEW_MODEL,
            temperature: 0.1,
            maxTokens: 1200,
        },
    );

    return {
        verdict: response.data.verdict === 'approve' ? 'approve' : 'reject',
        confidence: typeof response.data.confidence === 'number' ? response.data.confidence : 0,
        requiresHumanReview: response.data.requiresHumanReview !== false,
        failures: Array.isArray(response.data.failures) ? response.data.failures : [],
        summary: response.data.summary || '',
        promptBody: prompt,
        modelKey: response.modelKey,
        model: response.model,
        resolvedModel: response.resolvedModel,
        promptVersion: response.promptVersion,
        routingVersion: response.routingVersion,
        fallbackUsed: response.fallbackUsed,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
    };
}

// Content type enum values matching schema
type ContentType =
    | 'article'
    | 'comparison'
    | 'calculator'
    | 'cost_guide'
    | 'lead_capture'
    | 'health_decision'
    | 'checklist'
    | 'faq'
    | 'review'
    | 'wizard'
    | 'configurator'
    | 'quiz'
    | 'survey'
    | 'assessment'
    | 'interactive_infographic'
    | 'interactive_map';

// Helper: word-boundary test to avoid false positives like "Elvis" → "vs"
function wb(keyword: string, pattern: RegExp): boolean {
    return pattern.test(keyword);
}

// Helper to detect content type from keyword using word-boundary matching
export function getContentType(keyword: string): ContentType {
    const lower = keyword.toLowerCase();

    // Dedicated interactive formats
    if (wb(lower, /\bquiz\b/) || lower.includes('knowledge check') || lower.includes('test yourself')) return 'quiz';
    if (wb(lower, /\bsurvey\b/) || wb(lower, /\bquestionnaire\b/) || wb(lower, /\bpoll\b/)) return 'survey';
    if (wb(lower, /\bassessment\b/) || wb(lower, /\bself[- ]assessment\b/) || lower.includes('score yourself')) return 'assessment';
    if (wb(lower, /\bconfigurator\b/) || lower.includes('build your own') || lower.includes('customize')) return 'configurator';
    if (wb(lower, /\binfographic\b/) || lower.includes('data visualization') || lower.includes('visual breakdown')) return 'interactive_infographic';
    if (wb(lower, /\binteractive map\b/) || lower.includes('map by state') || lower.includes('regional map')) return 'interactive_map';

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

    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId!)).limit(1);
    const domain = domainRecord[0];
    if (!domain) {
        throw new Error(`Domain not found: ${job.domainId}`);
    }

    const differentiationInstructions = buildDomainDifferentiationInstructions({
        domainId: domain.id,
        domainName: domain.domain,
        niche: domain.niche,
        bucket: domain.bucket,
        keyword: payload.targetKeyword,
        stage: 'outline',
    });

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
    } else if (
        detectedType === 'wizard'
        || detectedType === 'configurator'
        || detectedType === 'quiz'
        || detectedType === 'survey'
        || detectedType === 'assessment'
    ) {
        const needsScoring = detectedType === 'quiz' || detectedType === 'assessment';
        const scoringInstructions = needsScoring
            ? '\n- Define scoring logic using `scoring` with weighted fields and named score bands'
            : '';
        const scoringJson = needsScoring
            ? `,
    "scoring": {
      "method": "weighted",
      "weights": { "goal": 50, "budget": 50 },
      "valueMap": {
        "goal": { "save": 90, "speed": 60 },
        "budget": { "low": 40, "medium": 70, "high": 95 }
      },
      "bands": [
        { "min": 0, "max": 39, "label": "Early Stage", "description": "Foundational work needed first." },
        { "min": 40, "max": 69, "label": "Developing", "description": "Good baseline with room to optimize." },
        { "min": 70, "max": 100, "label": "Ready", "description": "Strong position for immediate action." }
      ],
      "outcomes": [
        { "min": 0, "max": 39, "title": "Build fundamentals first", "body": "Focus on reducing risk and gathering more data." },
        { "min": 40, "max": 69, "title": "Promising with caveats", "body": "You can proceed, but optimize weak areas first." },
        { "min": 70, "max": 100, "title": "Strong fit", "body": "This looks like a high-confidence match for immediate action." }
      ]
    }`
            : '';
        typeSpecificInstructions = `
This is an INTERACTIVE FLOW page. In addition to the outline, design a multi-step flow:
- Define 3-6 steps with clear question prompts
- Define fields per step (radio, checkbox, select, number, text)
- Define result rules and recommendation outcomes
- Include optional lead capture consent if appropriate${scoringInstructions}`;
        typeSpecificJsonFields = `,
  "wizardConfig": {
    "steps": [
      {
        "id": "step_1",
        "title": "Start",
        "description": "Gather baseline information",
        "fields": [
          {
            "id": "goal",
            "type": "radio",
            "label": "What is your goal?",
            "options": [{ "value": "save", "label": "Save money" }, { "value": "speed", "label": "Save time" }],
            "required": true
          }
        ]
      }
    ],
    "resultRules": [
      {
        "condition": "goal == 'save'",
        "title": "Savings-first path",
        "body": "You should focus on low-cost options first."
      }
    ],
    "resultTemplate": "recommendation"${scoringJson}
  }`;
    } else if (detectedType === 'interactive_infographic') {
        typeSpecificInstructions = `
This is an INTERACTIVE INFOGRAPHIC page:
- Define visual comparison blocks and key metrics
- Provide grouped categories for filtering
- Include a short narrative summary for each metric`;
        typeSpecificJsonFields = `,
  "comparisonData": {
    "options": [{ "name": "Category A", "badge": "Top", "scores": { "impact": 4, "cost": 3 } }],
    "columns": [{ "key": "impact", "label": "Impact", "type": "rating", "sortable": true }],
    "verdict": "Category A stands out for most readers."
  }`;
    } else if (detectedType === 'interactive_map') {
        typeSpecificInstructions = `
This is an INTERACTIVE MAP page:
- Include region/state-level sections
- Provide a fallback national summary
- Keep each region block concise and actionable`;
        typeSpecificJsonFields = `,
  "geoData": {
    "regions": {
      "west": { "label": "West", "content": "<p>Regional guidance for western states.</p>" },
      "midwest": { "label": "Midwest", "content": "<p>Regional guidance for midwest states.</p>" }
    },
    "fallback": "<p>General nationwide guidance for all readers.</p>"
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

${differentiationInstructions}

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
        wizardConfig?: {
            steps: Array<{
                id: string;
                title: string;
                description?: string;
                fields: Array<{
                    id: string;
                    type: 'radio' | 'checkbox' | 'select' | 'number' | 'text';
                    label: string;
                    options?: Array<{ value: string; label: string }>;
                    required?: boolean;
                }>;
                nextStep?: string;
                branches?: Array<{ condition: string; goTo: string }>;
            }>;
            resultRules: Array<{
                condition: string;
                title: string;
                body: string;
                cta?: { text: string; url: string };
            }>;
            resultTemplate: 'summary' | 'recommendation' | 'score' | 'eligibility';
            collectLead?: {
                fields: string[];
                consentText: string;
                endpoint: string;
            };
            scoring?: {
                method?: 'completion' | 'weighted';
                weights?: Record<string, number>;
                valueMap?: Record<string, Record<string, number>>;
                bands?: Array<{
                    min: number;
                    max: number;
                    label: string;
                    description?: string;
                }>;
                outcomes?: Array<{
                    min: number;
                    max: number;
                    title: string;
                    body: string;
                    cta?: { text: string; url: string };
                }>;
            };
        };
        geoData?: {
            regions?: Record<string, { content: string; label?: string }>;
            fallback: string;
        };
    }>(
        'outlineGeneration',
        outlinePrompt
    );

    await logApiCallWithPrompt({
        articleId: job.articleId,
        domainId: job.domainId,
        stage: 'outline',
        prompt: outlinePrompt,
        usage: response,
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
    if (response.data.wizardConfig) {
        const parsed = wizardConfigSchema.safeParse(response.data.wizardConfig);
        if (parsed.success) {
            const collectLeadEndpoint = parsed.data.collectLead?.endpoint;
            if (collectLeadEndpoint) {
                assertAllowedCollectLeadEndpoint(collectLeadEndpoint, job.articleId ?? 'unknown');
            }
            outlineUpdate.wizardConfig = parsed.data;
        } else {
            console.warn(`[Pipeline] Invalid wizardConfig from AI for article ${job.articleId}:`, parsed.error.issues);
        }
    }
    if (response.data.geoData) {
        const parsed = geoDataSchema.safeParse(response.data.geoData);
        if (parsed.success) {
            outlineUpdate.geoData = parsed.data;
        } else {
            console.warn(`[Pipeline] Invalid geoData from AI for article ${job.articleId}:`, parsed.error.issues);
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

    // Queue next job BEFORE marking current complete — if enqueue fails,
    // this job stays in processing and stale lock recovery will retry it.
    await enqueueContentJob({
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

    // Mark job complete (Worker updates status, but Pipeline updates stats)
    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: response.data,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: String(response.cost.toFixed(2)),
    }).where(eq(contentQueue.id, jobId));
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

    const outline = article.headerStructure as Record<string, unknown>; // Cast for prompt construction

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

    const differentiationInstructions = buildDomainDifferentiationInstructions({
        domainId: domain.id,
        domainName: domain.domain,
        niche: domain.niche,
        bucket: domain.bucket,
        keyword: payload.targetKeyword,
        stage: 'draft',
    });
    const promptWithDifferentiation = `${differentiationInstructions}\n\n${prompt}`;

    const response = await ai.generate(
        'draftGeneration',
        promptWithDifferentiation
    );

    await logApiCallWithPrompt({
        articleId: job.articleId,
        domainId: job.domainId,
        stage: 'draft',
        prompt: promptWithDifferentiation,
        usage: response,
    });

    const sanitizedDraft = stripEmDashes(response.content).content;
    const wordCount = sanitizedDraft.split(/\s+/).filter(Boolean).length;
    const shortFormTypes = new Set([
        'calculator',
        'wizard',
        'configurator',
        'quiz',
        'survey',
        'assessment',
        'interactive_infographic',
        'interactive_map',
    ]);
    if (wordCount < 100 && !shortFormTypes.has(contentType)) {
        throw new Error(`AI generated suspiciously short content (${wordCount} words). This usually indicates an error or refusal.`);
    }

    // Update article
    await db.update(articles).set({
        contentMarkdown: sanitizedDraft,
        wordCount,
        generationPasses: 1,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: article.title,
        contentMarkdown: sanitizedDraft,
        metaDescription: article.metaDescription,
        changeType: 'ai_generated',
        changeSummary: `Draft generated (${wordCount} words)`,
    });

    // Queue next step BEFORE marking current complete — prevents article orphan
    await enqueueContentJob({
        jobType: 'humanize',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {}, // Minimal payload, next stage reads from DB
        status: 'pending',
    });

    // Complete job
    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
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

    const differentiationInstructions = buildDomainDifferentiationInstructions({
        domainId: domain.id,
        domainName: domain.domain,
        niche: domain.niche,
        bucket: domain.bucket,
        keyword: articleRecord[0]?.targetKeyword || undefined,
        stage: 'humanize',
    });

    const humanizePrompt = `${differentiationInstructions}\n\n${PROMPTS.humanize(draft, voiceSeed)}`;
    const response = await ai.generate('humanization', humanizePrompt);

    await logApiCallWithPrompt({
        articleId: job.articleId,
        domainId: job.domainId,
        stage: 'humanize',
        prompt: humanizePrompt,
        usage: response,
    });

    const sanitizedHumanized = stripEmDashes(response.content).content;
    const wordCount = sanitizedHumanized.split(/\s+/).filter(Boolean).length;

    await db.update(articles).set({
        contentMarkdown: sanitizedHumanized,
        wordCount,
        generationPasses: 2,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: articleRecord[0]?.title || null,
        contentMarkdown: sanitizedHumanized,
        metaDescription: articleRecord[0]?.metaDescription || null,
        changeType: 'ai_refined',
        changeSummary: `Humanized (${wordCount} words)`,
    });

    // Queue next step BEFORE marking current complete — prevents article orphan
    await enqueueContentJob({
        jobType: 'seo_optimize',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {},
        status: 'pending',
    });

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
}

export async function processSeoOptimizeJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];

    // Get article for content and keyword info
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const article = articleRecord[0];

    if (!article.contentMarkdown) throw new Error('Content not found for SEO optimization');

    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId!)).limit(1);
    const domain = domainRecord[0];
    if (!domain) {
        throw new Error(`Domain not found: ${job.domainId}`);
    }

    let availableLinks: Array<{ title: string; url: string }> = [];
    if (isInternalLinkingEnabled()) {
        const publishedArticles = await db.select({ title: articles.title, slug: articles.slug })
            .from(articles)
            .where(and(eq(articles.domainId, job.domainId!), eq(articles.status, 'published')))
            .limit(20);

        availableLinks = publishedArticles.map((a) => ({
            title: a.title,
            url: `/${a.slug}`,
        }));
    }

    const differentiationInstructions = buildDomainDifferentiationInstructions({
        domainId: domain.id,
        domainName: domain.domain,
        niche: domain.niche,
        bucket: domain.bucket,
        keyword: article.targetKeyword || undefined,
        stage: 'seo',
    });

    const seoPrompt = `${differentiationInstructions}\n\n${PROMPTS.seoOptimize(
        article.contentMarkdown,
        article.targetKeyword || '',
        article.secondaryKeywords || [],
        availableLinks,
    )}`;
    const response = await ai.generate('seoOptimize', seoPrompt);

    await logApiCallWithPrompt({
        articleId: job.articleId,
        domainId: job.domainId,
        stage: 'seo',
        prompt: seoPrompt,
        usage: response,
    });

    const sanitizedSeoContent = stripEmDashes(response.content).content;
    const wordCount = sanitizedSeoContent.split(/\s+/).filter(Boolean).length;

    await db.update(articles).set({
        contentMarkdown: sanitizedSeoContent,
        wordCount,
        generationPasses: 3,
    }).where(eq(articles.id, job.articleId!));

    await createRevision({
        articleId: job.articleId!,
        title: article.title,
        contentMarkdown: sanitizedSeoContent,
        metaDescription: article.metaDescription,
        changeType: 'ai_refined',
        changeSummary: `SEO optimized (${wordCount} words)`,
    });

    // Queue next step BEFORE marking current complete — prevents article orphan
    await enqueueContentJob({
        jobType: 'generate_meta',
        domainId: job.domainId,
        articleId: job.articleId,
        priority: job.priority,
        payload: {},
        status: 'pending',
    });

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
}

export async function processMetaJob(jobId: string): Promise<void> {
    const ai = getAIClient();
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];

    // Load content
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const article = articleRecord[0];

    if (!article.contentMarkdown) throw new Error('Content not found for meta generation');
    const normalizedContent = stripEmDashes(article.contentMarkdown).content;

    const metaPrompt = PROMPTS.meta(normalizedContent, article.targetKeyword || '');
    const response = await ai.generateJSON<{
        title: string;
        metaDescription: string;
        ogTitle: string;
        ogDescription: string;
        schemaType: string;
        suggestedSlug: string;
    }>(
        'seoOptimize', // Meta uses Haiku or similar
        metaPrompt
    );

    await logApiCallWithPrompt({
        articleId: job.articleId,
        domainId: job.domainId,
        stage: 'meta',
        prompt: metaPrompt,
        usage: response,
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
        contentMarkdown: normalizedContent,
    });

    let aiReview: AiReviewEvaluationWithUsage | null = null;
    let aiReviewFallbackError: string | null = null;

    if (isAiReviewFallbackEnabled()) {
        try {
            aiReview = await evaluateWithAiReviewer({
                ai,
                contentMarkdown: normalizedContent,
                keyword: article.targetKeyword || '',
                title: response.data.title,
            });

            await logApiCallWithPrompt({
                articleId: job.articleId,
                domainId: job.domainId,
                stage: 'classify',
                prompt: aiReview.promptBody,
                usage: aiReview,
            });
        } catch (error) {
            aiReviewFallbackError = error instanceof Error ? error.message : 'AI reviewer unavailable';
            console.error('AI reviewer fallback failed, routing to human review:', error);
        }
    }

    const autoApprovedByAi = Boolean(
        aiReview
        && aiReview.verdict === 'approve'
        && aiReview.requiresHumanReview === false
        && aiReview.failures.length === 0,
    );

    const nextStatus = autoApprovedByAi ? 'approved' : 'review';
    const nextGenerationPasses = aiReview ? 5 : 4;
    const reviewTimestamp = new Date();

    await db.update(articles).set({
        title: response.data.title,
        metaDescription: response.data.metaDescription,
        slug: safeSlug,
        contentMarkdown: normalizedContent,
        status: nextStatus,
        reviewRequestedAt: nextStatus === 'review' ? reviewTimestamp : null,
        lastReviewedAt: nextStatus === 'approved' ? reviewTimestamp : null,
        generationPasses: nextGenerationPasses,
        ymylLevel,
    }).where(eq(articles.id, job.articleId!));

    const revisionSummary = autoApprovedByAi
        ? 'Meta generated, approved by AI reviewer fallback (Opus)'
        : aiReview
            ? 'Meta generated, AI reviewer flagged for human review'
            : 'Meta generated, moved to review';

    await createRevision({
        articleId: job.articleId!,
        title: response.data.title,
        contentMarkdown: normalizedContent,
        metaDescription: response.data.metaDescription,
        changeType: 'ai_refined',
        changeSummary: revisionSummary,
    });

    const queueResult = aiReview
        ? {
            ...response.data,
            aiReview: {
                verdict: aiReview.verdict,
                confidence: aiReview.confidence,
                requiresHumanReview: aiReview.requiresHumanReview,
                failures: aiReview.failures,
                summary: aiReview.summary,
                model: aiReview.model,
                modelKey: aiReview.modelKey,
                resolvedModel: aiReview.resolvedModel,
                promptVersion: aiReview.promptVersion,
                routingVersion: aiReview.routingVersion,
                fallbackUsed: aiReview.fallbackUsed,
            },
            aiReviewerFallbackError: aiReviewFallbackError,
            finalStatus: nextStatus,
        }
        : {
            ...response.data,
            aiReviewerFallbackError: aiReviewFallbackError,
            finalStatus: nextStatus,
        };

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: queueResult,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
}

export async function processResearchJob(jobId: string): Promise<void> {
    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    const job = jobs[0];
    const payload = job.payload as {
        targetKeyword: string;
        domainName: string;
        domainPriority?: number;
    };

    const emptyResearch = {
        statistics: [],
        quotes: [],
        competitorHooks: [],
        recentDevelopments: [],
    };

    const researchPrompt = PROMPTS.research(payload.targetKeyword, payload.domainName);
    const response = await generateResearchWithCache<{
        statistics: Array<{ stat: string; source: string; date: string }>;
        quotes: Array<{ quote: string; author: string; source: string }>;
        competitorHooks: string[];
        recentDevelopments: string[];
    }>({
        queryText: `${payload.targetKeyword} @ ${payload.domainName}`,
        prompt: researchPrompt,
        domainPriority: typeof payload.domainPriority === 'number' ? payload.domainPriority : 0,
        emptyResult: emptyResearch,
        queueRefreshOnMiss: true,
    });

    await logApiCallWithPrompt({
        articleId: job.articleId,
        domainId: job.domainId,
        stage: 'research',
        prompt: researchPrompt,
        usage: response,
    });

    await db.update(articles).set({
        researchData: response.data,
    }).where(eq(articles.id, job.articleId!));

    // Queue next step BEFORE marking current complete — prevents article orphan
    await enqueueContentJob({
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

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: {
            ...response.data,
            cacheStatus: response.cacheStatus,
            cacheEntries: response.cacheEntries,
        },
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost.toFixed(2),
    }).where(eq(contentQueue.id, jobId));
}

const KEYWORD_RESEARCH_PROMPT = (
    domain: string,
    niche: string | null,
    subNiche: string | null,
    targetCount: number,
    intentCoverageGuidance: string,
    differentiationInstructions: string,
) => `
You are an SEO keyword research expert. Generate ${targetCount} high-value keyword opportunities for this website:

DOMAIN: ${domain}
NICHE: ${niche || 'General'}
SUB-NICHE: ${subNiche || 'Not specified'}

${differentiationInstructions}

INTENT COVERAGE PRIORITY:
${intentCoverageGuidance}

For each keyword, provide:
1. The exact keyword phrase (2-5 words preferred for long-tail)
2. Estimated monthly search volume (be realistic)
3. Keyword difficulty score (1-100)
4. Search intent: informational, commercial, transactional, or navigational
5. 2-3 variations or related keywords

Focus on:
- Long-tail keywords with clear commercial or informational intent
- Keywords a small authority site could realistically rank for (difficulty < 50)
- Mix of informational, commercial, transactional, and navigational opportunities
- Keywords that suggest user readiness to take action
- Keyword phrasing that reflects this domain's unique perspective and niche framing
- Avoid generic or repetitive phrasing patterns across batches

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

    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId!)).limit(1);
    const domain = domainRecord[0];
    if (!domain) {
        throw new Error(`Domain not found: ${job.domainId}`);
    }

    const existingIntentRows = await db
        .select({
            intent: keywords.intent,
            count: sql<number>`count(*)::int`,
        })
        .from(keywords)
        .where(eq(keywords.domainId, job.domainId!))
        .groupBy(keywords.intent);

    const intentCounts = existingIntentRows.reduce<Record<string, number>>((acc, row) => {
        const key = row.intent || 'informational';
        acc[key] = row.count;
        return acc;
    }, {});

    const intentCoverageGuidance = buildIntentCoverageGuidance(intentCounts, payload.targetCount);
    const differentiationInstructions = buildDomainDifferentiationInstructions({
        domainId: domain.id,
        domainName: domain.domain,
        niche: domain.niche,
        bucket: domain.bucket,
        stage: 'keyword_research',
    });

    const keywordResearchPrompt = KEYWORD_RESEARCH_PROMPT(
        payload.domain,
        payload.niche,
        payload.subNiche,
        payload.targetCount,
        intentCoverageGuidance,
        differentiationInstructions,
    );
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
        keywordResearchPrompt,
    );

    await logApiCallWithPrompt({
        domainId: job.domainId,
        stage: 'keyword_research',
        prompt: keywordResearchPrompt,
        usage: response,
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
        }).onConflictDoUpdate({
            target: [keywords.domainId, keywords.keyword],
            set: {
                monthlyVolume: kw.searchVolume,
                difficulty: kw.difficulty,
                intent,
            },
        });
    }

    if (response.data.keywords.length > 0) {
        const maxIntentCount = Math.max(...Object.values(intentCounts), 0);
        const intentWeight = (intent: string): number => {
            const count = intentCounts[intent] ?? 0;
            if (maxIntentCount <= 0) return 1.2;
            return 1 + ((maxIntentCount - count) / Math.max(maxIntentCount, 1)) * 0.4;
        };

        const sortedKeywords = [...response.data.keywords].sort((a, b) => {
            const scoreA = (a.searchVolume / (a.difficulty || 1)) * intentWeight(a.intent);
            const scoreB = (b.searchVolume / (b.difficulty || 1)) * intentWeight(b.intent);
            return scoreB - scoreA;
        });
        const bestKeyword = sortedKeywords[0];

        const baseSlug = slugify(bestKeyword.keyword) || `article-${job.id.slice(0, 8)}`;
        let newArticleId: string | null = null;

        for (let attempt = 0; attempt < 25; attempt += 1) {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
            const created = await db.insert(articles).values({
                domainId: job.domainId!,
                targetKeyword: bestKeyword.keyword,
                secondaryKeywords: bestKeyword.variations,
                title: bestKeyword.keyword,
                slug,
                status: 'draft',
            }).onConflictDoNothing().returning({ id: articles.id });

            if (created[0]?.id) {
                newArticleId = created[0].id;
                break;
            }
        }

        if (!newArticleId) {
            throw new Error(`Unable to create unique draft article slug for domain ${job.domainId}`);
        }

        await enqueueContentJob({
            jobType: 'research', // Now using proper Research stage
            domainId: job.domainId!,
            articleId: newArticleId,
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
