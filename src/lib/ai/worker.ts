/**
 * Content Queue Worker
 * 
 * Processes pending jobs from the content_queue table.
 * This runs as a separate process or can be triggered via API.
 * 
 * Features:
 * - Atomic job locking with pessimistic row-level locks
 * - Exponential backoff on retry (2^attempts minutes)
 * - Stale lock recovery (auto-unlocks jobs locked > LOCK_DURATION_MS)
 * - Dead letter queue (jobs exceeding maxAttempts are permanently failed)
 * - Per-job timeout enforcement
 * - Concurrency-safe: multiple workers can run simultaneously
 * 
 * Job Types:
 * - generate_outline: Create article outline with AI
 * - generate_draft: Write article from outline
 * - humanize: Make AI content sound natural
 * - seo_optimize: Add SEO elements
 * - generate_meta: Create meta tags
 * - deploy: Push to GitHub/Cloudflare
 * - keyword_research: Research keywords for domain
 * - bulk_seed: Seed articles for domain
 * - fetch_analytics: Pull analytics data
 */

import { db, contentQueue, articles, domains, keywords, domainResearch, acquisitionEvents, reviewTasks, previewBuilds } from '@/lib/db';
import { eq, and, lte, gt, isNull, or, sql, asc, desc, count, inArray } from 'drizzle-orm';
import { processOutlineJob, processDraftJob, processHumanizeJob, processSeoOptimizeJob, processMetaJob, processKeywordResearchJob, processResearchJob } from './pipeline';
import { processDeployJob } from '@/lib/deploy/processor';
import { checkContentSchedule } from './scheduler';
import { evaluateDomain } from '@/lib/evaluation/evaluator';
import { checkAndRefreshStaleContent } from '@/lib/content/refresh';
import { checkRenewals } from '@/lib/domain/renewals';
import { checkBacklinks } from '@/lib/analytics/backlinks';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';
import { snapshotCompliance } from '@/lib/compliance/metrics';
import { purgeExpiredSessions } from '@/lib/auth';
import { checkStaleDatasets } from '@/lib/datasets/freshness';
import { runAllMonitoringChecks } from '@/lib/monitoring/triggers';
import { calculateBackoff } from '@/lib/tpilot/core/retry';
import { FailureCategorizer } from '@/lib/tpilot/core/failure-categorizer';
import { dequeueContentJobIds, enqueueContentJob, requeueContentJobIds } from '@/lib/queue/content-queue';

const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per job
const BATCH_SIZE = 5;
const POLL_INTERVAL_MS = 5000;
const STALE_LOCK_CHECK_INTERVAL = 60_000; // Check for stale locks every 60s
const SCHEDULER_CHECK_INTERVAL = 60 * 60 * 1000; // Run scheduler every hour

let workerStopRequested = false;
let activeJobs = 0;
let idleWaiters: Array<() => void> = [];

interface WorkerOptions {
    continuous?: boolean;
    maxJobs?: number;
    jobTypes?: string[];
}

interface WorkerResult {
    processed: number;
    failed: number;
    staleLocksCleaned: number;
    stats: QueueStats;
}

interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
}

type ResearchDecision = 'researching' | 'buy' | 'pass' | 'watchlist' | 'bought';

interface ListingCandidate {
    domain: string;
    tld: string;
    listingSource?: string;
    listingId?: string;
    listingType?: string;
    currentBid?: number;
    buyNowPrice?: number;
    auctionEndsAt?: Date;
    acquisitionCost?: number;
    niche?: string;
    quickMode?: boolean;
    forceRefresh?: boolean;
}

interface UnderwritingSnapshot {
    demandScore: number;
    compsScore: number;
    tmRiskScore: number;
    historyRiskScore: number;
    backlinkRiskScore: number;
    compLow: number;
    compHigh: number;
    expected12mRevenueLow: number;
    expected12mRevenueHigh: number;
    recommendedMaxBid: number;
    confidenceScore: number;
    hardFailReason: string | null;
}

const UNDERWRITING_VERSION = 'acquisition_underwriting_v1';
const DEFAULT_ACQUISITION_COST = 12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') {
            return true;
        }
        if (value.toLowerCase() === 'false') {
            return false;
        }
    }
    return undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

function toOptionalDate(value: unknown): Date | undefined {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) {
            return parsed;
        }
    }
    return undefined;
}

function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function isValidDomainName(value: string): boolean {
    if (value.length < 3 || value.length > 253) {
        return false;
    }
    if (value.includes('..') || value.startsWith('.') || value.endsWith('.')) {
        return false;
    }

    const labels = value.split('.');
    if (labels.length < 2) {
        return false;
    }

    for (const label of labels) {
        if (label.length < 1 || label.length > 63) {
            return false;
        }
        if (!/^[a-z0-9-]+$/.test(label)) {
            return false;
        }
        if (label.startsWith('-') || label.endsWith('-')) {
            return false;
        }
    }

    return true;
}

function normalizeDomain(domainRaw: string, tldRaw?: string): { domain: string; tld: string } | null {
    const domainBase = domainRaw.trim().toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
    if (domainBase.length === 0) {
        return null;
    }

    const fqdn = domainBase.includes('.')
        ? domainBase
        : `${domainBase}.${(tldRaw || 'com').trim().toLowerCase()}`;

    if (!isValidDomainName(fqdn)) {
        return null;
    }

    const tld = fqdn.split('.').slice(1).join('.');
    return { domain: fqdn, tld };
}

function parseListingCandidate(
    raw: Record<string, unknown>,
    defaults: { source?: string; quickMode?: boolean; forceRefresh?: boolean },
): ListingCandidate | null {
    const domainInput = toOptionalString(raw.domain);
    if (!domainInput) {
        return null;
    }

    const normalized = normalizeDomain(domainInput, toOptionalString(raw.tld));
    if (!normalized) {
        return null;
    }

    const listingSource = toOptionalString(raw.listingSource)
        || toOptionalString(raw.source)
        || defaults.source;
    const listingType = toOptionalString(raw.listingType);
    const currentBid = toOptionalNumber(raw.currentBid);
    const buyNowPrice = toOptionalNumber(raw.buyNowPrice);
    const acquisitionCost = toOptionalNumber(raw.acquisitionCost);

    return {
        domain: normalized.domain,
        tld: normalized.tld,
        listingSource,
        listingId: toOptionalString(raw.listingId),
        listingType,
        currentBid,
        buyNowPrice,
        auctionEndsAt: toOptionalDate(raw.auctionEndsAt),
        acquisitionCost,
        niche: toOptionalString(raw.niche),
        quickMode: toOptionalBoolean(raw.quickMode) ?? defaults.quickMode ?? false,
        forceRefresh: toOptionalBoolean(raw.forceRefresh) ?? defaults.forceRefresh ?? false,
    };
}

function parseIngestListingsPayload(payload: unknown): {
    candidates: ListingCandidate[];
    createdBy: string;
} {
    if (!isPlainObject(payload)) {
        return { candidates: [], createdBy: 'system' };
    }

    const createdBy = toOptionalString(payload.createdBy) || 'system';
    const defaults = {
        source: toOptionalString(payload.source),
        quickMode: toOptionalBoolean(payload.quickMode),
        forceRefresh: toOptionalBoolean(payload.forceRefresh),
    };

    const candidates: ListingCandidate[] = [];
    const listings = payload.listings;
    if (Array.isArray(listings)) {
        for (const listing of listings) {
            if (!isPlainObject(listing)) {
                continue;
            }
            const parsed = parseListingCandidate(listing, defaults);
            if (parsed) {
                candidates.push(parsed);
            }
        }
    } else {
        const parsed = parseListingCandidate(payload, defaults);
        if (parsed) {
            candidates.push(parsed);
        }
    }

    return { candidates, createdBy };
}

