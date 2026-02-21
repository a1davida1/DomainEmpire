import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { assignThemeSkin } from '@/lib/deploy/theme-assigner';
import { availableV2Themes } from '@/lib/deploy/themes/theme-tokens';
import { availableSkins } from '@/lib/deploy/themes/skin-definitions';

/**
 * POST /api/domains/[id]/assign-theme
 *
 * Body (optional):
 *   { theme?: string, skin?: string }
 *
 * - If both theme and skin are provided, applies them directly (deliberate choice).
 * - If neither is provided, uses deterministic assignment via assignThemeSkin().
 * - Updates domain.skin AND all pageDefinitions.theme + pageDefinitions.skin.
 * - Content (blocks, text, etc.) is NOT regenerated — only the visual layer changes.
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

    let theme: string;
    let skin: string;

    let body: Record<string, unknown> = {};
    try {
        const text = await request.text();
        if (text.trim()) body = JSON.parse(text);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (body.theme || body.skin) {
        theme = (body.theme as string) || 'clean';
        skin = (body.skin as string) || 'slate';

        if (!availableV2Themes.includes(theme)) {
            return NextResponse.json({
                error: `Invalid theme "${theme}". Available: ${availableV2Themes.join(', ')}`,
            }, { status: 400 });
        }
        if (!availableSkins.includes(skin)) {
            return NextResponse.json({
                error: `Invalid skin "${skin}". Available: ${availableSkins.join(', ')}`,
            }, { status: 400 });
        }
    } else {
        const combo = assignThemeSkin(domain.domain, domain.cluster || 'misc', [domain.domain]);
        theme = combo.theme;
        skin = combo.skin;
    }

    await db.update(domains).set({ skin, updatedAt: new Date() }).where(eq(domains.id, id));
    const updated = await db.update(pageDefinitions).set({
        theme,
        skin,
        updatedAt: new Date(),
    }).where(eq(pageDefinitions.domainId, id)).returning({ id: pageDefinitions.id });

    return NextResponse.json({
        theme,
        skin,
        pagesUpdated: updated.length,
        message: `Applied ${theme}/${skin} to ${updated.length} pages. Deploy to see changes live.`,
    });
}

/**
 * GET /api/domains/[id]/assign-theme
 *
 * Returns available themes and skins for the UI picker.
 */
export async function GET() {
    return NextResponse.json({
        themes: availableV2Themes,
        skins: availableSkins,
    });
}
