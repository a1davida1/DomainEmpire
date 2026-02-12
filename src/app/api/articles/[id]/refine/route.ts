import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';
import { aiLimiter, getClientIp } from '@/lib/rate-limit';

// POST /api/articles/[id]/refine - Improve article content using AI
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const ip = getClientIp(request) || 'unknown';
    const limit = aiLimiter(ip);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many AI requests. Please slow down.' },
            { status: 429, headers: limit.headers }
        );
    }

    const { id } = params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { content, instructions } = body;

        // Fetch article if content not provided (optional)
        let articleContent = content;
        if (!articleContent) {
            const article = await db.query.articles.findFirst({
                where: eq(articles.id, id),
            });
            if (!article) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
            articleContent = article.contentMarkdown;
        }

        if (!articleContent) {
            return NextResponse.json({ error: 'No content to refine' }, { status: 400 });
        }

        const client = getAIClient();

        const systemPrompt = `You are an expert editor for "Domain Empire", a high-quality portfolio of authority sites.
        Your goal is to refine the given article content to meet strict quality standards:
        1. Remove any "AIisms" (e.g., "In conclusion", "It is important to note", repetitive structures).
        2. Ensure the tone is authoritative, engaging, and human-like.
        3. Improve flow and readability.
        4. Maintain the original markdown structure (headers, lists, links).
        5. Do not strip out valuable information, only improve how it is presented.
        
        Return ONLY the refined markdown content. Do not include any conversational preamble.`;

        const safeInstructions = (instructions || '').slice(0, 1000);
        const userPrompt = `Refine the following article content based on these instructions: ${safeInstructions || 'General polish and humanization'}\n\nCONTENT:\n${articleContent}`;

        const response = await client.generate('humanization', userPrompt, {
            systemPrompt,
            temperature: 0.7,
        });

        return NextResponse.json({
            refinedContent: response.content,
            cost: response.cost
        });

    } catch (error) {
        console.error('Content refinement failed:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to refine content' }, { status: 500 });
    }
}
