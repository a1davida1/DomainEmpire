import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiLimiter, getClientIp } from '@/lib/rate-limit';
import { generatePageBlockContent } from '@/lib/ai/block-pipeline';

// POST /api/pages/[id]/generate — Generate AI content for all blocks in a page definition
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const ip = getClientIp(request) || 'unknown';
    const limit = aiLimiter(ip);
    if (!limit.allowed) {
        return NextResponse.json(
            { error: 'Too many AI requests. Please slow down.' },
            { status: 429, headers: limit.headers },
        );
    }

    const { id } = params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID format' }, { status: 400 });
    }

    try {
        const result = await generatePageBlockContent(id);

        return NextResponse.json({
            success: result.failureCount === 0,
            partial: result.failureCount > 0 && result.successCount > 0,
            pageDefinitionId: result.pageDefinitionId,
            route: result.route,
            successCount: result.successCount,
            failureCount: result.failureCount,
            skippedCount: result.skippedCount,
            totalTokens: result.totalTokens,
            totalCost: result.totalCost,
            totalDurationMs: result.totalDurationMs,
            blocks: result.blocks.map(b => ({
                blockId: b.blockId,
                blockType: b.blockType,
                success: b.success,
                error: b.error || null,
            })),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('not found')) {
            return NextResponse.json({ error: message }, { status: 404 });
        }

        console.error('[api/pages/generate] Block content generation failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to generate block content' },
            { status: 500 },
        );
    }
}
