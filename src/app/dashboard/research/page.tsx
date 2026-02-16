'use client';

import Link from 'next/link';
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

type AcquisitionStageJobType = 'ingest_listings' | 'enrich_candidate' | 'score_candidate' | 'create_bid_plan';
type AcquisitionDecision = 'buy' | 'watchlist' | 'pass';
type AcquisitionStageState = 'done' | 'pending' | 'waiting' | 'skipped';

interface AcquisitionEvent {
    id: string;
    eventType: string;
    createdAt: string | null;
}

interface AcquisitionCandidate {
    id: string;
    domain: string;
    domainScore: number | null;
    decision: string | null;
    decisionReason: string | null;
    isAvailable: boolean | null;
    registrationPrice: number | null;
    evaluatedAt: string | null;
    createdAt: string | null;
    confidenceScore: number | null;
    listingSource: string | null;
    recommendedMaxBid: number | null;
    hardFailReason: string | null;
    pendingStages?: string[];
    events?: AcquisitionEvent[];
}

const ACQUISITION_STAGE_ORDER: AcquisitionStageJobType[] = [
    'ingest_listings',
    'enrich_candidate',
    'score_candidate',
    'create_bid_plan',
];

const ACQUISITION_STAGE_LABEL: Record<AcquisitionStageJobType, string> = {
    ingest_listings: 'Ingest',
    enrich_candidate: 'Enrich',
    score_candidate: 'Score',
    create_bid_plan: 'Bid Plan',
};

const ACQUISITION_STAGE_STATE_CLASS: Record<AcquisitionStageState, string> = {
    done: 'bg-emerald-100 text-emerald-800',
    pending: 'bg-blue-100 text-blue-800',
    waiting: 'bg-slate-100 text-slate-700',
    skipped: 'bg-amber-100 text-amber-900',
};

const ACQUISITION_QUEUE_JOB_TYPES: AcquisitionStageJobType[] = [
    'ingest_listings',
    'enrich_candidate',
    'score_candidate',
    'create_bid_plan',
];

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

function hasAcquisitionEvent(candidate: AcquisitionCandidate, types: string[]): boolean {
    const events = candidate.events || [];
    if (events.length === 0) return false;
    const wanted = new Set(types);
    return events.some((event) => wanted.has(event.eventType));
}

function getStageState(candidate: AcquisitionCandidate, stage: AcquisitionStageJobType): AcquisitionStageState {
    const pending = new Set((candidate.pendingStages || []) as string[]);
    if (pending.has(stage)) {
        return 'pending';
    }

    if (stage === 'ingest_listings') {
        return 'done';
    }

    if (stage === 'enrich_candidate') {
        if (
            hasAcquisitionEvent(candidate, ['enriched', 'hard_fail', 'scored', 'watchlist', 'approved', 'passed', 'bought'])
            || candidate.evaluatedAt !== null
        ) {
            return 'done';
        }
        return 'waiting';
    }

    if (stage === 'score_candidate') {
        if (
            hasAcquisitionEvent(candidate, ['scored', 'hard_fail', 'watchlist', 'approved', 'passed', 'bought'])
            || candidate.domainScore !== null
            || candidate.confidenceScore !== null
            || candidate.hardFailReason !== null
        ) {
            return 'done';
        }
        return 'waiting';
    }

    if (candidate.hardFailReason) {
        return 'skipped';
    }
    if (hasAcquisitionEvent(candidate, ['watchlist', 'approved', 'passed', 'bought'])) {
        return 'done';
    }
    return 'waiting';
}

