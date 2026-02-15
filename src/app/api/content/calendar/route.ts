import { NextRequest, NextResponse } from 'next/server';
import { db, articles, domains, keywords } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, gte, lte, lt, and, isNull } from 'drizzle-orm';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/content/calendar - Content calendar view based on creation date
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const rawStart = searchParams.get('start');
    const rawEnd = searchParams.get('end');
    const domainId = searchParams.get('domainId');
    const strategy = searchParams.get('strategy') || 'timeline';

    if (!['timeline', 'keyword_opportunity'].includes(strategy)) {
        return NextResponse.json({ error: 'Invalid strategy. Use "timeline" or "keyword_opportunity".' }, { status: 400 });
    }

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
        if (strategy === 'keyword_opportunity') {
            const rawLimit = Number.parseInt(searchParams.get('limit') || '100', 10);
            const rawMinVolume = Number.parseInt(searchParams.get('minVolume') || '0', 10);
            const rawMaxDifficulty = Number.parseInt(searchParams.get('maxDifficulty') || '100', 10);
            const includeAssigned = searchParams.get('includeAssigned') === 'true';

            if (Number.isNaN(rawLimit) || rawLimit < 1) {
                return NextResponse.json({ error: 'Invalid limit value' }, { status: 400 });
            }
            if (Number.isNaN(rawMinVolume) || rawMinVolume < 0) {
                return NextResponse.json({ error: 'Invalid minVolume value' }, { status: 400 });
            }
            if (Number.isNaN(rawMaxDifficulty) || rawMaxDifficulty < 0 || rawMaxDifficulty > 100) {
                return NextResponse.json({ error: 'Invalid maxDifficulty value' }, { status: 400 });
            }

            const limit = Math.min(rawLimit, 500);
            const keywordConditions = [];

            if (domainId) {
                keywordConditions.push(eq(keywords.domainId, domainId));
            }
            if (!includeAssigned) {
                keywordConditions.push(isNull(keywords.articleId));
            }
            keywordConditions.push(gte(keywords.monthlyVolume, rawMinVolume));
            keywordConditions.push(lte(keywords.difficulty, rawMaxDifficulty));

            const keywordRows = await db
                .select({
                    id: keywords.id,
                    keyword: keywords.keyword,
                    domainId: keywords.domainId,
                    domain: domains.domain,
                    monthlyVolume: keywords.monthlyVolume,
                    cpc: keywords.cpc,
                    difficulty: keywords.difficulty,
                    status: keywords.status,
                    priority: keywords.priority,
                    intent: keywords.intent,
                    articleId: keywords.articleId,
                    lastCheckedAt: keywords.lastCheckedAt,
                })
                .from(keywords)
                .leftJoin(domains, eq(keywords.domainId, domains.id))
                .where(and(...keywordConditions));

            const maxVolume = Math.max(1, ...keywordRows.map(k => k.monthlyVolume || 0));
            const maxCpc = Math.max(1, ...keywordRows.map(k => Number(k.cpc || 0)));

            const opportunities = keywordRows
                .map((k) => {
                    const volumeScore = (k.monthlyVolume || 0) / maxVolume;
                    const difficultyScore = k.difficulty === null || k.difficulty === undefined
                        ? 0.4
                        : (100 - Math.min(Math.max(k.difficulty, 0), 100)) / 100;
                    const cpcScore = Number(k.cpc || 0) / maxCpc;
                    const priorityScore = Math.min(Math.max(k.priority || 0, 0), 10) / 10;
                    const opportunityScore = (0.45 * volumeScore) + (0.35 * difficultyScore) + (0.15 * cpcScore) + (0.05 * priorityScore);

                    let recommendedAction: 'publish_now' | 'queue_next_sprint' | 'research_supporting_cluster' | 'already_assigned' = 'research_supporting_cluster';
                    if (k.articleId) {
                        recommendedAction = 'already_assigned';
                    } else if ((k.difficulty ?? 100) <= 25 && (k.monthlyVolume || 0) >= 500) {
                        recommendedAction = 'publish_now';
                    } else if ((k.difficulty ?? 100) <= 50) {
                        recommendedAction = 'queue_next_sprint';
                    }

                    return {
                        ...k,
                        opportunityScore: Math.round(opportunityScore * 1000) / 1000,
                        recommendedAction,
                    };
                })
                .sort((a, b) => b.opportunityScore - a.opportunityScore)
                .slice(0, limit);

            const totalVolume = opportunities.reduce((sum, k) => sum + (k.monthlyVolume || 0), 0);
            const avgDifficulty = opportunities.length
                ? opportunities.reduce((sum, k) => sum + (k.difficulty || 0), 0) / opportunities.length
                : 0;

            return NextResponse.json({
                strategy: 'keyword_opportunity',
                filters: {
                    domainId: domainId || null,
                    minVolume: rawMinVolume,
                    maxDifficulty: rawMaxDifficulty,
                    includeAssigned,
                    limit,
                },
                summary: {
                    totalKeywords: opportunities.length,
                    totalVolume,
                    avgDifficulty: Math.round(avgDifficulty * 100) / 100,
                    publishNowCount: opportunities.filter(o => o.recommendedAction === 'publish_now').length,
                },
                opportunities,
            });
        }

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
