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
import { eq } from 'drizzle-orm';

// ===========================================
// PROMPTS FOR EACH STAGE
// ===========================================

import { PROMPTS } from './prompts';
import { getOrCreateVoiceSeed } from './voice-seed';

// Helper to slugify string
function slugify(text: string) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
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

    // Get job details
    const jobs = await db
        .select()
        .from(contentQueue)
        .where(eq(contentQueue.id, jobId))
        .limit(1);

    if (jobs.length === 0) {
        throw new Error(`Job ${jobId} not found`);
    }

    const job = jobs[0];
    const payload = job.payload as { targetKeyword: string; secondaryKeywords: string[]; domainName: string };

    // Mark as processing
    await db
        .update(contentQueue)
        .set({ status: 'processing', startedAt: new Date() })
        .where(eq(contentQueue.id, jobId));

    // Fetch article to get research data
    const articleRecord = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    const researchData = articleRecord[0]?.researchData;

    try {
        // Generate outline
        // (We use a simple inline prompt for outline or export one in PROMPTS if preferred)
        // For now, retaining a simplified inline prompt or using a new one if added to PROMPTS.
        // Actually, let's keep the outline prompt inline for now as it wasn't replaced by Antigravity prompts yet.
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
        });

        // Update article with outline data
        await db
            .update(articles)
            .set({
                title: response.data.title,
                metaDescription: response.data.metaDescription,
                headerStructure: response.data.outline,
            })
            .where(eq(articles.id, job.articleId!));

        // Mark job complete
        await db
            .update(contentQueue)
            .set({
                status: 'completed',
                completedAt: new Date(),
                result: response.data,
                apiTokensUsed: response.inputTokens + response.outputTokens,
                apiCost: response.cost,
            })
            .where(eq(contentQueue.id, jobId));

        // Queue next job (draft generation)
        await db.insert(contentQueue).values({
            jobType: 'generate_draft',
            domainId: job.domainId,
            articleId: job.articleId,
            priority: job.priority,
            payload: {
                outline: response.data,
                targetKeyword: payload.targetKeyword,
                domainName: payload.domainName,
            },
            status: 'pending',
        });
    } catch (error) {
        await db
            .update(contentQueue)
            .set({
                status: 'failed',
                errorMessage: error instanceof Error ? error.message : String(error),
                attempts: (job.attempts || 0) + 1,
            })
            .where(eq(contentQueue.id, jobId));

        // Also update article status
        await db
            .update(articles)
            .set({ status: 'draft' }) // Fall back to draft so user can retry
            .where(eq(articles.id, job.articleId!));

        throw error;
    }
}

export async function processDraftJob(jobId: string): Promise<void> {
    const ai = getAIClient();

    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as { outline: object; targetKeyword: string; domainName: string };

    await db.update(contentQueue).set({ status: 'processing', startedAt: new Date() }).where(eq(contentQueue.id, jobId));

    try {
        // Fetch domain for voice seed
        const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId!)).limit(1);
        const domain = domainRecord[0];
        // Lazily generate voice seed if not present
        const voiceSeed = await getOrCreateVoiceSeed(job.domainId!, domain.domain, domain.niche || 'general');

        const contentType = getContentType(payload.targetKeyword);
        let prompt = '';

        if (contentType === 'calculator') {
            prompt = PROMPTS.calculator(payload.targetKeyword);
        } else if (contentType === 'comparison') {
            prompt = PROMPTS.comparison(payload.outline, payload.targetKeyword, payload.domainName);
        } else if (contentType === 'costGuide') {
            prompt = PROMPTS.costGuide(payload.outline, payload.targetKeyword, payload.domainName);
        } else if (contentType === 'leadCapture') {
            prompt = PROMPTS.leadCapture(payload.outline, payload.targetKeyword, payload.domainName);
        } else if (contentType === 'healthDecision') {
            prompt = PROMPTS.healthDecision(payload.outline, payload.targetKeyword, payload.domainName);
        } else {
            // Standard article with voice seed
            prompt = PROMPTS.article(payload.outline, payload.targetKeyword, payload.domainName, voiceSeed);
        }

        const response = await ai.generate(
            'draftGeneration',
            prompt
        );

        await db.insert(apiCallLogs).values({
            articleId: job.articleId!,
            stage: 'draft',
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost,
            durationMs: response.durationMs,
        });

        // Count words
        const wordCount = response.content.split(/\s+/).filter(Boolean).length;

        await db.update(articles).set({
            contentMarkdown: response.content,
            wordCount,
            generationPasses: 1,
        }).where(eq(articles.id, job.articleId!));

        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            apiTokensUsed: response.inputTokens + response.outputTokens,
            apiCost: response.cost,
        }).where(eq(contentQueue.id, jobId));

        // Queue humanization job
        await db.insert(contentQueue).values({
            jobType: 'humanize',
            domainId: job.domainId,
            articleId: job.articleId,
            priority: job.priority,
            payload: { draft: response.content },
            status: 'pending',
        });
    } catch (error) {
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
        }).where(eq(contentQueue.id, jobId));
        throw error;
    }
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

