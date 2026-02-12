import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getRevisions, getRevisionById, getRevisionPair } from '@/lib/audit/revisions';

// GET /api/articles/[id]/revisions — list revisions or get specific one
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const revisionId = searchParams.get('revisionId');
    const diffNum = searchParams.get('diff');

    // Get a specific revision by ID
    if (revisionId) {
        const revision = await getRevisionById(revisionId);
        if (!revision) {
            return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
        }
        return NextResponse.json(revision);
    }

    // Get a diff pair
    if (diffNum) {
        const pair = await getRevisionPair(params.id, parseInt(diffNum, 10));
        return NextResponse.json(pair);
    }

    // List revisions with pagination (metadata only, no full content)
    const { searchParams: sp } = request.nextUrl;
    const limit = Math.min(Number(sp.get('limit')) || 50, 200);
    const offset = Math.max(Number(sp.get('offset')) || 0, 0);

    const revisions = await getRevisions(params.id);
    const total = revisions.length;
    const paginated = revisions.slice(offset, offset + limit);
    return NextResponse.json({ data: paginated, total, limit, offset });
}
