import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { globalSearch, type SearchResultType } from '@/lib/search';

const VALID_TYPES = new Set<SearchResultType>(['domain', 'article', 'keyword', 'page']);

export async function GET(request: NextRequest) {
    const authResult = await requireAuth(request);
    if (authResult) return authResult;

    const { searchParams } = request.nextUrl;
    const q = searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
        return NextResponse.json({ results: [] });
    }

    const typesParam = searchParams.get('types');
    const types = typesParam
        ? typesParam.split(',').filter((t): t is SearchResultType => VALID_TYPES.has(t as SearchResultType))
        : undefined;
    const normalizedTypes = types && types.length > 0 ? types : undefined;

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 50) : undefined;

    try {
        const results = await globalSearch(q, { types: normalizedTypes, limit });
        return NextResponse.json({ results, query: q });
    } catch (err) {
        console.error('[Search] Error:', err);
        return NextResponse.json(
            { error: 'Search failed', results: [] },
            { status: 500 },
        );
    }
}