function getLatestEvent(candidate: AcquisitionCandidate): AcquisitionEvent | null {
    const events = candidate.events || [];
    if (events.length === 0) return null;
    return events[0] || null;
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
    const [candidates, setCandidates] = useState<AcquisitionCandidate[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [pipelineSubmitting, setPipelineSubmitting] = useState(false);
    const [pipelineProcessing, setPipelineProcessing] = useState(false);
    const [candidateDecisionUpdatingId, setCandidateDecisionUpdatingId] = useState<string | null>(null);
    const [candidateRequeueingId, setCandidateRequeueingId] = useState<string | null>(null);
    const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState<Array<{ domain: string; available: string }>>([]);
    const [suggestionStats, setSuggestionStats] = useState<{ totalChecked: number; totalAvailable: number; rerollCount: number } | null>(null);

    useEffect(() => {
        loadKeywordOpportunities();
        loadCandidates();
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

    async function runFullEvaluation(quick = false, overrideDomain?: string) {
        const domain = overrideDomain
            ? overrideDomain
            : result
                ? `${result.domain}.${result.tld}`
                : `${domainInput.trim()}.${tld}`;
        // Stronger validation: ensure it has content and doesn't start with a dot
        if (!domain || !domain.trim() || domain.trim().startsWith('.')) return;

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

    async function loadCandidates() {
        setLoadingCandidates(true);
        try {
            const res = await fetch('/api/acquisition/candidates?limit=40&includeQueue=true&includeEvents=true');
            if (res.ok) {
                const data = await res.json();
                setCandidates(Array.isArray(data?.candidates) ? data.candidates : []);
            }
        } catch (err) {
            console.error('Failed to load candidates:', err);
        } finally {
            setLoadingCandidates(false);
        }
    }

    async function submitToPipeline() {
        const domain = evalResult?.domain || (result ? `${result.domain}.${result.tld}` : null);
        if (!domain) return;

        setPipelineSubmitting(true);
        setPipelineMessage(null);
        try {
            const res = await fetch('/api/acquisition/candidates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain,
                    source: 'manual_research',
                    quickMode: false,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setPipelineMessage(`Added to pipeline (Job: ${data.jobId})`);
                loadCandidates();
            } else {
                setPipelineMessage(`Error: ${data.error || 'Failed'}`);
            }
        } catch (err) {
            setPipelineMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
        } finally {
            setPipelineSubmitting(false);
        }
    }

    async function processAcquisitionPipelineNow() {
        setPipelineProcessing(true);
        setPipelineMessage(null);
        try {
            const response = await fetch('/api/queue/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    maxJobs: 25,
                    jobTypes: ACQUISITION_QUEUE_JOB_TYPES,
                }),
            });
            const body = await response.json().catch(() => ({})) as {
                processed?: number;
                failed?: number;
                staleLocksCleaned?: number;
                error?: string;
            };
            if (!response.ok) {
                throw new Error(body.error || `Failed to process acquisition pipeline (${response.status})`);
            }
            const processed = typeof body.processed === 'number' ? body.processed : 0;
            const failed = typeof body.failed === 'number' ? body.failed : 0;
            const staleLocks = typeof body.staleLocksCleaned === 'number' ? body.staleLocksCleaned : 0;
            setPipelineMessage(`Pipeline run complete: processed ${processed}, failed ${failed}, stale locks ${staleLocks}.`);
            await loadCandidates();
        } catch (runError) {
            setPipelineMessage(`Error: ${runError instanceof Error ? runError.message : 'Failed to process pipeline'}`);
        } finally {
            setPipelineProcessing(false);
        }
    }

    async function requeueCandidatePipeline(candidate: AcquisitionCandidate) {
        setCandidateRequeueingId(candidate.id);
        setPipelineMessage(null);
        try {
            const response = await fetch('/api/acquisition/candidates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: candidate.domain,
                    source: 'manual_requeue',
                    quickMode: false,
                    forceRefresh: true,
                }),
            });
            const body = await response.json().catch(() => ({})) as { jobId?: string; error?: string };
            if (!response.ok) {
                throw new Error(body.error || `Failed to requeue ${candidate.domain}`);
            }
            setPipelineMessage(`Requeued ${candidate.domain} (job ${body.jobId || 'created'}).`);
            await loadCandidates();
        } catch (requeueError) {
            setPipelineMessage(`Error: ${requeueError instanceof Error ? requeueError.message : 'Failed to requeue candidate'}`);
        } finally {
            setCandidateRequeueingId(null);
        }
    }

    async function applyCandidateDecision(candidate: AcquisitionCandidate, decision: AcquisitionDecision) {
        const reasonPrompt = window.prompt(
            `Enter reason for ${decision.toUpperCase()} decision on ${candidate.domain}:`,
            candidate.decisionReason || '',
        );
        if (!reasonPrompt || reasonPrompt.trim().length < 8) {
            setPipelineMessage('Error: decision reason must be at least 8 characters.');
            return;
        }

        let recommendedMaxBid: number | undefined;
        if (decision === 'buy') {
            if (typeof candidate.recommendedMaxBid === 'number' && candidate.recommendedMaxBid > 0) {
                recommendedMaxBid = candidate.recommendedMaxBid;
            } else {
                const bidPrompt = window.prompt(
                    `Recommended max bid for ${candidate.domain} (required for BUY):`,
                    '',
                );
                const parsed = Number.parseFloat((bidPrompt || '').trim());
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    setPipelineMessage('Error: buy decision requires a positive recommended max bid.');
                    return;
                }
                recommendedMaxBid = parsed;
            }
        }

        setCandidateDecisionUpdatingId(candidate.id);
        setPipelineMessage(null);
        try {
            const response = await fetch(`/api/acquisition/candidates/${candidate.id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decision,
                    decisionReason: reasonPrompt.trim(),
                    ...(typeof recommendedMaxBid === 'number' ? { recommendedMaxBid } : {}),
                }),
            });
            const body = await response.json().catch(() => ({})) as {
                success?: boolean;
                decision?: string;
                bidPlanQueued?: boolean;
                error?: string;
            };
            if (!response.ok) {
                throw new Error(body.error || `Failed to set decision for ${candidate.domain}`);
            }
            const bidPlanNote = body.bidPlanQueued ? ' Bid plan queued.' : '';
            setPipelineMessage(`Decision set to ${body.decision || decision} for ${candidate.domain}.${bidPlanNote}`);
            await loadCandidates();
        } catch (decisionError) {
            setPipelineMessage(`Error: ${decisionError instanceof Error ? decisionError.message : 'Failed to set decision'}`);
        } finally {
            setCandidateDecisionUpdatingId(null);
        }
    }

    async function suggestDomains() {
        setSuggesting(true);
        setSuggestions([]);
        setSuggestionStats(null);
        try {
            const res = await fetch('/api/research/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: 10 }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data?.suggestions)) {
                setSuggestions(data.suggestions);
                if (data.availabilityChecked) {
                    setSuggestionStats({
                        totalChecked: data.totalChecked ?? 0,
                        totalAvailable: data.totalAvailable ?? 0,
                        rerollCount: data.rerollCount ?? 0,
                    });
                }
            } else {
                setError(data.error || 'Failed to get suggestions');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Suggestion failed');
        } finally {
            setSuggesting(false);
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
                <h1 className="text-2xl font-bold tracking-tight">Research & Intelligence</h1>
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
                            title="Top-level domain"
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
                                            <p className="font-medium">{evalResult.flipValuation.breakEvenMonths ?? '?'} months</p>
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
                                            <span className={`font-medium ${evalResult.portfolioFit.diversification === 'improves' ? 'text-green-600' :
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
                        API cost: ${(evalResult.apiCost || 0).toFixed(4)}
                    </div>
                </>
            )}

            {/* Pipeline Actions (shown after eval or research) */}
            {(evalResult || result) && (
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3 flex-wrap">
                            <Button
                                onClick={submitToPipeline}
                                disabled={pipelineSubmitting}
                            >
                                {pipelineSubmitting ? 'Submitting...' : 'Add to Acquisition Pipeline'}
                            </Button>
                            {pipelineMessage && (
                                <span className={`text-sm ${pipelineMessage.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>
                                    {pipelineMessage}
                                </span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* AI Domain Suggestions */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>AI Domain Suggestions</CardTitle>
                        <CardDescription>AI-powered domain recommendations with availability checking</CardDescription>
                    </div>
                    <Button variant="outline" onClick={suggestDomains} disabled={suggesting}>
                        {suggesting ? 'Checking availability...' : 'Suggest Domains'}
                    </Button>
                </CardHeader>
                <CardContent>
                    {suggestionStats && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 pb-3 border-b">
                            <span>Checked: {suggestionStats.totalChecked}</span>
                            <span className="text-green-600">Available: {suggestionStats.totalAvailable}</span>
                            {suggestionStats.rerollCount > 0 && (
                                <span>Rerolls: {suggestionStats.rerollCount}</span>
                            )}
                        </div>
                    )}
                    {suggestions.length === 0 ? (
                        <p className="text-muted-foreground text-center py-6">
                            Click &quot;Suggest Domains&quot; to get AI-powered acquisition targets based on your portfolio.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {suggestions.map((s, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium font-mono">{s.domain}</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            s.available === 'available'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {s.available === 'available' ? 'Available' : 'Unconfirmed'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const parts = s.domain.split('.');
                                                const t = parts.pop() || 'com';
                                                setDomainInput(parts.join('.'));
                                                setTld(t);
                                            }}
                                        >
                                            Research
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                const parts = s.domain.split('.');
                                                const t = parts.pop() || 'com';
                                                setDomainInput(parts.join('.'));
                                                setTld(t);
                                                runFullEvaluation(true, s.domain);
                                            }}
                                        >
                                            Quick Eval
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Acquisition Pipeline Candidates */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Acquisition Pipeline</CardTitle>
                        <CardDescription>Domains being evaluated for purchase ({candidates.length} candidates)</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/acquisition">
                            <Button variant="outline">Open Full Pipeline</Button>
                        </Link>
                        <Button variant="secondary" onClick={processAcquisitionPipelineNow} disabled={pipelineProcessing}>
                            {pipelineProcessing ? 'Running...' : 'Process Pipeline Jobs'}
                        </Button>
                        <Button variant="outline" onClick={loadCandidates} disabled={loadingCandidates}>
                            {loadingCandidates ? 'Loading...' : 'Refresh'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {candidates.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">
                            No acquisition candidates yet. Evaluate a domain and add it to the pipeline.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {candidates.map((c) => {
                                const latestEvent = getLatestEvent(c);
                                return (
                                    <div key={c.id} className="space-y-3 rounded-lg border bg-muted/30 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="font-medium font-mono">{c.domain}</span>
                                                {c.decision && (
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                                        c.decision === 'buy' ? 'bg-green-100 text-green-800' :
                                                        c.decision === 'watchlist' ? 'bg-yellow-100 text-yellow-800' :
                                                        c.decision === 'pass' ? 'bg-red-100 text-red-800' :
                                                        'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {c.decision}
                                                    </span>
                                                )}
                                                {c.listingSource && (
                                                    <span className="text-xs text-muted-foreground">{c.listingSource}</span>
                                                )}
                                                {c.hardFailReason && (
                                                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                                                        hard fail
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-sm">
                                                {c.domainScore != null && (
                                                    <span className={`font-bold ${
                                                        c.domainScore >= 65 ? 'text-green-600' :
                                                        c.domainScore >= 45 ? 'text-yellow-600' : 'text-red-500'
                                                    }`}>
                                                        {c.domainScore}/100
                                                    </span>
                                                )}
                                                {c.recommendedMaxBid != null && (
                                                    <span className="text-muted-foreground">
                                                        max bid: ${c.recommendedMaxBid}
                                                    </span>
                                                )}
                                                {c.isAvailable != null && (
                                                    <span className={c.isAvailable ? 'text-green-600' : 'text-red-500'}>
                                                        {c.isAvailable ? 'Available' : 'Taken'}
                                                    </span>
                                                )}
                                                {c.registrationPrice != null && (
                                                    <span className="text-muted-foreground">${c.registrationPrice}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {ACQUISITION_STAGE_ORDER.map((stage) => {
                                                const stageState = getStageState(c, stage);
                                                return (
                                                    <span
                                                        key={`${c.id}:${stage}`}
                                                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ACQUISITION_STAGE_STATE_CLASS[stageState]}`}
                                                    >
                                                        {ACQUISITION_STAGE_LABEL[stage]}: {stageState}
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {latestEvent && (
                                            <p className="text-xs text-muted-foreground">
                                                Latest event: {latestEvent.eventType}
                                                {latestEvent.createdAt ? ` at ${new Date(latestEvent.createdAt).toLocaleString()}` : ''}
                                            </p>
                                        )}

                                        {c.hardFailReason && (
                                            <p className="text-xs text-red-700">
                                                Hard fail reason: {c.hardFailReason}
                                            </p>
                                        )}

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    const parts = c.domain.split('.');
                                                    const t = parts.pop() || 'com';
                                                    setDomainInput(parts.join('.'));
                                                    setTld(t);
                                                    runFullEvaluation(false, c.domain);
                                                }}
                                            >
                                                Re-eval
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => requeueCandidatePipeline(c)}
                                                disabled={candidateRequeueingId === c.id}
                                            >
                                                {candidateRequeueingId === c.id ? 'Requeueing...' : 'Requeue Pipeline'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyCandidateDecision(c, 'buy')}
                                                disabled={candidateDecisionUpdatingId === c.id}
                                            >
                                                Buy
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyCandidateDecision(c, 'watchlist')}
                                                disabled={candidateDecisionUpdatingId === c.id}
                                            >
                                                Watchlist
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyCandidateDecision(c, 'pass')}
                                                disabled={candidateDecisionUpdatingId === c.id}
                                            >
                                                Pass
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

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
                                        <span title="Difficulty" className={`${kw.difficulty <= 30 ? 'text-green-600' :
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
