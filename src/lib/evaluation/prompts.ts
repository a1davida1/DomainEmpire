/**
 * AI Evaluation Prompts
 *
 * Three targeted prompts that together cost ~$0.015 per evaluation:
 * 1. Keyword & SERP analysis (Perplexity — needs live web data)
 * 2. Market & competition assessment (Perplexity — needs live web data)
 * 3. Monetization & flip valuation (Grok fast — structured reasoning)
 */

/**
 * Prompt 1: Keyword extraction + SERP competitive analysis
 * Model: Perplexity (needs live search data)
 */
export function keywordSerpPrompt(domain: string, niche: string): string {
    return `Analyze this domain name as a potential website investment:

DOMAIN: ${domain}
DETECTED NICHE: ${niche}

I need you to research the real search landscape for this domain. Provide:

1. PRIMARY KEYWORD: What is the most natural target keyword for this domain? Estimate its monthly search volume and CPC.

2. TOP 5 LONG-TAIL KEYWORDS: Keywords this domain could realistically rank for. For each, estimate:
   - Monthly search volume
   - Keyword difficulty (1-100)
   - CPC ($)
   - Search intent (informational / commercial / transactional)

3. SERP COMPETITION ANALYSIS for the primary keyword:
   - How many low-authority sites (DR < 30) appear in the top 10?
   - Are there featured snippets that a new site could capture?
   - Are there Reddit/forum results? (indicates weak competition)
   - What's the typical content length of top results?
   - Are there obvious content gaps that competitors miss?

4. KEYWORD OPPORTUNITY SCORE: On a scale of 1-100, how realistic is it for a new site on this domain to rank within 12 months? Factor in competition, domain relevance, and keyword difficulty.

Return ONLY valid JSON:
{
  "primaryKeyword": {
    "keyword": "string",
    "monthlyVolume": number,
    "cpc": number,
    "difficulty": number
  },
  "longTailKeywords": [
    {
      "keyword": "string",
      "monthlyVolume": number,
      "difficulty": number,
      "cpc": number,
      "intent": "informational" | "commercial" | "transactional"
    }
  ],
  "serpAnalysis": {
    "weakCompetitorsInTop10": number,
    "featuredSnippetAvailable": boolean,
    "forumResultsPresent": boolean,
    "avgTopResultWordCount": number,
    "contentGaps": ["string"]
  },
  "keywordOpportunityScore": number,
  "reasoning": "string (2-3 sentences)"
}`;
}

/**
 * Prompt 2: Market sizing, trends, and risk assessment
 * Model: Perplexity (needs live web data for trends)
 */
export function marketAnalysisPrompt(domain: string, niche: string): string {
    return `Evaluate the market opportunity for a content website in this space:

DOMAIN: ${domain}
NICHE: ${niche}

Research and provide:

1. MARKET OVERVIEW:
   - Estimated US market size for this niche
   - Is the market growing, stable, or declining?
   - Any major recent developments or disruptions?

2. MONETIZATION LANDSCAPE:
   - What ad networks work best for this niche? (Mediavine, Ezoic, AdSense)
   - Typical RPM range for display ads
   - Top affiliate programs available (name specific programs)
   - Lead gen viability and typical lead values
   - Any SaaS or tool monetization potential?

3. RISK ASSESSMENT:
   - Is this a YMYL (Your Money Your Life) niche? How strict is Google?
   - Any regulatory/legal risks (FTC, HIPAA, etc.)?
   - Trademark concerns with this specific domain name?
   - Seasonal patterns that affect traffic?
   - AI content policy risk (will Google penalize AI content here?)

4. COMPARABLE DOMAIN SALES:
   - Have similar domains in this niche sold recently?
   - What price range do comparable domains trade at?
   - Is there aftermarket demand?

Return ONLY valid JSON:
{
  "market": {
    "sizeEstimate": "string (e.g., '$50B US market')",
    "trend": "growing" | "stable" | "declining",
    "trendReasoning": "string",
    "recentDevelopments": ["string"]
  },
  "monetization": {
    "bestAdNetwork": "string",
    "estimatedRpm": [number, number],
    "topAffiliatePrograms": [{"name": "string", "commissionRange": "string"}],
    "leadGenViable": boolean,
    "leadGenValueRange": [number, number],
    "additionalRevenueSources": ["string"]
  },
  "risks": {
    "ymylSeverity": "none" | "moderate" | "high",
    "regulatoryRisks": ["string"],
    "trademarkConcern": boolean,
    "trademarkNotes": "string",
    "seasonalityScore": number,
    "aiContentRisk": "low" | "medium" | "high"
  },
  "comparableSales": {
    "recentSales": [{"domain": "string", "price": number, "date": "string"}],
    "estimatedMarketValue": [number, number]
  },
  "marketScore": number,
  "reasoning": "string (2-3 sentences)"
}`;
}

