/**
 * PDF generation endpoint for articles.
 * GET /api/articles/[id]/pdf?type=article|worksheet
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateArticlePdf } from '@/lib/pdf/generator';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const { id } = await params;
        const type = (request.nextUrl.searchParams.get('type') || 'article') as 'article' | 'worksheet';

        if (type !== 'article' && type !== 'worksheet') {
            return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
        }

        const pdfBuffer = await generateArticlePdf(id, type);

        // Detect if we got HTML fallback (no puppeteer) vs real PDF
        const isHtml = pdfBuffer.slice(0, 15).toString().startsWith('<!DOCTYPE');
        const contentType = isHtml ? 'text/html; charset=utf-8' : 'application/pdf';
        const ext = isHtml ? 'html' : 'pdf';

        return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="article-${id}.${ext}"`,
            },
        });
    } catch (error) {
        console.error('PDF generation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
