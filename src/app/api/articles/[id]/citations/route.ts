import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { getCitations, addCitation, updateCitation, removeCitation } from '@/lib/citations';

// GET /api/articles/[id]/citations
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const citationList = await getCitations(params.id);
    const total = citationList.length;
    const paginated = citationList.slice(offset, offset + limit);
    return NextResponse.json({ data: paginated, total, limit, offset });
}

// POST /api/articles/[id]/citations — add a citation
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const claimText = typeof body.claimText === 'string' ? body.claimText : '';
        const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl : '';
        const sourceTitle = typeof body.sourceTitle === 'string' ? body.sourceTitle : undefined;
        const quotedSnippet = typeof body.quotedSnippet === 'string' ? body.quotedSnippet : undefined;
        const notes = typeof body.notes === 'string' ? body.notes : undefined;

        if (!claimText || !sourceUrl) {
            return NextResponse.json({ error: 'claimText and sourceUrl are required' }, { status: 400 });
        }

        const id = await addCitation({
            articleId: params.id,
            claimText,
            sourceUrl,
            sourceTitle,
            quotedSnippet,
            notes,
            createdById: user.id || undefined,
        });

        return NextResponse.json({ id }, { status: 201 });
    } catch (error) {
        console.error('Failed to add citation:', error);
        return NextResponse.json({ error: 'Failed to add citation' }, { status: 500 });
    }
}

// PATCH /api/articles/[id]/citations — update a citation (citationId in body)
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const _params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }
        const citationId = typeof body.citationId === 'string' ? body.citationId : '';

        if (!citationId) {
            return NextResponse.json({ error: 'citationId is required' }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (body.claimText !== undefined) updates.claimText = body.claimText;
        if (body.sourceUrl !== undefined) updates.sourceUrl = body.sourceUrl;
        if (body.sourceTitle !== undefined) updates.sourceTitle = body.sourceTitle;
        if (body.quotedSnippet !== undefined) updates.quotedSnippet = body.quotedSnippet;
        if (body.notes !== undefined) updates.notes = body.notes;

        await updateCitation(citationId, updates);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update citation:', error);
        return NextResponse.json({ error: 'Failed to update citation' }, { status: 500 });
    }
}

// DELETE /api/articles/[id]/citations — remove a citation (citationId in body)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const _params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { searchParams } = request.nextUrl;
        const citationId = searchParams.get('citationId');

        if (!citationId) {
            return NextResponse.json({ error: 'citationId query param is required' }, { status: 400 });
        }

        await removeCitation(citationId);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to remove citation:', error);
        return NextResponse.json({ error: 'Failed to remove citation' }, { status: 500 });
    }
}