async function logAcquisitionEvent(
    domainResearchId: string,
    eventType: string,
    payload: Record<string, unknown>,
    createdBy = 'system',
): Promise<void> {
    await db.insert(acquisitionEvents).values({
        domainResearchId,
        eventType,
        payload,
        createdBy,
    });
}

async function upsertResearchCandidate(candidate: ListingCandidate) {
    const inferredAftermarket = candidate.currentBid ?? candidate.buyNowPrice ?? null;
    const inferredRegPrice = candidate.acquisitionCost && candidate.acquisitionCost <= 50
        ? candidate.acquisitionCost
        : null;

    const [research] = await db.insert(domainResearch).values({
        domain: candidate.domain,
        tld: candidate.tld,
        listingSource: candidate.listingSource,
        listingId: candidate.listingId,
        listingType: candidate.listingType,
        currentBid: candidate.currentBid,
        buyNowPrice: candidate.buyNowPrice,
        auctionEndsAt: candidate.auctionEndsAt,
        aftermarketPrice: inferredAftermarket,
        registrationPrice: inferredRegPrice,
        decision: 'researching',
        underwritingVersion: UNDERWRITING_VERSION,
    }).onConflictDoUpdate({
        target: domainResearch.domain,
        set: {
            listingSource: candidate.listingSource,
            listingId: candidate.listingId,
            listingType: candidate.listingType,
            currentBid: candidate.currentBid,
            buyNowPrice: candidate.buyNowPrice,
            auctionEndsAt: candidate.auctionEndsAt,
            aftermarketPrice: inferredAftermarket,
            registrationPrice: inferredRegPrice,
            underwritingVersion: UNDERWRITING_VERSION,
        },
    }).returning();

    if (!research) {
        throw new Error(`Failed to upsert candidate ${candidate.domain}`);
    }
    return research;
}

function resolveAcquisitionCost(
    payload: Record<string, unknown>,
    research: typeof domainResearch.$inferSelect,
): number {
    const payloadCost = toOptionalNumber(payload.acquisitionCost);
    if (payloadCost && payloadCost > 0) {
        return payloadCost;
    }
    if (typeof research.currentBid === 'number' && research.currentBid > 0) {
        return research.currentBid;
    }
    if (typeof research.buyNowPrice === 'number' && research.buyNowPrice > 0) {
        return research.buyNowPrice;
    }
    if (typeof research.aftermarketPrice === 'number' && research.aftermarketPrice > 0) {
        return research.aftermarketPrice;
    }
    if (typeof research.registrationPrice === 'number' && research.registrationPrice > 0) {
        return research.registrationPrice;
    }
    return DEFAULT_ACQUISITION_COST;
}

async function resolveResearchRowFromPayload(
    payload: unknown,
    options: { createIfMissing?: boolean } = {},
): Promise<typeof domainResearch.$inferSelect | null> {
    if (!isPlainObject(payload)) {
        return null;
    }

    const domainResearchId = toOptionalString(payload.domainResearchId);
    if (domainResearchId) {
        const byId = await db.select()
            .from(domainResearch)
            .where(eq(domainResearch.id, domainResearchId))
            .limit(1);
        if (byId.length > 0) {
            return byId[0];
        }
    }

    const domainInput = toOptionalString(payload.domain);
    if (!domainInput) {
        return null;
    }

    const normalized = normalizeDomain(domainInput, toOptionalString(payload.tld));
    if (!normalized) {
        return null;
    }

    const byDomain = await db.select()
        .from(domainResearch)
        .where(eq(domainResearch.domain, normalized.domain))
        .limit(1);
    if (byDomain.length > 0) {
        return byDomain[0];
    }

    if (!options.createIfMissing) {
        return null;
    }

    const [created] = await db.insert(domainResearch).values({
        domain: normalized.domain,
        tld: normalized.tld,
        decision: 'researching',
        underwritingVersion: UNDERWRITING_VERSION,
    }).returning();

    return created ?? null;
}

type AcquisitionStageJobType = 'enrich_candidate' | 'score_candidate' | 'create_bid_plan';

async function enqueueAcquisitionStageJobIfMissing(
    jobType: AcquisitionStageJobType,
    domainResearchId: string,
    payload: Record<string, unknown>,
    priority: number,
): Promise<boolean> {
    const existing = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(and(
            eq(contentQueue.jobType, jobType),
            inArray(contentQueue.status, ['pending', 'processing']),
            sql`${contentQueue.payload} ->> 'domainResearchId' = ${domainResearchId}`,
        ))
        .limit(1);

    if (existing.length > 0) {
        return false;
    }

    await enqueueContentJob({
        jobType,
        payload,
        status: 'pending',
        priority,
    });

    return true;
}

async function syncDomainBuyReviewTask(opts: {
    domainResearchId: string;
    domainId: string | null;
    domain: string;
    decision: ResearchDecision;
    decisionReason: string;
    recommendedMaxBid: number;
}): Promise<void> {
    const checklistJson: Record<string, unknown> = {
        domain: opts.domain,
        decision: opts.decision,
        decisionReason: opts.decisionReason,
        recommendedMaxBid: opts.recommendedMaxBid,
        underwritingVersion: UNDERWRITING_VERSION,
        generatedAt: new Date().toISOString(),
    };

    if (opts.decision !== 'buy') {
        await db.update(reviewTasks).set({
            status: 'cancelled',
            reviewNotes: `Auto-cancelled: underwriting decision changed to ${opts.decision}`,
            updatedAt: new Date(),
        }).where(and(
            eq(reviewTasks.taskType, 'domain_buy'),
            eq(reviewTasks.domainResearchId, opts.domainResearchId),
            eq(reviewTasks.status, 'pending'),
        ));
        return;
    }

    const existing = await db
        .select({
            id: reviewTasks.id,
            status: reviewTasks.status,
        })
        .from(reviewTasks)
        .where(and(
            eq(reviewTasks.taskType, 'domain_buy'),
            eq(reviewTasks.domainResearchId, opts.domainResearchId),
        ))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(1);

    if (existing.length === 0) {
        await db.insert(reviewTasks).values({
            taskType: 'domain_buy',
            entityId: opts.domainResearchId,
            domainId: opts.domainId,
            domainResearchId: opts.domainResearchId,
            checklistJson,
            status: 'pending',
            reviewNotes: 'Awaiting reviewer approval before purchase',
            createdBy: null,
        });
        return;
    }

    const task = existing[0];
    if (task.status === 'approved') {
        return;
    }

    await db.update(reviewTasks).set({
        status: 'pending',
        checklistJson,
        reviewerId: null,
        reviewedAt: null,
        reviewNotes: 'Awaiting reviewer approval before purchase',
        updatedAt: new Date(),
    }).where(eq(reviewTasks.id, task.id));
}

function buildDomainBuyPreviewPath(domainResearchId: string): string {
    return `/dashboard/review/domain-buy/${domainResearchId}/preview`;
}

