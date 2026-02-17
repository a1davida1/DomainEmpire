import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { seedPageDefinitions, batchSeedPageDefinitions } from '@/lib/deploy/blocks/seed';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/pages/seed — Seed v2 page definitions for a domain (or batch).
 *
 * Body:
 *   { domainId: "uuid" }                     — seed one domain
 *   { domainId: "uuid", publish: true }      — seed and auto-publish
 *   { batch: true, limit: 50 }              — batch seed up to 50 domains
 */
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        let body: Record<string, unknown>;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
        }

        // Batch mode
        if (body.batch === true) {
            const rawLimit = typeof body.limit === 'number' && Number.isFinite(body.limit)
                ? Math.trunc(body.limit)
                : 50;
            const limit = Math.max(1, Math.min(rawLimit, 200));
            const result = await batchSeedPageDefinitions({
                publish: typeof body.publish === 'boolean' ? body.publish : false,
                theme: typeof body.theme === 'string' ? body.theme : undefined,
                skin: typeof body.skin === 'string' ? body.skin : undefined,
                seedArticlePages: typeof body.seedArticlePages === 'boolean' ? body.seedArticlePages : true,
                filterTemplate: typeof body.filterTemplate === 'string' ? body.filterTemplate : undefined,
                limit,
            });

            return NextResponse.json(result);
        }

        // Single domain mode
        const domainId = typeof body.domainId === 'string' ? body.domainId : '';
        if (!domainId || !UUID_RE.test(domainId)) {
            return NextResponse.json({ error: 'domainId is required (UUID)' }, { status: 400 });
        }

        const result = await seedPageDefinitions(domainId, {
            publish: typeof body.publish === 'boolean' ? body.publish : false,
            theme: typeof body.theme === 'string' ? body.theme : undefined,
            skin: typeof body.skin === 'string' ? body.skin : undefined,
            seedArticlePages: typeof body.seedArticlePages === 'boolean' ? body.seedArticlePages : true,
            skipIfExists: typeof body.skipIfExists === 'boolean' ? body.skipIfExists : true,
        });

        if (result.skipped) {
            return NextResponse.json({ ...result, message: result.skipReason }, { status: 200 });
        }

        return NextResponse.json(result, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (message.includes('not found')) {
            return NextResponse.json({ error: message }, { status: 404 });
        }

        console.error('[api/pages/seed] Seed failed:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', message: 'Failed to seed page definitions' },
            { status: 500 },
        );
    }
}
