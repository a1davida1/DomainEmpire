/**
 * Domain Evaluator
 *
 * Orchestrates multi-signal domain evaluation:
 * 1. Brand quality scoring (instant, local)
 * 2. Keyword & SERP analysis (Perplexity, with fallback)
 * 3. Market & competition research (Perplexity, with fallback)
 * 4. Investment thesis & projections (Grok, with fallback)
 * 5. Portfolio fit analysis (local, queries existing domains + revenue)
 * 6. Domain availability check (GoDaddy API)
 * 7. Domain age lookup (RDAP)
 *
 * Features:
 * - 24h evaluation caching to avoid redundant API calls
 * - AI error resilience with automatic fallback to heuristics
 * - Niche-adaptive composite score weights
 * - Full result persistence + evaluation history
 * - Revenue projections scaled by niche competitiveness
 *
 * Total cost per full evaluation: ~$0.015
 */

import { scoreBrandQuality, type BrandSignal } from './brand-scorer';
import { detectNiche, getNicheProfile, estimateRevenue, detectSubNiche, type NicheProfile } from './niche-data';
import { keywordSerpPrompt, marketAnalysisPrompt, investmentThesisPrompt } from './prompts';
import { getAIClient } from '@/lib/ai/openrouter';
import { db, domains, domainResearch, apiCallLogs, revenueSnapshots } from '@/lib/db';
import { eq, and, gte, sql } from 'drizzle-orm';
import { checkDomainAvailability } from '@/lib/deploy/godaddy';

// ─── Result Types ───────────────────────────────────────────

export interface EvaluationResult {
    domain: string;
    compositeScore: number;
    recommendation: 'strong_buy' | 'buy' | 'conditional' | 'pass' | 'hard_pass';
    subNiche?: string;
    signals: {
        brand: BrandSignal;
        keyword: KeywordSignal;
        serp: SerpSignal;
        monetization: MonetizationSignal;
        market: MarketSignal;
        mechanics: MechanicsSignal;
    };
    contentPlan: ContentPlan;
    revenueProjections: RevenueProjections;
    flipValuation: FlipValuation;
    riskAssessment: RiskAssessment;
    portfolioFit: PortfolioFit;
    costs: CostBreakdown;
    aiSummary: string;
    evaluatedAt: string;
    apiCost: number;
    /** Whether any AI signals fell back to heuristics due to errors */
    hadAiFallback: boolean;
}

interface KeywordSignal {
    score: number;
    primaryKeyword: string;
    volume: number;
    cpc: number;
    difficulty: number;
    longTailCount: number;
    topKeywords: string[];
}

interface SerpSignal {
    score: number;
    weakCompetitors: number;
    contentGaps: string[];
    snippetOpportunity: boolean;
    forumResults: boolean;
    avgCompetitorWordCount: number;
}

interface MonetizationSignal {
    score: number;
    bestModel: string;
    estimatedRpm: [number, number];
    affiliatePrograms: Array<{ name: string; commissionRange: string }>;
    leadGenViable: boolean;
    leadGenValueRange: [number, number];
    additionalSources: string[];
}

interface MarketSignal {
    score: number;
    trend: 'growing' | 'stable' | 'declining';
    sizeEstimate: string;
    seasonal: boolean;
    ymyl: boolean;
    recentDevelopments: string[];
}

interface MechanicsSignal {
    score: number;
    estimatedRegPrice: number;
    estimatedRenewalPrice: number;
    tldValue: string;
    domainAge: 'new' | 'aged' | 'unknown';
    domainRegisteredDate?: string;
    available?: boolean;
    registrationPrice?: number;
    trademarkConcern: boolean;
}

interface ContentPlan {
    articlesForAuthority: number;
    estimatedContentCost: number;
    recommendedTypes: string[];
    monthsToInitialCluster: number;
}

interface RevenueProjections {
    month6: { pageviews: number; revenue: [number, number] };
    month12: { pageviews: number; revenue: [number, number] };
    month24: { pageviews: number; revenue: [number, number] };
    primarySource: string;
    secondarySources: string[];
}

interface FlipValuation {
    flipReadyRevenue: number;
    nicheMultiple: [number, number];
    projectedFlipValue12mo: [number, number];
    projectedFlipValue24mo: [number, number];
    breakEvenMonths: number;
}

interface RiskAssessment {
    overallRisk: 'low' | 'medium' | 'high';
    ymylSeverity: 'none' | 'moderate' | 'high';
    regulatoryRisks: string[];
    trademarkConcern: boolean;
    aiContentRisk: 'low' | 'medium' | 'high';
    seasonalityScore: number;
    successProbability: number;
    biggestRisk: string;
    dealBreaker: string;
}

interface PortfolioFit {
    duplicateNiche: boolean;
    existingDomainsInNiche: string[];
    complementsExisting: string[];
    diversification: 'improves' | 'neutral' | 'concentrates';
    portfolioNicheCount: number;
    avgMonthlyRevenue?: number;
}

interface CostBreakdown {
    acquisition: number;
    yearOneContent: number;
    yearOneRenewal: number;
    yearOneTotal: number;
}

// ─── Main Evaluator ─────────────────────────────────────────

export interface EvaluateOptions {
    /** Known acquisition/registration cost. Default: 12 (typical .com) */
    acquisitionCost?: number;
    /** Override niche detection */
    niche?: string;
    /** Skip AI calls (brand + niche heuristics only). Much faster, free. */
    quickMode?: boolean;
    /** Force re-evaluation even if cached result exists */
    forceRefresh?: boolean;
}

/**
 * Run a domain evaluation
 */
