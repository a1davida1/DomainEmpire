import { NextRequest, NextResponse } from 'next/server';
import { db, apiCallLogs, contentQueue, articles } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sql, gte } from 'drizzle-orm';

// GET /api/analytics/costs - Get AI cost summary
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const rawDays = searchParams.get('days');
    const parsedDays = parseInt(rawDays || '30', 10);
    // Validate: must be integer > 0, clamp to 365
    const days = (Number.isNaN(parsedDays) || parsedDays < 1) ? 30 : Math.min(parsedDays, 365);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
        // Costs by stage from API call logs
        const costsByStage = await db
            .select({
                stage: apiCallLogs.stage,
                totalCost: sql<number>`sum(${apiCallLogs.cost})::float`,
                totalInputTokens: sql<number>`sum(${apiCallLogs.inputTokens})::int`,
                totalOutputTokens: sql<number>`sum(${apiCallLogs.outputTokens})::int`,
                callCount: sql<number>`count(*)::int`,
                avgDuration: sql<number>`avg(${apiCallLogs.durationMs})::int`,
            })
            .from(apiCallLogs)
            .where(gte(apiCallLogs.createdAt, startDate))
            .groupBy(apiCallLogs.stage);

        // Costs by model
        const costsByModel = await db
            .select({
                model: apiCallLogs.model,
                totalCost: sql<number>`sum(${apiCallLogs.cost})::float`,
                totalInputTokens: sql<number>`sum(${apiCallLogs.inputTokens})::int`,
                totalOutputTokens: sql<number>`sum(${apiCallLogs.outputTokens})::int`,
                callCount: sql<number>`count(*)::int`,
            })
            .from(apiCallLogs)
            .where(gte(apiCallLogs.createdAt, startDate))
            .groupBy(apiCallLogs.model);

        // Daily costs for chart
        const dailyCosts = await db
            .select({
                date: sql<string>`date(${apiCallLogs.createdAt})`,
                totalCost: sql<number>`sum(${apiCallLogs.cost})::float`,
                callCount: sql<number>`count(*)::int`,
            })
            .from(apiCallLogs)
            .where(gte(apiCallLogs.createdAt, startDate))
            .groupBy(sql`date(${apiCallLogs.createdAt})`)
            .orderBy(sql`date(${apiCallLogs.createdAt})`);

        // Queue job costs
        const queueCosts = await db
            .select({
                jobType: contentQueue.jobType,
                totalCost: sql<number>`sum(${contentQueue.apiCost})::float`,
                totalTokens: sql<number>`sum(${contentQueue.apiTokensUsed})::int`,
                jobCount: sql<number>`count(*)::int`,
                completedCount: sql<number>`count(case when ${contentQueue.status} = 'completed' then 1 end)::int`,
                failedCount: sql<number>`count(case when ${contentQueue.status} = 'failed' then 1 end)::int`,
            })
            .from(contentQueue)
            .where(gte(contentQueue.createdAt, startDate))
            .groupBy(contentQueue.jobType);

        // Articles generation costs
        const articleCosts = await db
            .select({
                totalCost: sql<number>`sum(${articles.generationCost})::float`,
                articleCount: sql<number>`count(*)::int`,
                avgCostPerArticle: sql<number>`avg(${articles.generationCost})::float`,
                totalWords: sql<number>`sum(${articles.wordCount})::int`,
            })
            .from(articles)
            .where(gte(articles.createdAt, startDate));

        // Calculate totals
        const totalCost = costsByStage.reduce((sum, s) => sum + (s.totalCost || 0), 0);
        const totalTokens = costsByStage.reduce((sum, s) => sum + (s.totalInputTokens || 0) + (s.totalOutputTokens || 0), 0);
        const totalCalls = costsByStage.reduce((sum, s) => sum + (s.callCount || 0), 0);

        return NextResponse.json({
            period: {
                days,
                startDate: startDate.toISOString(),
                endDate: new Date().toISOString(),
            },
            summary: {
                totalCost: Math.round(totalCost * 100) / 100,
                totalTokens,
                totalCalls,
                avgCostPerCall: totalCalls > 0 ? Math.round((totalCost / totalCalls) * 1000) / 1000 : 0,
            },
            costsByStage: costsByStage.map(s => ({
                ...s,
                totalCost: Math.round((s.totalCost || 0) * 100) / 100,
            })),
            costsByModel: costsByModel.map(m => ({
                ...m,
                totalCost: Math.round((m.totalCost || 0) * 100) / 100,
            })),
            dailyCosts: dailyCosts.map(d => ({
                ...d,
                totalCost: Math.round((d.totalCost || 0) * 100) / 100,
            })),
            queueCosts: queueCosts.map(q => ({
                ...q,
                totalCost: Math.round((q.totalCost || 0) * 100) / 100,
            })),
            articleCosts: (() => {
                const ac = articleCosts[0] || { totalCost: 0, avgCostPerArticle: 0, articleCount: 0, totalWords: 0 };
                return {
                    ...ac,
                    totalCost: Math.round((ac.totalCost || 0) * 100) / 100,
                    avgCostPerArticle: Math.round((ac.avgCostPerArticle || 0) * 100) / 100,
                };
            })(),
        });
    } catch (error) {
        console.error('Failed to fetch cost analytics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch cost analytics' },
            { status: 500 }
        );
    }
}
