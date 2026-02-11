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

// Helper to slugify string
function slugify(text: string) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w-]+/g, '')        // Remove all non-word chars
        .replace(/-+/g, '-')            // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
}

// Helper to detect content type from keyword
function getContentType(keyword: string): 'article' | 'comparison' | 'calculator' | 'costGuide' | 'leadCapture' | 'healthDecision' {
    const lower = keyword.toLowerCase();
    if (lower.includes(' vs ') || lower.includes(' versus ')) return 'comparison';
    if (lower.includes('calculator') || lower.includes('estimator') || lower.includes('tool')) return 'calculator';
    if (lower.includes('cost') || lower.includes('price') || lower.includes('how much')) return 'costGuide';
    if (lower.includes('case') || lower.includes('lawyer') || lower.includes('attorney') || lower.includes('claim')) return 'leadCapture';
    if (lower.includes('safe') || lower.includes('side effects') || lower.includes('treatment') || lower.includes('symptom')) return 'healthDecision';
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

    // Generate outline
    const outlinePrompt = `
You are an expert SEO content strategist. Create a detailed outline for:
KEYWORD: ${payload.targetKeyword}
CONTEXT: ${payload.domainName}

RESEARCH DATA (Use these facts):
${JSON.stringify(researchData || {})}

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
  "estimatedWordCount": 2500
}`;

    const response = await ai.generateJSON<{
        title: string;
        metaDescription: string;
        outline: Array<{ heading: string; level: number; subheadings?: Array<{ heading: string; level: number }>; notes?: string }>;
        faqs: Array<{ question: string; answerHint: string }>;
        estimatedWordCount: number;
    }>(
        'outlineGeneration',
        outlinePrompt
    );

    // Log API call
    await db.insert(apiCallLogs).values({
        articleId: job.articleId!,
        stage: 'outline',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
        domainId: job.domainId, // Added for completeness
    });

    // Update article with outline data
    await db.update(articles).set({
        title: response.data.title,
        metaDescription: response.data.metaDescription,
        headerStructure: response.data.outline,
    }).where(eq(articles.id, job.articleId!));

    // Mark job complete (Worker updates status, but Pipeline updates stats)
    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: response.data,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost,
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

    const contentType = getContentType(payload.targetKeyword);
    let prompt = '';

    if (contentType === 'calculator') {
        prompt = PROMPTS.calculator(payload.targetKeyword, article.researchData, voiceSeed);
    } else if (contentType === 'comparison') {
        prompt = PROMPTS.comparison(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else if (contentType === 'costGuide') {
        prompt = PROMPTS.costGuide(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else if (contentType === 'leadCapture') {
        prompt = PROMPTS.leadCapture(outline, payload.targetKeyword, payload.domainName, article.researchData, voiceSeed);
    } else if (contentType === 'healthDecision') {
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
        articleId: job.articleId!,
        stage: 'draft',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    const wordCount = response.content.split(/\s+/).filter(Boolean).length;

    // Update article
    await db.update(articles).set({
        contentMarkdown: response.content,
        wordCount,
        generationPasses: 1,
    }).where(eq(articles.id, job.articleId!));

    // Complete job
    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost,
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

    if (!domain) throw new Error(`Domain lookup failed for article: ${job.domainId}`);

    const voiceSeed = await getOrCreateVoiceSeed(job.domainId!, domain.domain, domain.niche || 'general');

    const response = await ai.generate(
        'humanization',
        PROMPTS.humanize(draft, voiceSeed)
    );

    await db.insert(apiCallLogs).values({
        articleId: job.articleId!,
        stage: 'humanize',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    const wordCount = response.content.split(/\s+/).filter(Boolean).length;

    await db.update(articles).set({
        contentMarkdown: response.content,
        wordCount,
        generationPasses: 2,
    }).where(eq(articles.id, job.articleId!));

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost,
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
        articleId: job.articleId!,
        stage: 'seo',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    const wordCount = response.content.split(/\s+/).filter(Boolean).length;

    await db.update(articles).set({
        contentMarkdown: response.content,
        wordCount,
        generationPasses: 3,
    }).where(eq(articles.id, job.articleId!));

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost,
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
        articleId: job.articleId!,
        stage: 'meta',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
        durationMs: response.durationMs,
        domainId: job.domainId,
    });

    let safeSlug = slugify(response.data.suggestedSlug || response.data.title || '');
    if (!safeSlug) {
        safeSlug = slugify(response.data.title || '') || 'untitled';
    }

    await db.update(articles).set({
        title: response.data.title,
        metaDescription: response.data.metaDescription,
        slug: safeSlug,
        status: 'review', // Ready for human review
        generationPasses: 4,
    }).where(eq(articles.id, job.articleId!));

    await db.update(contentQueue).set({
        status: 'completed',
        completedAt: new Date(),
        result: response.data,
        apiTokensUsed: response.inputTokens + response.outputTokens,
        apiCost: response.cost,
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
        articleId: job.articleId!,
        stage: 'research',
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.cost,
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
        apiCost: response.cost,
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
        cost: response.cost,
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
        apiCost: response.cost,
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
