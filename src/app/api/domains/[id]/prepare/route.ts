import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { prepareDomain, updateDomain, type DomainStrategy, type PrepareMode } from '@/lib/deploy/prepare-domain';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

    let strategy: DomainStrategy | undefined;
    let mode: PrepareMode = 'full';
    try {
        const text = await request.text();
        if (text.trim()) {
            const body = JSON.parse(text) as Record<string, unknown>;
            if (body.mode === 'edit') mode = 'edit';
            const ALLOWED_KEYS = new Set<string>(['wave', 'cluster', 'niche', 'subNiche', 'vertical', 'siteTemplate', 'monetizationTier', 'homeTitle', 'homeMeta']);
            const hasStrategyFields = body.niche || body.cluster || body.siteTemplate || body.homeTitle;
            if (hasStrategyFields) {
                const filtered: Record<string, unknown> = {};
                for (const key of Object.keys(body)) {
                    if (ALLOWED_KEYS.has(key)) filtered[key] = body[key];
                }
                strategy = filtered as DomainStrategy;
            }
        }
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    try {
        const result = await prepareDomain(domain.id, strategy, mode);
        return NextResponse.json(result);
    } catch (err) {
        console.error('[prepare]', err);
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
    }
}