export async function evaluateDomain(
    domain: string,
    options: EvaluateOptions = {}
): Promise<EvaluationResult> {
    // Check cache first (evaluations <24h old)
    if (!options.forceRefresh) {
        const cached = await getCachedEvaluation(domain);
        if (cached) return cached;
    }

    const startTime = Date.now();
    let totalApiCost = 0;
    let hadAiFallback = false;

    // Step 1: Instant local analysis
    const detectedNiche = options.niche || detectNiche(domain);
    const nicheProfile = getNicheProfile(detectedNiche);
    const brandSignal = scoreBrandQuality(domain, detectedNiche);
    const subNiche = detectSubNiche(domain, detectedNiche);
    const acquisitionCost = options.acquisitionCost ?? 12;

    // Deterministic preflight gates: fail fast before paying AI costs.
    const preflightHardFail = getDeterministicHardFail(domain, brandSignal, acquisitionCost);

    // Step 2: Portfolio fit (local DB query)
    const portfolioFit = await analyzePortfolioFit(domain, detectedNiche);

    // Step 3: Domain availability + age (non-blocking, don't fail on error)
    const availabilityPromise = checkDomainAvailability(domain).catch(() => null);
    const domainAgePromise = lookupDomainAge(domain).catch(() => null);

    if (options.quickMode) {
        const [availability, domainAge] = await Promise.all([availabilityPromise, domainAgePromise]);
        const availabilityHardFail = getAvailabilityHardFail(availability, acquisitionCost);
        const hardFailReason = preflightHardFail?.reason || availabilityHardFail?.reason;

        let quickResult = buildQuickResult(
            domain,
            brandSignal,
            detectedNiche,
            subNiche,
            nicheProfile,
            portfolioFit,
            options,
            availability,
            domainAge
        );

        if (hardFailReason) {
            quickResult = buildHardPassResult(quickResult, hardFailReason);
        }

        await persistEvaluation(quickResult, detectedNiche).catch(err =>
            console.error('Failed to persist evaluation:', err)
        );
        return quickResult;
    }

    // Resolve availability/age before AI calls to avoid paying for obvious hard-fails.
    const [availability, domainAge] = await Promise.all([availabilityPromise, domainAgePromise]);
    const availabilityHardFail = getAvailabilityHardFail(availability, acquisitionCost);
    const hardFailReason = preflightHardFail?.reason || availabilityHardFail?.reason;

    if (hardFailReason) {
        const durationMs = Date.now() - startTime;
        const result = buildHardPassResult(
            buildQuickResult(
                domain,
                brandSignal,
                detectedNiche,
                subNiche,
                nicheProfile,
                portfolioFit,
                options,
                availability,
                domainAge
            ),
            hardFailReason
        );

        await persistEvaluation(result, detectedNiche).catch(err =>
            console.error('Failed to persist evaluation:', err)
        );

        console.log(`Evaluated ${domain} in ${durationMs}ms — hard pass: ${hardFailReason}`);
        return result;
    }

    // Step 4: AI-powered analysis with error resilience
    const ai = getAIClient();

    let keywordData: KeywordSerpResponse | null = null;
    let marketData: MarketAnalysisResponse | null = null;

    // Parallel: keyword/SERP + market
    const [keywordOutcome, marketOutcome] = await Promise.all([
        safeAICall(() => ai.generateJSON<KeywordSerpResponse>('research', keywordSerpPrompt(domain, detectedNiche))),
        safeAICall(() => ai.generateJSON<MarketAnalysisResponse>('research', marketAnalysisPrompt(domain, detectedNiche))),
    ]);

    if (keywordOutcome.success) {
        keywordData = keywordOutcome.result.data;
        totalApiCost += keywordOutcome.result.cost;
        await logApiCall('evaluate', keywordOutcome.result);
    } else {
        console.warn(`Keyword AI failed for ${domain}, using heuristics:`, keywordOutcome.error);
        hadAiFallback = true;
    }

    if (marketOutcome.success) {
        marketData = marketOutcome.result.data;
        totalApiCost += marketOutcome.result.cost;
        await logApiCall('evaluate', marketOutcome.result);
    } else {
        console.warn(`Market AI failed for ${domain}, using heuristics:`, marketOutcome.error);
        hadAiFallback = true;
    }

    // Step 5: Investment thesis (depends on keyword + market results)
    let thesisData: InvestmentThesisResponse | null = null;

    if (keywordData && marketData) {
        const thesisOutcome = await safeAICall(() =>
            ai.generateJSON<InvestmentThesisResponse>(
                'keywordResearch', // Uses Grok fast
                investmentThesisPrompt(
                    domain,
                    detectedNiche,
                    brandSignal.score,
                    {
                        volume: keywordData!.primaryKeyword.monthlyVolume,
                        difficulty: keywordData!.primaryKeyword.difficulty,
                        cpc: keywordData!.primaryKeyword.cpc,
                    },
                    {
                        trend: marketData!.market.trend,
                        ymyl: marketData!.risks.ymylSeverity,
                        rpm: marketData!.monetization.estimatedRpm,
                    },
                    acquisitionCost
                )
            )
        );

        if (thesisOutcome.success) {
            thesisData = thesisOutcome.result.data;
            totalApiCost += thesisOutcome.result.cost;
            await logApiCall('evaluate', thesisOutcome.result);
        } else {
            console.warn(`Thesis AI failed for ${domain}, using heuristics:`, thesisOutcome.error);
            hadAiFallback = true;
        }
    } else {
        hadAiFallback = true;
    }

    // Step 6: Build signals (with fallbacks for missing AI data)
    const keywordSignal = buildKeywordSignal(keywordData, brandSignal, nicheProfile);
    const serpSignal = buildSerpSignal(keywordData, nicheProfile);
    const monetizationSignal = buildMonetizationSignal(marketData, nicheProfile);
    const marketSignal = buildMarketSignal(marketData, nicheProfile);
    const mechanicsSignal = buildMechanicsSignal(brandSignal, marketData, acquisitionCost, availability, domainAge);

    // Step 7: Niche-adaptive composite score
    const weights = getCompositeWeights(nicheProfile);
    const compositeScore = Math.round(
        keywordSignal.score * weights.keyword +
        serpSignal.score * weights.serp +
        brandSignal.score * weights.brand +
        monetizationSignal.score * weights.monetization +
        marketSignal.score * weights.market +
        mechanicsSignal.score * weights.mechanics
    );

    const recommendation = getRecommendation(compositeScore, thesisData?.verdict.recommendation ?? null);

    // Build content plan and projections from AI or heuristics
    const contentPlan = thesisData?.contentPlan ?? buildFallbackContentPlan(nicheProfile);
    const revenueProjections = thesisData?.revenueProjections ?? buildFallbackRevenueProjections(detectedNiche, nicheProfile);
    const flipValuation = thesisData?.flipValuation ?? buildFallbackFlipValuation();

    const yearOneContent = contentPlan.estimatedContentCost;
    const yearOneRenewal = mechanicsSignal.estimatedRenewalPrice;
    const durationMs = Date.now() - startTime;

    const result: EvaluationResult = {
        domain,
        compositeScore,
        recommendation,
        subNiche,
        signals: {
            brand: brandSignal,
            keyword: keywordSignal,
            serp: serpSignal,
            monetization: monetizationSignal,
            market: marketSignal,
            mechanics: mechanicsSignal,
        },
        contentPlan,
        revenueProjections,
        flipValuation,
        riskAssessment: buildRiskAssessment(marketData, thesisData, nicheProfile),
        portfolioFit,
        costs: {
            acquisition: acquisitionCost,
            yearOneContent,
            yearOneRenewal,
            yearOneTotal: acquisitionCost + yearOneContent + yearOneRenewal,
        },
        aiSummary: thesisData?.verdict.summary
            ?? `Evaluation of ${domain} in the ${detectedNiche} niche (score: ${compositeScore}/100).${hadAiFallback ? ' Some AI signals used heuristic fallbacks.' : ''}`,
        evaluatedAt: new Date().toISOString(),
        apiCost: Math.round(totalApiCost * 1000) / 1000,
        hadAiFallback,
    };

    // Step 8: Persist to domainResearch table (full result + history)
    await persistEvaluation(result, detectedNiche).catch(err =>
        console.error('Failed to persist evaluation:', err)
    );

    console.log(`Evaluated ${domain} in ${durationMs}ms — score: ${compositeScore}, cost: $${result.apiCost}`);

    return result;
}

