import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, domains, articles } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { getThemeStyles } from '@/lib/deploy/themes/theme-definitions';

interface PageProps {
    params: Promise<{ id: string }>;
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractSiteTitle(domain: string): string {
    const ccTlds = ['.co.uk', '.com.au', '.co.nz', '.co.za', '.com.br', '.co.in', '.org.uk', '.net.au'];
    let sld = domain;
    for (const ccTld of ccTlds) {
        if (domain.endsWith(ccTld)) {
            sld = domain.slice(0, -ccTld.length);
            break;
        }
    }
    if (sld === domain) {
        const lastDot = domain.lastIndexOf('.');
        sld = lastDot > 0 ? domain.slice(0, lastDot) : domain;
    }
    return sld.replaceAll('-', ' ').replaceAll(/\b\w/g, c => c.toUpperCase());
}

const STATUS_BADGE: Record<string, string> = {
    generating: 'background:#fef3c7;color:#92400e;',
    draft: 'background:#dbeafe;color:#1e40af;',
    review: 'background:#fce7f3;color:#9d174d;',
    approved: 'background:#d1fae5;color:#065f46;',
    published: 'background:#dcfce7;color:#166534;',
    archived: 'background:#f3f4f6;color:#6b7280;',
};

/**
 * GET /api/domains/[id]/preview
 * Returns a full HTML page previewing the site.
 * Query params:
 *   ?articleId=xxx — preview a single article
 *   (no params) — preview the homepage with article list
 */
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    const url = new URL(request.url);
    const articleId = url.searchParams.get('articleId');

    const [domainRow] = await db.select().from(domains)
        .where(and(eq(domains.id, id), isNull(domains.deletedAt)))
        .limit(1);

