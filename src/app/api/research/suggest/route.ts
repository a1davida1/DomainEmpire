import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { isNull } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';

/**
 * POST /api/research/suggest
 * AI-powered domain suggestions based on portfolio gaps and niche expansion.
 */
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const rawCount = Number(body.count);
        const count = Math.max(1, Math.min(Number.isFinite(rawCount) ? rawCount : 10, 25));

        // Analyze current portfolio composition
        const portfolio = await db
            .select({
                niche: domains.niche,
                vertical: domains.vertical,
                tier: domains.tier,
                domain: domains.domain,
                siteTemplate: domains.siteTemplate,
                monetizationModel: domains.monetizationModel,
            })
            .from(domains)
            .where(isNull(domains.deletedAt));

        // Build portfolio summary for AI
        const nicheCount = new Map<string, number>();
        const templateCount = new Map<string, number>();
        const verticalCount = new Map<string, number>();
        const domainNames: string[] = [];

        for (const d of portfolio) {
            const n = d.niche || 'unclassified';
            nicheCount.set(n, (nicheCount.get(n) || 0) + 1);
            if (d.siteTemplate) templateCount.set(d.siteTemplate, (templateCount.get(d.siteTemplate) || 0) + 1);
            if (d.vertical) verticalCount.set(d.vertical, (verticalCount.get(d.vertical) || 0) + 1);
            domainNames.push(d.domain);
        }

        const portfolioSummary = {
            totalDomains: portfolio.length,
            nicheBreakdown: Object.fromEntries(nicheCount),
            templateBreakdown: Object.fromEntries(templateCount),
            verticalBreakdown: Object.fromEntries(verticalCount),
            existingDomains: domainNames.slice(0, 50),
        };

        const prompt = `You are a domain portfolio strategist. Analyze this portfolio and suggest ${count} NEW domain names to acquire.

CURRENT PORTFOLIO (${portfolioSummary.totalDomains} domains):
Niches: ${JSON.stringify(portfolioSummary.nicheBreakdown)}
Site Templates: ${JSON.stringify(portfolioSummary.templateBreakdown)}
Verticals: ${JSON.stringify(portfolioSummary.verticalBreakdown)}
Sample domains: ${portfolioSummary.existingDomains.slice(0, 30).join(', ')}

STRATEGY REQUIREMENTS:
1. Suggest domains that COMPLEMENT the existing portfolio (fill gaps, strengthen weak niches)
2. Focus on calculator, comparison, and decision tool domains (these are the portfolio's strength)
3. Target .com domains primarily
4. Names should be:
   - Keyword-rich (exact match or partial match for high-CPC queries)
   - Short (under 20 chars ideally)
   - Easy to remember and type
   - Tool-oriented (people searching to calculate, compare, decide something)
5. Prioritize niches where the portfolio is UNDERWEIGHT relative to opportunity
6. Avoid domains too similar to existing ones
7. Consider AIO (AI Overview) resistance — tool/calculator domains survive AI better than pure info sites

Return ONLY a valid JSON array of domain name strings (with .com TLD):
["example1.com", "example2.com", ...]`;

        const ai = getAIClient();
        const result = await ai.generateJSON<string[]>('keywordResearch', prompt);

        const suggestions = Array.isArray(result.data)
            ? result.data.filter((s): s is string => typeof s === 'string' && s.includes('.'))
            : [];

        return NextResponse.json({
            suggestions: suggestions.slice(0, count),
            portfolioSize: portfolio.length,
            nicheCount: nicheCount.size,
            apiCost: result.cost,
        });
    } catch (error) {
        console.error('Domain suggestion failed:', error);
        return NextResponse.json(
            { error: 'Failed to generate suggestions' },
            { status: 500 }
        );
    }
}
