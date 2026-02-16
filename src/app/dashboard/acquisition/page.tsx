'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AcquisitionStageJobType = 'ingest_listings' | 'enrich_candidate' | 'score_candidate' | 'create_bid_plan';
type AcquisitionDecision = 'buy' | 'watchlist' | 'pass';
type AcquisitionStageState = 'done' | 'pending' | 'waiting' | 'skipped';
type DecisionFilter = 'all' | 'researching' | 'buy' | 'watchlist' | 'pass' | 'bought';
type StageFilter =
    | 'all'
    | 'pipeline_active'
    | 'hard_fail'
    | 'needs_enrichment'
    | 'needs_scoring'
    | 'needs_bid_plan'
    | 'ready_to_decide';
type SortBy = 'updated_desc' | 'score_desc' | 'confidence_desc' | 'bid_desc' | 'domain_asc';
type ParsedListing = {
    domain: string;
    acquisitionCost?: number;
    listingSource?: string;
    currentBid?: number;
    buyNowPrice?: number;
    niche?: string;
};

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
const PIPELINE_STUCK_WARNING_HOURS = 6;
const PIPELINE_STUCK_CRITICAL_HOURS = 24;

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

function lastUpdatedAt(candidate: AcquisitionCandidate): number {
    const latestEventAt = candidate.events?.[0]?.createdAt
        ? Date.parse(candidate.events[0].createdAt)
        : Number.NaN;
    const evaluatedAt = candidate.evaluatedAt ? Date.parse(candidate.evaluatedAt) : Number.NaN;
    const createdAt = candidate.createdAt ? Date.parse(candidate.createdAt) : Number.NaN;
    return [latestEventAt, evaluatedAt, createdAt].filter((value) => Number.isFinite(value))[0] ?? 0;
}

function pipelineAgeHours(candidate: AcquisitionCandidate): number | null {
    if ((candidate.pendingStages?.length ?? 0) === 0) {
        return null;
    }
    const updated = lastUpdatedAt(candidate);
    if (!Number.isFinite(updated) || updated <= 0) {
        return null;
    }
    return Math.max((Date.now() - updated) / (1000 * 60 * 60), 0);
}

function fmtDate(value: string | null): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return '-';
    return parsed.toLocaleString();
}

function fmtMoney(value: number | null): string {
    if (typeof value !== 'number') return '-';
    return `$${value.toLocaleString()}`;
}

function normalizeCandidateDomain(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;
    const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
    const withoutWww = withoutProtocol.replace(/^www\./, '');
    const host = withoutWww.split('/')[0]?.trim() || '';
    if (!host) return null;
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(host)) return null;
    return host;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return parsed;
}

function parseBulkListingInput(input: string, defaultSource: string): {
    listings: ParsedListing[];
    invalidLines: string[];
} {
    const listingsByDomain = new Map<string, ParsedListing>();
    const invalidLines: string[] = [];

    const rows = input
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

    for (const row of rows) {
        const parts = row.split(',').map((part) => part.trim());
        const domain = normalizeCandidateDomain(parts[0] || '');
        if (!domain) {
            invalidLines.push(row);
            continue;
        }

        const listing: ParsedListing = {
            domain,
            listingSource: parts[2] || defaultSource || undefined,
            acquisitionCost: parseOptionalNumber(parts[1]),
            currentBid: parseOptionalNumber(parts[3]),
            buyNowPrice: parseOptionalNumber(parts[4]),
            niche: parts[5] || undefined,
        };
        listingsByDomain.set(domain, listing);
    }

    return {
        listings: [...listingsByDomain.values()],
        invalidLines,
    };
}

