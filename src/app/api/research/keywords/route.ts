import { NextRequest, NextResponse } from 'next/server';
import { db, keywords, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, desc, isNull, and, gte, lte } from 'drizzle-orm';

// GET /api/research/keywords - Find keyword opportunities
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get('domainId');
    const minVolume = Number(searchParams.get('minVolume')) || 100;
    const maxDifficulty = Number(searchParams.get('maxDifficulty')) || 50;
    const unassigned = searchParams.get('unassigned') === 'true';
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

    try {
        const conditions = [];

        if (domainId) {
            conditions.push(eq(keywords.domainId, domainId));
        }
        if (minVolume > 0) {
            conditions.push(gte(keywords.monthlyVolume, minVolume));
        }
        if (maxDifficulty < 100) {
            conditions.push(lte(keywords.difficulty, maxDifficulty));
        }
        if (unassigned) {
            conditions.push(isNull(keywords.articleId));
        }

        let query = db.select({
            id: keywords.id,
            domainId: keywords.domainId,
            domain: domains.domain,
            keyword: keywords.keyword,
            monthlyVolume: keywords.monthlyVolume,
            cpc: keywords.cpc,
            difficulty: keywords.difficulty,
            intent: keywords.intent,
            status: keywords.status,
            articleId: keywords.articleId,
        })
            .from(keywords)
            .leftJoin(domains, eq(keywords.domainId, domains.id));

        if (conditions.length > 0) {
            query = query.where(and(...conditions)) as typeof query;
        }

        const results = await query
            .orderBy(desc(keywords.monthlyVolume))
            .limit(limit);

        // Calculate opportunity score
        const opportunities = results.map(kw => ({
            ...kw,
            opportunityScore: calculateOpportunityScore(kw),
        })).sort((a, b) => b.opportunityScore - a.opportunityScore);

        // Summary stats
        const summary = {
            totalKeywords: results.length,
            avgVolume: results.length > 0
                ? Math.round(results.reduce((sum, k) => sum + (k.monthlyVolume || 0), 0) / results.length)
                : 0,
            avgDifficulty: results.length > 0
                ? Math.round(results.reduce((sum, k) => sum + (k.difficulty || 0), 0) / results.length)
                : 0,
            unassignedCount: results.filter(k => !k.articleId).length,
        };

        return NextResponse.json({
            summary,
            keywords: opportunities,
        });
    } catch (error) {
        console.error('Keyword finder failed:', error);
        return NextResponse.json({ error: 'Failed to find keywords' }, { status: 500 });
    }
}

function calculateOpportunityScore(kw: {
    monthlyVolume: number | null;
    difficulty: number | null;
    cpc: number | null;
    articleId: string | null;
}): number {
    const volume = kw.monthlyVolume || 0;
    const difficulty = kw.difficulty || 50;
    const cpc = kw.cpc || 0;
    const hasArticle = !!kw.articleId;

    // Volume contributes up to 40 points
    const volumeScore = Math.min(40, Math.round((volume / 5000) * 40));

    // Low difficulty contributes up to 30 points (inverse)
    const difficultyScore = Math.round(((100 - difficulty) / 100) * 30);

    // CPC contributes up to 20 points
    const cpcScore = Math.min(20, Math.round((cpc / 3) * 20));

    // Unassigned gets 10 point bonus
    const unassignedBonus = hasArticle ? 0 : 10;

    return volumeScore + difficultyScore + cpcScore + unassignedBonus;
}
