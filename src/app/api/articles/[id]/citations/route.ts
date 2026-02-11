import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { getCitations, addCitation, updateCitation, removeCitation } from '@/lib/citations';

// GET /api/articles/[id]/citations
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const citationList = await getCitations(params.id);
    return NextResponse.json(citationList);
}

// POST /api/articles/[id]/citations — add a citation
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);

    try {
        const body = await request.json();
        const { claimText, sourceUrl, sourceTitle, quotedSnippet, notes } = body;

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
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json();
        const { citationId, ...updates } = body;

        if (!citationId) {
            return NextResponse.json({ error: 'citationId is required' }, { status: 400 });
        }

        await updateCitation(citationId, updates);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to update citation:', error);
        return NextResponse.json({ error: 'Failed to update citation' }, { status: 500 });
    }
}

// DELETE /api/articles/[id]/citations — remove a citation (citationId in body)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
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
