import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { enrichContent } from '@/lib/deploy/prepare-domain';

/**
 * POST /api/domains/[id]/enrich
 *
 * Run AI-powered content enrichment independently:
 *   - Hero headlines, calculator inputs, FAQ, meta descriptions
 *   - Content scanning (banned words, burstiness, AI rewrite)
 *   - Site review + auto-remediation
 *
 * Each sub-step has a timeout and fails gracefully.
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
        const result = await enrichContent(domain.id);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[enrich]', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
    }
}
