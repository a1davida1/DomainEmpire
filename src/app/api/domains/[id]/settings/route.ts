import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { eq } from 'drizzle-orm';

type SiteSettings = NonNullable<typeof domains.$inferSelect.siteSettings>;

const ALLOWED_KEYS = new Set([
    'siteName', 'siteDescription', 'phone', 'contactEmail',
    'showSidebar', 'sidebarAboutText', 'footerText',
    'ctaHeading', 'ctaButtonText', 'ctaButtonUrl',
    'socialLinks', 'customCss',
]);

function sanitizeSettings(raw: Record<string, unknown>): Partial<SiteSettings> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!ALLOWED_KEYS.has(key)) continue;
        if (key === 'showSidebar') {
            out[key] = Boolean(value);
        } else if (key === 'socialLinks') {
            if (Array.isArray(value)) {
                out[key] = value
                    .filter((v): v is { platform: string; url: string } =>
                        typeof v === 'object' && v !== null &&
                        typeof (v as Record<string, unknown>).platform === 'string' &&
                        typeof (v as Record<string, unknown>).url === 'string')
                    .slice(0, 10);
            }
        } else if (typeof value === 'string') {
            const trimmed = value.trim();
            out[key] = trimmed.length > 0 ? trimmed : undefined;
        }
    }
    return out as Partial<SiteSettings>;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    const [domain] = await db.select({
        id: domains.id,
        domain: domains.domain,
        siteSettings: domains.siteSettings,
    }).from(domains).where(eq(domains.id, id)).limit(1);

    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

    return NextResponse.json({ settings: domain.siteSettings || {} });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireRole(request, 'admin');
    if (authError) return authError;

    const { id } = await params;
    const [domain] = await db.select({ id: domains.id, siteSettings: domains.siteSettings })
        .from(domains).where(eq(domains.id, id)).limit(1);

    if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const incoming = sanitizeSettings(body);
    const merged = { ...(domain.siteSettings || {}), ...incoming };

    // Remove keys explicitly set to undefined/null/empty
    for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || value === null || value === '') {
            delete (merged as Record<string, unknown>)[key];
        }
    }

    await db.update(domains).set({
        siteSettings: merged,
        updatedAt: new Date(),
    }).where(eq(domains.id, id));

    return NextResponse.json({ settings: merged });
}
