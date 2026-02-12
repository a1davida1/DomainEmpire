'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ResearchResult {
    cached: boolean;
    score: number;
    domain: string;
    tld: string;
    isAvailable: boolean;
    registrationPrice: number;
    aftermarketPrice: number | null;
    keywordVolume: number;
    keywordCpc: number;
    estimatedRevenuePotential: number;
    backlinks: number;
    domainAuthority: number;
    nicheRelevance: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface EvalResult {
    domain: string;
    compositeScore: number;
    recommendation: string;
    subNiche?: string;
    signals: {
        brand: any;
        keyword: any;
        serp: any;
        monetization: any;
        market: any;
        mechanics: any;
    };
    contentPlan: any;
    revenueProjections: any;
    flipValuation: any;
    riskAssessment: any;
    portfolioFit: any;
    costs: any;
    aiSummary: string;
    evaluatedAt: string;
    apiCost: number;
    hadAiFallback: boolean;
}

interface KeywordOpportunity {
    id: string;
    domain: string;
    keyword: string;
    monthlyVolume: number;
    difficulty: number;
    cpc: number;
    intent: string;
    opportunityScore: number;
}

const recColors: Record<string, string> = {
    strong_buy: 'bg-emerald-600 text-white',
    buy: 'bg-green-100 text-green-800',
    conditional: 'bg-yellow-100 text-yellow-800',
    pass: 'bg-orange-100 text-orange-800',
    hard_pass: 'bg-red-100 text-red-800',
};

const riskColors: Record<string, string> = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-red-600',
};

function ScoreBar({ label, score, max = 100 }: { label: string; score: number; max?: number }) {
    const pct = Math.min(100, Math.max(0, (score / max) * 100));
    const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-mono w-8 text-right">{score}</span>
        </div>
    );
}