// ─── AI Error Resilience ────────────────────────────────────

type SafeResult<T> =
    | { success: true; result: T }
    | { success: false; error: string };

async function safeAICall<T>(fn: () => Promise<T>): Promise<SafeResult<T>> {
    try {
        const result = await fn();
        return { success: true, result };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function logApiCall(stage: string, result: { model: string; inputTokens: number; outputTokens: number; cost: number; durationMs: number }): Promise<void> {
    await db.insert(apiCallLogs).values({
        stage: stage as 'evaluate',
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        durationMs: result.durationMs,
    }).catch(() => { }); // Don't fail on log error
}

// ─── Signal Builders (with fallbacks) ───────────────────────

function buildKeywordSignal(
    aiData: KeywordSerpResponse | null,
    brand: BrandSignal,
    nicheProfile: NicheProfile
): KeywordSignal {
    if (aiData) {
        return {
            score: aiData.keywordOpportunityScore,
            primaryKeyword: aiData.primaryKeyword.keyword,
            volume: aiData.primaryKeyword.monthlyVolume,
            cpc: aiData.primaryKeyword.cpc,
            difficulty: aiData.primaryKeyword.difficulty,
            longTailCount: aiData.longTailKeywords.length,
            topKeywords: aiData.longTailKeywords.map(k => k.keyword),
        };
    }
    // Fallback: estimate from brand signal and niche
    const avgCpcMid = (nicheProfile.avgCpc[0] + nicheProfile.avgCpc[1]) / 2;
    return {
        score: brand.isExactMatch ? 80 : brand.isPartialMatch ? 55 : 30,
        primaryKeyword: '(AI unavailable — heuristic estimate)',
        volume: 0,
        cpc: avgCpcMid,
        difficulty: 0,
        longTailCount: 0,
        topKeywords: [],
    };
}

function buildSerpSignal(
    aiData: KeywordSerpResponse | null,
    nicheProfile: NicheProfile
): SerpSignal {
    if (aiData) {
        return {
            score: calculateSerpScore(aiData.serpAnalysis),
            weakCompetitors: aiData.serpAnalysis.weakCompetitorsInTop10,
            contentGaps: aiData.serpAnalysis.contentGaps,
            snippetOpportunity: aiData.serpAnalysis.featuredSnippetAvailable,
            forumResults: aiData.serpAnalysis.forumResultsPresent,
            avgCompetitorWordCount: aiData.serpAnalysis.avgTopResultWordCount,
        };
    }
    return {
        score: nicheProfile.ymyl ? 30 : nicheProfile.expertiseRequired <= 2 ? 60 : 45,
        weakCompetitors: 0,
        contentGaps: [],
        snippetOpportunity: false,
        forumResults: false,
        avgCompetitorWordCount: 0,
    };
}

function buildMonetizationSignal(
    aiData: MarketAnalysisResponse | null,
    nicheProfile: NicheProfile
): MonetizationSignal {
    if (aiData) {
        return {
            score: calculateMonetizationScore(aiData.monetization, nicheProfile),
            bestModel: nicheProfile.bestModels[0],
            estimatedRpm: aiData.monetization.estimatedRpm,
            affiliatePrograms: aiData.monetization.topAffiliatePrograms,
            leadGenViable: aiData.monetization.leadGenViable,
            leadGenValueRange: aiData.monetization.leadGenValueRange,
            additionalSources: aiData.monetization.additionalRevenueSources,
        };
    }
    const rpmMid = (nicheProfile.rpmRange[0] + nicheProfile.rpmRange[1]) / 2;
    return {
        score: rpmMid >= 30 ? 75 : rpmMid >= 15 ? 55 : 35,
        bestModel: nicheProfile.bestModels[0],
        estimatedRpm: nicheProfile.rpmRange,
        affiliatePrograms: [],
        leadGenViable: nicheProfile.bestModels.includes('leadgen'),
        leadGenValueRange: nicheProfile.leadGenValue,
        additionalSources: [],
    };
}

function buildMarketSignal(
    aiData: MarketAnalysisResponse | null,
    nicheProfile: NicheProfile
): MarketSignal {
    if (aiData) {
        return {
            score: aiData.marketScore,
            trend: aiData.market.trend,
            sizeEstimate: aiData.market.sizeEstimate,
            seasonal: aiData.risks.seasonalityScore > 0.5,
            ymyl: aiData.risks.ymylSeverity !== 'none',
            recentDevelopments: aiData.market.recentDevelopments,
        };
    }
    return {
        score: nicheProfile.trend === 'growing' ? 70 : nicheProfile.trend === 'stable' ? 50 : 30,
        trend: nicheProfile.trend,
        sizeEstimate: '(AI unavailable)',
        seasonal: nicheProfile.seasonality > 0.4,
        ymyl: nicheProfile.ymyl,
        recentDevelopments: [],
    };
}

function buildMechanicsSignal(
    brand: BrandSignal,
    market: MarketAnalysisResponse | null,
    acquisitionCost: number,
    availability: { available: boolean; price?: number } | null,
    domainAge: { age: string; registeredDate: string } | null,
): MechanicsSignal {
    let score = 50;

    // Cheap acquisition = better
    if (acquisitionCost <= 12) score += 20;
    else if (acquisitionCost <= 50) score += 10;
    else if (acquisitionCost <= 1000) score -= 10;
    else score -= 20;

    // Trademark risk
    if (market?.risks.trademarkConcern) score -= 25;

    // Comparable sales suggest value
    if (market && market.comparableSales.estimatedMarketValue[1] > acquisitionCost * 3) score += 15;
    else if (market && market.comparableSales.estimatedMarketValue[1] > acquisitionCost) score += 5;

    // TLD
    if (brand.tld === 'com') score += 10;

    // Availability bonus
    if (availability?.available) score += 5;

    // Aged domain bonus
    if (domainAge) score += 5;

    return {
        score: Math.max(0, Math.min(100, score)),
        estimatedRegPrice: availability?.price ?? acquisitionCost,
        estimatedRenewalPrice: brand.tld === 'com' ? 12 : 15,
        tldValue: brand.tld === 'com' ? 'premium' : (brand.tld === 'org' || brand.tld === 'net') ? 'good' : 'fair',
        domainAge: domainAge ? 'aged' : 'new',
        domainRegisteredDate: domainAge?.registeredDate,
        available: availability?.available,
        registrationPrice: availability?.price,
        trademarkConcern: market?.risks.trademarkConcern ?? false,
    };
}

function buildRiskAssessment(
    market: MarketAnalysisResponse | null,
    thesis: InvestmentThesisResponse | null,
    nicheProfile: NicheProfile
): RiskAssessment {
    if (market && thesis) {
        const overallRisk = thesis.verdict.successProbability > 60 ? 'low' as const
            : thesis.verdict.successProbability > 35 ? 'medium' as const : 'high' as const;
        return {
            overallRisk,
            ymylSeverity: market.risks.ymylSeverity,
            regulatoryRisks: market.risks.regulatoryRisks,
            trademarkConcern: market.risks.trademarkConcern,
            aiContentRisk: market.risks.aiContentRisk,
            seasonalityScore: market.risks.seasonalityScore,
            successProbability: thesis.verdict.successProbability,
            biggestRisk: thesis.verdict.biggestRisk,
            dealBreaker: thesis.verdict.dealBreaker,
        };
    }
    return {
        overallRisk: nicheProfile.ymyl ? 'high' : nicheProfile.expertiseRequired >= 3 ? 'medium' : 'low',
        ymylSeverity: nicheProfile.ymyl ? 'high' : 'none',
        regulatoryRisks: [],
        trademarkConcern: false,
        aiContentRisk: nicheProfile.ymyl ? 'high' : 'low',
        seasonalityScore: nicheProfile.seasonality,
        successProbability: 50,
        biggestRisk: nicheProfile.ymyl ? 'YMYL niche — Google scrutinizes content quality heavily' : 'Standard competition risk',
        dealBreaker: '(AI unavailable — run full evaluation for detailed risk analysis)',
    };
}

function buildFallbackContentPlan(nicheProfile: NicheProfile): ContentPlan {
    const articlesNeeded = (nicheProfile.articlesForAuthority[0] + nicheProfile.articlesForAuthority[1]) / 2;
    return {
        articlesForAuthority: Math.round(articlesNeeded),
        estimatedContentCost: Math.round(articlesNeeded * 7.5),
        recommendedTypes: ['authority guides', 'comparison articles', 'FAQ pages'],
        monthsToInitialCluster: Math.round((nicheProfile.monthsToRank[0] + nicheProfile.monthsToRank[1]) / 4),
    };
}

function buildFallbackRevenueProjections(niche: string, nicheProfile: NicheProfile): RevenueProjections {
    const multiplier = getCompetitivenessMultiplier(nicheProfile);
    const m6pv = Math.round(500 * multiplier);
    const m12pv = Math.round(3000 * multiplier);
    const m24pv = Math.round(15000 * multiplier);

    return {
        month6: { pageviews: m6pv, revenue: [estimateRevenue(niche, m6pv).total * 0.3, estimateRevenue(niche, m6pv).total] },
        month12: { pageviews: m12pv, revenue: [estimateRevenue(niche, m12pv).total * 0.5, estimateRevenue(niche, m12pv).total] },
        month24: { pageviews: m24pv, revenue: [estimateRevenue(niche, m24pv).total * 0.5, estimateRevenue(niche, m24pv).total] },
        primarySource: nicheProfile.bestModels[0],
        secondarySources: nicheProfile.bestModels.slice(1, 3),
    };
}

function buildFallbackFlipValuation(): FlipValuation {
    return {
        flipReadyRevenue: 200,
        nicheMultiple: [24, 36],
        projectedFlipValue12mo: [0, 500],
        projectedFlipValue24mo: [2000, 8000],
        breakEvenMonths: 14,
    };
}

// ─── Scoring Helpers ────────────────────────────────────────

function calculateSerpScore(serp: KeywordSerpResponse['serpAnalysis']): number {
    let score = 30;
    score += Math.min(40, serp.weakCompetitorsInTop10 * 8);
    if (serp.featuredSnippetAvailable) score += 10;
    if (serp.forumResultsPresent) score += 10;
    score += Math.min(10, serp.contentGaps.length * 3);
    return Math.min(100, score);
}

function calculateMonetizationScore(
    monetization: MarketAnalysisResponse['monetization'],
    _nicheProfile: NicheProfile
): number {
    let score = 20;
    const rpmMid = (monetization.estimatedRpm[0] + monetization.estimatedRpm[1]) / 2;
    if (rpmMid >= 40) score += 30;
    else if (rpmMid >= 20) score += 20;
    else if (rpmMid >= 10) score += 10;
    score += Math.min(20, monetization.topAffiliatePrograms.length * 5);
    if (monetization.leadGenViable) {
        const leadMid = (monetization.leadGenValueRange[0] + monetization.leadGenValueRange[1]) / 2;
        if (leadMid >= 50) score += 20;
        else if (leadMid >= 20) score += 10;
        else score += 5;
    }
    score += Math.min(10, monetization.additionalRevenueSources.length * 3);
    return Math.min(100, score);
}

/**
 * Get niche-adaptive composite score weights.
 * Different niches benefit from weighting different signals.
 */
function getCompositeWeights(nicheProfile: NicheProfile): Record<string, number> {
    // YMYL niches: market risk and mechanics matter more
    if (nicheProfile.ymyl) {
        return { keyword: 0.20, serp: 0.10, brand: 0.15, monetization: 0.20, market: 0.15, mechanics: 0.20 };
    }
    // High-RPM niches: monetization matters more
    const rpmMid = (nicheProfile.rpmRange[0] + nicheProfile.rpmRange[1]) / 2;
    if (rpmMid >= 30) {
        return { keyword: 0.20, serp: 0.15, brand: 0.10, monetization: 0.30, market: 0.10, mechanics: 0.15 };
    }
    // Low-competition niches: keyword/SERP opportunity matters more
    if (nicheProfile.expertiseRequired <= 2 && nicheProfile.monthsToRank[1] <= 14) {
        return { keyword: 0.30, serp: 0.20, brand: 0.15, monetization: 0.15, market: 0.10, mechanics: 0.10 };
    }
    // Default balanced weights
    return { keyword: 0.25, serp: 0.15, brand: 0.15, monetization: 0.20, market: 0.10, mechanics: 0.15 };
}

function getRecommendation(
    compositeScore: number,
    aiRecommendation: string | null
): EvaluationResult['recommendation'] {
    const valid = ['strong_buy', 'buy', 'conditional', 'pass', 'hard_pass'] as const;
    const aiRec = aiRecommendation && valid.includes(aiRecommendation as typeof valid[number])
        ? aiRecommendation as typeof valid[number]
        : null;

    if (compositeScore >= 80) return aiRec === 'pass' || aiRec === 'hard_pass' ? 'conditional' : 'strong_buy';
    if (compositeScore >= 65) return aiRec === 'hard_pass' ? 'pass' : 'buy';
    if (compositeScore >= 45) return aiRec || 'conditional';
    if (compositeScore >= 25) return aiRec === 'strong_buy' || aiRec === 'buy' ? 'conditional' : 'pass';
    return 'hard_pass';
}

/**
 * Scale factor for traffic projections based on niche difficulty
 */
function getCompetitivenessMultiplier(nicheProfile: NicheProfile): number {
    if (nicheProfile.ymyl) return 0.3;
    if (nicheProfile.expertiseRequired >= 4) return 0.5;
    if (nicheProfile.expertiseRequired >= 3) return 0.7;
    if (nicheProfile.monthsToRank[0] >= 8) return 0.6;
    return 1;
}

// ─── Portfolio Fit ──────────────────────────────────────────

async function analyzePortfolioFit(domain: string, niche: string): Promise<PortfolioFit> {
    const allDomains = await db
        .select({
            id: domains.id,
            domain: domains.domain,
            niche: domains.niche,
            vertical: domains.vertical,
        })
        .from(domains);

    const nicheCount = new Map<string, string[]>();
    for (const d of allDomains) {
        const n = (d.niche || d.vertical || 'general').toLowerCase();
        const list = nicheCount.get(n) || [];
        list.push(d.domain);
        nicheCount.set(n, list);
    }

    const existingInNiche = nicheCount.get(niche.toLowerCase()) || [];
    const totalNiches = nicheCount.size;
    const hasDuplicateNiche = existingInNiche.length > 0;

    let diversification: PortfolioFit['diversification'] = 'neutral';
    if (!hasDuplicateNiche && totalNiches > 0) {
        diversification = 'improves';
    } else if (hasDuplicateNiche && existingInNiche.length >= 3) {
        diversification = 'concentrates';
    }

    const complements: string[] = [];
    for (const [n, doms] of nicheCount) {
        if (n !== niche.toLowerCase() && isRelatedNiche(niche, n)) {
            complements.push(...doms.slice(0, 2));
        }
    }

    // Query average monthly revenue across portfolio (last 30 days)
    let avgMonthlyRevenue: number | undefined;
    if (allDomains.length > 0) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const revenueData = await db
            .select({
                avgRevenue: sql<number>`avg(${revenueSnapshots.totalRevenue})`,
            })
            .from(revenueSnapshots)
            .where(gte(revenueSnapshots.snapshotDate, thirtyDaysAgo))
            .catch(() => []);

        if (Array.isArray(revenueData) && revenueData[0]?.avgRevenue) {
            avgMonthlyRevenue = Math.round(Number(revenueData[0].avgRevenue) * 100) / 100;
        }
    }

    return {
        duplicateNiche: hasDuplicateNiche,
        existingDomainsInNiche: existingInNiche.slice(0, 5),
        complementsExisting: complements.slice(0, 5),
        diversification,
        portfolioNicheCount: totalNiches,
        avgMonthlyRevenue,
    };
}

function isRelatedNiche(a: string, b: string): boolean {
    const relatedPairs: Record<string, string[]> = {
        legal: ['insurance', 'finance'],
        insurance: ['legal', 'finance', 'auto', 'home'],
        finance: ['legal', 'insurance', 'tech'],
        health: ['fitness', 'beauty', 'food'],
        fitness: ['health', 'beauty'],
        beauty: ['health', 'fitness'],
        home: ['auto', 'insurance'],
        tech: ['gaming', 'education'],
        food: ['health', 'fitness'],
    };
    return relatedPairs[a.toLowerCase()]?.includes(b.toLowerCase()) ?? false;
}

function getDeterministicHardFail(
    domain: string,
    brand: BrandSignal,
    acquisitionCost: number,
): { reason: string } | null {
    const sld = domain.split('.')[0]?.toLowerCase() || '';
    const blockedTrademarkTokens = [
        'google', 'youtube', 'facebook', 'instagram', 'tiktok', 'amazon',
        'apple', 'microsoft', 'netflix', 'paypal', 'stripe', 'tesla',
        'openai', 'chatgpt', 'claude', 'grok',
    ];

    if (blockedTrademarkTokens.some(token => sld.includes(token))) {
        return { reason: 'Hard fail: likely trademark conflict in SLD token set' };
    }

    if (brand.score < 20) {
        return { reason: 'Hard fail: brand quality score below minimum threshold (20)' };
    }

    if (acquisitionCost > 2500) {
        return { reason: 'Hard fail: acquisition cost exceeds hard cap ($2,500)' };
    }

    if (acquisitionCost > 500 && !brand.isExactMatch && !brand.isPartialMatch) {
        return { reason: 'Hard fail: high acquisition cost without keyword/brand match support' };
    }

    return null;
}

function getAvailabilityHardFail(
    availability: { available: boolean; price?: number } | null,
    acquisitionCost: number,
): { reason: string } | null {
    if (availability?.available === false && acquisitionCost <= 25) {
        return { reason: 'Hard fail: domain is not available at registration pricing; aftermarket underwriting required' };
    }
    return null;
}

function buildHardPassResult(result: EvaluationResult, reason: string): EvaluationResult {
    return {
        ...result,
        recommendation: 'hard_pass',
        compositeScore: Math.min(result.compositeScore, 20),
        riskAssessment: {
            ...result.riskAssessment,
            overallRisk: 'high',
            biggestRisk: reason,
            dealBreaker: reason,
        },
        aiSummary: `${reason}. Recommendation forced to hard_pass by deterministic gate.`,
    };
}

// ─── Quick Mode (no AI) ────────────────────────────────────

function buildQuickResult(
    domain: string,
    brand: BrandSignal,
    niche: string,
    subNiche: string | undefined,
    nicheProfile: NicheProfile,
    portfolioFit: PortfolioFit,
    options: EvaluateOptions,
    availability: { available: boolean; price?: number } | null,
    domainAge: { age: string; registeredDate: string } | null,
): EvaluationResult {
    const acquisitionCost = options.acquisitionCost ?? 12;
    const avgCpcMid = (nicheProfile.avgCpc[0] + nicheProfile.avgCpc[1]) / 2;

    const keywordScore = brand.isExactMatch ? 80 : brand.isPartialMatch ? 55 : 30;
    const serpScore = nicheProfile.ymyl ? 30 : nicheProfile.expertiseRequired <= 2 ? 60 : 45;
    const rpmMid = (nicheProfile.rpmRange[0] + nicheProfile.rpmRange[1]) / 2;
    const monetizationScore = rpmMid >= 30 ? 75 : rpmMid >= 15 ? 55 : 35;
    const marketScore = nicheProfile.trend === 'growing' ? 70 : nicheProfile.trend === 'stable' ? 50 : 30;
    let mechanicsScore = acquisitionCost <= 15 ? 75 : acquisitionCost <= 100 ? 55 : 35;
    if (availability?.available) mechanicsScore += 5;
    if (domainAge) mechanicsScore += 5;
    mechanicsScore = Math.min(100, mechanicsScore);

    // Niche-adaptive weights
    const weights = getCompositeWeights(nicheProfile);
    const compositeScore = Math.round(
        keywordScore * weights.keyword +
        serpScore * weights.serp +
        brand.score * weights.brand +
        monetizationScore * weights.monetization +
        marketScore * weights.market +
        mechanicsScore * weights.mechanics
    );

    const recommendation: EvaluationResult['recommendation'] =
        compositeScore >= 75 ? 'buy' :
            compositeScore >= 50 ? 'conditional' :
                compositeScore >= 30 ? 'pass' : 'hard_pass';

    const articlesNeeded = (nicheProfile.articlesForAuthority[0] + nicheProfile.articlesForAuthority[1]) / 2;
    const contentCost = articlesNeeded * 7.5;

    // Scale traffic by niche competitiveness
    const multiplier = getCompetitivenessMultiplier(nicheProfile);
    const m6pv = Math.round(500 * multiplier);
    const m12pv = Math.round(3000 * multiplier);
    const m24pv = Math.round(15000 * multiplier);

    return {
        domain,
        compositeScore,
        recommendation,
        subNiche,
        signals: {
            brand,
            keyword: {
                score: keywordScore,
                primaryKeyword: '(quick mode — run full evaluation for keyword data)',
                volume: 0,
                cpc: avgCpcMid,
                difficulty: 0,
                longTailCount: 0,
                topKeywords: [],
            },
            serp: {
                score: serpScore,
                weakCompetitors: 0,
                contentGaps: [],
                snippetOpportunity: false,
                forumResults: false,
                avgCompetitorWordCount: 0,
            },
            monetization: {
                score: monetizationScore,
                bestModel: nicheProfile.bestModels[0],
                estimatedRpm: nicheProfile.rpmRange,
                affiliatePrograms: [],
                leadGenViable: nicheProfile.bestModels.includes('leadgen'),
                leadGenValueRange: nicheProfile.leadGenValue,
                additionalSources: [],
            },
            market: {
                score: marketScore,
                trend: nicheProfile.trend,
                sizeEstimate: '(quick mode)',
                seasonal: nicheProfile.seasonality > 0.4,
                ymyl: nicheProfile.ymyl,
                recentDevelopments: [],
            },
            mechanics: {
                score: mechanicsScore,
                estimatedRegPrice: availability?.price ?? acquisitionCost,
                estimatedRenewalPrice: brand.tld === 'com' ? 12 : 15,
                tldValue: brand.tld === 'com' ? 'premium' : 'fair',
                domainAge: domainAge ? 'aged' : 'new',
                domainRegisteredDate: domainAge?.registeredDate,
                available: availability?.available,
                registrationPrice: availability?.price,
                trademarkConcern: false,
            },
        },
        contentPlan: {
            articlesForAuthority: Math.round(articlesNeeded),
            estimatedContentCost: Math.round(contentCost),
            recommendedTypes: ['authority guides', 'comparison articles', 'FAQ pages'],
            monthsToInitialCluster: Math.round((nicheProfile.monthsToRank[0] + nicheProfile.monthsToRank[1]) / 4),
        },
        revenueProjections: {
            month6: { pageviews: m6pv, revenue: [estimateRevenue(niche, m6pv).total * 0.3, estimateRevenue(niche, m6pv).total] },
            month12: { pageviews: m12pv, revenue: [estimateRevenue(niche, m12pv).total * 0.5, estimateRevenue(niche, m12pv).total] },
            month24: { pageviews: m24pv, revenue: [estimateRevenue(niche, m24pv).total * 0.5, estimateRevenue(niche, m24pv).total] },
            primarySource: nicheProfile.bestModels[0],
            secondarySources: nicheProfile.bestModels.slice(1, 3),
        },
        flipValuation: {
            flipReadyRevenue: 200,
            nicheMultiple: [24, 36],
            projectedFlipValue12mo: [0, 500],
            projectedFlipValue24mo: [2000, 8000],
            breakEvenMonths: 14,
        },
        riskAssessment: {
            overallRisk: nicheProfile.ymyl ? 'high' : nicheProfile.expertiseRequired >= 3 ? 'medium' : 'low',
            ymylSeverity: nicheProfile.ymyl ? 'high' : 'none',
            regulatoryRisks: [],
            trademarkConcern: false,
            aiContentRisk: nicheProfile.ymyl ? 'high' : 'low',
            seasonalityScore: nicheProfile.seasonality,
            successProbability: compositeScore,
            biggestRisk: nicheProfile.ymyl ? 'YMYL niche — Google scrutinizes content quality heavily' : 'Standard competition risk',
            dealBreaker: '(run full evaluation for detailed risk analysis)',
        },
        portfolioFit,
        costs: {
            acquisition: acquisitionCost,
            yearOneContent: Math.round(contentCost),
            yearOneRenewal: brand.tld === 'com' ? 12 : 15,
            yearOneTotal: Math.round(acquisitionCost + contentCost + (brand.tld === 'com' ? 12 : 15)),
        },
        aiSummary: `Quick evaluation of ${domain} in the ${niche} niche. Composite score: ${compositeScore}/100. Run a full evaluation for AI-powered keyword, SERP, and market analysis.`,
        evaluatedAt: new Date().toISOString(),
        apiCost: 0,
        hadAiFallback: false,
    };
}

// ─── Caching ────────────────────────────────────────────────

async function getCachedEvaluation(domain: string): Promise<EvaluationResult | null> {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const cached = await db
            .select()
            .from(domainResearch)
            .where(
                and(
                    eq(domainResearch.domain, domain),
                    gte(domainResearch.evaluatedAt, twentyFourHoursAgo)
                )
            )
            .limit(1);

        if (cached.length > 0 && cached[0].evaluationResult) {
            const raw = cached[0].evaluationResult as Record<string, unknown>;
            // Validate essential fields
            if (raw.compositeScore != null && raw.signals && raw.recommendation) {
                return raw as unknown as EvaluationResult;
            }
            // Invalidate if shape is wrong
            console.warn(`[Evaluator] Cache hit for ${domain} but invalid shape. Re-evaluating.`);
        }
    } catch (err) {
        console.warn('Cache lookup failed:', err);
    }
    return null;
}

