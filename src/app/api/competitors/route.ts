import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { addCompetitor, getCompetitors, removeCompetitor, findKeywordGaps } from '@/lib/competitors/monitor';
import { z } from 'zod';

const addSchema = z.object({
    domainId: z.string().uuid(),
    competitorDomain: z.string().min(3).max(253),
});

// GET /api/competitors?domainId=xxx — Get competitors for a domain
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');

    if (!domainId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainId)) {
        return NextResponse.json({ error: 'Valid domainId is required' }, { status: 400 });
    }

    try {
        const [comps, gaps] = await Promise.all([
            getCompetitors(domainId),
            findKeywordGaps(domainId),
        ]);
        return NextResponse.json({ competitors: comps, keywordGaps: gaps.slice(0, 50) });
    } catch (error) {
        console.error(`Failed to fetch competitors for ${domainId}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to fetch competitors' },
            { status: 500 }
        );
    }
}

// POST /api/competitors — Add a competitor
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const parsed = addSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
        }

        const id = await addCompetitor(parsed.data.domainId, parsed.data.competitorDomain);
        return NextResponse.json({ id }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to add competitor', message: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

// DELETE /api/competitors?id=xxx — Remove a competitor
export async function DELETE(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    }

    try {
        const success = await removeCompetitor(id);
        if (!success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(`Failed to remove competitor ${id}:`, error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to remove competitor' },
            { status: 500 }
        );
    }
}