async function syncDomainBuyPreviewBuild(opts: {
    domainResearchId: string;
    domainId: string | null;
    decision: ResearchDecision;
    domain: string;
    compositeScore: number;
    recommendation: string;
    recommendedMaxBid: number;
    confidenceScore: number;
    hardFailReason: string | null;
}): Promise<void> {
    if (opts.decision !== 'buy') {
        await db.update(previewBuilds).set({
            buildStatus: 'expired',
            buildLog: `Preview expired: underwriting decision changed to ${opts.decision}`,
            updatedAt: new Date(),
        }).where(and(
            eq(previewBuilds.domainResearchId, opts.domainResearchId),
            inArray(previewBuilds.buildStatus, ['queued', 'building', 'ready']),
        ));
        return;
    }

    const previewUrl = buildDomainBuyPreviewPath(opts.domainResearchId);
    const expiresAt = new Date(Date.now() + (1000 * 60 * 60 * 72)); // 72h
    const metadata = {
        domain: opts.domain,
        compositeScore: opts.compositeScore,
        recommendation: opts.recommendation,
        recommendedMaxBid: opts.recommendedMaxBid,
        confidenceScore: opts.confidenceScore,
        hardFailReason: opts.hardFailReason,
        generatedBy: 'score_candidate',
        generatedAt: new Date().toISOString(),
    };

    const existing = await db
        .select({ id: previewBuilds.id })
        .from(previewBuilds)
        .where(eq(previewBuilds.domainResearchId, opts.domainResearchId))
        .orderBy(desc(previewBuilds.createdAt))
        .limit(1);

    if (existing.length === 0) {
        await db.insert(previewBuilds).values({
            domainId: opts.domainId,
            domainResearchId: opts.domainResearchId,
            previewUrl,
            expiresAt,
            buildStatus: 'ready',
            buildLog: 'Preview generated from underwriting score snapshot',
            metadata,
            createdBy: null,
        });
        return;
    }

    await db.update(previewBuilds).set({
        domainId: opts.domainId,
        previewUrl,
        expiresAt,
        buildStatus: 'ready',
        buildLog: 'Preview refreshed from latest underwriting score snapshot',
        metadata,
        updatedAt: new Date(),
    }).where(eq(previewBuilds.id, existing[0].id));
}

function buildUnderwritingSnapshot(
    evaluation: Awaited<ReturnType<typeof evaluateDomain>>,
    research: typeof domainResearch.$inferSelect,
    acquisitionCost: number,
): UnderwritingSnapshot {
    const expected12mRevenueLow = roundMoney(Math.max(0, evaluation.revenueProjections?.month12?.revenue?.[0] ?? 0));
    const expected12mRevenueHigh = roundMoney(Math.max(0, evaluation.revenueProjections?.month12?.revenue?.[1] ?? 0));

    const comp12Low = roundMoney(Math.max(0, evaluation.flipValuation?.projectedFlipValue12mo?.[0] ?? 0));
    const comp12High = roundMoney(Math.max(0, evaluation.flipValuation?.projectedFlipValue12mo?.[1] ?? 0));
    const comp24Low = roundMoney(Math.max(0, evaluation.flipValuation?.projectedFlipValue24mo?.[0] ?? 0));
    const comp24High = roundMoney(Math.max(0, evaluation.flipValuation?.projectedFlipValue24mo?.[1] ?? 0));
    const compLow = roundMoney(Math.max(comp12Low, comp24Low * 0.5));
    const compHigh = roundMoney(Math.max(comp12High, comp24High * 0.6, compLow));

    const demandScore = roundMoney(clamp(
        ((evaluation.signals.keyword?.score ?? 0) * 0.6) + ((evaluation.signals.market?.score ?? 0) * 0.4),
        0,
        100,
    ));
    const compsScore = roundMoney(clamp(
        ((evaluation.signals.serp?.score ?? 0) * 0.7) + ((evaluation.signals.market?.score ?? 0) * 0.3),
        0,
        100,
    ));

    const tmRiskScore = evaluation.riskAssessment?.trademarkConcern ? 90 : 15;
    const historyRiskScore = evaluation.riskAssessment?.overallRisk === 'high'
        ? 85
        : evaluation.riskAssessment?.overallRisk === 'medium'
            ? 55
            : 25;
    const backlinkRiskScore = roundMoney(clamp(
        ((evaluation.signals.keyword?.difficulty ?? 40) * 0.7)
        + (evaluation.hadAiFallback ? 12 : 0)
        + (evaluation.signals.serp?.forumResults ? -6 : 3),
        5,
        95,
    ));

    let confidenceScore = evaluation.hadAiFallback ? 55 : 78;
    if ((evaluation.signals.keyword?.volume ?? 0) > 0) confidenceScore += 6;
    if ((evaluation.signals.market?.recentDevelopments?.length ?? 0) > 0) confidenceScore += 4;
    if (evaluation.recommendation === 'strong_buy' || evaluation.recommendation === 'buy') confidenceScore += 5;
    if (evaluation.riskAssessment?.overallRisk === 'high') confidenceScore -= 15;
    if (evaluation.riskAssessment?.overallRisk === 'medium') confidenceScore -= 8;
    if (tmRiskScore >= 80) confidenceScore -= 20;
    confidenceScore = roundMoney(clamp(confidenceScore, 5, 95));

    const economicsCap = expected12mRevenueLow * 0.35;
    const compsCap = compLow > 0 ? compLow * 0.65 : expected12mRevenueHigh * 0.2;
    const riskDiscount = tmRiskScore >= 80 ? 0.4 : historyRiskScore >= 80 ? 0.6 : 1;
    let recommendedMaxBid = roundMoney(Math.max(0, Math.min(economicsCap, compsCap) * riskDiscount));

    if (evaluation.recommendation === 'strong_buy') {
        recommendedMaxBid = roundMoney(recommendedMaxBid * 1.1);
    }
    if (evaluation.recommendation === 'hard_pass' || evaluation.recommendation === 'pass') {
        recommendedMaxBid = 0;
    }

    const dealBreaker = toOptionalString(evaluation.riskAssessment?.dealBreaker);
    const biggestRisk = toOptionalString(evaluation.riskAssessment?.biggestRisk);
    let hardFailReason: string | null = null;

    if (evaluation.recommendation === 'hard_pass') {
        hardFailReason = dealBreaker || biggestRisk || 'Hard fail from evaluator recommendation';
    } else if (tmRiskScore >= 85) {
        hardFailReason = 'Hard fail: trademark risk exceeds threshold';
    } else if (historyRiskScore >= 85) {
        hardFailReason = 'Hard fail: historical risk exceeds threshold';
    } else if (backlinkRiskScore >= 88) {
        hardFailReason = 'Hard fail: backlink toxicity exceeds threshold';
    } else if (expected12mRevenueLow < acquisitionCost * 0.6 && expected12mRevenueHigh < acquisitionCost * 1.4) {
        hardFailReason = 'Hard fail: 12-month revenue projections do not clear ROI threshold';
    } else if (recommendedMaxBid <= 0 && (research.currentBid ?? research.buyNowPrice ?? acquisitionCost) > 0) {
        hardFailReason = 'Hard fail: risk-adjusted max bid resolved to $0';
    }

    return {
        demandScore,
        compsScore,
        tmRiskScore,
        historyRiskScore,
        backlinkRiskScore,
        compLow,
        compHigh,
        expected12mRevenueLow,
        expected12mRevenueHigh,
        recommendedMaxBid,
        confidenceScore,
        hardFailReason,
    };
}

function decideResearchOutcome(
    research: typeof domainResearch.$inferSelect,
    evaluation: Awaited<ReturnType<typeof evaluateDomain>>,
    underwriting: UnderwritingSnapshot,
): { decision: ResearchDecision; reason: string } {
    if (research.decision === 'bought') {
        return { decision: 'bought', reason: research.decisionReason ?? 'Already purchased' };
    }
    if (underwriting.hardFailReason) {
        return { decision: 'pass', reason: underwriting.hardFailReason };
    }
    if (
        (evaluation.recommendation === 'strong_buy' || evaluation.recommendation === 'buy')
        && underwriting.confidenceScore >= 65
        && underwriting.tmRiskScore < 70
    ) {
        return {
            decision: 'buy',
            reason: `Approved by underwriting: score ${evaluation.compositeScore}/100, max bid $${underwriting.recommendedMaxBid}`,
        };
    }
    if (evaluation.recommendation === 'conditional' || underwriting.confidenceScore >= 50) {
        return {
            decision: 'watchlist',
            reason: `Watchlist: confidence ${underwriting.confidenceScore}/100, max bid $${underwriting.recommendedMaxBid}`,
        };
    }
    return {
        decision: 'pass',
        reason: `Pass: recommendation ${evaluation.recommendation}, confidence ${underwriting.confidenceScore}/100`,
    };
}