// ─── Domain Age Lookup ──────────────────────────────────────

async function lookupDomainAge(domain: string): Promise<{ age: string; registeredDate: string } | null> {
    try {
        const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;

        const data = await response.json() as {
            events?: Array<{ eventAction: string; eventDate: string }>;
        };
        const regEvent = data.events?.find(
            (e) => e.eventAction === 'registration'
        );
        if (!regEvent?.eventDate) return null;

        const regDate = new Date(regEvent.eventDate);
        const now = new Date();
        const years = Math.floor((now.getTime() - regDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

        return {
            age: years >= 1 ? `${years} year${years > 1 ? 's' : ''}` : 'Less than 1 year',
            registeredDate: regDate.toISOString().split('T')[0],
        };
    } catch {
        return null;
    }
}

// ─── Persistence ────────────────────────────────────────────

async function persistEvaluation(result: EvaluationResult, _niche: string): Promise<void> {
    const historyEntry = {
        evaluatedAt: result.evaluatedAt,
        compositeScore: result.compositeScore,
        recommendation: result.recommendation,
        mode: result.apiCost > 0 ? 'full' : 'quick',
    };

    const data = {
        domain: result.domain,
        tld: result.signals.brand.tld,
        keywordVolume: result.signals.keyword.volume,
        keywordCpc: result.signals.keyword.cpc,
        domainScore: result.compositeScore,
        isAvailable: result.signals.mechanics.available ?? null,
        registrationPrice: result.signals.mechanics.registrationPrice ?? null,
        estimatedRevenuePotential: result.revenueProjections.month12.revenue[1] ?? 0,
        evaluationResult: result as unknown as Record<string, unknown>,
        evaluatedAt: new Date(),
        decision: result.recommendation === 'strong_buy' || result.recommendation === 'buy'
            ? 'buy' as const
            : result.recommendation === 'conditional'
                ? 'watchlist' as const
                : 'pass' as const,
        decisionReason: result.aiSummary,
    };

    await db.insert(domainResearch).values({
        ...data,
        evaluationHistory: [historyEntry],
    })
        .onConflictDoUpdate({
            target: domainResearch.domain,
            set: {
                ...data,
                evaluationHistory: sql`COALESCE(${domainResearch.evaluationHistory}, '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb`
            }
        });
}

// ─── AI Response Types ──────────────────────────────────────

interface KeywordSerpResponse {
    primaryKeyword: {
        keyword: string;
        monthlyVolume: number;
        cpc: number;
        difficulty: number;
    };
    longTailKeywords: Array<{
        keyword: string;
        monthlyVolume: number;
        difficulty: number;
        cpc: number;
        intent: string;
    }>;
    serpAnalysis: {
        weakCompetitorsInTop10: number;
        featuredSnippetAvailable: boolean;
        forumResultsPresent: boolean;
        avgTopResultWordCount: number;
        contentGaps: string[];
    };
    keywordOpportunityScore: number;
    reasoning: string;
}

interface MarketAnalysisResponse {
    market: {
        sizeEstimate: string;
        trend: 'growing' | 'stable' | 'declining';
        trendReasoning: string;
        recentDevelopments: string[];
    };
    monetization: {
        bestAdNetwork: string;
        estimatedRpm: [number, number];
        topAffiliatePrograms: Array<{ name: string; commissionRange: string }>;
        leadGenViable: boolean;
        leadGenValueRange: [number, number];
        additionalRevenueSources: string[];
    };
    risks: {
        ymylSeverity: 'none' | 'moderate' | 'high';
        regulatoryRisks: string[];
        trademarkConcern: boolean;
        trademarkNotes: string;
        seasonalityScore: number;
        aiContentRisk: 'low' | 'medium' | 'high';
    };
    comparableSales: {
        recentSales: Array<{ domain: string; price: number; date: string }>;
        estimatedMarketValue: [number, number];
    };
    marketScore: number;
    reasoning: string;
}

interface InvestmentThesisResponse {
    contentPlan: {
        articlesForAuthority: number;
        estimatedContentCost: number;
        recommendedTypes: string[];
        monthsToInitialCluster: number;
    };
    revenueProjections: {
        month6: { pageviews: number; revenue: [number, number] };
        month12: { pageviews: number; revenue: [number, number] };
        month24: { pageviews: number; revenue: [number, number] };
        primarySource: string;
        secondarySources: string[];
    };
    flipValuation: {
        flipReadyRevenue: number;
        nicheMultiple: [number, number];
        projectedFlipValue12mo: [number, number];
        projectedFlipValue24mo: [number, number];
        breakEvenMonths: number;
    };
    verdict: {
        successProbability: number;
        biggestRisk: string;
        dealBreaker: string;
        recommendation: string;
        summary: string;
    };
}
