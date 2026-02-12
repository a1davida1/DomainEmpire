import { NextRequest, NextResponse } from 'next/server';
import { db, articles, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, gte, lt, and, isNull } from 'drizzle-orm';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/content/calendar - Content calendar view based on creation date
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const rawStart = searchParams.get('start');
    const rawEnd = searchParams.get('end');
    const domainId = searchParams.get('domainId');

    // Validate date formats if provided
    if (rawStart && !ISO_DATE_RE.test(rawStart)) {
        return NextResponse.json({ error: 'Invalid start date format. Use YYYY-MM-DD.' }, { status: 400 });
    }
    if (rawEnd && !ISO_DATE_RE.test(rawEnd)) {
        return NextResponse.json({ error: 'Invalid end date format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    const startDate = rawStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = rawEnd || new Date().toISOString().split('T')[0];

    try {
        // Compute nextDay to include articles created on endDate (exclusive upper bound)
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const conditions = [
            gte(articles.createdAt, new Date(startDate)),
            lt(articles.createdAt, nextDay),
            isNull(articles.deletedAt),
        ];

        if (domainId) {
            conditions.push(eq(articles.domainId, domainId));
        }

        const articleList = await db
            .select({
                id: articles.id,
                title: articles.title,
                slug: articles.slug,
                status: articles.status,
                createdAt: articles.createdAt,
                publishedAt: articles.publishedAt,
                domainId: articles.domainId,
                domain: domains.domain,
                wordCount: articles.wordCount,
            })
            .from(articles)
            .leftJoin(domains, eq(articles.domainId, domains.id))
            .where(and(...conditions))
            .orderBy(articles.createdAt);

        // Group by date
        const calendar: Record<string, typeof articleList> = {};
        for (const article of articleList) {
            const date = article.createdAt?.toISOString().split('T')[0] || 'unknown';
            if (!calendar[date]) calendar[date] = [];
            calendar[date].push(article);
        }

        // Summary stats
        const summary = {
            totalArticles: articleList.length,
            byStatus: {
                draft: articleList.filter(a => a.status === 'draft').length,
                review: articleList.filter(a => a.status === 'review').length,
                generating: articleList.filter(a => a.status === 'generating').length,
                published: articleList.filter(a => a.status === 'published').length,
            },
            daysWithContent: Object.keys(calendar).length,
        };

        return NextResponse.json({
            period: { start: startDate, end: endDate },
            summary,
            calendar,
        });
    } catch (error) {
        console.error('Content calendar failed:', error);
        return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to get calendar' }, { status: 500 });
    }
}
