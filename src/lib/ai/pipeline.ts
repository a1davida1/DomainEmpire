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

import { db, articles, contentQueue, apiCallLogs, keywords } from '@/lib/db';
import { getAIClient } from './openrouter';
import { eq } from 'drizzle-orm';

// ===========================================
// PROMPTS FOR EACH STAGE
// ===========================================

const PROMPTS = {
    outline: (keyword: string, secondaryKeywords: string[], domainContext: string) => `
You are an expert SEO content strategist. Create a detailed article outline for the following:

PRIMARY KEYWORD: ${keyword}
SECONDARY KEYWORDS: ${secondaryKeywords.join(', ') || 'None specified'}
WEBSITE CONTEXT: ${domainContext}

Create an outline that:
1. Has a compelling H1 title that includes the primary keyword naturally
2. Has 5-8 H2 sections that comprehensively cover the topic
3. Each H2 should have 2-4 H3 subsections
4. Include a clear introduction and conclusion section
5. Suggest FAQ questions (3-5) based on "People Also Ask" style queries
6. Include notes on where to add statistics, examples, or expert quotes

Respond with a JSON object:
{
  "title": "The optimized H1 title",
  "metaDescription": "155 character meta description",
  "outline": [
    {
      "heading": "H2 heading text",
      "level": 2,
      "subheadings": [
        { "heading": "H3 heading", "level": 3, "notes": "Content notes" }
      ],
      "notes": "What to cover in this section"
    }
  ],
  "faqs": [
    { "question": "FAQ question", "answerHint": "Key points to cover" }
  ],
  "estimatedWordCount": 2500
}
`,

    draft: (outline: object, keyword: string, domainName: string) => `
You are an expert content writer specializing in SEO-optimized, genuinely helpful articles.

Write a complete, publication-ready article based on this outline:

${JSON.stringify(outline, null, 2)}

PRIMARY KEYWORD: ${keyword}
WEBSITE: ${domainName}

CRITICAL WRITING GUIDELINES:
1. Write in a conversational but authoritative tone
2. Use the primary keyword naturally 3-5 times (not forced)
3. Include specific examples, statistics, and actionable advice
4. Make the content genuinely helpful - not keyword-stuffed garbage
5. Use short paragraphs (2-3 sentences max) for readability
6. Include transition sentences between sections
7. Write a compelling introduction that hooks the reader
8. End with a clear conclusion and call-to-action
9. Format using Markdown with proper headings (## for H2, ### for H3)

DO NOT:
- Use phrases like "in this article" or "as we discussed"
- Start sentences with "So," or "Well,"
- Use clichés like "game-changer" or "dive into"
- Over-promise or make claims without backing them up

Write the complete article in Markdown format.
`,

    humanize: (draft: string) => `
You are an expert editor who makes AI-generated content sound more natural and human.

Review and refine this article to make it sound like it was written by a knowledgeable human expert:

${draft}

REFINEMENT TASKS:
1. Vary sentence structure and length naturally
2. Add personality through word choice (without being unprofessional)
3. Include subtle imperfections that humans would write (parenthetical asides, rhetorical questions)
4. Replace any remaining robotic phrases
5. Ensure the article flows naturally when read aloud
6. Add authentic-sounding personal touches or opinions where appropriate
7. Make sure transitions between sections feel natural

Keep all the factual content, structure, and SEO elements intact.
Return the refined article in Markdown format.
`,

    seoOptimize: (article: string, keyword: string, secondaryKeywords: string[]) => `
You are an SEO specialist. Optimize this article for search engines while maintaining readability.

ARTICLE:
${article}

PRIMARY KEYWORD: ${keyword}
SECONDARY KEYWORDS: ${secondaryKeywords.join(', ')}

OPTIMIZATION TASKS:
1. Ensure primary keyword appears in first 100 words
2. Check keyword density (aim for 1-2% naturally)
3. Add secondary keywords where they fit naturally
4. Optimize headings for featured snippets
5. Add internal linking placeholders: [INTERNAL_LINK: anchor text | suggested topic]
6. Add external linking placeholders for authoritative sources: [EXTERNAL_LINK: anchor text | suggested source type]
7. Ensure proper heading hierarchy (H2 -> H3, no skipped levels)
8. Add alt text suggestions for any images: [IMAGE: description | alt text]

Return the optimized article in Markdown format with all placeholders included.
`,

    meta: (article: string, keyword: string) => `
Generate SEO metadata for this article.

ARTICLE (first 1000 chars):
${article.slice(0, 1000)}

PRIMARY KEYWORD: ${keyword}

Return a JSON object with:
{
  "title": "60-character SEO title with keyword near the start",
  "metaDescription": "155-character compelling meta description with keyword",
  "ogTitle": "Open Graph title for social sharing",
  "ogDescription": "Open Graph description for social sharing",
  "schemaType": "Article" | "HowTo" | "FAQ",
  "suggestedSlug": "url-slug-here"
}
`,
};

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

    try {
        // Generate outline
        const response = await ai.generateJSON<{
            title: string;
            metaDescription: string;
            outline: Array<{ heading: string; level: number; subheadings?: Array<{ heading: string; level: number }>; notes?: string }>;
            faqs: Array<{ question: string; answerHint: string }>;
            estimatedWordCount: number;
        }>(
            'outlineGeneration',
            PROMPTS.outline(payload.targetKeyword, payload.secondaryKeywords, payload.domainName)
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
        const response = await ai.generate(
            'draftGeneration',
            PROMPTS.draft(payload.outline, payload.targetKeyword, payload.domainName)
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
};

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