export default function AcquisitionPage() {
    const [loading, setLoading] = useState(true);
    const [pipelineProcessing, setPipelineProcessing] = useState(false);
    const [bulkApplying, setBulkApplying] = useState(false);
    const [decisionUpdatingId, setDecisionUpdatingId] = useState<string | null>(null);
    const [requeueingId, setRequeueingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<AcquisitionCandidate[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
    const [stageFilter, setStageFilter] = useState<StageFilter>('all');
    const [sortBy, setSortBy] = useState<SortBy>('updated_desc');
    const [ingestInput, setIngestInput] = useState('');
    const [ingestSource, setIngestSource] = useState('manual_batch');
    const [ingestQuickMode, setIngestQuickMode] = useState(false);
    const [ingestForceRefresh, setIngestForceRefresh] = useState(false);
    const [ingestPriority, setIngestPriority] = useState(3);
    const [ingestSubmitting, setIngestSubmitting] = useState(false);

    async function loadCandidates() {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set('limit', '250');
            params.set('includeQueue', 'true');
            params.set('includeEvents', 'true');
            if (decisionFilter !== 'all') {
                params.set('decision', decisionFilter);
            }
            const response = await fetch(`/api/acquisition/candidates?${params.toString()}`);
            const body = await response.json().catch(() => ({})) as { candidates?: AcquisitionCandidate[]; error?: string };
            if (!response.ok) {
                throw new Error(body.error || 'Failed to load acquisition candidates');
            }
            const loaded = Array.isArray(body.candidates) ? body.candidates : [];
            setCandidates(loaded);
            const idSet = new Set(loaded.map((row) => row.id));
            setSelectedIds((current) => {
                const next = new Set<string>();
                for (const id of current) {
                    if (idSet.has(id)) {
                        next.add(id);
                    }
                }
                return next;
            });
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load acquisition candidates');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadCandidates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [decisionFilter]);

    const parsedIngest = useMemo(
        () => parseBulkListingInput(ingestInput, ingestSource.trim()),
        [ingestInput, ingestSource],
    );

    const visibleCandidates = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const rows = candidates
            .filter((candidate) => {
                if (!normalizedQuery) return true;
                return candidate.domain.toLowerCase().includes(normalizedQuery)
                    || candidate.id.toLowerCase().includes(normalizedQuery);
            })
            .filter((candidate) => {
                if (stageFilter === 'all') return true;
                const enrich = getStageState(candidate, 'enrich_candidate');
                const score = getStageState(candidate, 'score_candidate');
                const bidPlan = getStageState(candidate, 'create_bid_plan');
                if (stageFilter === 'pipeline_active') return (candidate.pendingStages?.length ?? 0) > 0;
                if (stageFilter === 'hard_fail') return Boolean(candidate.hardFailReason);
                if (stageFilter === 'needs_enrichment') return enrich === 'pending' || enrich === 'waiting';
                if (stageFilter === 'needs_scoring') return score === 'pending' || score === 'waiting';
                if (stageFilter === 'needs_bid_plan') return bidPlan === 'pending' || bidPlan === 'waiting';
                if (stageFilter === 'ready_to_decide') {
                    const hasSignal = candidate.domainScore !== null || candidate.confidenceScore !== null;
                    const blocked = Boolean(candidate.hardFailReason);
                    return hasSignal && !blocked;
                }
                return true;
            });

        const sorted = [...rows];
        sorted.sort((left, right) => {
            if (sortBy === 'domain_asc') {
                return left.domain.localeCompare(right.domain);
            }
            if (sortBy === 'score_desc') {
                return (right.domainScore ?? -1) - (left.domainScore ?? -1);
            }
            if (sortBy === 'confidence_desc') {
                return (right.confidenceScore ?? -1) - (left.confidenceScore ?? -1);
            }
            if (sortBy === 'bid_desc') {
                return (right.recommendedMaxBid ?? -1) - (left.recommendedMaxBid ?? -1);
            }
            return lastUpdatedAt(right) - lastUpdatedAt(left);
        });
        return sorted;
    }, [candidates, query, stageFilter, sortBy]);

    const selectedCount = selectedIds.size;
    const pipelineActiveCount = candidates.filter((row) => (row.pendingStages?.length ?? 0) > 0).length;
    const hardFailCount = candidates.filter((row) => Boolean(row.hardFailReason)).length;
    const readyToDecideCount = candidates.filter((row) => {
        const hasSignal = row.domainScore !== null || row.confidenceScore !== null;
        return hasSignal && !row.hardFailReason;
    }).length;
    const buyCount = candidates.filter((row) => row.decision === 'buy').length;
    const stuckRows = candidates
        .map((row) => ({ row, ageHours: pipelineAgeHours(row) }))
        .filter((entry): entry is { row: AcquisitionCandidate; ageHours: number } => typeof entry.ageHours === 'number')
        .filter((entry) => entry.ageHours >= PIPELINE_STUCK_WARNING_HOURS)
        .sort((left, right) => right.ageHours - left.ageHours);
    const criticalStuckCount = stuckRows.filter((entry) => entry.ageHours >= PIPELINE_STUCK_CRITICAL_HOURS).length;

    function toggleSelected(id: string, checked: boolean) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (checked) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    }

    function toggleSelectVisible() {
        setSelectedIds((current) => {
            const next = new Set(current);
            const allVisibleSelected = visibleCandidates.length > 0
                && visibleCandidates.every((row) => next.has(row.id));
            if (allVisibleSelected) {
                for (const row of visibleCandidates) {
                    next.delete(row.id);
                }
            } else {
                for (const row of visibleCandidates) {
                    next.add(row.id);
                }
            }
            return next;
        });
    }

    async function processPipelineNow() {
        setPipelineProcessing(true);
        setMessage(null);
        setError(null);
        try {
            const response = await fetch('/api/queue/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    maxJobs: 50,
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
                throw new Error(body.error || `Failed to process acquisition queue (${response.status})`);
            }
            const processed = typeof body.processed === 'number' ? body.processed : 0;
            const failed = typeof body.failed === 'number' ? body.failed : 0;
            const staleLocks = typeof body.staleLocksCleaned === 'number' ? body.staleLocksCleaned : 0;
            setMessage(`Processed ${processed}, failed ${failed}, stale locks ${staleLocks}.`);
            await loadCandidates();
        } catch (runError) {
            setError(runError instanceof Error ? runError.message : 'Failed to process acquisition queue');
        } finally {
            setPipelineProcessing(false);
        }
    }

    async function submitIngestBatch() {
        const listings = parsedIngest.listings;
        if (listings.length === 0) {
            setError('Enter at least one valid domain to queue underwriting.');
            return;
        }

        setIngestSubmitting(true);
        setMessage(null);
        setError(null);
        try {
            const response = await fetch('/api/acquisition/candidates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: ingestSource.trim() || 'manual_batch',
                    quickMode: ingestQuickMode,
                    forceRefresh: ingestForceRefresh,
                    priority: ingestPriority,
                    listings,
                }),
            });
            const body = await response.json().catch(() => ({})) as {
                error?: string;
                listingCount?: number;
                jobId?: string;
            };
            if (!response.ok) {
                throw new Error(body.error || `Failed to queue ingest batch (${response.status})`);
            }

            setMessage(
                `Queued ${body.listingCount ?? listings.length} candidate${(body.listingCount ?? listings.length) === 1 ? '' : 's'} ` +
                `${body.jobId ? `(job ${body.jobId})` : ''}.`,
            );
            setIngestInput('');
            await loadCandidates();
        } catch (ingestError) {
            setError(ingestError instanceof Error ? ingestError.message : 'Failed to queue ingest batch');
        } finally {
            setIngestSubmitting(false);
        }
    }

    async function requeueCandidate(candidate: AcquisitionCandidate) {
        setRequeueingId(candidate.id);
        setMessage(null);
        setError(null);
        try {
            const response = await fetch('/api/acquisition/candidates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: candidate.domain,
                    source: 'acquisition_page_requeue',
                    quickMode: false,
                    forceRefresh: true,
                }),
            });
            const body = await response.json().catch(() => ({})) as { error?: string; jobId?: string };
            if (!response.ok) {
                throw new Error(body.error || `Failed to requeue ${candidate.domain}`);
            }
            setMessage(`Requeued ${candidate.domain} (${body.jobId ? `job ${body.jobId}` : 'job created'}).`);
            await loadCandidates();
        } catch (requeueError) {
            setError(requeueError instanceof Error ? requeueError.message : 'Failed to requeue candidate');
        } finally {
            setRequeueingId(null);
        }
    }

    async function applyCandidateDecision(
        candidate: AcquisitionCandidate,
        decision: AcquisitionDecision,
        reason: string,
        fallbackBuyBid: number | null,
    ): Promise<void> {
        let recommendedMaxBid: number | undefined;
        if (decision === 'buy') {
            if (typeof candidate.recommendedMaxBid === 'number' && candidate.recommendedMaxBid > 0) {
                recommendedMaxBid = candidate.recommendedMaxBid;
            } else if (typeof fallbackBuyBid === 'number' && fallbackBuyBid > 0) {
                recommendedMaxBid = fallbackBuyBid;
            } else {
                throw new Error(`Missing positive recommended max bid for ${candidate.domain}`);
            }
        }

        const response = await fetch(`/api/acquisition/candidates/${candidate.id}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decision,
                decisionReason: reason,
                ...(typeof recommendedMaxBid === 'number' ? { recommendedMaxBid } : {}),
            }),
        });
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) {
            throw new Error(body.error || `Failed to set ${decision} decision for ${candidate.domain}`);
        }
    }

    async function runSingleDecision(candidate: AcquisitionCandidate, decision: AcquisitionDecision) {
        const reasonInput = window.prompt(
            `Reason for ${decision.toUpperCase()} decision on ${candidate.domain}:`,
            candidate.decisionReason || '',
        );
        if (!reasonInput || reasonInput.trim().length < 8) {
            setError('Decision reason must be at least 8 characters.');
            return;
        }

        let fallbackBuyBid: number | null = null;
        if (decision === 'buy' && (!candidate.recommendedMaxBid || candidate.recommendedMaxBid <= 0)) {
            const bidInput = window.prompt(`Recommended max bid for ${candidate.domain}:`, '');
            const parsed = Number.parseFloat((bidInput || '').trim());
            if (!Number.isFinite(parsed) || parsed <= 0) {
                setError('Buy decision requires a positive max bid.');
                return;
            }
            fallbackBuyBid = parsed;
        }

        setDecisionUpdatingId(candidate.id);
        setMessage(null);
        setError(null);
        try {
            await applyCandidateDecision(candidate, decision, reasonInput.trim(), fallbackBuyBid);
            setMessage(`Set ${decision} decision for ${candidate.domain}.`);
            await loadCandidates();
        } catch (decisionError) {
            setError(decisionError instanceof Error ? decisionError.message : 'Failed to set decision');
        } finally {
            setDecisionUpdatingId(null);
        }
    }

    async function runBulkDecision(decision: AcquisitionDecision) {
        if (selectedCount === 0) {
            setError('Select at least one candidate for bulk decision.');
            return;
        }
        const reasonInput = window.prompt(`Reason for bulk ${decision.toUpperCase()} decision:`, '');
        if (!reasonInput || reasonInput.trim().length < 8) {
            setError('Decision reason must be at least 8 characters.');
            return;
        }

        const selected = candidates.filter((candidate) => selectedIds.has(candidate.id));
        let fallbackBuyBid: number | null = null;
        if (decision === 'buy') {
            const missingBid = selected.some((candidate) => !candidate.recommendedMaxBid || candidate.recommendedMaxBid <= 0);
            if (missingBid) {
                const bidInput = window.prompt('Fallback max bid for selected candidates missing bid data:', '');
                const parsed = Number.parseFloat((bidInput || '').trim());
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    setError('Bulk BUY requires a positive fallback max bid when any candidate is missing one.');
                    return;
                }
                fallbackBuyBid = parsed;
            }
        }

        setBulkApplying(true);
        setMessage(null);
        setError(null);
        try {
            const response = await fetch('/api/acquisition/candidates/bulk-decision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidateIds: selected.map((candidate) => candidate.id),
                    decision,
                    decisionReason: reasonInput.trim(),
                    ...(typeof fallbackBuyBid === 'number' ? { recommendedMaxBid: fallbackBuyBid } : {}),
                }),
            });
            const body = await response.json().catch(() => ({})) as {
                updated?: number;
                failed?: number;
                bidPlanQueued?: number;
                results?: Array<{ status: 'updated' | 'failed'; domain: string | null; reason?: string | null }>;
                error?: string;
            };
            if (!response.ok) {
                throw new Error(body.error || `Bulk ${decision} failed`);
            }
            const updated = typeof body.updated === 'number' ? body.updated : 0;
            const failed = typeof body.failed === 'number' ? body.failed : 0;
            const bidPlanQueued = typeof body.bidPlanQueued === 'number' ? body.bidPlanQueued : 0;
            const firstFailures = (body.results || [])
                .filter((row) => row.status === 'failed' && row.domain)
                .slice(0, 3)
                .map((row) => row.domain as string);

            if (failed > 0) {
                setError(
                    `Bulk ${decision} partially failed (${updated} success, ${failed} failed). ` +
                    `${firstFailures.length > 0 ? `First failures: ${firstFailures.join(', ')}.` : ''}`,
                );
            } else {
                setMessage(
                    `Bulk ${decision} applied to ${updated} candidate${updated === 1 ? '' : 's'}. ` +
                    (decision === 'buy' ? `Bid plans queued: ${bidPlanQueued}.` : ''),
                );
            }
        } catch (bulkError) {
            setError(bulkError instanceof Error ? bulkError.message : `Bulk ${decision} failed`);
        } finally {
            setBulkApplying(false);
            setSelectedIds(new Set());
            await loadCandidates();
        }
    }

    async function runBulkRequeue() {
        if (selectedCount === 0) {
            setError('Select at least one candidate to requeue.');
            return;
        }
        const selected = candidates.filter((candidate) => selectedIds.has(candidate.id));
        setBulkApplying(true);
        setMessage(null);
        setError(null);
        let success = 0;
        let failed = 0;
        for (const candidate of selected) {
            try {
                const response = await fetch('/api/acquisition/candidates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: candidate.domain,
                        source: 'acquisition_page_bulk_requeue',
                        quickMode: false,
                        forceRefresh: true,
                    }),
                });
                if (response.ok) {
                    success += 1;
                } else {
                    failed += 1;
                }
            } catch {
                failed += 1;
            }
        }
        setBulkApplying(false);
        setSelectedIds(new Set());
        await loadCandidates();
        if (failed > 0) {
            setError(`Bulk requeue partially failed (${success} success, ${failed} failed).`);
        } else {
            setMessage(`Requeued ${success} candidate${success === 1 ? '' : 's'}.`);
        }
    }

    const allVisibleSelected = visibleCandidates.length > 0
        && visibleCandidates.every((row) => selectedIds.has(row.id));

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Acquisition Pipeline</h1>
                    <p className="text-sm text-muted-foreground">
                        Underwriting queue with stage visibility, decision controls, and batch operations.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={processPipelineNow} disabled={pipelineProcessing}>
                        {pipelineProcessing ? 'Processing...' : 'Process Pipeline Jobs'}
                    </Button>
                    <Button variant="outline" onClick={loadCandidates} disabled={loading}>
                        {loading ? 'Loading...' : 'Refresh'}
                    </Button>
                    <Link href="/dashboard/research">
                        <Button variant="outline">Open Research</Button>
                    </Link>
                    <Link href="/dashboard/queue?preset=acquisition">
                        <Button variant="outline">Open Acquisition Queue</Button>
                    </Link>
                </div>
            </div>

            {(message || error) && (
                <div className={`rounded border px-3 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    {error || message}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Ingest Candidates</CardTitle>
                    <CardDescription>
                        Paste domains (one per line) or CSV rows: <code>domain,acquisitionCost,listingSource,currentBid,buyNowPrice,niche</code>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <textarea
                        value={ingestInput}
                        onChange={(event) => setIngestInput(event.target.value)}
                        placeholder={`example.com\nexample.org,125,godaddy_auctions,40,250,insurance`}
                        className="min-h-[140px] w-full rounded border bg-background px-3 py-2 text-sm font-mono"
                    />
                    <div className="grid gap-3 md:grid-cols-4">
                        <Input
                            value={ingestSource}
                            onChange={(event) => setIngestSource(event.target.value)}
                            placeholder="Source label"
                        />
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={ingestQuickMode}
                                onChange={(event) => setIngestQuickMode(event.target.checked)}
                                className="h-4 w-4 accent-blue-600"
                            />
                            Quick mode
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={ingestForceRefresh}
                                onChange={(event) => setIngestForceRefresh(event.target.checked)}
                                className="h-4 w-4 accent-blue-600"
                            />
                            Force refresh
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            Priority
                            <input
                                type="number"
                                min={0}
                                max={100}
                                value={ingestPriority}
                                onChange={(event) => {
                                    const parsed = Number.parseInt(event.target.value, 10);
                                    setIngestPriority(Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 100)) : 3);
                                }}
                                className="w-20 rounded border bg-background px-2 py-1 text-sm"
                            />
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                            Parsed: {parsedIngest.listings.length} valid
                            {parsedIngest.invalidLines.length > 0 ? ` • ${parsedIngest.invalidLines.length} invalid` : ''}
                        </span>
                        {parsedIngest.invalidLines.length > 0 && (
                            <span>
                                First invalid: {parsedIngest.invalidLines[0]}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            onClick={submitIngestBatch}
                            disabled={ingestSubmitting || parsedIngest.listings.length === 0}
                        >
                            {ingestSubmitting ? 'Queueing...' : 'Queue Underwriting Batch'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setIngestInput('')}
                            disabled={ingestSubmitting || ingestInput.length === 0}
                        >
                            Clear
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-5">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Total</CardDescription>
                        <CardTitle className="text-2xl">{candidates.length}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Pipeline Active</CardDescription>
                        <CardTitle className="text-2xl">{pipelineActiveCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Ready To Decide</CardDescription>
                        <CardTitle className="text-2xl">{readyToDecideCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Hard Fail</CardDescription>
                        <CardTitle className="text-2xl">{hardFailCount}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Buy Decision</CardDescription>
                        <CardTitle className="text-2xl">{buyCount}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Pipeline SLA</CardTitle>
                    <CardDescription>
                        Candidates still pending after {PIPELINE_STUCK_WARNING_HOURS}h are considered stuck.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Stuck (warning)</p>
                            <p className="text-2xl font-semibold">{stuckRows.length}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Stuck (critical)</p>
                            <p className="text-2xl font-semibold">{criticalStuckCount}</p>
                        </div>
                        <div className="rounded border p-3">
                            <p className="text-xs text-muted-foreground">Thresholds</p>
                            <p className="text-sm font-medium">
                                warn {PIPELINE_STUCK_WARNING_HOURS}h • critical {PIPELINE_STUCK_CRITICAL_HOURS}h
                            </p>
                        </div>
                    </div>
                    {stuckRows.length > 0 ? (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" size="sm" onClick={() => setStageFilter('pipeline_active')}>
                                    Show Pipeline Active
                                </Button>
                                <Button variant="outline" size="sm" onClick={processPipelineNow} disabled={pipelineProcessing}>
                                    {pipelineProcessing ? 'Processing...' : 'Run Pipeline Now'}
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {stuckRows.slice(0, 8).map((entry) => (
                                    <span
                                        key={entry.row.id}
                                        className={`rounded-full px-2 py-1 text-xs ${
                                            entry.ageHours >= PIPELINE_STUCK_CRITICAL_HOURS
                                                ? 'bg-red-100 text-red-800'
                                                : 'bg-amber-100 text-amber-900'
                                        }`}
                                    >
                                        {entry.row.domain}: {entry.ageHours.toFixed(1)}h
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-emerald-700">No stuck pipeline candidates right now.</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                    <CardDescription>
                        {visibleCandidates.length} visible of {candidates.length} candidate{candidates.length === 1 ? '' : 's'}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-4">
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search domain or candidate id"
                    />
                    <select
                        value={decisionFilter}
                        onChange={(event) => setDecisionFilter(event.target.value as DecisionFilter)}
                        className="rounded border bg-background px-3 py-2 text-sm"
                        title="Decision filter"
                    >
                        <option value="all">All decisions</option>
                        <option value="researching">Researching</option>
                        <option value="buy">Buy</option>
                        <option value="watchlist">Watchlist</option>
                        <option value="pass">Pass</option>
                        <option value="bought">Bought</option>
                    </select>
                    <select
                        value={stageFilter}
                        onChange={(event) => setStageFilter(event.target.value as StageFilter)}
                        className="rounded border bg-background px-3 py-2 text-sm"
                        title="Stage filter"
                    >
                        <option value="all">All stages</option>
                        <option value="pipeline_active">Pipeline Active</option>
                        <option value="needs_enrichment">Needs Enrichment</option>
                        <option value="needs_scoring">Needs Scoring</option>
                        <option value="needs_bid_plan">Needs Bid Plan</option>
                        <option value="ready_to_decide">Ready To Decide</option>
                        <option value="hard_fail">Hard Fail</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SortBy)}
                        className="rounded border bg-background px-3 py-2 text-sm"
                        title="Sort order"
                    >
                        <option value="updated_desc">Latest Updated</option>
                        <option value="score_desc">Score Desc</option>
                        <option value="confidence_desc">Confidence Desc</option>
                        <option value="bid_desc">Max Bid Desc</option>
                        <option value="domain_asc">Domain A-Z</option>
                    </select>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Bulk Actions</CardTitle>
                    <CardDescription>
                        {selectedCount} selected
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={toggleSelectVisible}>
                        {allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}
                    </Button>
                    <Button variant="outline" onClick={() => runBulkDecision('buy')} disabled={bulkApplying || selectedCount === 0}>
                        Bulk Buy
                    </Button>
                    <Button variant="outline" onClick={() => runBulkDecision('watchlist')} disabled={bulkApplying || selectedCount === 0}>
                        Bulk Watchlist
                    </Button>
                    <Button variant="outline" onClick={() => runBulkDecision('pass')} disabled={bulkApplying || selectedCount === 0}>
                        Bulk Pass
                    </Button>
                    <Button variant="outline" onClick={runBulkRequeue} disabled={bulkApplying || selectedCount === 0}>
                        Bulk Requeue Pipeline
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Candidates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {loading && (
                        <p className="text-sm text-muted-foreground">Loading acquisition candidates...</p>
                    )}
                    {!loading && visibleCandidates.length === 0 && (
                        <p className="text-sm text-muted-foreground">No candidates match this filter.</p>
                    )}
                    {!loading && visibleCandidates.map((candidate) => {
                        const latestEvent = candidate.events?.[0] ?? null;
                        return (
                            <div key={candidate.id} className="space-y-3 rounded-lg border p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(candidate.id)}
                                            onChange={(event) => toggleSelected(candidate.id, event.target.checked)}
                                            className="h-4 w-4 accent-blue-600"
                                            aria-label={`Select ${candidate.domain}`}
                                        />
                                        <span className="font-mono text-sm font-medium">{candidate.domain}</span>
                                        {candidate.decision && (
                                            <span className={`rounded px-2 py-0.5 text-xs ${
                                                candidate.decision === 'buy'
                                                    ? 'bg-green-100 text-green-800'
                                                    : candidate.decision === 'watchlist'
                                                        ? 'bg-yellow-100 text-yellow-800'
                                                        : candidate.decision === 'pass'
                                                            ? 'bg-red-100 text-red-800'
                                                            : 'bg-blue-100 text-blue-800'
                                            }`}>
                                                {candidate.decision}
                                            </span>
                                        )}
                                        {candidate.hardFailReason && (
                                            <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                                                hard fail
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                        <span>score: {candidate.domainScore ?? '-'}</span>
                                        <span>confidence: {candidate.confidenceScore ?? '-'}</span>
                                        <span>max bid: {fmtMoney(candidate.recommendedMaxBid)}</span>
                                        <span>reg: {fmtMoney(candidate.registrationPrice)}</span>
                                        <span>{candidate.isAvailable === null ? 'availability: -' : `availability: ${candidate.isAvailable ? 'available' : 'taken'}`}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {ACQUISITION_STAGE_ORDER.map((stage) => {
                                        const state = getStageState(candidate, stage);
                                        return (
                                            <span
                                                key={`${candidate.id}:${stage}`}
                                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ACQUISITION_STAGE_STATE_CLASS[state]}`}
                                            >
                                                {ACQUISITION_STAGE_LABEL[stage]}: {state}
                                            </span>
                                        );
                                    })}
                                </div>

                                {(latestEvent || candidate.hardFailReason) && (
                                    <div className="text-xs text-muted-foreground">
                                        {latestEvent && (
                                            <div>
                                                latest event: {latestEvent.eventType} at {fmtDate(latestEvent.createdAt)}
                                            </div>
                                        )}
                                        {candidate.hardFailReason && (
                                            <div className="text-red-700">
                                                hard fail reason: {candidate.hardFailReason}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                    <Link href={`/dashboard/review/domain-buy/${candidate.id}/preview`}>
                                        <Button variant="outline" size="sm">Preview</Button>
                                    </Link>
                                    <Button variant="outline" size="sm" onClick={() => requeueCandidate(candidate)} disabled={requeueingId === candidate.id}>
                                        {requeueingId === candidate.id ? 'Requeueing...' : 'Requeue'}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => runSingleDecision(candidate, 'buy')} disabled={decisionUpdatingId === candidate.id}>
                                        Buy
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => runSingleDecision(candidate, 'watchlist')} disabled={decisionUpdatingId === candidate.id}>
                                        Watchlist
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => runSingleDecision(candidate, 'pass')} disabled={decisionUpdatingId === candidate.id}>
                                        Pass
                                    </Button>
                                    <Link href={`/dashboard/queue?preset=acquisition&q=${encodeURIComponent(candidate.id)}`}>
                                        <Button variant="ghost" size="sm">Queue Trace</Button>
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
}
