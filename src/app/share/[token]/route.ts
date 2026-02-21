import { NextRequest, NextResponse } from 'next/server';
import { db, previewBuilds } from '@/lib/db';
import { and, eq, gt, sql } from 'drizzle-orm';

const TOKEN_RE = /^[0-9a-f]{16}$/i;

/**
 * GET /share/[token] — Public (no auth) shareable preview page.
 * Looks up the preview build by share token in metadata, checks expiry,
 * and returns the stored HTML directly.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ token: string }> },
) {
    const { token } = await params;

    if (!TOKEN_RE.test(token)) {
        return new NextResponse(errorPage('Invalid share link'), {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    // Find the preview build by shareToken in metadata JSONB
    const builds = await db
        .select({
            id: previewBuilds.id,
            buildLog: previewBuilds.buildLog,
            buildStatus: previewBuilds.buildStatus,
            expiresAt: previewBuilds.expiresAt,
            metadata: previewBuilds.metadata,
        })
        .from(previewBuilds)
        .where(
            and(
                eq(previewBuilds.buildStatus, 'ready'),
                sql`${previewBuilds.metadata}->>'shareToken' = ${token}`,
            ),
        )
        .limit(1);

    if (builds.length === 0) {
        return new NextResponse(errorPage('Share link not found or expired'), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    const build = builds[0];

    // Check expiry
    if (build.expiresAt && new Date(build.expiresAt) < new Date()) {
        return new NextResponse(errorPage('This share link has expired'), {
            status: 410,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    if (!build.buildLog) {
        return new NextResponse(errorPage('Preview content is unavailable'), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    // Inject a small banner indicating this is a shared preview
    const meta = (build.metadata ?? {}) as Record<string, unknown>;
    const route = (meta.route as string) || '/';
    const theme = (meta.theme as string) || 'unknown';
    const skin = (meta.skin as string) || 'unknown';

    const banner = `<div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:white;padding:6px 16px;font:500 11px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>SHARED PREVIEW · ${escapeHtml(route)} · ${escapeHtml(theme)}/${escapeHtml(skin)}</span>
        <span style="opacity:0.7">Expires ${build.expiresAt ? new Date(build.expiresAt).toLocaleDateString() : 'never'}</span>
    </div>`;

    const html = build.buildLog.replace('</body>', `${banner}</body>`);

    return new NextResponse(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, max-age=300',
            'X-Robots-Tag': 'noindex, nofollow',
        },
    });
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function errorPage(message: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Preview · ${escapeHtml(message)}</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#1e293b}
        .card{text-align:center;padding:3rem 2rem;max-width:420px}
        h1{font-size:1.25rem;font-weight:600;margin-bottom:0.5rem}
        p{font-size:0.875rem;color:#64748b;line-height:1.6}
    </style>
</head>
<body>
    <div class="card">
        <h1>${escapeHtml(message)}</h1>
        <p>This preview link may have expired or been removed. Ask the sender for a new link.</p>
    </div>
</body>
</html>`;
}