export async function processResearchJob(jobId: string): Promise<void> {
    const ai = getAIClient();

    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as { targetKeyword: string; domainName: string };

    await db.update(contentQueue).set({ status: 'processing', startedAt: new Date() }).where(eq(contentQueue.id, jobId));

    try {
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
            stage: 'research' as any, // Cast to any until TS picks up schema change
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost,
            durationMs: response.durationMs,
        });

        // Save research data to article
        await db.update(articles).set({
            researchData: response.data,
            // status: 'researching' // optional, keep as draft/queued
        }).where(eq(articles.id, job.articleId!));

        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            result: response.data,
            apiTokensUsed: response.inputTokens + response.outputTokens,
            apiCost: response.cost,
        }).where(eq(contentQueue.id, jobId));

        // Queue next job: generate_outline
        await db.insert(contentQueue).values({
            jobType: 'generate_outline',
            domainId: job.domainId,
            articleId: job.articleId,
            priority: job.priority,
            payload: {
                targetKeyword: payload.targetKeyword,
                secondaryKeywords: [], // research prompt doesn't extract secondary keywords, maybe add later or pass from payload
                domainName: payload.domainName
            },
            status: 'pending',
        });

    } catch (error) {
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
        }).where(eq(contentQueue.id, jobId));
        throw error;
    }
}

export async function processHumanizeJob(jobId: string): Promise<void> {
    const ai = getAIClient();

    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as { draft: string };

    await db.update(contentQueue).set({ status: 'processing', startedAt: new Date() }).where(eq(contentQueue.id, jobId));

    try {
        const response = await ai.generate(
            'humanization',
            PROMPTS.humanize(payload.draft)
        );

        await db.insert(apiCallLogs).values({
            articleId: job.articleId!,
            stage: 'humanize',
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost,
            durationMs: response.durationMs,
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

        // Queue SEO optimization
        await db.insert(contentQueue).values({
            jobType: 'seo_optimize',
            domainId: job.domainId,
            articleId: job.articleId,
            priority: job.priority,
            payload: { content: response.content },
            status: 'pending',
        });
    } catch (error) {
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
        }).where(eq(contentQueue.id, jobId));
        throw error;
    }
}

export async function processSeoOptimizeJob(jobId: string): Promise<void> {
    const ai = getAIClient();

    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as { content: string };

    // Get article for keyword info
    const articleData = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    if (articleData.length === 0) throw new Error(`Article not found for job ${jobId}`);

    const article = articleData[0];

    await db.update(contentQueue).set({ status: 'processing', startedAt: new Date() }).where(eq(contentQueue.id, jobId));

    try {
        const response = await ai.generate(
            'seoOptimize',
            PROMPTS.seoOptimize(payload.content, article.targetKeyword || '', article.secondaryKeywords || [])
        );

        await db.insert(apiCallLogs).values({
            articleId: job.articleId!,
            stage: 'seo',
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost,
            durationMs: response.durationMs,
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

        // Queue meta generation
        await db.insert(contentQueue).values({
            jobType: 'generate_meta',
            domainId: job.domainId,
            articleId: job.articleId,
            priority: job.priority,
            payload: { content: response.content },
            status: 'pending',
        });
    } catch (error) {
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
        }).where(eq(contentQueue.id, jobId));
        throw error;
    }
}

