import { NextRequest, NextResponse } from 'next/server';
import { db, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { analyzeContentQuality, toPlainText } from '@/lib/review/content-quality';

interface PageProps {
    params: Promise<{ id: string }>;
}

// GET /api/articles/[id]/quality - Analyze article quality
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return NextResponse.json({ error: 'Invalid article ID format' }, { status: 400 });
    }

    try {
        const articleResult = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
        if (articleResult.length === 0) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }
        const article = articleResult[0];

        const plainText = toPlainText(article.contentMarkdown, article.contentHtml);
        const quality = analyzeContentQuality(plainText);

        // Quality score calculated on-demand; not persisted to DB

        return NextResponse.json({
            articleId: id,
            title: article.title,
            qualityScore: quality.qualityScore,
            status: quality.status,
            metrics: quality.metrics,
            aiPhrases: quality.aiPhrases,
            recommendations: quality.recommendations,
        });
    } catch (error) {
        console.error('Article quality check failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
