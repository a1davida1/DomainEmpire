/**
 * PDF generation using puppeteer.
 * Renders article HTML to clean, printable PDF.
 */

import type { Article } from '@/lib/db/schema';
import { db, articles } from '@/lib/db';
import { eq } from 'drizzle-orm';

// In-memory cache: contentHash -> PDF buffer
const pdfCache = new Map<string, { buffer: Buffer; cachedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

function getCacheKey(articleId: string, type: string): string {
    return `${articleId}:${type}`;
}

function buildPdfHtml(article: Article, type: 'article' | 'worksheet'): string {
    const title = article.title.replace(/</g, '&lt;');
    const content = article.contentHtml || article.contentMarkdown || '';

    if (type === 'worksheet') {
        return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; font-size: 14px; line-height: 1.6; }
  h1 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 8px; }
  h2, h3 { font-size: 16px; margin-top: 24px; }
  .worksheet-field { border-bottom: 1px solid #999; min-height: 24px; margin: 8px 0; padding: 4px 0; }
  .checkbox-item { display: flex; align-items: flex-start; gap: 8px; margin: 6px 0; }
  .checkbox-item::before { content: "\\2610"; font-size: 18px; }
  ul, ol { padding-left: 24px; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 11px; color: #666; }
  @page { margin: 1cm; }
</style>
</head><body>
<h1>${title}</h1>
<p style="color:#666;font-size:12px;">Worksheet — Fill in your answers below</p>
${content}
<div class="footer">
  <p>Generated from ${article.targetKeyword || title} | Print date: ${new Date().toLocaleDateString()}</p>
</div>
</body></html>`;
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Georgia, serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; font-size: 14px; line-height: 1.7; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  h3 { font-size: 15px; margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  blockquote { border-left: 3px solid #ccc; margin: 16px 0; padding: 8px 16px; color: #555; }
  code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 13px; }
  ul, ol { padding-left: 24px; }
  img { max-width: 100%; height: auto; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 11px; color: #666; }
  @page { margin: 1.5cm; }
</style>
</head><body>
<h1>${title}</h1>
<p class="meta">${article.metaDescription || ''}</p>
${content}
<div class="footer">
  <p>Last updated: ${article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : 'N/A'}</p>
</div>
</body></html>`;
}

/**
 * Generate a PDF buffer for an article.
 * Falls back to a simple HTML-to-text approach if puppeteer isn't available.
 */
export async function generateArticlePdf(
    articleId: string,
    type: 'article' | 'worksheet' = 'article',
): Promise<Buffer> {
    const cacheKey = getCacheKey(articleId, type);
    const cached = pdfCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return cached.buffer;
    }

    const articleResult = await db.select().from(articles).where(eq(articles.id, articleId)).limit(1);
    if (articleResult.length === 0) throw new Error('Article not found');
    const article = articleResult[0];

    const html = buildPdfHtml(article, type);

    let pdfBuffer: Buffer;

    try {
        // Try puppeteer for real PDF generation (optional dependency)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const puppeteer = await import(/* webpackIgnore: true */ 'puppeteer' as string);
        const browser = await puppeteer.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' },
        });
        await browser.close();
        pdfBuffer = Buffer.from(pdf);
    } catch {
        // Fallback: return the HTML as a "printable" document
        // This allows the endpoint to still work without puppeteer installed
        console.warn('Puppeteer not available, returning HTML for print');
        pdfBuffer = Buffer.from(html, 'utf-8');
    }

    pdfCache.set(cacheKey, { buffer: pdfBuffer, cachedAt: Date.now() });

    // Prune old cache entries
    if (pdfCache.size > 100) {
        const now = Date.now();
        for (const [key, val] of pdfCache) {
            if (now - val.cachedAt > CACHE_TTL_MS) pdfCache.delete(key);
        }
    }

    return pdfBuffer;
}
