import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getAIClient } from '@/lib/ai/openrouter';

// POST /api/articles/suggest-titles - Generate title ideas
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { topic, keyword } = body;

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
        return NextResponse.json({ error: 'Failed to suggest titles' }, { status: 500 });
    }
}
