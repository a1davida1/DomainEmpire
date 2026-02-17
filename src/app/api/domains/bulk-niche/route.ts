import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { domainIds, niche } = body as { domainIds?: string[]; niche?: string };

    if (!Array.isArray(domainIds) || domainIds.length === 0) {
        return NextResponse.json({ error: 'domainIds array required' }, { status: 400 });
    }
    if (typeof niche !== 'string' || niche.trim().length === 0) {
        return NextResponse.json({ error: 'niche string required' }, { status: 400 });
    }

    if (domainIds.length > 200) {
        return NextResponse.json({ error: 'Maximum 200 domains per batch' }, { status: 400 });
    }

    try {
        const updated = await db
            .update(domains)
            .set({ niche: niche.trim() })
            .where(inArray(domains.id, domainIds))
            .returning({ id: domains.id });

        return NextResponse.json({
            success: true,
            updated: updated.length,
            niche: niche.trim(),
        });
    } catch (err) {
        console.error('[BulkNiche] Error:', err);
        return NextResponse.json({ error: 'Failed to update niches' }, { status: 500 });
    }
}
