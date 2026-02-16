import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getRequestUser } from '@/lib/auth';
import { db, domains } from '@/lib/db';
import { and, isNull } from 'drizzle-orm';
import { getAIClient } from '@/lib/ai/openrouter';

const DOMAIN_REGEX = /^(?!-)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
function isValidDomain(value: string): boolean {
    return DOMAIN_REGEX.test(value) && value.length <= 253;
}

const RDAP_TIMEOUT_MS = 3000;
const MAX_CONCURRENT_CHECKS = 5;
const MAX_REROLL_ATTEMPTS = 3;

type AvailabilityStatus = 'available' | 'taken' | 'unknown';

interface DomainSuggestion {
    domain: string;
    available: AvailabilityStatus;
}

/**
 * Check domain availability via RDAP.
 * 404 = not registered (available), 200 = registered (taken).
 */
async function checkDomainAvailability(domain: string): Promise<AvailabilityStatus> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);

        const res = await fetch(`https://rdap.org/domain/${domain}`, {
            method: 'HEAD',
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.status === 404) return 'available';
        if (res.ok || res.status === 200) return 'taken';
        // 429 or other errors - can't determine
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Check availability for a batch of domains with concurrency limiting.
 */
async function checkAvailabilityBatch(domainList: string[]): Promise<DomainSuggestion[]> {
    const results: DomainSuggestion[] = [];
    // Process in chunks to limit concurrent requests
    for (let i = 0; i < domainList.length; i += MAX_CONCURRENT_CHECKS) {
        const chunk = domainList.slice(i, i + MAX_CONCURRENT_CHECKS);
        const settled = await Promise.allSettled(
            chunk.map(async (domain) => ({
                domain,
                available: await checkDomainAvailability(domain),
            })),
        );
        for (const result of settled) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
        }
    }
    return results;
}

/**
 * POST /api/research/suggest
 * AI-powered domain suggestions based on portfolio gaps and niche expansion.
 * Checks domain availability via RDAP and rerolls AI if too few are available.
 */
export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    // Single-tenant app: requireAuth gates access. No per-user domain scoping needed.
    const _user = getRequestUser(request);

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
            .where(and(isNull(domains.deletedAt)));

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

        const ai = getAIClient();
        const availableDomains: DomainSuggestion[] = [];
        const alreadySuggested = new Set<string>();
        let totalChecked = 0;
        let totalCost = 0;
        let rerollCount = 0;
        const minRequired = Math.ceil(count * 0.5);

        for (let attempt = 0; attempt < MAX_REROLL_ATTEMPTS; attempt++) {
            const excludeList = [...alreadySuggested].slice(0, 50).join(', ');
            const excludeInstruction = alreadySuggested.size > 0
                ? `\nDO NOT suggest any of these (already checked): ${excludeList}`
                : '';

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
7. Consider AIO (AI Overview) resistance: tool/calculator domains survive AI better than pure info sites
8. IMPORTANT: Suggest domains that are LIKELY to be UNREGISTERED. Avoid common dictionary words alone. Prefer creative compound names, niche-specific terms, and longer-tail combinations.${excludeInstruction}

Return ONLY a valid JSON array of domain name strings (with .com TLD):
["example1.com", "example2.com", ...]`;

            const result = await ai.generateJSON<string[]>('keywordResearch', prompt);
            totalCost += result.cost;

            const candidates = Array.isArray(result.data)
                ? result.data.filter((s): s is string => typeof s === 'string' && isValidDomain(s) && !alreadySuggested.has(s.toLowerCase()))
                : [];

            // Track all suggested domains to avoid duplicates on reroll
            for (const c of candidates) alreadySuggested.add(c.toLowerCase());

            // Check availability
            const checked = await checkAvailabilityBatch(candidates);
            totalChecked += checked.length;

            for (const d of checked) {
                if (d.available === 'available' || d.available === 'unknown') {
                    availableDomains.push(d);
                }
            }

            // If we have enough available domains, stop
            if (availableDomains.length >= minRequired) break;

            rerollCount++;
        }

        // Sort: confirmed available first, then unknown
        availableDomains.sort((a, b) => {
            if (a.available === 'available' && b.available !== 'available') return -1;
            if (b.available === 'available' && a.available !== 'available') return 1;
            return 0;
        });

        return NextResponse.json({
            suggestions: availableDomains.slice(0, count).map((d) => ({
                domain: d.domain,
                available: d.available,
            })),
            availabilityChecked: true,
            totalChecked,
            totalAvailable: availableDomains.filter((d) => d.available === 'available').length,
            rerollCount,
            portfolioSize: portfolio.length,
            nicheCount: nicheCount.size,
            apiCost: totalCost,
        });
    } catch (error) {
        console.error('Domain suggestion failed:', error);
        return NextResponse.json(
            { error: 'Failed to generate suggestions' },
            { status: 500 }
        );
    }
}
