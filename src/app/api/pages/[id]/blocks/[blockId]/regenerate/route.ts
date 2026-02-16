import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { aiLimiter, getClientIp } from '@/lib/rate-limit';
import { regenerateBlockContent } from '@/lib/ai/block-pipeline';

// POST /api/pages/[id]/blocks/[blockId]/regenerate — Regenerate AI content for a single block
export async function POST(
    request: NextRequest,
    props: { params: Promise<{ id: string; blockId: string }> },
) {
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

    const { id, blockId } = params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid page definition ID format' }, { status: 400 });
    }

    if (!blockId || blockId.length === 0) {
        return NextResponse.json({ error: 'Block ID is required' }, { status: 400 });
    }

    try {
        const result = await regenerateBlockContent(id, blockId);

        return NextResponse.json({
            success: result.success,
            blockId: result.blockId,
            blockType: result.blockType,
            error: result.error || null,
            tokensUsed: result.tokensUsed || 0,
            cost: result.cost || 0,
            durationMs: result.durationMs || 0,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('not found')) {
            return NextResponse.json({ error: message }, { status: 404 });
        }

        console.error('[api/pages/blocks/regenerate] Block regeneration failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to regenerate block content' },
            { status: 500 },
        );
    }
}