export async function processMetaJob(jobId: string): Promise<void> {
    const ai = getAIClient();

    const jobs = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as { content: string };

    const articleData = await db.select().from(articles).where(eq(articles.id, job.articleId!)).limit(1);
    if (articleData.length === 0) throw new Error(`Article not found for job ${jobId}`);

    const article = articleData[0];

    await db.update(contentQueue).set({ status: 'processing', startedAt: new Date() }).where(eq(contentQueue.id, jobId));

    try {
        const response = await ai.generateJSON<{
            title: string;
            metaDescription: string;
            ogTitle: string;
            ogDescription: string;
            schemaType: string;
            suggestedSlug: string;
        }>(
            'seoOptimize', // Use Haiku for meta generation
            PROMPTS.meta(payload.content, article.targetKeyword || '')
        );

        await db.insert(apiCallLogs).values({
            articleId: job.articleId!,
            stage: 'meta',
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.cost,
            durationMs: response.durationMs,
        });

        await db.update(articles).set({
            title: response.data.title,
            metaDescription: response.data.metaDescription,
            slug: response.data.suggestedSlug,
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

        // Pipeline complete for this article! Status is now 'review'
    } catch (error) {
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
        }).where(eq(contentQueue.id, jobId));
        throw error;
    }
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
    if (jobs.length === 0) throw new Error(`Job ${jobId} not found`);

    const job = jobs[0];
    const payload = job.payload as { domain: string; niche: string | null; subNiche: string | null; targetCount: number };

    await db.update(contentQueue).set({ status: 'processing', startedAt: new Date() }).where(eq(contentQueue.id, jobId));

    try {
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

        // Note: apiCallLogs requires articleId, but keyword research is domain-level
        // We skip logging here since there's no article yet. Cost is tracked in queue job result.


        // Insert keywords into database
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

        // AUTO-APPROVE BEST KEYWORD AND START RESEARCH
        if (response.data.keywords.length > 0) {
            // Sort copy of keywords to avoid mutation issues
            const sortedKeywords = [...response.data.keywords].sort((a, b) => {
                // heuristic: score = volume / difficulty (simplified)
                return (b.searchVolume / (b.difficulty || 1)) - (a.searchVolume / (a.difficulty || 1));
            });
            const bestKeyword = sortedKeywords[0];

            console.log(`[KeywordResearch] Auto-selecting best keyword: ${bestKeyword.keyword}`);

            // Create article record
            const newArticle = await db.insert(articles).values({
                domainId: job.domainId!,
                targetKeyword: bestKeyword.keyword,
                secondaryKeywords: bestKeyword.variations,
                title: bestKeyword.keyword, // Temporary title
                slug: slugify(bestKeyword.keyword), // Temporary slug
                status: 'draft',
            }).returning({ id: articles.id });

            // Queue RESEARCH job (new start of pipeline)
            await db.insert(contentQueue).values({
                jobType: 'research' as any, // Cast to any until TS picks up schema change
                domainId: job.domainId!,
                articleId: newArticle[0].id,
                payload: {
                    targetKeyword: bestKeyword.keyword,
                    domainName: payload.domain,
                },
                status: 'pending',
                priority: 1, // High priority to get it moving
            });
        }

        await db.update(contentQueue).set({
            status: 'completed',
            completedAt: new Date(),
            result: { keywordsGenerated: response.data.keywords.length },
            apiTokensUsed: response.inputTokens + response.outputTokens,
            apiCost: response.cost,
        }).where(eq(contentQueue.id, jobId));

    } catch (error) {
        await db.update(contentQueue).set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: (job.attempts || 0) + 1,
        }).where(eq(contentQueue.id, jobId));
        throw error;
    }
}