/**
 * Prompt 3: Investment thesis + flip timeline
 * Model: Grok fast (structured reasoning, no web data needed)
 */
export function investmentThesisPrompt(
    domain: string,
    niche: string,
    brandScore: number,
    keywordData: { volume: number; difficulty: number; cpc: number },
    marketData: { trend: string; ymyl: string; rpm: [number, number] },
    acquisitionCost: number
): string {
    return `You are a domain investment analyst. Evaluate this acquisition:

DOMAIN: ${domain}
NICHE: ${niche}
BRAND QUALITY SCORE: ${brandScore}/100
PRIMARY KEYWORD: Volume ${keywordData.volume}/mo, Difficulty ${keywordData.difficulty}/100, CPC $${keywordData.cpc}
MARKET TREND: ${marketData.trend}
YMYL SEVERITY: ${marketData.ymyl}
ESTIMATED RPM: $${marketData.rpm[0]}-$${marketData.rpm[1]}
ACQUISITION COST: $${acquisitionCost}

Provide a comprehensive investment analysis:

1. CONTENT PLAN:
   - How many articles needed for topical authority?
   - Estimated content production cost (at ~$5-10/article with AI + editing)
   - Recommended content types (guides, comparisons, calculators, etc.)
   - Time to publish initial content cluster

2. REVENUE PROJECTIONS (realistic, not optimistic):
   - Month 6: Expected monthly pageviews and revenue
   - Month 12: Expected monthly pageviews and revenue
   - Month 24: Expected monthly pageviews and revenue
   - Primary revenue source and secondary sources

3. FLIP VALUATION:
   - At what monthly revenue does this become flippable?
   - Estimated flip multiple for this niche (typically 24-40x monthly)
   - Projected flip value at 12 months and 24 months
   - Break-even timeline (total invested vs. cumulative revenue)

4. RISK-ADJUSTED VERDICT:
   - Probability of reaching month-12 projection (%)
   - Biggest single risk factor
   - What would make this a "no" decision?

Return ONLY valid JSON:
{
  "contentPlan": {
    "articlesForAuthority": number,
    "estimatedContentCost": number,
    "recommendedTypes": ["string"],
    "monthsToInitialCluster": number
  },
  "revenueProjections": {
    "month6": { "pageviews": number, "revenue": [number, number] },
    "month12": { "pageviews": number, "revenue": [number, number] },
    "month24": { "pageviews": number, "revenue": [number, number] },
    "primarySource": "string",
    "secondarySources": ["string"]
  },
  "flipValuation": {
    "flipReadyRevenue": number,
    "nicheMultiple": [number, number],
    "projectedFlipValue12mo": [number, number],
    "projectedFlipValue24mo": [number, number],
    "breakEvenMonths": number
  },
  "verdict": {
    "successProbability": number,
    "biggestRisk": "string",
    "dealBreaker": "string",
    "recommendation": "strong_buy" | "buy" | "conditional" | "pass" | "hard_pass",
    "summary": "string (3-4 sentence investment thesis)"
  }
}`;
}
