import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { regeneratePages } from '@/lib/deploy/prepare-domain';

/**
 * POST /api/domains/[id]/regenerate
 *
 * Explicit page regeneration: deletes all existing pages and re-seeds
 * from the structural blueprint. Uses niche/theme/skin already on the
 * domain record — call updateDomain (via /prepare with mode=edit) first
 * to set those fields if needed.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

    try {
        const result = await regeneratePages(domain.id);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[regenerate]', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
    }
}