function getBidIncrement(currentBid: number): number {
    if (currentBid < 50) return 5;
    if (currentBid < 200) return 10;
    if (currentBid < 500) return 25;
    return 50;
}

function buildBidPlan(
    research: typeof domainResearch.$inferSelect,
    createdBy: string,
): {
    eventType: 'approved' | 'watchlist' | 'passed';
    decision: ResearchDecision;
    decisionReason: string;
    message: string;
    payload: Record<string, unknown>;
} {
    const maxBid = roundMoney(Math.max(0, research.recommendedMaxBid ?? 0));
    const anchorPrice = roundMoney(Math.max(
        research.currentBid ?? 0,
        research.buyNowPrice ?? 0,
        research.aftermarketPrice ?? 0,
        research.registrationPrice ?? 0,
    ));
    const listingType = research.listingType ?? 'unknown';

    if (research.decision === 'bought') {
        return {
            eventType: 'approved',
            decision: 'bought',
            decisionReason: research.decisionReason ?? 'Already purchased',
            message: `${research.domain} already bought`,
            payload: {
                domain: research.domain,
                action: 'none',
                reason: 'already_bought',
                createdBy,
            },
        };
    }

    if (research.hardFailReason || maxBid <= 0) {
        const reason = research.hardFailReason || 'No positive bid capacity after underwriting';
        return {
            eventType: 'passed',
            decision: 'pass',
            decisionReason: reason,
            message: `${research.domain} passed (${reason})`,
            payload: {
                domain: research.domain,
                action: 'pass',
                maxBid,
                anchorPrice,
                listingType,
                reason,
                createdBy,
            },
        };
    }

    if (listingType === 'buy_now' && typeof research.buyNowPrice === 'number') {
        if (research.buyNowPrice <= maxBid) {
            return {
                eventType: 'approved',
                decision: 'buy',
                decisionReason: `Buy-now acceptable at $${research.buyNowPrice} (max $${maxBid})`,
                message: `${research.domain} approved for buy-now at $${research.buyNowPrice}`,
                payload: {
                    domain: research.domain,
                    action: 'buy_now',
                    buyNowPrice: research.buyNowPrice,
                    maxBid,
                    listingType,
                    createdBy,
                },
            };
        }
        return {
            eventType: 'watchlist',
            decision: 'watchlist',
            decisionReason: `Buy-now exceeds max bid ($${research.buyNowPrice} > $${maxBid})`,
            message: `${research.domain} moved to watchlist (buy-now above max bid)`,
            payload: {
                domain: research.domain,
                action: 'watchlist',
                buyNowPrice: research.buyNowPrice,
                maxBid,
                listingType,
                createdBy,
            },
        };
    }

    if ((listingType === 'auction' || typeof research.currentBid === 'number') && typeof research.currentBid === 'number') {
        const increment = getBidIncrement(research.currentBid);
        const suggestedNextBid = roundMoney(Math.min(maxBid, research.currentBid + increment));
        const bidHeadroomRatio = research.currentBid > 0 ? maxBid / research.currentBid : 0;

        if (bidHeadroomRatio >= 1.1) {
            return {
                eventType: 'approved',
                decision: 'buy',
                decisionReason: `Auction approved with max bid $${maxBid} and next bid $${suggestedNextBid}`,
                message: `${research.domain} approved for auction bidding (max $${maxBid})`,
                payload: {
                    domain: research.domain,
                    action: 'auction_bid',
                    currentBid: research.currentBid,
                    suggestedNextBid,
                    increment,
                    maxBid,
                    listingType,
                    createdBy,
                },
            };
        }
        return {
            eventType: 'watchlist',
            decision: 'watchlist',
            decisionReason: `Insufficient auction headroom (current $${research.currentBid}, max $${maxBid})`,
            message: `${research.domain} watchlist (auction headroom too thin)`,
            payload: {
                domain: research.domain,
                action: 'watchlist',
                currentBid: research.currentBid,
                increment,
                maxBid,
                listingType,
                createdBy,
            },
        };
    }

    return {
        eventType: 'watchlist',
        decision: 'watchlist',
        decisionReason: `No active listing price. Hold with max bid cap $${maxBid}`,
        message: `${research.domain} watchlist with max bid $${maxBid}`,
        payload: {
            domain: research.domain,
            action: 'watchlist',
            maxBid,
            anchorPrice,
            listingType,
            createdBy,
        },
    };
}

function notifyIdleIfNeeded(): void {
    if (activeJobs !== 0) {
        return;
    }
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
}

export function requestWorkerStop(): void {
    workerStopRequested = true;
}

export function getWorkerRuntimeState(): { stopRequested: boolean; activeJobs: number } {
    return {
        stopRequested: workerStopRequested,
        activeJobs,
    };
}

export async function waitForWorkerIdle(timeoutMs = 20_000): Promise<boolean> {
    if (activeJobs === 0) {
        return true;
    }

    return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
            resolve(false);
        }, timeoutMs);
        timeout.unref();

        idleWaiters.push(() => {
            clearTimeout(timeout);
            resolve(true);
        });
    });
}

/**
 * Recover stale locks — jobs that were locked but the worker crashed.
 * These get reset to 'pending' so they can be picked up again.
 */
async function recoverStaleLocks(): Promise<number> {
    const now = new Date();

    // Find jobs that are still marked as 'processing' but whose lock has expired
    const staleJobs = await db
        .update(contentQueue)
        .set({
            status: 'pending',
            lockedUntil: null,
            errorMessage: 'Worker crashed or timed out — auto-recovered',
        })
        .where(
            and(
                eq(contentQueue.status, 'processing'),
                lte(contentQueue.lockedUntil, now)
            )
        )
        .returning({ id: contentQueue.id });

    if (staleJobs.length > 0) {
        console.warn(`Recovered ${staleJobs.length} stale locks: ${staleJobs.map(j => j.id).join(', ')}`);
    }

    return staleJobs.length;
}

/**
 * Acquires pending jobs that are ready to process using atomic UPDATE...RETURNING
 * to prevent race conditions between multiple workers.
 */
async function acquireJobs(limit: number, jobTypes?: string[]) {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);

    // Use a single atomic UPDATE...WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
    // This prevents race conditions between multiple workers entirely.
    const jobTypeFilter = jobTypes?.length
        ? sql`AND ${contentQueue.jobType} IN (${sql.join(jobTypes.map(t => sql`${t}`), sql`, `)})`
        : sql``;

    const lockedJobs = await db.execute<typeof contentQueue.$inferSelect>(sql`
        UPDATE ${contentQueue}
        SET status = 'processing',
            locked_until = ${lockUntil},
            started_at = ${now}
        WHERE id IN (
            SELECT id FROM ${contentQueue}
            WHERE status = 'pending'
              AND (scheduled_for IS NULL OR scheduled_for <= ${now})
              AND (locked_until IS NULL OR locked_until <= ${now})
              ${jobTypeFilter}
            ORDER BY priority DESC, created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `);

    return Array.isArray(lockedJobs) ? lockedJobs : (lockedJobs as unknown as { rows: typeof contentQueue.$inferSelect[] }).rows ?? [];
}

/**
 * Acquire jobs by specific IDs, preserving the same lock semantics.
 */