    if (!domainRow) {
        return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const siteTitle = extractSiteTitle(domainRow.domain);
    const themeCSS = getThemeStyles(domainRow.themeStyle || undefined);

    // Fetch articles — include all non-archived for preview purposes
    const allArticles = await db.select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        contentMarkdown: articles.contentMarkdown,
        metaDescription: articles.metaDescription,
        wordCount: articles.wordCount,
        targetKeyword: articles.targetKeyword,
        contentType: articles.contentType,
        createdAt: articles.createdAt,
    })
        .from(articles)
        .where(and(eq(articles.domainId, id), isNull(articles.deletedAt)));

    const baseStyles = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { max-width: 900px; margin: 0 auto; padding: 1rem 1.5rem; line-height: 1.7; color: #1f2937; font-family: system-ui, sans-serif; }
        header { padding: 1rem 0; margin-bottom: 2rem; border-bottom: 2px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.25rem; font-weight: 700; text-decoration: none; color: inherit; }
        .preview-badge { background: #7c3aed; color: white; font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 999px; font-weight: 600; letter-spacing: 0.05em; }
        h1 { font-size: 2rem; margin: 1rem 0 0.5rem; line-height: 1.3; }
        h2 { font-size: 1.5rem; margin: 1.5rem 0 0.75rem; }
        h3 { font-size: 1.2rem; margin: 1.25rem 0 0.5rem; }
        p { margin: 0.75rem 0; }
        a { color: #2563eb; }
        ul, ol { margin: 0.75rem 0; padding-left: 1.5rem; }
        li { margin: 0.3rem 0; }
        .hero { padding: 3rem 2rem; margin-bottom: 2rem; border-radius: 0.75rem; background: #f9fafb; }
        .hero h1 { font-size: 2.25rem; margin-bottom: 0.5rem; }
        .hero p { font-size: 1.1rem; opacity: 0.85; }
        .articles { list-style: none; padding: 0; }
        .articles li { padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.5rem; margin-bottom: 0.75rem; }
        .articles li a { font-weight: 600; font-size: 1.05rem; text-decoration: none; }
        .articles li a:hover { text-decoration: underline; }
        .articles .meta { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }
        .status-badge { display: inline-block; font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 999px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-left: 0.5rem; }
        footer { margin-top: 3rem; padding: 1.5rem 0; border-top: 1px solid #e5e7eb; font-size: 0.85rem; color: #6b7280; }
        article img { max-width: 100%; border-radius: 0.5rem; }
        article blockquote { border-left: 3px solid #d1d5db; padding-left: 1rem; color: #4b5563; margin: 1rem 0; }
        article code { background: #f3f4f6; padding: 0.15rem 0.3rem; border-radius: 0.25rem; font-size: 0.9em; }
        article pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
        article table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        article th, article td { border: 1px solid #e5e7eb; padding: 0.5rem 0.75rem; text-align: left; }
        article th { background: #f9fafb; font-weight: 600; }
        .back-link { display: inline-block; margin-bottom: 1rem; font-size: 0.85rem; color: #6b7280; }
        .article-meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 1.5rem; }
    `;

    if (articleId) {
        // Single article preview
        const article = allArticles.find(a => a.id === articleId);
        if (!article) {
            return new NextResponse('Article not found', { status: 404 });
        }

        let bodyHtml = '<p style="color:#6b7280;font-style:italic">No content generated yet.</p>';
        if (article.contentMarkdown) {
            const rawHtml = await marked.parse(article.contentMarkdown);
            bodyHtml = sanitizeHtml(rawHtml, {
                allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td']),
                allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ['src', 'alt', 'width', 'height'] },
            });
        }

        const statusStyle = STATUS_BADGE[article.status || 'draft'] || STATUS_BADGE.draft;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(article.title)} — ${escapeHtml(siteTitle)}</title>
    <style>${baseStyles}${themeCSS}</style>
</head>
<body>
    <header>
        <a href="/api/domains/${id}/preview" class="logo" target="_self">${escapeHtml(siteTitle)}</a>
        <span class="preview-badge">PREVIEW</span>
    </header>
    <a href="/api/domains/${id}/preview" class="back-link" target="_self">← Back to all articles</a>
    <article>
        <h1>${escapeHtml(article.title)} <span class="status-badge" style="${statusStyle}">${escapeHtml(article.status || 'draft')}</span></h1>
        <div class="article-meta">
            ${article.targetKeyword ? `Keyword: <strong>${escapeHtml(article.targetKeyword)}</strong> · ` : ''}
            ${article.wordCount ? `${article.wordCount.toLocaleString()} words · ` : ''}
            ${article.contentType ? `Type: ${escapeHtml(article.contentType)}` : ''}
        </div>
        ${bodyHtml}
    </article>
    <footer>
        <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteTitle)} · Preview Mode</p>
    </footer>
</body>
</html>`;

        return new NextResponse(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    // Homepage preview — list all articles
    const articleListHtml = allArticles.length > 0
        ? allArticles.map(a => {
            const statusStyle = STATUS_BADGE[a.status || 'draft'] || STATUS_BADGE.draft;
            return `<li>
                <a href="/api/domains/${id}/preview?articleId=${a.id}" target="_self">${escapeHtml(a.title)}</a>
                <span class="status-badge" style="${statusStyle}">${escapeHtml(a.status || 'draft')}</span>
                <div class="meta">
                    ${a.targetKeyword ? `${escapeHtml(a.targetKeyword)} · ` : ''}
                    ${a.wordCount ? `${a.wordCount.toLocaleString()} words · ` : ''}
                    ${a.contentType || 'article'}
                </div>
            </li>`;
        }).join('\n')
        : '<li style="color:#6b7280;font-style:italic;border:none;padding:2rem;text-align:center">No articles yet. Generate content from the pipeline card.</li>';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(siteTitle)} — Site Preview</title>
    <style>${baseStyles}${themeCSS}</style>
</head>
<body>
    <header>
        <a href="/api/domains/${id}/preview" class="logo" target="_self">${escapeHtml(siteTitle)}</a>
        <span class="preview-badge">PREVIEW</span>
    </header>
    <div class="hero">
        <h1>${escapeHtml(siteTitle)}</h1>
        <p>Expert guides about ${escapeHtml(domainRow.niche || 'various topics')}</p>
    </div>
    <h2>Articles (${allArticles.length})</h2>
    <ul class="articles">
        ${articleListHtml}
    </ul>
    <footer>
        <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteTitle)} · Preview Mode · Theme: ${escapeHtml(domainRow.themeStyle || 'default')}</p>
    </footer>
</body>
</html>`;

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
