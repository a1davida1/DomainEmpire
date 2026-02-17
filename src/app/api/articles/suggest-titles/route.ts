import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAIClient } from '@/lib/ai/openrouter';
import { aiLimiter, getClientIp } from '@/lib/rate-limit';

// POST /api/articles/suggest-titles - Generate title ideas
export async function POST(request: NextRequest) {
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

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const topic = typeof body.topic === 'string' ? body.topic : '';
        const keyword = typeof body.keyword === 'string' ? body.keyword : '';

        if (!topic && !keyword) {
            return NextResponse.json({ error: 'Topic or keyword required' }, { status: 400 });
        }

        const client = getAIClient();

        const systemPrompt = `You are an expert copywriter for high-authority niche sites.
        Generate 5 engaging, SEO-optimized article titles based on the user's input.
        
        Rules:
        1. Mix of "How-to", "Listicle", and "Question" formats.
        2. Include the target keyword naturally.
        3. Optimize for high CTR (Click Through Rate).
        4. Keep them under 60 characters if possible.
        5. Return ONLY a JSON array of strings. No markdown.`;

        // Build prompt parts, filtering out empty values to avoid "undefined"
        const promptParts: string[] = [];
        if (topic) promptParts.push(`Topic: ${topic}`);
        if (keyword) promptParts.push(`Keyword: ${keyword}`);
        const userPrompt = promptParts.join('\n') || 'Generate article titles';

        // Using generateJSON to ensure array format
        const response = await client.generateJSON<string[]>('titleGeneration', userPrompt, {
            systemPrompt,
            temperature: 0.8,
        });

        return NextResponse.json({
            titles: response.data,
            cost: response.cost
        });

    } catch (error) {
        console.error('Title suggestion failed:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to suggest titles' }, { status: 500 });
    }
}