async function acquireJobsByIds(ids: string[], limit: number, jobTypes?: string[]) {
    if (ids.length === 0 || limit <= 0) {
        return [];
    }

    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    const dedupedIds = [...new Set(ids)];
    const idList = sql.join(dedupedIds.map((id) => sql`${id}`), sql`, `);
    const jobTypeFilter = jobTypes?.length
        ? sql`AND ${contentQueue.jobType} IN (${sql.join(jobTypes.map(t => sql`${t}`), sql`, `)})`
        : sql``;

    const lockedJobs = await db.execute<typeof contentQueue.$inferSelect>(sql`
        UPDATE ${contentQueue}
        SET status = 'processing',
            locked_until = ${lockUntil},
            started_at = ${now}
        WHERE id IN (
            SELECT id FROM ${contentQueue}
            WHERE id IN (${idList})
              AND status = 'pending'
              AND (scheduled_for IS NULL OR scheduled_for <= ${now})
              AND (locked_until IS NULL OR locked_until <= ${now})
              ${jobTypeFilter}
            ORDER BY priority DESC, created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
    `);

    return Array.isArray(lockedJobs) ? lockedJobs : (lockedJobs as unknown as { rows: typeof contentQueue.$inferSelect[] }).rows ?? [];
}

/**
 * Requeue Redis-dequeued IDs that remain pending but were not acquired.
 */
async function requeueUnacquiredPendingIds(candidateIds: string[], acquiredIds: string[]): Promise<void> {
    if (candidateIds.length === 0) {
        return;
    }

    const acquired = new Set(acquiredIds);
    const unacquired = candidateIds.filter((id) => !acquired.has(id));
    if (unacquired.length === 0) {
        return;
    }

    const pendingRows = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(and(
            inArray(contentQueue.id, unacquired),
            eq(contentQueue.status, 'pending'),
        ));

    if (pendingRows.length > 0) {
        await requeueContentJobIds(pendingRows.map((row) => row.id));
    }
}

/**
 * Process a single job with timeout enforcement
 */
