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
        const body = await request.json();

        // Batch mode
        if (body.batch) {
            const result = await batchSeedPageDefinitions({
                publish: body.publish ?? false,
                theme: body.theme,
                skin: body.skin,
                seedArticlePages: body.seedArticlePages ?? true,
                filterTemplate: body.filterTemplate,
                limit: Math.min(body.limit ?? 50, 200),
            });

            return NextResponse.json(result);
        }

        // Single domain mode
        const { domainId } = body;
        if (!domainId || !UUID_RE.test(domainId)) {
            return NextResponse.json({ error: 'domainId is required (UUID)' }, { status: 400 });
        }

        const result = await seedPageDefinitions(domainId, {
            publish: body.publish ?? false,
            theme: body.theme,
            skin: body.skin,
            seedArticlePages: body.seedArticlePages ?? true,
            skipIfExists: body.skipIfExists ?? true,
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