export default function ResearchPage() {
    const [domainInput, setDomainInput] = useState('');
    const [tld, setTld] = useState('com');
    const [researching, setResearching] = useState(false);
    const [result, setResult] = useState<ResearchResult | null>(null);
    const [evaluating, setEvaluating] = useState(false);
    const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
    const [keywords, setKeywords] = useState<KeywordOpportunity[]>([]);
    const [loadingKeywords, setLoadingKeywords] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadKeywordOpportunities();
    }, []);

    async function researchDomain() {
        if (!domainInput.trim()) return;
        setResearching(true);
        setResult(null);
        setEvalResult(null);
        setError(null);

        try {
            const res = await fetch('/api/research/domains', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: domainInput.trim(), tld }),
            });
            const data = await res.json();
            if (res.ok) setResult(data);
            else setError(data.error || 'Research failed');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Research failed');
        } finally {
            setResearching(false);
        }
    }

    async function runFullEvaluation(quick = false) {
        const domain = result
            ? `${result.domain}.${result.tld}`
            : `${domainInput.trim()}.${tld}`;
        if (!domain || domain === '.') return;

        setEvaluating(true);
        setError(null);

        try {
            const res = await fetch('/api/evaluate/domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain, quickMode: quick }),
            });
            const data = await res.json();
            if (res.ok) setEvalResult(data);
            else setError(data.error || data.message || 'Evaluation failed');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Evaluation failed');
        } finally {
            setEvaluating(false);
        }
    }

    async function loadKeywordOpportunities() {
        setLoadingKeywords(true);
        try {
            const res = await fetch('/api/research/keywords?unassigned=true&maxDifficulty=40&limit=20');
            if (res.ok) {
                const data = await res.json();
                setKeywords(Array.isArray(data?.keywords) ? data.keywords : []);
            }
        } catch (err) {
            console.error('Failed to load keywords:', err);
        } finally {
            setLoadingKeywords(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Research & Intelligence</h1>
                <p className="text-muted-foreground">Discover, evaluate, and compare domain opportunities</p>
            </div>

            {/* Domain Research Input */}
            <Card>
                <CardHeader>
                    <CardTitle>Domain Research</CardTitle>
                    <CardDescription>Quick check or run a full AI-powered evaluation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Enter domain name (without TLD)"
                            value={domainInput}
                            onChange={e => setDomainInput(e.target.value)}
                            className="flex-1"
                            onKeyDown={e => e.key === 'Enter' && researchDomain()}
                        />
                        <select
                            value={tld}
                            onChange={e => setTld(e.target.value)}
                            className="px-3 py-2 border rounded-lg bg-background"
                        >
                            {['com', 'net', 'org', 'io', 'co', 'ai', 'dev'].map(t => (
                                <option key={t} value={t}>.{t}</option>
                            ))}
                        </select>
                        <Button onClick={researchDomain} disabled={researching || evaluating}>
                            {researching ? 'Checking...' : 'Quick Check'}
                        </Button>
                        <Button
                            onClick={() => runFullEvaluation(true)}
                            disabled={evaluating || researching}
                            variant="outline"
                        >
                            {evaluating ? 'Evaluating...' : 'Quick Eval'}
                        </Button>
                        <Button
                            onClick={() => runFullEvaluation(false)}
                            disabled={evaluating || researching}
                            variant="secondary"
                        >
                            {evaluating ? 'Evaluating...' : 'Deep Eval'}
                        </Button>
                    </div>

                    {error && (
                        <div className="p-4 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>
                    )}

                    {/* Quick Research Result */}
                    {result && !evalResult && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                            <div className="text-center">
                                <div className={`text-3xl font-bold ${result.isAvailable ? 'text-green-600' : 'text-red-500'}`}>
                                    {result.isAvailable ? 'Available' : 'Taken'}
                                </div>
                                <div className="text-sm text-muted-foreground">Status</div>
                            </div>
                            <div className="text-center">
                                <div className="text-3xl font-bold">{result.score}</div>
                                <div className="text-sm text-muted-foreground">Score</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">{result.keywordVolume.toLocaleString()}</div>
                                <div className="text-sm text-muted-foreground">Monthly Searches</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600">${result.estimatedRevenuePotential}</div>
                                <div className="text-sm text-muted-foreground">Est. Monthly Revenue</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">${result.registrationPrice}</div>
                                <div className="text-sm text-muted-foreground">Reg Price</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">${result.keywordCpc}</div>
                                <div className="text-sm text-muted-foreground">CPC</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">{result.domainAuthority}</div>
                                <div className="text-sm text-muted-foreground">DA</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl">{result.backlinks}</div>
                                <div className="text-sm text-muted-foreground">Backlinks</div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Full Evaluation Results */}
            {evalResult && (
                <>
                    {/* Header / Recommendation */}
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="text-2xl font-bold">{evalResult.domain}</h2>
                                    {evalResult.subNiche && (
                                        <p className="text-muted-foreground">Niche: {evalResult.subNiche}</p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className={`inline-block px-4 py-2 rounded-lg text-lg font-bold ${recColors[evalResult.recommendation] || 'bg-gray-100'}`}>
                                        {evalResult.recommendation.replace('_', ' ').toUpperCase()}
                                    </span>
                                    <div className="text-3xl font-bold mt-1">{evalResult.compositeScore}/100</div>
                                </div>
                            </div>
                            {evalResult.aiSummary && (
                                <p className="text-sm bg-muted/50 p-3 rounded">{evalResult.aiSummary}</p>
                            )}
                            {evalResult.hadAiFallback && (
                                <p className="text-xs text-yellow-600 mt-2">Some signals used heuristic fallbacks (AI API unavailable)</p>
                            )}
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Signal Scores */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Signal Breakdown</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <ScoreBar label="Brand" score={evalResult.signals.brand?.score ?? 0} />
                                <ScoreBar label="Keyword" score={evalResult.signals.keyword?.score ?? 0} />
                                <ScoreBar label="SERP" score={evalResult.signals.serp?.score ?? 0} />
                                <ScoreBar label="Monetization" score={evalResult.signals.monetization?.score ?? 0} />
                                <ScoreBar label="Market" score={evalResult.signals.market?.score ?? 0} />
                                <ScoreBar label="Mechanics" score={evalResult.signals.mechanics?.score ?? 0} />
                            </CardContent>
                        </Card>

                        {/* Revenue Projections */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Revenue Projections</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.revenueProjections ? (
                                    <div className="space-y-3">
                                        {[
                                            { label: '6 Months', data: evalResult.revenueProjections.month6 },
                                            { label: '12 Months', data: evalResult.revenueProjections.month12 },
                                            { label: '24 Months', data: evalResult.revenueProjections.month24 },
                                        ].map(p => (
                                            <div key={p.label} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                                                <span className="font-medium">{p.label}</span>
                                                <div className="text-right">
                                                    <div className="text-green-600 font-bold">
                                                        ${p.data?.revenue?.[0]?.toFixed(0) ?? '?'} - ${p.data?.revenue?.[1]?.toFixed(0) ?? '?'}/mo
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {p.data?.pageviews?.toLocaleString() ?? '?'} pageviews/mo
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        <div className="text-sm text-muted-foreground pt-2">
                                            Primary: {evalResult.revenueProjections.primarySource}
                                            {evalResult.revenueProjections.secondarySources?.length > 0 && (
                                                <> + {evalResult.revenueProjections.secondarySources.join(', ')}</>
                                            )}
                                        </div>
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No projections available</p>}
                            </CardContent>
                        </Card>

                        {/* Flip Valuation */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Flip Valuation</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.flipValuation ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-xs text-muted-foreground">12-Month Flip</p>
                                            <p className="text-lg font-bold">
                                                ${evalResult.flipValuation.projectedFlipValue12mo?.[0]?.toLocaleString() ?? '?'} - ${evalResult.flipValuation.projectedFlipValue12mo?.[1]?.toLocaleString() ?? '?'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">24-Month Flip</p>
                                            <p className="text-lg font-bold">
                                                ${evalResult.flipValuation.projectedFlipValue24mo?.[0]?.toLocaleString() ?? '?'} - ${evalResult.flipValuation.projectedFlipValue24mo?.[1]?.toLocaleString() ?? '?'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Niche Multiple</p>
                                            <p className="font-medium">
                                                {evalResult.flipValuation.nicheMultiple?.[0]}x - {evalResult.flipValuation.nicheMultiple?.[1]}x
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Break Even</p>
                                            <p className="font-medium">{evalResult.flipValuation.breakEvenMonths} months</p>
                                        </div>
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No valuation data</p>}
                            </CardContent>
                        </Card>

                        {/* Risk Assessment */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Risk Assessment</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.riskAssessment ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">Overall Risk</span>
                                            <span className={`font-bold uppercase ${riskColors[evalResult.riskAssessment.overallRisk] || ''}`}>
                                                {evalResult.riskAssessment.overallRisk}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">Success Probability</span>
                                            <span className="font-bold">{evalResult.riskAssessment.successProbability}%</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">YMYL Severity</span>
                                            <span className={`font-medium ${riskColors[evalResult.riskAssessment.ymylSeverity === 'none' ? 'low' : evalResult.riskAssessment.ymylSeverity === 'moderate' ? 'medium' : 'high']}`}>
                                                {evalResult.riskAssessment.ymylSeverity}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm">AI Content Risk</span>
                                            <span className={`font-medium ${riskColors[evalResult.riskAssessment.aiContentRisk]}`}>
                                                {evalResult.riskAssessment.aiContentRisk}
                                            </span>
                                        </div>
                                        {evalResult.riskAssessment.biggestRisk && (
                                            <div className="pt-2 border-t">
                                                <p className="text-xs text-muted-foreground">Biggest Risk</p>
                                                <p className="text-sm">{evalResult.riskAssessment.biggestRisk}</p>
                                            </div>
                                        )}
                                        {evalResult.riskAssessment.dealBreaker && (
                                            <div>
                                                <p className="text-xs text-red-600">Deal Breaker</p>
                                                <p className="text-sm text-red-600">{evalResult.riskAssessment.dealBreaker}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No risk data</p>}
                            </CardContent>
                        </Card>

                        {/* Costs */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Cost Breakdown</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.costs ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-sm">Acquisition</span>
                                            <span className="font-medium">${evalResult.costs.acquisition}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Year 1 Content</span>
                                            <span className="font-medium">${evalResult.costs.yearOneContent}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Year 1 Renewal</span>
                                            <span className="font-medium">${evalResult.costs.yearOneRenewal}</span>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t font-bold">
                                            <span>Year 1 Total</span>
                                            <span>${evalResult.costs.yearOneTotal}</span>
                                        </div>
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No cost data</p>}
                            </CardContent>
                        </Card>

                        {/* Content Plan */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Content Plan</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.contentPlan ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-sm">Articles for Authority</span>
                                            <span className="font-medium">{evalResult.contentPlan.articlesForAuthority}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Content Cost</span>
                                            <span className="font-medium">${evalResult.contentPlan.estimatedContentCost}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Time to Cluster</span>
                                            <span className="font-medium">{evalResult.contentPlan.monthsToInitialCluster} months</span>
                                        </div>
                                        {evalResult.contentPlan.recommendedTypes?.length > 0 && (
                                            <div className="pt-2 border-t">
                                                <p className="text-xs text-muted-foreground mb-1">Recommended Types</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {evalResult.contentPlan.recommendedTypes.map((t: string) => (
                                                        <span key={t} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">{t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No content plan</p>}
                            </CardContent>
                        </Card>

                        {/* Portfolio Fit */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Portfolio Fit</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.portfolioFit ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-sm">Diversification</span>
                                            <span className={`font-medium ${
                                                evalResult.portfolioFit.diversification === 'improves' ? 'text-green-600' :
                                                evalResult.portfolioFit.diversification === 'concentrates' ? 'text-red-600' : ''
                                            }`}>
                                                {evalResult.portfolioFit.diversification}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Duplicate Niche</span>
                                            <span className={evalResult.portfolioFit.duplicateNiche ? 'text-yellow-600' : 'text-green-600'}>
                                                {evalResult.portfolioFit.duplicateNiche ? 'Yes' : 'No'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Portfolio Niches</span>
                                            <span className="font-medium">{evalResult.portfolioFit.portfolioNicheCount}</span>
                                        </div>
                                        {evalResult.portfolioFit.complementsExisting?.length > 0 && (
                                            <div className="pt-2 border-t">
                                                <p className="text-xs text-muted-foreground">Complements</p>
                                                <p className="text-sm">{evalResult.portfolioFit.complementsExisting.join(', ')}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No portfolio data</p>}
                            </CardContent>
                        </Card>

                        {/* Keyword Details */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Keyword Signal</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {evalResult.signals.keyword ? (
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-sm">Primary Keyword</span>
                                            <span className="font-medium">{evalResult.signals.keyword.primaryKeyword}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Volume</span>
                                            <span className="font-medium">{evalResult.signals.keyword.volume?.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">CPC</span>
                                            <span className="font-medium">${evalResult.signals.keyword.cpc}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Difficulty</span>
                                            <span className="font-medium">{evalResult.signals.keyword.difficulty}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm">Long-tail Count</span>
                                            <span className="font-medium">{evalResult.signals.keyword.longTailCount}</span>
                                        </div>
                                        {evalResult.signals.keyword.topKeywords?.length > 0 && (
                                            <div className="pt-2 border-t">
                                                <p className="text-xs text-muted-foreground mb-1">Top Keywords</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {evalResult.signals.keyword.topKeywords.slice(0, 8).map((k: string) => (
                                                        <span key={k} className="px-2 py-0.5 bg-muted rounded text-xs">{k}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : <p className="text-muted-foreground text-sm">No keyword data</p>}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Eval metadata */}
                    <div className="text-xs text-muted-foreground text-center">
                        Evaluated {new Date(evalResult.evaluatedAt).toLocaleString()}
                        {' '} | API cost: ${evalResult.apiCost.toFixed(4)}
                    </div>
                </>
            )}

            {/* Keyword Opportunities */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Keyword Opportunities</CardTitle>
                        <CardDescription>Low difficulty, high volume keywords across your domains</CardDescription>
                    </div>
                    <Button variant="outline" onClick={loadKeywordOpportunities} disabled={loadingKeywords}>
                        {loadingKeywords ? 'Loading...' : 'Refresh'}
                    </Button>
                </CardHeader>
                <CardContent>
                    {keywords.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                            No keyword opportunities found. Add domains and keywords to see suggestions.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {keywords.map(kw => (
                                <div
                                    key={kw.id}
                                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                                >
                                    <div>
                                        <span className="font-medium">{kw.keyword}</span>
                                        <span className="text-xs text-muted-foreground ml-2">{kw.domain}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span title="Monthly Volume">{kw.monthlyVolume?.toLocaleString() || 0}</span>
                                        <span title="Difficulty" className={`${
                                            kw.difficulty <= 30 ? 'text-green-600' :
                                            kw.difficulty <= 60 ? 'text-yellow-600' : 'text-red-600'
                                        }`}>D:{kw.difficulty || 0}</span>
                                        <span title="CPC" className="text-green-600">${kw.cpc || 0}</span>
                                        <span
                                            className="px-2 py-1 rounded bg-primary/10 text-primary font-mono text-xs font-bold"
                                            title="Opportunity Score"
                                        >
                                            {kw.opportunityScore}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