async function processJob(job: typeof contentQueue.$inferSelect): Promise<boolean> {
    const startTime = Date.now();
    console.log(`[Worker] Processing job ${job.id} (${job.jobType}) — attempt ${(job.attempts || 0) + 1}/${job.maxAttempts || 3}`);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    activeJobs += 1;

    try {
        // Create a timeout promise (cleared on success or failure to prevent leak)
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS / 1000}s`)), JOB_TIMEOUT_MS);
        });

        // Race the job against the timeout
        const jobPromise = executeJob(job);
        await Promise.race([jobPromise, timeoutPromise]);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        const durationMs = Date.now() - startTime;
        console.log(`[Worker] Job ${job.id} completed in ${durationMs}ms`);
        return true;
    } catch (error) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        const durationMs = Date.now() - startTime;
        console.error(`[Worker] Job ${job.id} failed after ${durationMs}ms:`, errorMessage);
        const categorized = FailureCategorizer.categorize(error);
        const failurePrefix = `[${categorized.category}] ${categorized.humanReadable}`;
        const detailedError = `${failurePrefix}: ${errorMessage}`;

        const attempts = (job.attempts || 0) + 1;
        const maxAttempts = job.maxAttempts || 3;
        const shouldRetry = categorized.retryable && attempts < maxAttempts;

        if (!shouldRetry) {
            // Dead letter — permanently failed
            const reason = categorized.retryable
                ? `Dead letter (${attempts}/${maxAttempts}): ${detailedError}`
                : `Permanent failure: ${detailedError}`;
            await markJobFailed(job.id, reason, {
                category: categorized.category,
                confidence: categorized.confidence,
                retryable: categorized.retryable,
                suggestedAction: categorized.suggestedAction,
                extractedDetails: categorized.extractedDetails,
                attempts,
                maxAttempts,
            }, attempts);

            // Reset article status so user can manually retry
            if (job.articleId) {
                await db
                    .update(articles)
                    .set({ status: 'draft' })
                    .where(eq(articles.id, job.articleId));
            }
        } else {
            // Schedule retry with exponential backoff: 2, 4, 8 minutes... capped at 30 min
            const retryDelayMs = calculateBackoff(attempts, {
                baseDelayMs: 60_000,
                maxDelayMs: 30 * 60_000,
                jitter: false,
            });
            const scheduledFor = new Date(Date.now() + retryDelayMs);

            await db
                .update(contentQueue)
                .set({
                    status: 'pending',
                    attempts,
                    lockedUntil: null,
                    scheduledFor,
                    errorMessage: `Retry ${attempts}/${maxAttempts}: ${detailedError}`,
                    result: {
                        failureCategory: categorized.category,
                        retryable: categorized.retryable,
                        confidence: categorized.confidence,
                        retryScheduledFor: scheduledFor.toISOString(),
                    },
                })
                .where(eq(contentQueue.id, job.id));

            console.log(`[Worker] Job ${job.id} scheduled for retry in ${retryDelayMs / 1000}s`);
        }

        return false;
    } finally {
        activeJobs = Math.max(0, activeJobs - 1);
        notifyIdleIfNeeded();
    }
}

/**
 * Execute the actual job logic based on job type
 */
async function executeJob(job: typeof contentQueue.$inferSelect): Promise<void> {
    switch (job.jobType) {
        case 'generate_outline':
            await processOutlineJob(job.id);
            break;
        case 'generate_draft':
            await processDraftJob(job.id);
            break;
        case 'humanize':
            await processHumanizeJob(job.id);
            break;
        case 'seo_optimize':
            await processSeoOptimizeJob(job.id);
            break;
        case 'generate_meta':
            await processMetaJob(job.id);
            break;
        case 'keyword_research':
            await processKeywordResearchJob(job.id);
            break;
        case 'research':
            await processResearchJob(job.id);
            break;
        case 'bulk_seed':
            await processBulkSeedJob(job.id);
            break;
        case 'deploy':
            await processDeployJob(job.id);
            break;
        case 'evaluate': {
            const evalPayload = job.payload as { domain: string; acquisitionCost?: number; niche?: string } | undefined;

            if (!evalPayload || typeof evalPayload.domain !== 'string' || evalPayload.domain.trim() === '') {
                await markJobFailed(job.id, 'Failed: invalid payload - missing or invalid domain');
                break;
            }

            // Optional type checks for extra safety
            const acquisitionCost = typeof evalPayload.acquisitionCost === 'number' ? evalPayload.acquisitionCost : undefined;
            const niche = typeof evalPayload.niche === 'string' ? evalPayload.niche : undefined;

            try {
                const evalResult = await evaluateDomain(evalPayload.domain, {
                    acquisitionCost,
                    niche,
                });
                await markJobComplete(job.id, `Score: ${evalResult.compositeScore}/100 — ${evalResult.recommendation}`);
            } catch (err) {
                await markJobFailed(job.id, err instanceof Error ? err.message : String(err));
            }
            break;
        }
        case 'fetch_analytics': {
            // Fetch Cloudflare + GSC analytics for the domain
            if (job.domainId) {
                const domainRecord = await db.select({ domain: domains.domain })
                    .from(domains).where(eq(domains.id, job.domainId)).limit(1);
                if (domainRecord.length) {
                    const { getDomainAnalytics } = await import('@/lib/analytics/cloudflare');
                    const cfData = await getDomainAnalytics(domainRecord[0].domain);
                    const gscData = await getDomainGSCSummary(domainRecord[0].domain);
                    await markJobComplete(job.id, `CF: ${cfData.length} days, GSC: ${gscData ? 'ok' : 'n/a'}`);
                } else {
                    await markJobFailed(job.id, 'Domain not found');
                }
            } else {
                await markJobFailed(job.id, 'No domainId provided');
            }
            break;
        }
        case 'content_refresh': {
            // Refresh a stale article — re-run research + regeneration
            if (job.articleId) {
                const articleRecord = await db.select({ id: articles.id, domainId: articles.domainId, targetKeyword: articles.targetKeyword })
                    .from(articles).where(eq(articles.id, job.articleId)).limit(1);
                if (articleRecord.length) {
                    const article = articleRecord[0];
                    // Queue a research job which will chain into outline -> draft -> humanize -> SEO -> meta
                    const domainRecord = await db.select({ domain: domains.domain })
                        .from(domains).where(eq(domains.id, article.domainId)).limit(1);

                    if (!domainRecord.length) {
                        await markJobFailed(job.id, `Domain not found for article: ${article.domainId}`);
                        break;
                    }

                    // Guard against duplicate refresh pipelines
                    const existingJob = await db.select({ id: contentQueue.id })
                        .from(contentQueue)
                        .where(and(
                            eq(contentQueue.articleId, article.id),
                            eq(contentQueue.jobType, 'research'),
                            inArray(contentQueue.status, ['pending', 'processing'])
                        ))
                        .limit(1);

                    if (existingJob.length > 0) {
                        await markJobComplete(job.id, `Refresh already in progress for article ${article.id}`);
                        break;
                    }

                    await enqueueContentJob({
                        jobType: 'research',
                        domainId: article.domainId,
                        articleId: article.id,
                        payload: { targetKeyword: article.targetKeyword, domainName: domainRecord[0].domain },
                        status: 'pending',
                        priority: 3,
                    });

                    // Update refresh timestamp
                    await db.update(articles).set({ lastRefreshedAt: new Date() }).where(eq(articles.id, article.id));
                    await markJobComplete(job.id, `Queued refresh pipeline for article ${article.id}`);
                } else {
                    await markJobFailed(job.id, 'Article not found');
                }
            } else {
                await markJobFailed(job.id, 'No articleId provided');
            }
            break;
        }
        case 'fetch_gsc': {
            if (job.domainId) {
                const domainRecord = await db.select({ domain: domains.domain })
                    .from(domains).where(eq(domains.id, job.domainId)).limit(1);
                if (domainRecord.length) {
                    const summary = await getDomainGSCSummary(domainRecord[0].domain);
                    await markJobComplete(job.id, summary
                        ? `Clicks: ${summary.totalClicks}, Impressions: ${summary.totalImpressions}`
                        : 'GSC not configured or no data');
                } else {
                    await markJobFailed(job.id, 'Domain not found');
                }
            } else {
                await markJobFailed(job.id, 'No domainId provided');
            }
            break;
        }
        case 'check_backlinks': {
            if (job.domainId) {
                await checkBacklinks(job.domainId);
                await markJobComplete(job.id, 'Backlink snapshot saved');
            } else {
                await markJobFailed(job.id, 'No domainId provided');
            }
            break;
        }
        case 'check_renewals': {
            await checkRenewals();
            await markJobComplete(job.id, 'Renewal check complete');
            break;
        }
        case 'check_datasets': {
            const staleCount = await checkStaleDatasets();
            await markJobComplete(job.id, `Found ${staleCount} stale dataset(s)`);
            break;
        }
        case 'ingest_listings': {
            const { candidates, createdBy } = parseIngestListingsPayload(job.payload);
            if (candidates.length === 0) {
                await markJobFailed(job.id, 'Failed: invalid payload - no valid listings found');
                break;
            }

            let ingested = 0;
            let queued = 0;
            for (const candidate of candidates) {
                const research = await upsertResearchCandidate(candidate);
                ingested += 1;

                await logAcquisitionEvent(
                    research.id,
                    'ingested',
                    {
                        domain: research.domain,
                        listingSource: candidate.listingSource ?? null,
                        listingType: candidate.listingType ?? null,
                        currentBid: candidate.currentBid ?? null,
                        buyNowPrice: candidate.buyNowPrice ?? null,
                        auctionEndsAt: candidate.auctionEndsAt?.toISOString() ?? null,
                        acquisitionCost: candidate.acquisitionCost ?? null,
                        underwritingVersion: UNDERWRITING_VERSION,
                    },
                    createdBy,
                );

                const queuedStage = await enqueueAcquisitionStageJobIfMissing(
                    'enrich_candidate',
                    research.id,
                    {
                        domainResearchId: research.id,
                        domain: research.domain,
                        niche: candidate.niche,
                        acquisitionCost: candidate.acquisitionCost,
                        quickMode: candidate.quickMode ?? false,
                        forceRefresh: candidate.forceRefresh ?? false,
                        createdBy,
                    },
                    job.priority ?? 2,
                );
                if (queuedStage) {
                    queued += 1;
                }
            }

            await markJobComplete(job.id, `Ingested ${ingested} candidate(s), queued ${queued} enrichment job(s)`);
            break;
        }
        case 'enrich_candidate': {
            if (!isPlainObject(job.payload)) {
                await markJobFailed(job.id, 'Failed: invalid payload for enrich_candidate');
                break;
            }

            const createdBy = toOptionalString(job.payload.createdBy) || 'system';
            const research = await resolveResearchRowFromPayload(job.payload, { createIfMissing: true });
            if (!research) {
                await markJobFailed(job.id, 'Failed: candidate not found for enrichment');
                break;
            }

            const acquisitionCost = resolveAcquisitionCost(job.payload, research);
            const niche = toOptionalString(job.payload.niche);
            const quickMode = toOptionalBoolean(job.payload.quickMode) ?? false;
            const forceRefresh = toOptionalBoolean(job.payload.forceRefresh) ?? false;

            const evaluation = await evaluateDomain(research.domain, {
                acquisitionCost,
                niche,
                quickMode,
                forceRefresh,
            });

            const eventType = evaluation.recommendation === 'hard_pass' ? 'hard_fail' : 'enriched';
            await logAcquisitionEvent(
                research.id,
                eventType,
                {
                    domain: research.domain,
                    compositeScore: evaluation.compositeScore,
                    recommendation: evaluation.recommendation,
                    hadAiFallback: evaluation.hadAiFallback,
                    acquisitionCost,
                    apiCost: evaluation.apiCost,
                    underwritingVersion: UNDERWRITING_VERSION,
                },
                createdBy,
            );

            await enqueueAcquisitionStageJobIfMissing(
                'score_candidate',
                research.id,
                {
                    domainResearchId: research.id,
                    domain: research.domain,
                    acquisitionCost,
                    niche,
                    forceRefresh: false,
                    createdBy,
                },
                job.priority ?? 2,
            );

            await markJobComplete(
                job.id,
                `Enriched ${research.domain}: ${evaluation.compositeScore}/100 (${evaluation.recommendation})`,
            );
            break;
        }
        case 'score_candidate': {
            if (!isPlainObject(job.payload)) {
                await markJobFailed(job.id, 'Failed: invalid payload for score_candidate');
                break;
            }

            const createdBy = toOptionalString(job.payload.createdBy) || 'system';
            const research = await resolveResearchRowFromPayload(job.payload);
            if (!research) {
                await markJobFailed(job.id, 'Failed: candidate not found for scoring');
                break;
            }

            const acquisitionCost = resolveAcquisitionCost(job.payload, research);
            const niche = toOptionalString(job.payload.niche);
            const forceRefresh = toOptionalBoolean(job.payload.forceRefresh) ?? false;
            const quickMode = toOptionalBoolean(job.payload.quickMode) ?? true;

            let evaluation = research.evaluationResult as Awaited<ReturnType<typeof evaluateDomain>> | null;
            const hasUsableEvaluation = evaluation
                && typeof evaluation === 'object'
                && typeof evaluation.compositeScore === 'number'
                && typeof evaluation.recommendation === 'string';

            if (!hasUsableEvaluation || forceRefresh) {
                evaluation = await evaluateDomain(research.domain, {
                    acquisitionCost,
                    niche,
                    quickMode,
                    forceRefresh,
                });
            }

            if (!evaluation) {
                await markJobFailed(job.id, 'Failed: missing evaluation result after scoring step');
                break;
            }

            const underwriting = buildUnderwritingSnapshot(evaluation, research, acquisitionCost);
            const decision = decideResearchOutcome(research, evaluation, underwriting);
            const evaluatedAt = toOptionalDate(evaluation.evaluatedAt) ?? new Date();
            const keywordCpc = typeof evaluation.signals.keyword?.cpc === 'number'
                ? roundMoney(evaluation.signals.keyword.cpc)
                : null;
            const estimatedRevenuePotential = roundMoney(evaluation.revenueProjections.month12.revenue[1] ?? 0);

            await db.update(domainResearch).set({
                demandScore: underwriting.demandScore,
                compsScore: underwriting.compsScore,
                tmRiskScore: underwriting.tmRiskScore,
                historyRiskScore: underwriting.historyRiskScore,
                backlinkRiskScore: underwriting.backlinkRiskScore,
                compLow: underwriting.compLow,
                compHigh: underwriting.compHigh,
                expected12mRevenueLow: underwriting.expected12mRevenueLow,
                expected12mRevenueHigh: underwriting.expected12mRevenueHigh,
                recommendedMaxBid: underwriting.recommendedMaxBid,
                confidenceScore: underwriting.confidenceScore,
                hardFailReason: underwriting.hardFailReason,
                underwritingVersion: UNDERWRITING_VERSION,
                domainScore: evaluation.compositeScore.toString(),
                keywordVolume: evaluation.signals.keyword?.volume ?? null,
                keywordCpc: keywordCpc === null ? null : keywordCpc.toString(),
                estimatedRevenuePotential: estimatedRevenuePotential.toString(),
                evaluationResult: evaluation as unknown as Record<string, unknown>,
                evaluatedAt,
                decision: decision.decision,
                decisionReason: decision.reason,
            }).where(eq(domainResearch.id, research.id));

            await syncDomainBuyReviewTask({
                domainResearchId: research.id,
                domainId: research.domainId ?? null,
                domain: research.domain,
                decision: decision.decision,
                decisionReason: decision.reason,
                recommendedMaxBid: underwriting.recommendedMaxBid,
            });

            await syncDomainBuyPreviewBuild({
                domainResearchId: research.id,
                domainId: research.domainId ?? null,
                decision: decision.decision,
                domain: research.domain,
                compositeScore: evaluation.compositeScore,
                recommendation: evaluation.recommendation,
                recommendedMaxBid: underwriting.recommendedMaxBid,
                confidenceScore: underwriting.confidenceScore,
                hardFailReason: underwriting.hardFailReason,
            });

            await logAcquisitionEvent(
                research.id,
                underwriting.hardFailReason ? 'hard_fail' : 'scored',
                {
                    domain: research.domain,
                    recommendation: evaluation.recommendation,
                    compositeScore: evaluation.compositeScore,
                    recommendedMaxBid: underwriting.recommendedMaxBid,
                    confidenceScore: underwriting.confidenceScore,
                    hardFailReason: underwriting.hardFailReason,
                    decision: decision.decision,
                    decisionReason: decision.reason,
                    underwritingVersion: UNDERWRITING_VERSION,
                },
                createdBy,
            );

            if (!underwriting.hardFailReason) {
                await enqueueAcquisitionStageJobIfMissing(
                    'create_bid_plan',
                    research.id,
                    {
                        domainResearchId: research.id,
                        domain: research.domain,
                        createdBy,
                    },
                    job.priority ?? 2,
                );
            }

            await markJobComplete(
                job.id,
                `${research.domain} scored ${evaluation.compositeScore}/100; max bid $${underwriting.recommendedMaxBid}`,
            );
            break;
        }
        case 'create_bid_plan': {
            if (!isPlainObject(job.payload)) {
                await markJobFailed(job.id, 'Failed: invalid payload for create_bid_plan');
                break;
            }

            const createdBy = toOptionalString(job.payload.createdBy) || 'system';
            const research = await resolveResearchRowFromPayload(job.payload);
            if (!research) {
                await markJobFailed(job.id, 'Failed: candidate not found for bid planning');
                break;
            }

            const plan = buildBidPlan(research, createdBy);
            const decision = research.decision === 'bought' ? 'bought' : plan.decision;
            const decisionReason = research.decision === 'bought'
                ? (research.decisionReason ?? plan.decisionReason)
                : plan.decisionReason;

            await db.update(domainResearch).set({
                decision,
                decisionReason,
                underwritingVersion: UNDERWRITING_VERSION,
            }).where(eq(domainResearch.id, research.id));

            await logAcquisitionEvent(
                research.id,
                plan.eventType,
                {
                    ...plan.payload,
                    decision,
                    decisionReason,
                    underwritingVersion: UNDERWRITING_VERSION,
                },
                createdBy,
            );

            await markJobComplete(job.id, plan.message);
            break;
        }
        default:
            throw new Error(`Unknown job type: ${job.jobType}`);
    }
}

/**
 * Process a bulk_seed job: queue keyword_research jobs for N articles on a domain.
 * The keyword_research pipeline will chain into outline -> draft -> humanize -> SEO.
 */
async function processBulkSeedJob(jobId: string) {
    const [job] = await db.select().from(contentQueue).where(eq(contentQueue.id, jobId)).limit(1);
    if (!job?.domainId) {
        await markJobFailed(jobId, 'No domainId provided');
        return;
    }

    const payload = job.payload as { domain?: string; niche?: string; subNiche?: string; articleCount?: number } | undefined;
    const articleCount = payload?.articleCount || 5;

    const domainRecord = await db.select().from(domains).where(eq(domains.id, job.domainId)).limit(1);
    if (!domainRecord.length) {
        await markJobFailed(jobId, 'Domain not found');
        return;
    }

    const domain = domainRecord[0];

    // Check for available unassigned keywords
    const availableKeywords = await db.select()
        .from(keywords)
        .where(and(eq(keywords.domainId, domain.id), isNull(keywords.articleId)))
        .limit(articleCount);

    // Queue keyword_research if we don't have enough keywords
    const keywordsNeeded = articleCount - availableKeywords.length;
    if (keywordsNeeded > 0) {
        await enqueueContentJob({
            jobType: 'keyword_research',
            domainId: domain.id,
            payload: {
                domain: domain.domain,
                niche: domain.niche,
                subNiche: domain.subNiche,
                targetCount: keywordsNeeded,
            },
            status: 'pending',
            priority: job.priority ?? 3,
        });
    }

    // Queue article generation for each available keyword
    let queued = 0;
    for (const kw of availableKeywords) {
        // Create article stub
        const slug = kw.keyword.toLowerCase().replaceAll(/\s+/g, '-').replaceAll(/[^a-z0-9-]/g, '').replaceAll(/-+/g, '-').replaceAll(/^-|-$/g, '') || `article-${kw.id.slice(0, 8)}`;
        const [article] = await db.insert(articles).values({
            domainId: domain.id,
            title: kw.keyword,
            slug,
            targetKeyword: kw.keyword,
            status: 'generating',
            isSeedArticle: true,
        }).returning();

        // Link keyword to article
        await db.update(keywords).set({ articleId: article.id, status: 'assigned' }).where(eq(keywords.id, kw.id));

        // Queue the generation pipeline
        await enqueueContentJob({
            jobType: 'research',
            domainId: domain.id,
            articleId: article.id,
            payload: { targetKeyword: kw.keyword, domainName: domain.domain },
            status: 'pending',
            priority: job.priority ?? 3,
        });
        queued++;
    }

    await markJobComplete(jobId, `Queued ${queued} article(s), ${keywordsNeeded > 0 ? `${keywordsNeeded} keyword research job(s)` : 'all keywords available'}`);
}

async function markJobComplete(jobId: string, result?: string) {
    await db
        .update(contentQueue)
        .set({
            status: 'completed',
            completedAt: new Date(),
            lockedUntil: null,
            result: result ? { message: result } : undefined,
        })
        .where(eq(contentQueue.id, jobId));
}

async function markJobFailed(
    jobId: string,
    errorMessage: string,
    failureMeta?: Record<string, unknown>,
    attempts?: number,
) {
    await db
        .update(contentQueue)
        .set({
            status: 'failed',
            errorMessage,
            result: failureMeta ? { failure: failureMeta } : undefined,
            attempts,
            lockedUntil: null,
            completedAt: new Date(),
        })
        .where(eq(contentQueue.id, jobId));
}

/**
 * Run the worker once (process available jobs and exit)
 */
export async function runWorkerOnce(options: WorkerOptions = {}): Promise<WorkerResult> {
    const maxJobs = options.maxJobs || BATCH_SIZE;

    // Step 1: Recover any stale locks from crashed workers
    const staleLocksCleaned = await recoverStaleLocks();

    // Step 2: Acquire and process jobs.
    // In Redis mode, consume Redis-dispatched IDs first; otherwise (or on empty/degraded),
    // fall back to PostgreSQL scanning.
    let jobs: typeof contentQueue.$inferSelect[] = [];
    const redisIds = await dequeueContentJobIds(maxJobs * 3);
    if (redisIds.length > 0) {
        jobs = await acquireJobsByIds(redisIds, maxJobs, options.jobTypes);
        await requeueUnacquiredPendingIds(redisIds, jobs.map((job) => job.id));
    }
    if (jobs.length === 0) {
        jobs = await acquireJobs(maxJobs, options.jobTypes);
    }

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
        const success = await processJob(job);
        if (success) {
            processed++;
        } else {
            failed++;
        }
    }

    // Step 3: Get current stats
    const stats = await getQueueStats();

    return { processed, failed, staleLocksCleaned, stats };
}

/**
 * Run the worker continuously (for production use with process manager)
 */
export async function runWorkerContinuously(options: WorkerOptions = {}): Promise<void> {
    console.log('[Worker] Starting continuous queue worker...');

    workerStopRequested = false;

    let lastStaleCheck = 0;
    let lastSchedulerCheck = 0;

    while (!workerStopRequested) {
        try {
            const now = Date.now();

            // Periodically recover stale locks (every 60s)
            if (now - lastStaleCheck > STALE_LOCK_CHECK_INTERVAL) {
                await recoverStaleLocks();
                lastStaleCheck = now;
            }

            // Run scheduler check approximately every hour
            if (now - lastSchedulerCheck > SCHEDULER_CHECK_INTERVAL) {
                await checkContentSchedule().catch((err: unknown) => console.error('[Scheduler] Error:', err));
                await checkAndRefreshStaleContent().catch((err: unknown) => console.error('[ContentRefresh] Error:', err));
                await checkRenewals().catch((err: unknown) => console.error('[Renewals] Error:', err));
                await snapshotCompliance().catch((err: unknown) => console.error('[Compliance] Error:', err));
                await checkStaleDatasets().catch((err: unknown) => console.error('[DatasetFreshness] Error:', err));
                await purgeExpiredSessions().catch((err: unknown) => console.error('[SessionPurge] Error:', err));
                await runAllMonitoringChecks().catch((err: unknown) => console.error('[Monitoring] Error:', err));
                lastSchedulerCheck = now;
            }

            const result = await runWorkerOnce(options);

            if (result.processed > 0 || result.failed > 0) {
                console.log(
                    `[Worker] Batch: ${result.processed} processed, ${result.failed} failed, ` +
                    `${result.staleLocksCleaned} stale recovered | ` +
                    `Queue: ${result.stats.pending} pending, ${result.stats.failed} dead`
                );
            }
        } catch (error) {
            console.error('[Worker] Unexpected error:', error);
        }

        if (workerStopRequested) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const idle = await waitForWorkerIdle(20_000);
    if (!idle) {
        console.warn('[Worker] Stop requested but jobs still active after timeout');
    }
    console.log('[Worker] Worker loop stopped');
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
    const stats = await db
        .select({
            status: contentQueue.status,
            count: sql<number>`count(*)::int`,
        })
        .from(contentQueue)
        .groupBy(contentQueue.status);

    const byStatus: Record<string, number> = {};
    for (const row of stats) {
        if (row.status) {
            byStatus[row.status] = row.count;
        }
    }

    return {
        pending: byStatus['pending'] || 0,
        processing: byStatus['processing'] || 0,
        completed: byStatus['completed'] || 0,
        failed: byStatus['failed'] || 0,
        cancelled: byStatus['cancelled'] || 0,
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    };
}

/**
 * Get detailed queue health metrics
 */
export async function getQueueHealth() {
    const stats = await getQueueStats();

    // Get oldest pending job age
    const oldestPending = await db
        .select({ createdAt: contentQueue.createdAt })
        .from(contentQueue)
        .where(eq(contentQueue.status, 'pending'))
        .orderBy(asc(contentQueue.createdAt))
        .limit(1);

    // Get average processing time for completed jobs (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const avgDuration = await db
        .select({
            avgMs: sql<number>`avg(extract(epoch from (${contentQueue.completedAt} - ${contentQueue.startedAt})) * 1000)::int`,
        })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'completed'),
                lte(contentQueue.completedAt, new Date()),
                gt(contentQueue.completedAt, oneDayAgo)
            )
        );

    // Get throughput (completed jobs in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const throughput = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'completed'),
                gt(contentQueue.completedAt, oneHourAgo)
            )
        );

    // Get error rate (failed in last 24h / total in last 24h)
    const recentTotal = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(gt(contentQueue.createdAt, oneDayAgo));

    const recentFailed = await db
        .select({ count: count() })
        .from(contentQueue)
        .where(
            and(
                eq(contentQueue.status, 'failed'),
                gt(contentQueue.createdAt, oneDayAgo)
            )
        );

    const totalRecent = recentTotal[0]?.count || 0;
    const failedRecent = recentFailed[0]?.count || 0;

    return {
        ...stats,
        oldestPendingAge: oldestPending[0]?.createdAt
            ? Date.now() - oldestPending[0].createdAt.getTime()
            : null,
        avgProcessingTimeMs: avgDuration[0]?.avgMs || null,
        throughputPerHour: throughput[0]?.count || 0,
        errorRate24h: totalRecent > 0 ? Math.round((failedRecent / totalRecent) * 10000) / 100 : 0,
    };
}

/**
 * Retry failed jobs
 */
export async function retryFailedJobs(limit = 10): Promise<number> {
    const failedJobs = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(eq(contentQueue.status, 'failed'))
        .limit(limit);

    for (const job of failedJobs) {
        await db
            .update(contentQueue)
            .set({
                status: 'pending',
                attempts: 0,
                errorMessage: null,
                scheduledFor: new Date(),
                lockedUntil: null,
            })
            .where(eq(contentQueue.id, job.id));
    }

    return failedJobs.length;
}

/**
 * Cancel a pending job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
    const result = await db
        .update(contentQueue)
        .set({ status: 'cancelled' })
        .where(
            and(
                eq(contentQueue.id, jobId),
                eq(contentQueue.status, 'pending')
            )
        )
        .returning();

    return result.length > 0;
}

/**
 * Purge completed jobs older than N days
 */
export async function purgeOldJobs(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const deleted = await db
        .delete(contentQueue)
        .where(
            and(
                or(
                    eq(contentQueue.status, 'completed'),
                    eq(contentQueue.status, 'cancelled')
                ),
                lte(contentQueue.completedAt, cutoff)
            )
        )
        .returning({ id: contentQueue.id });

    if (deleted.length > 0) {
        console.log(`[Worker] Purged ${deleted.length} old completed/cancelled jobs`);
    }

    return deleted.length;
}
