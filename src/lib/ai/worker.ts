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
 * - run_integration_connection_sync: Execute scheduled integration sync
 */

import { createHash, randomInt } from 'node:crypto';
import {
    db,
    contentQueue,
    articles,
    domains,
    keywords,
    domainResearch,
    acquisitionEvents,
    reviewTasks,
    previewBuilds,
    promotionCampaigns,
    promotionJobs,
    promotionEvents,
    mediaAssets,
    mediaAssetUsage,
    mediaModerationTasks,
    domainChannelProfiles,
} from '@/lib/db';
import { eq, and, lte, gt, gte, isNull, or, sql, asc, desc, count, inArray } from 'drizzle-orm';
import { processOutlineJob, processDraftJob, processHumanizeJob, processSeoOptimizeJob, processResolveExternalLinksJob, processMetaJob, processKeywordResearchJob, processResearchJob } from './pipeline';
import { processDeployJob } from '@/lib/deploy/processor';
import { checkContentSchedule } from './scheduler';
import { evaluateDomain } from '@/lib/evaluation/evaluator';
import { checkAndRefreshStaleContent } from '@/lib/content/refresh';
import { checkRenewals } from '@/lib/domain/renewals';
import { advanceDomainLifecycleForAcquisition } from '@/lib/domain/lifecycle-sync';
import { checkBacklinks } from '@/lib/analytics/backlinks';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';
import { snapshotCompliance } from '@/lib/compliance/metrics';
import { purgeExpiredSessions } from '@/lib/auth';
import { checkStaleDatasets } from '@/lib/datasets/freshness';
import { runAllMonitoringChecks } from '@/lib/monitoring/triggers';
import { calculateBackoff } from '@/lib/tpilot/core/retry';
import { FailureCategorizer } from '@/lib/tpilot/core/failure-categorizer';
import { dequeueContentJobIds, enqueueContentJob, requeueContentJobIds } from '@/lib/queue/content-queue';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { refreshResearchCacheEntry } from '@/lib/ai/research-cache';
import { publishToGrowthChannel } from '@/lib/growth/publishers';
import { refreshExpiringGrowthCredentialsAudit, resolveGrowthPublishCredential } from '@/lib/growth/channel-credentials';
import { evaluateGrowthPublishPolicy } from '@/lib/growth/policy';
import { runMediaReviewEscalationSweep } from '@/lib/growth/media-review-escalation';
import { purgeDeletedGrowthMediaStorage } from '@/lib/growth/media-retention';
import { runRevenueReconciliationSweep } from '@/lib/finance/reconciliation-monitor';
import { runRevenueDataContractSweep } from '@/lib/data/contracts-monitor';
import { runCapitalAllocationSweep } from '@/lib/growth/capital-allocation-monitor';
import { runDomainLifecycleMonitorSweep } from '@/lib/domain/lifecycle-monitor';
import { runCompetitorRefreshSweep } from '@/lib/competitors/refresh-sweep';
import { runStrategyPropagationSweep } from '@/lib/domain/strategy-propagation-monitor';
import { runIntegrationHealthSweep } from '@/lib/integrations/health-monitor';
import { runIntegrationConnectionSync } from '@/lib/integrations/executor';
import { scheduleIntegrationConnectionSyncJobs } from '@/lib/integrations/scheduler';
import { runCampaignLaunchReviewEscalationSweep } from '@/lib/review/campaign-launch-sla';
import {
    runGrowthLaunchFreezePostmortemSlaSweep,
    syncGrowthLaunchFreezeAuditState,
} from '@/lib/growth/launch-freeze';
import { createNotification } from '@/lib/notifications';
import {
    evaluatePromotionIntegrityAlert,
    summarizePromotionIntegrity,
} from '@/lib/growth/integrity';

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
    transientRetriesQueued: number;
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

async function purgeExpiredPreviewBuilds(): Promise<number> {
    const now = new Date();
    const expired = await db.update(previewBuilds).set({
        buildStatus: 'expired',
        updatedAt: now,
    }).where(and(
        lte(previewBuilds.expiresAt, now),
        or(
            eq(previewBuilds.buildStatus, 'ready'),
            eq(previewBuilds.buildStatus, 'queued'),
            eq(previewBuilds.buildStatus, 'building'),
        ),
    )).returning({ id: previewBuilds.id });
    if (expired.length > 0) {
        console.log(`[PreviewBuildPurge] Expired ${expired.length} preview build(s)`);
    }
    return expired.length;
}

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
    const [linkedDomain] = await db.select({ id: domains.id })
        .from(domains)
        .where(and(
            eq(domains.domain, candidate.domain),
            isNull(domains.deletedAt),
        ))
        .limit(1);
    const resolvedDomainId = linkedDomain?.id ?? null;

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
        domainId: resolvedDomainId,
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
            ...(resolvedDomainId ? { domainId: resolvedDomainId } : {}),
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
        if (!byDomain[0].domainId) {
            const [linkedDomain] = await db.select({ id: domains.id })
                .from(domains)
                .where(and(
                    eq(domains.domain, normalized.domain),
                    isNull(domains.deletedAt),
                ))
                .limit(1);
            if (linkedDomain?.id) {
                const [updated] = await db.update(domainResearch).set({
                    domainId: linkedDomain.id,
                }).where(eq(domainResearch.id, byDomain[0].id)).returning();
                return updated ?? byDomain[0];
            }
        }
        return byDomain[0];
    }

    if (!options.createIfMissing) {
        return null;
    }

    const [linkedDomain] = await db.select({ id: domains.id })
        .from(domains)
        .where(and(
            eq(domains.domain, normalized.domain),
            isNull(domains.deletedAt),
        ))
        .limit(1);

    const [created] = await db.insert(domainResearch).values({
        domain: normalized.domain,
        tld: normalized.tld,
        domainId: linkedDomain?.id ?? null,
        decision: 'researching',
        underwritingVersion: UNDERWRITING_VERSION,
    }).returning();

    return created ?? null;
}

type AcquisitionStageJobType = 'enrich_candidate' | 'score_candidate' | 'create_bid_plan';
type GrowthChannel = 'pinterest' | 'youtube_shorts';
type GrowthExecutionJobType =
    | 'generate_short_script'
    | 'render_short_video'
    | 'publish_pinterest_pin'
    | 'publish_youtube_short'
    | 'sync_campaign_metrics'
    | 'run_media_review_escalations';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GROWTH_COOLDOWN_HOURS = Number.isFinite(Number.parseInt(process.env.GROWTH_CHANNEL_COOLDOWN_HOURS || '', 10))
    ? Math.max(1, Number.parseInt(process.env.GROWTH_CHANNEL_COOLDOWN_HOURS || '', 10))
    : 24;
const GROWTH_DEFAULT_DAILY_CAP = Number.isFinite(Number.parseInt(process.env.GROWTH_DEFAULT_DAILY_CAP || '', 10))
    ? Math.max(1, Number.parseInt(process.env.GROWTH_DEFAULT_DAILY_CAP || '', 10))
    : 2;
const GROWTH_DEFAULT_MIN_JITTER_MINUTES = Number.isFinite(Number.parseInt(process.env.GROWTH_DEFAULT_MIN_JITTER_MINUTES || '', 10))
    ? Math.max(0, Number.parseInt(process.env.GROWTH_DEFAULT_MIN_JITTER_MINUTES || '', 10))
    : 15;
const GROWTH_DEFAULT_MAX_JITTER_MINUTES = Number.isFinite(Number.parseInt(process.env.GROWTH_DEFAULT_MAX_JITTER_MINUTES || '', 10))
    ? Math.max(GROWTH_DEFAULT_MIN_JITTER_MINUTES, Number.parseInt(process.env.GROWTH_DEFAULT_MAX_JITTER_MINUTES || '', 10))
    : 90;
const GROWTH_DEFAULT_QUIET_HOURS_START = Number.isFinite(Number.parseInt(process.env.GROWTH_DEFAULT_QUIET_HOURS_START || '', 10))
    ? clamp(Number.parseInt(process.env.GROWTH_DEFAULT_QUIET_HOURS_START || '', 10), 0, 23)
    : 23;
const GROWTH_DEFAULT_QUIET_HOURS_END = Number.isFinite(Number.parseInt(process.env.GROWTH_DEFAULT_QUIET_HOURS_END || '', 10))
    ? clamp(Number.parseInt(process.env.GROWTH_DEFAULT_QUIET_HOURS_END || '', 10), 0, 23)
    : 6;
const MEDIA_REVIEW_ESCALATION_SWEEP_USER_LIMIT = Number.isFinite(Number.parseInt(process.env.MEDIA_REVIEW_ESCALATION_SWEEP_USER_LIMIT || '', 10))
    ? Math.max(1, Math.min(Number.parseInt(process.env.MEDIA_REVIEW_ESCALATION_SWEEP_USER_LIMIT || '', 10), 500))
    : 100;

function toUuid(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return UUID_REGEX.test(trimmed) ? trimmed : undefined;
}

function toGrowthChannel(value: unknown): GrowthChannel | null {
    if (value !== 'pinterest' && value !== 'youtube_shorts') {
        return null;
    }
    return value;
}

function normalizeGrowthChannels(value: unknown): GrowthChannel[] {
    if (!Array.isArray(value)) return [];
    const normalized = value
        .map((item) => toGrowthChannel(item))
        .filter((item): item is GrowthChannel => item !== null);
    return [...new Set(normalized)];
}

type GrowthChannelCompatibility = 'supported' | 'limited' | 'blocked';

interface GrowthChannelProfileSettings {
    channel: GrowthChannel;
    enabled: boolean;
    compatibility: GrowthChannelCompatibility;
    dailyCap: number | null;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    minJitterMinutes: number;
    maxJitterMinutes: number;
}

interface GrowthSchedulePlan {
    scheduledFor: Date;
    jitterMinutes: number;
    movedOutOfQuietHours: boolean;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
}

function randomIntInclusive(minValue: number, maxValue: number): number {
    const min = Math.floor(Math.min(minValue, maxValue));
    const max = Math.floor(Math.max(minValue, maxValue));
    if (min === max) return min;
    return randomInt(min, max + 1);
}

function isWithinQuietHoursUtc(date: Date, startHour: number, endHour: number): boolean {
    if (startHour === endHour) {
        return false;
    }
    const hour = date.getUTCHours();
    if (startHour < endHour) {
        return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour;
}

function computeGrowthPublishSchedule(profile: GrowthChannelProfileSettings): GrowthSchedulePlan {
    const now = new Date();
    const minJitterMinutes = clamp(profile.minJitterMinutes, 0, 24 * 60);
    const maxJitterMinutes = clamp(profile.maxJitterMinutes, minJitterMinutes, 24 * 60);
    const jitterMinutes = randomIntInclusive(minJitterMinutes, maxJitterMinutes);
    const scheduled = new Date(now.getTime() + jitterMinutes * 60 * 1000);

    const quietHoursStart = profile.quietHoursStart;
    const quietHoursEnd = profile.quietHoursEnd;
    if (
        typeof quietHoursStart !== 'number'
        || typeof quietHoursEnd !== 'number'
        || !isWithinQuietHoursUtc(scheduled, quietHoursStart, quietHoursEnd)
    ) {
        return {
            scheduledFor: scheduled,
            jitterMinutes,
            movedOutOfQuietHours: false,
            quietHoursStart: quietHoursStart ?? null,
            quietHoursEnd: quietHoursEnd ?? null,
        };
    }

    const adjusted = new Date(scheduled);
    adjusted.setUTCHours(quietHoursEnd, 0, 0, 0);
    if (adjusted.getTime() <= scheduled.getTime()) {
        adjusted.setUTCDate(adjusted.getUTCDate() + 1);
    }
    adjusted.setUTCMinutes(randomIntInclusive(5, 35));

    return {
        scheduledFor: adjusted,
        jitterMinutes,
        movedOutOfQuietHours: true,
        quietHoursStart,
        quietHoursEnd,
    };
}

async function getGrowthChannelProfilesByDomainId(domainId: string | null | undefined): Promise<Map<GrowthChannel, GrowthChannelProfileSettings>> {
    if (!domainId) {
        return new Map<GrowthChannel, GrowthChannelProfileSettings>();
    }

    const rows = await db
        .select({
            channel: domainChannelProfiles.channel,
            enabled: domainChannelProfiles.enabled,
            compatibility: domainChannelProfiles.compatibility,
            dailyCap: domainChannelProfiles.dailyCap,
            quietHoursStart: domainChannelProfiles.quietHoursStart,
            quietHoursEnd: domainChannelProfiles.quietHoursEnd,
            minJitterMinutes: domainChannelProfiles.minJitterMinutes,
            maxJitterMinutes: domainChannelProfiles.maxJitterMinutes,
        })
        .from(domainChannelProfiles)
        .where(eq(domainChannelProfiles.domainId, domainId));

    const map = new Map<GrowthChannel, GrowthChannelProfileSettings>();
    for (const row of rows) {
        const channel = toGrowthChannel(row.channel);
        if (!channel) continue;
        map.set(channel, {
            channel,
            enabled: row.enabled ?? true,
            compatibility: (row.compatibility as GrowthChannelCompatibility) || 'supported',
            dailyCap: row.dailyCap ?? null,
            quietHoursStart: row.quietHoursStart ?? null,
            quietHoursEnd: row.quietHoursEnd ?? null,
            minJitterMinutes: row.minJitterMinutes ?? GROWTH_DEFAULT_MIN_JITTER_MINUTES,
            maxJitterMinutes: row.maxJitterMinutes ?? GROWTH_DEFAULT_MAX_JITTER_MINUTES,
        });
    }

    return map;
}

function resolveGrowthChannelProfile(
    profilesByChannel: Map<GrowthChannel, GrowthChannelProfileSettings>,
    channel: GrowthChannel,
): GrowthChannelProfileSettings {
    const fromDb = profilesByChannel.get(channel);
    if (fromDb) {
        return {
            ...fromDb,
            minJitterMinutes: clamp(fromDb.minJitterMinutes, 0, 24 * 60),
            maxJitterMinutes: clamp(fromDb.maxJitterMinutes, clamp(fromDb.minJitterMinutes, 0, 24 * 60), 24 * 60),
        };
    }

    return {
        channel,
        enabled: true,
        compatibility: 'supported',
        dailyCap: null,
        quietHoursStart: GROWTH_DEFAULT_QUIET_HOURS_START,
        quietHoursEnd: GROWTH_DEFAULT_QUIET_HOURS_END,
        minJitterMinutes: GROWTH_DEFAULT_MIN_JITTER_MINUTES,
        maxJitterMinutes: GROWTH_DEFAULT_MAX_JITTER_MINUTES,
    };
}

function getGrowthPayload(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : {};
}

function buildCreativeHash(seed: string): string {
    return createHash('sha256').update(seed).digest('hex').slice(0, 24);
}

function getUtcDayStart(now = new Date()): Date {
    return new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
    ));
}

function getLinkedPromotionJobId(job: typeof contentQueue.$inferSelect): string | null {
    const payload = getGrowthPayload(job.payload);
    return toUuid(payload.promotionJobId) ?? null;
}

async function markLinkedPromotionJobRunning(job: typeof contentQueue.$inferSelect): Promise<void> {
    const promotionJobId = getLinkedPromotionJobId(job);
    if (!promotionJobId) return;
    await db.update(promotionJobs).set({
        status: 'running',
        startedAt: new Date(),
    }).where(eq(promotionJobs.id, promotionJobId));
}

async function markLinkedPromotionJobCompleted(job: typeof contentQueue.$inferSelect): Promise<void> {
    const promotionJobId = getLinkedPromotionJobId(job);
    if (!promotionJobId) return;
    await db.update(promotionJobs).set({
        status: 'completed',
        completedAt: new Date(),
        errorMessage: null,
    }).where(eq(promotionJobs.id, promotionJobId));
}

async function markLinkedPromotionJobFailed(
    job: typeof contentQueue.$inferSelect,
    errorMessage: string,
    shouldRetry: boolean,
): Promise<void> {
    const promotionJobId = getLinkedPromotionJobId(job);
    if (!promotionJobId) return;
    await db.update(promotionJobs).set({
        status: shouldRetry ? 'pending' : 'failed',
        errorMessage,
        completedAt: shouldRetry ? null : new Date(),
    }).where(eq(promotionJobs.id, promotionJobId));
}

async function enqueueGrowthExecutionJob(opts: {
    campaignId: string;
    jobType: GrowthExecutionJobType;
    priority: number;
    payload?: Record<string, unknown>;
    scheduledFor?: Date | null;
}): Promise<boolean> {
    return db.transaction(async (tx) => {
        const existing = await tx
            .select({ id: contentQueue.id })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.jobType, opts.jobType),
                inArray(contentQueue.status, ['pending', 'processing']),
                sql`${contentQueue.payload} ->> 'campaignId' = ${opts.campaignId}`,
            ))
            .limit(1);

        if (existing.length > 0) {
            return false;
        }

        const [promotionJob] = await tx.insert(promotionJobs).values({
            campaignId: opts.campaignId,
            jobType: opts.jobType,
            status: 'pending',
            payload: opts.payload ?? {},
        }).returning({ id: promotionJobs.id });

        if (!promotionJob) {
            throw new Error(`Failed to create promotion_jobs row for ${opts.jobType}`);
        }

        const jobPayload = {
            ...(opts.payload ?? {}),
            campaignId: opts.campaignId,
            promotionJobId: promotionJob.id,
        };

        const queueJobId = await enqueueContentJob({
            jobType: opts.jobType,
            status: 'pending',
            priority: opts.priority,
            payload: jobPayload,
            scheduledFor: opts.scheduledFor ?? null,
        }, tx);

        await tx.update(promotionJobs).set({
            payload: {
                ...jobPayload,
                contentQueueJobId: queueJobId,
            },
        }).where(eq(promotionJobs.id, promotionJob.id));

        return true;
    });
}

async function countCampaignPublishesToday(campaignId: string): Promise<number> {
    const today = getUtcDayStart();
    const [row] = await db.select({ value: count() })
        .from(promotionEvents)
        .where(and(
            eq(promotionEvents.campaignId, campaignId),
            eq(promotionEvents.eventType, 'published'),
            gte(promotionEvents.occurredAt, today),
        ));
    return Number(row?.value ?? 0);
}

async function countCampaignPublishesTodayByChannel(campaignId: string, channel: GrowthChannel): Promise<number> {
    const today = getUtcDayStart();
    const [row] = await db.select({ value: count() })
        .from(promotionEvents)
        .where(and(
            eq(promotionEvents.campaignId, campaignId),
            eq(promotionEvents.eventType, 'published'),
            gte(promotionEvents.occurredAt, today),
            sql`${promotionEvents.attributes} ->> 'channel' = ${channel}`,
        ));
    return Number(row?.value ?? 0);
}

async function isCreativeSuppressed(opts: {
    campaignId: string;
    channel: GrowthChannel;
    creativeHash: string;
    domainResearchId: string;
}): Promise<{ duplicate: boolean; cooldown: boolean }> {
    const since = new Date(Date.now() - (GROWTH_COOLDOWN_HOURS * 60 * 60 * 1000));

    const [duplicate] = await db.select({ id: promotionEvents.id })
        .from(promotionEvents)
        .where(and(
            eq(promotionEvents.campaignId, opts.campaignId),
            eq(promotionEvents.eventType, 'published'),
            gte(promotionEvents.occurredAt, since),
            sql`${promotionEvents.attributes} ->> 'channel' = ${opts.channel}`,
            sql`${promotionEvents.attributes} ->> 'creativeHash' = ${opts.creativeHash}`,
        ))
        .limit(1);

    const domainCooldownRows = await db.select({ id: promotionEvents.id })
        .from(promotionEvents)
        .innerJoin(promotionCampaigns, eq(promotionEvents.campaignId, promotionCampaigns.id))
        .where(and(
            eq(promotionCampaigns.domainResearchId, opts.domainResearchId),
            eq(promotionEvents.eventType, 'published'),
            gte(promotionEvents.occurredAt, since),
            sql`${promotionEvents.attributes} ->> 'channel' = ${opts.channel}`,
        ))
        .limit(1);

    return {
        duplicate: Boolean(duplicate),
        cooldown: domainCooldownRows.length > 0,
    };
}

async function trackMediaUsage(opts: {
    campaignId: string;
    assetId?: string;
    promotionJobId?: string | null;
}): Promise<void> {
    if (!opts.assetId || !UUID_REGEX.test(opts.assetId)) {
        return;
    }

    await db.insert(mediaAssetUsage).values({
        assetId: opts.assetId,
        campaignId: opts.campaignId,
        jobId: opts.promotionJobId ?? null,
    });

    await db.update(mediaAssets).set({
        usageCount: sql`${mediaAssets.usageCount} + 1`,
    }).where(and(eq(mediaAssets.id, opts.assetId), isNull(mediaAssets.deletedAt)));
}

interface CampaignMetricsSnapshot {
    totalEvents: number;
    published: number;
    clicks: number;
    leads: number;
    conversions: number;
    lastPublishedAt: string | null;
    computedAt: string;
}

async function syncCampaignMetrics(campaignId: string): Promise<CampaignMetricsSnapshot> {
    const rows = await db.select({
        eventType: promotionEvents.eventType,
        occurredAt: promotionEvents.occurredAt,
    })
        .from(promotionEvents)
        .where(eq(promotionEvents.campaignId, campaignId));

    let published = 0;
    let clicks = 0;
    let leads = 0;
    let conversions = 0;
    let lastPublishedAt: string | null = null;

    for (const row of rows) {
        if (row.eventType === 'published') {
            published += 1;
            if (row.occurredAt) {
                const iso = row.occurredAt.toISOString();
                if (!lastPublishedAt || iso > lastPublishedAt) {
                    lastPublishedAt = iso;
                }
            }
        }
        if (row.eventType === 'click') clicks += 1;
        if (row.eventType === 'lead') leads += 1;
        if (row.eventType === 'conversion') conversions += 1;
    }

    const metrics: CampaignMetricsSnapshot = {
        totalEvents: rows.length,
        published,
        clicks,
        leads,
        conversions,
        lastPublishedAt,
        computedAt: new Date().toISOString(),
    };

    await db.update(promotionCampaigns).set({
        metrics,
        updatedAt: new Date(),
    }).where(eq(promotionCampaigns.id, campaignId));

    return metrics;
}

interface PromotionContext {
    payload: Record<string, unknown>;
    campaign: typeof promotionCampaigns.$inferSelect;
    research: typeof domainResearch.$inferSelect;
}

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

function parseEnvFloat(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseFloat(process.env[name] || '');
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

async function maybeTriggerCampaignIntegrityAlert(input: {
    campaignId: string;
    domain: string;
    domainId: string | null;
}): Promise<void> {
    const windowHours = parseEnvInt('GROWTH_INTEGRITY_ALERT_WINDOW_HOURS', 24, 1, 24 * 14);
    const blockedDestinationThreshold = parseEnvInt('GROWTH_INTEGRITY_BLOCKED_DESTINATION_THRESHOLD', 4, 1, 100);
    const highRiskPublishedThreshold = parseEnvInt('GROWTH_INTEGRITY_HIGH_RISK_PUBLISHED_THRESHOLD', 3, 1, 100);
    const hostConcentrationThreshold = parseEnvFloat('GROWTH_INTEGRITY_HOST_CONCENTRATION_THRESHOLD', 0.8, 0.5, 0.99);
    const hostConcentrationMinSamples = parseEnvInt('GROWTH_INTEGRITY_HOST_CONCENTRATION_MIN_SAMPLES', 8, 3, 500);

    const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const rows = await db.select({
        eventType: promotionEvents.eventType,
        occurredAt: promotionEvents.occurredAt,
        attributes: promotionEvents.attributes,
    })
        .from(promotionEvents)
        .where(and(
            eq(promotionEvents.campaignId, input.campaignId),
            gte(promotionEvents.occurredAt, windowStart),
            inArray(promotionEvents.eventType, ['published', 'publish_blocked']),
        ))
        .orderBy(desc(promotionEvents.occurredAt))
        .limit(3000);

    const summary = summarizePromotionIntegrity(rows);
    const alert = evaluatePromotionIntegrityAlert(summary, {
        blockedDestinationThreshold,
        highRiskPublishedThreshold,
        hostConcentrationThreshold,
        hostConcentrationMinSamples,
    });

    if (!alert.shouldAlert) {
        return;
    }

    await createNotification({
        type: 'info',
        severity: alert.severity,
        title: `Growth integrity alert for ${input.domain}`,
        message: alert.reasons.join('; '),
        domainId: input.domainId ?? undefined,
        actionUrl: '/dashboard/growth',
        metadata: {
            campaignId: input.campaignId,
            windowHours,
            summary,
            reasons: alert.reasons,
        },
    });
}

function resolveCampaignDailyCap(campaign: typeof promotionCampaigns.$inferSelect): number {
    const configured = typeof campaign.dailyCap === 'number' ? campaign.dailyCap : 0;
    return configured > 0 ? configured : GROWTH_DEFAULT_DAILY_CAP;
}

function resolveCampaignChannels(
    campaign: typeof promotionCampaigns.$inferSelect,
    payload: Record<string, unknown>,
    channelProfiles?: Map<GrowthChannel, GrowthChannelProfileSettings>,
): GrowthChannel[] {
    const payloadChannels = normalizeGrowthChannels(payload.channels);
    const requested = payloadChannels.length > 0
        ? payloadChannels
        : normalizeGrowthChannels(campaign.channels);

    if (!channelProfiles) {
        return requested;
    }

    return requested.filter((channel) => {
        const profile = resolveGrowthChannelProfile(channelProfiles, channel);
        return profile.enabled && profile.compatibility !== 'blocked';
    });
}

function resolveCreativeHashForPublish(opts: {
    campaignId: string;
    domain: string;
    channel: GrowthChannel;
    payload: Record<string, unknown>;
}): string {
    const explicit = toOptionalString(opts.payload.creativeHash);
    if (explicit) {
        return explicit;
    }
    const utcDay = getUtcDayStart().toISOString().slice(0, 10);
    return buildCreativeHash(`${opts.campaignId}:${opts.domain}:${opts.channel}:${utcDay}`);
}

async function recordPromotionEvent(
    campaignId: string,
    eventType: string,
    attributes: Record<string, unknown>,
): Promise<void> {
    await db.insert(promotionEvents).values({
        campaignId,
        eventType,
        attributes,
    });
}

async function resolvePromotionContext(
    payloadInput: unknown,
    options: { allowCreateCampaign?: boolean } = {},
): Promise<PromotionContext> {
    const payload = getGrowthPayload(payloadInput);
    const payloadCampaignId = toUuid(payload.campaignId);
    const payloadDomainResearchId = toUuid(payload.domainResearchId);

    let campaign: typeof promotionCampaigns.$inferSelect | null = null;
    if (payloadCampaignId) {
        const rows = await db.select()
            .from(promotionCampaigns)
            .where(eq(promotionCampaigns.id, payloadCampaignId))
            .limit(1);
        campaign = rows[0] ?? null;
    }

    if (!campaign && payloadDomainResearchId) {
        const rows = await db.select()
            .from(promotionCampaigns)
            .where(eq(promotionCampaigns.domainResearchId, payloadDomainResearchId))
            .orderBy(desc(promotionCampaigns.createdAt))
            .limit(1);
        campaign = rows[0] ?? null;
    }

    if (!campaign && options.allowCreateCampaign) {
        const domainResearchId = payloadDomainResearchId;
        if (!domainResearchId) {
            throw new Error('create_promotion_plan requires campaignId or domainResearchId');
        }

        const channels = normalizeGrowthChannels(payload.channels);
        if (channels.length === 0) {
            throw new Error('create_promotion_plan requires at least one growth channel');
        }

        const rawBudget = toOptionalNumber(payload.budget);
        const budget = rawBudget && rawBudget > 0 ? rawBudget : 0;
        const rawDailyCap = toOptionalNumber(payload.dailyCap);
        const dailyCap = rawDailyCap && rawDailyCap > 0
            ? Math.max(1, Math.floor(rawDailyCap))
            : GROWTH_DEFAULT_DAILY_CAP;

        const [created] = await db.insert(promotionCampaigns).values({
            domainResearchId,
            channels,
            budget,
            dailyCap,
            status: 'draft',
            metrics: {},
        }).returning();

        campaign = created ?? null;
    }

    if (!campaign) {
        throw new Error('Promotion campaign not found');
    }

    const researchRows = await db.select()
        .from(domainResearch)
        .where(eq(domainResearch.id, campaign.domainResearchId))
        .limit(1);
    const research = researchRows[0];
    if (!research) {
        throw new Error('Domain research record not found for promotion campaign');
    }

    return {
        payload,
        campaign,
        research,
    };
}

async function resolvePublishAssetId(
    channel: GrowthChannel,
    payload: Record<string, unknown>,
): Promise<string | null> {
    const explicitAssetId = toUuid(payload.assetId)
        ?? toUuid(payload.videoAssetId)
        ?? toUuid(payload.imageAssetId);
    if (explicitAssetId) {
        return explicitAssetId;
    }

    const type = channel === 'youtube_shorts' ? 'video' : 'image';
    const rows = await db.select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.type, type), isNull(mediaAssets.deletedAt)))
        .orderBy(asc(mediaAssets.usageCount), asc(mediaAssets.createdAt))
        .limit(1);

    return rows[0]?.id ?? null;
}

function buildPromotionCopy(opts: {
    channel: GrowthChannel;
    payload: Record<string, unknown>;
    research: typeof domainResearch.$inferSelect;
}): string {
    const explicit = toOptionalString(opts.payload.copy)
        || toOptionalString(opts.payload.caption)
        || toOptionalString(opts.payload.script);
    if (explicit) {
        return explicit;
    }

    if (opts.channel === 'youtube_shorts') {
        return `Domain spotlight: ${opts.research.domain}. Why this niche name has upside and what makes it a smart acquisition.`;
    }
    return `Pin spotlight: ${opts.research.domain}. Explore the niche angle and monetization opportunity.`;
}

async function runPublishJob(
    job: typeof contentQueue.$inferSelect,
    channel: GrowthChannel,
): Promise<string> {
    const context = await resolvePromotionContext(job.payload);
    const scheduledPublishFor = toOptionalString(context.payload.scheduledPublishFor);
    const channelProfiles = await getGrowthChannelProfilesByDomainId(context.research.domainId);
    const channelProfile = resolveGrowthChannelProfile(channelProfiles, channel);

    if (context.campaign.status !== 'active') {
        return `Skipped publish: campaign ${context.campaign.id} is ${context.campaign.status}`;
    }

    if (!channelProfile.enabled || channelProfile.compatibility === 'blocked') {
        await recordPromotionEvent(context.campaign.id, 'publish_skipped', {
            channel,
            reason: channelProfile.enabled ? 'channel_blocked_for_domain' : 'channel_disabled_for_domain',
            compatibility: channelProfile.compatibility,
            scheduledPublishFor,
        });
        return `Skipped publish: ${channel} is disabled/blocked for this domain`;
    }

    const dailyCap = resolveCampaignDailyCap(context.campaign);
    const publishesToday = await countCampaignPublishesToday(context.campaign.id);
    if (publishesToday >= dailyCap) {
        await recordPromotionEvent(context.campaign.id, 'publish_skipped', {
            channel,
            reason: 'daily_cap_reached',
            dailyCap,
            publishesToday,
            scheduledPublishFor,
        });
        return `Skipped publish: daily cap reached (${publishesToday}/${dailyCap})`;
    }

    if (channelProfile.dailyCap && channelProfile.dailyCap > 0) {
        const channelPublishesToday = await countCampaignPublishesTodayByChannel(context.campaign.id, channel);
        if (channelPublishesToday >= channelProfile.dailyCap) {
            await recordPromotionEvent(context.campaign.id, 'publish_skipped', {
                channel,
                reason: 'channel_daily_cap_reached',
                channelDailyCap: channelProfile.dailyCap,
                channelPublishesToday,
                scheduledPublishFor,
            });
            return `Skipped publish: channel daily cap reached (${channelPublishesToday}/${channelProfile.dailyCap})`;
        }
    }

    const creativeHash = resolveCreativeHashForPublish({
        campaignId: context.campaign.id,
        domain: context.research.domain,
        channel,
        payload: context.payload,
    });

    const suppressed = await isCreativeSuppressed({
        campaignId: context.campaign.id,
        channel,
        creativeHash,
        domainResearchId: context.research.id,
    });
    if (suppressed.duplicate || suppressed.cooldown) {
        await recordPromotionEvent(context.campaign.id, 'publish_skipped', {
            channel,
            creativeHash,
            reason: suppressed.duplicate ? 'duplicate_creative' : 'domain_cooldown',
            cooldownHours: GROWTH_COOLDOWN_HOURS,
            scheduledPublishFor,
        });
        return suppressed.duplicate
            ? 'Skipped publish: duplicate creative inside cooldown window'
            : 'Skipped publish: domain cooldown active for channel';
    }

    const assetId = await resolvePublishAssetId(channel, context.payload);
    let assetUrl: string | null = null;
    if (assetId) {
        const [assetRow] = await db.select({ url: mediaAssets.url })
            .from(mediaAssets)
            .where(and(eq(mediaAssets.id, assetId), isNull(mediaAssets.deletedAt)))
            .limit(1);
        assetUrl = assetRow?.url ?? null;
    }

    const destinationUrl = toOptionalString(context.payload.destinationUrl) || `https://${context.research.domain}`;
    const copy = buildPromotionCopy({
        channel,
        payload: context.payload,
        research: context.research,
    });
    const policyCheck = evaluateGrowthPublishPolicy({
        channel,
        copy,
        destinationUrl,
    });

    if (!policyCheck.allowed) {
        await recordPromotionEvent(context.campaign.id, 'publish_blocked', {
            channel,
            creativeHash,
            destinationUrl,
            destinationHost: policyCheck.destinationHost,
            destinationRiskScore: policyCheck.destinationRiskScore,
            blockReasons: policyCheck.blockReasons,
            policyWarnings: policyCheck.warnings,
            policyChanges: policyCheck.changes,
            policyPackId: policyCheck.policyPackId,
            policyPackVersion: policyCheck.policyPackVersion,
            policyChecksApplied: policyCheck.checksApplied,
            scheduledPublishFor,
        });

        await enqueueGrowthExecutionJob({
            campaignId: context.campaign.id,
            jobType: 'sync_campaign_metrics',
            priority: 1,
            payload: {
                sourceJobId: job.id,
                sourceChannel: channel,
                sourceStage: 'publish_blocked',
            },
        });

        const destinationBlockReasons = policyCheck.blockReasons
            .filter((reason) => reason.toLowerCase().includes('destination'));
        if (destinationBlockReasons.length > 0) {
            try {
                await createNotification({
                    type: 'info',
                    severity: 'warning',
                    title: 'Growth publish blocked by destination quality policy',
                    message: `${context.research.domain}: ${destinationBlockReasons.join('; ')}`,
                    domainId: context.research.domainId ?? undefined,
                    actionUrl: '/dashboard/growth',
                    metadata: {
                        campaignId: context.campaign.id,
                        channel,
                        destinationUrl,
                        destinationHost: policyCheck.destinationHost,
                        destinationRiskScore: policyCheck.destinationRiskScore,
                        blockReasons: destinationBlockReasons,
                    },
                });
            } catch (notificationError) {
                console.error('Failed to create destination quality policy notification:', notificationError);
            }
        }

        try {
            await maybeTriggerCampaignIntegrityAlert({
                campaignId: context.campaign.id,
                domain: context.research.domain,
                domainId: context.research.domainId ?? null,
            });
        } catch (integrityAlertError) {
            console.error('Failed to evaluate campaign integrity alerts after publish block:', integrityAlertError);
        }

        return `Blocked publish: ${policyCheck.blockReasons.join('; ')}`;
    }

    const launchedBy = toUuid(context.payload.launchedBy)
        ?? toUuid(context.payload.requestedBy)
        ?? null;
    const credential = await resolveGrowthPublishCredential(launchedBy, channel);
    const publishResult = await publishToGrowthChannel(channel, {
        campaignId: context.campaign.id,
        domain: context.research.domain,
        destinationUrl,
        copy: policyCheck.normalizedCopy,
        creativeHash,
        assetUrl,
    }, {
        credential,
    });

    await recordPromotionEvent(context.campaign.id, 'published', {
        channel,
        creativeHash,
        assetId,
        assetUrl,
        destinationUrl,
        destinationHost: policyCheck.destinationHost,
        destinationRiskScore: policyCheck.destinationRiskScore,
        copy: policyCheck.normalizedCopy,
        externalPostId: publishResult.externalPostId,
        publishStatus: publishResult.status,
        publishMetadata: publishResult.metadata,
        policyWarnings: policyCheck.warnings,
        policyChanges: policyCheck.changes,
        policyPackId: policyCheck.policyPackId,
        policyPackVersion: policyCheck.policyPackVersion,
        policyChecksApplied: policyCheck.checksApplied,
        scheduledPublishFor,
        launchedBy,
        credentialSource: credential ? 'stored' : 'env',
    });

    await trackMediaUsage({
        campaignId: context.campaign.id,
        assetId: assetId ?? undefined,
        promotionJobId: getLinkedPromotionJobId(job),
    });

    try {
        await maybeTriggerCampaignIntegrityAlert({
            campaignId: context.campaign.id,
            domain: context.research.domain,
            domainId: context.research.domainId ?? null,
        });
    } catch (integrityAlertError) {
        console.error('Failed to evaluate campaign integrity alerts after publish success:', integrityAlertError);
    }

    await enqueueGrowthExecutionJob({
        campaignId: context.campaign.id,
        jobType: 'sync_campaign_metrics',
        priority: 1,
        payload: {
            sourceJobId: job.id,
            sourceChannel: channel,
        },
    });

    return `Published ${channel} creative for ${context.research.domain} (${publishResult.externalPostId})`;
}

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

async function enqueueMediaReviewEscalationJobIfMissing(
    userId: string,
    opts: {
        priority?: number;
        source?: string;
    } = {},
): Promise<boolean> {
    const existing = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(and(
            eq(contentQueue.jobType, 'run_media_review_escalations'),
            inArray(contentQueue.status, ['pending', 'processing']),
            sql`${contentQueue.payload} ->> 'userId' = ${userId}`,
        ))
        .limit(1);

    if (existing.length > 0) {
        return false;
    }

    await enqueueContentJob({
        jobType: 'run_media_review_escalations',
        payload: {
            userId,
            dryRun: false,
            actorId: null,
            source: opts.source ?? 'maintenance',
        },
        status: 'pending',
        priority: opts.priority ?? 1,
    });

    return true;
}

async function scheduleMediaReviewEscalationSweeps(limit = MEDIA_REVIEW_ESCALATION_SWEEP_USER_LIMIT): Promise<{
    consideredUsers: number;
    queuedJobs: number;
    alreadyQueued: number;
}> {
    const rows = await db
        .select({ userId: mediaModerationTasks.userId })
        .from(mediaModerationTasks)
        .where(eq(mediaModerationTasks.status, 'pending'))
        .groupBy(mediaModerationTasks.userId)
        .limit(limit);

    let queuedJobs = 0;
    let alreadyQueued = 0;
    for (const row of rows) {
        const queued = await enqueueMediaReviewEscalationJobIfMissing(row.userId, {
            source: 'hourly_maintenance',
            priority: 1,
        });
        if (queued) {
            queuedJobs += 1;
        } else {
            alreadyQueued += 1;
        }
    }

    return {
        consideredUsers: rows.length,
        queuedJobs,
        alreadyQueued,
    };
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
    const nowIso = now.toISOString();
    const lockUntilIso = lockUntil.toISOString();

    // Use a single atomic UPDATE...WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
    // This prevents race conditions between multiple workers entirely.
    const jobTypeFilter = jobTypes?.length
        ? sql`AND ${contentQueue.jobType} IN (${sql.join(jobTypes.map(t => sql`${t}`), sql`, `)})`
        : sql``;

    const lockedJobs = await db.execute<{ id: string }>(sql`
        UPDATE ${contentQueue}
        SET status = 'processing',
            locked_until = ${lockUntilIso}::timestamp,
            started_at = ${nowIso}::timestamp
        WHERE id IN (
            SELECT id FROM ${contentQueue}
            WHERE status = 'pending'
              AND (scheduled_for IS NULL OR scheduled_for <= ${nowIso}::timestamp)
              AND (locked_until IS NULL OR locked_until <= ${nowIso}::timestamp)
              ${jobTypeFilter}
            ORDER BY priority DESC, created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id
    `);
    const lockedRows = Array.isArray(lockedJobs)
        ? lockedJobs
        : (lockedJobs as unknown as { rows: Array<{ id: string }> }).rows ?? [];
    const lockedIds = lockedRows
        .map((row) => row?.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (lockedIds.length === 0) {
        return [];
    }

    return db
        .select()
        .from(contentQueue)
        .where(inArray(contentQueue.id, lockedIds))
        .orderBy(desc(contentQueue.priority), asc(contentQueue.createdAt));
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
    const nowIso = now.toISOString();
    const lockUntilIso = lockUntil.toISOString();
    const dedupedIds = [...new Set(ids)];
    const idList = sql.join(dedupedIds.map((id) => sql`${id}`), sql`, `);
    const jobTypeFilter = jobTypes?.length
        ? sql`AND ${contentQueue.jobType} IN (${sql.join(jobTypes.map(t => sql`${t}`), sql`, `)})`
        : sql``;

    const lockedJobs = await db.execute<{ id: string }>(sql`
        UPDATE ${contentQueue}
        SET status = 'processing',
            locked_until = ${lockUntilIso}::timestamp,
            started_at = ${nowIso}::timestamp
        WHERE id IN (
            SELECT id FROM ${contentQueue}
            WHERE id IN (${idList})
              AND status = 'pending'
              AND (scheduled_for IS NULL OR scheduled_for <= ${nowIso}::timestamp)
              AND (locked_until IS NULL OR locked_until <= ${nowIso}::timestamp)
              ${jobTypeFilter}
            ORDER BY priority DESC, created_at ASC
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id
    `);
    const lockedRows = Array.isArray(lockedJobs)
        ? lockedJobs
        : (lockedJobs as unknown as { rows: Array<{ id: string }> }).rows ?? [];
    const lockedIds = lockedRows
        .map((row) => row?.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (lockedIds.length === 0) {
        return [];
    }

    return db
        .select()
        .from(contentQueue)
        .where(inArray(contentQueue.id, lockedIds))
        .orderBy(desc(contentQueue.priority), asc(contentQueue.createdAt));
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

        await markLinkedPromotionJobRunning(job);

        // Race the job against the timeout
        const jobPromise = executeJob(job);
        await Promise.race([jobPromise, timeoutPromise]);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        await markLinkedPromotionJobCompleted(job);
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
        try {
            await markLinkedPromotionJobFailed(job, detailedError, shouldRetry);
        } catch (promotionJobError) {
            console.error(`[Worker] Failed to update linked promotion job for ${job.id}:`, promotionJobError);
        }

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
        case 'resolve_external_links':
            await processResolveExternalLinksJob(job.id);
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
        case 'refresh_research_cache': {
            await refreshResearchCacheEntry(job.payload);
            await markJobComplete(job.id, 'Research cache refreshed');
            break;
        }
        case 'ingest_listings': {
            if (!isFeatureEnabled('acquisition_underwriting_v1')) {
                await markJobComplete(job.id, 'Skipped: acquisition_underwriting_v1 disabled');
                break;
            }

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
            if (!isFeatureEnabled('acquisition_underwriting_v1')) {
                await markJobComplete(job.id, 'Skipped: acquisition_underwriting_v1 disabled');
                break;
            }

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
            if (!isFeatureEnabled('acquisition_underwriting_v1')) {
                await markJobComplete(job.id, 'Skipped: acquisition_underwriting_v1 disabled');
                break;
            }

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
                domainScore: evaluation.compositeScore,
                keywordVolume: evaluation.signals.keyword?.volume ?? null,
                keywordCpc: keywordCpc ?? null,
                estimatedRevenuePotential: estimatedRevenuePotential,
                evaluationResult: evaluation as unknown as Record<string, unknown>,
                evaluatedAt,
                decision: decision.decision,
                decisionReason: decision.reason,
            }).where(eq(domainResearch.id, research.id));

            if (research.domainId) {
                try {
                    await advanceDomainLifecycleForAcquisition({
                        domainId: research.domainId,
                        targetState: 'underwriting',
                        actorId: null,
                        actorRole: 'expert',
                        reason: 'Automated underwriting pipeline scored domain candidate',
                        metadata: {
                            source: 'score_candidate',
                            domainResearchId: research.id,
                            decision: decision.decision,
                            recommendation: evaluation.recommendation,
                        },
                    });
                } catch (lifecycleError) {
                    console.error('Failed to sync lifecycle to underwriting during score_candidate:', {
                        domainResearchId: research.id,
                        domainId: research.domainId,
                        error: lifecycleError instanceof Error ? lifecycleError.message : String(lifecycleError),
                    });
                }
            }

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
            if (!isFeatureEnabled('acquisition_underwriting_v1')) {
                await markJobComplete(job.id, 'Skipped: acquisition_underwriting_v1 disabled');
                break;
            }

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
        case 'create_promotion_plan': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const context = await resolvePromotionContext(job.payload, { allowCreateCampaign: true });
            const channelProfiles = await getGrowthChannelProfilesByDomainId(context.research.domainId);
            const requestedChannels = resolveCampaignChannels(context.campaign, context.payload);
            const channels = resolveCampaignChannels(context.campaign, context.payload, channelProfiles);

            if (context.campaign.status === 'cancelled' || context.campaign.status === 'completed') {
                await markJobComplete(
                    job.id,
                    `Skipped: campaign ${context.campaign.id} is ${context.campaign.status}`,
                );
                break;
            }

            if (channels.length === 0) {
                await recordPromotionEvent(context.campaign.id, 'plan_skipped', {
                    reason: 'no_enabled_channels',
                    requestedChannels,
                    sourceJobId: job.id,
                });
                await markJobComplete(job.id, `Skipped: no enabled channels for campaign ${context.campaign.id}`);
                break;
            }

            const blockedChannels = requestedChannels.filter((channel) => !channels.includes(channel));

            await db.update(promotionCampaigns).set({
                status: 'active',
                updatedAt: new Date(),
            }).where(eq(promotionCampaigns.id, context.campaign.id));

            await recordPromotionEvent(context.campaign.id, 'plan_created', {
                channels,
                blockedChannels,
                budget: context.campaign.budget,
                dailyCap: resolveCampaignDailyCap(context.campaign),
                sourceJobId: job.id,
            });

            const launchedBy = toUuid(context.payload.launchedBy)
                ?? toUuid(context.payload.requestedBy)
                ?? null;
            let queued = 0;
            for (const channel of channels) {
                const profile = resolveGrowthChannelProfile(channelProfiles, channel);
                const schedulePlan = computeGrowthPublishSchedule(profile);
                if (channel === 'youtube_shorts') {
                    const didQueue = await enqueueGrowthExecutionJob({
                        campaignId: context.campaign.id,
                        jobType: 'generate_short_script',
                        priority: job.priority ?? 2,
                        payload: {
                            channel,
                            domainResearchId: context.research.id,
                            domain: context.research.domain,
                            destinationUrl: `https://${context.research.domain}`,
                            launchedBy,
                            scheduledPublishFor: schedulePlan.scheduledFor.toISOString(),
                            scheduleMetadata: {
                                jitterMinutes: schedulePlan.jitterMinutes,
                                movedOutOfQuietHours: schedulePlan.movedOutOfQuietHours,
                                quietHoursStart: schedulePlan.quietHoursStart,
                                quietHoursEnd: schedulePlan.quietHoursEnd,
                            },
                        },
                    });
                    if (didQueue) queued += 1;
                    continue;
                }

                if (channel === 'pinterest') {
                    const didQueue = await enqueueGrowthExecutionJob({
                        campaignId: context.campaign.id,
                        jobType: 'publish_pinterest_pin',
                        priority: job.priority ?? 2,
                        scheduledFor: schedulePlan.scheduledFor,
                        payload: {
                            channel,
                            domainResearchId: context.research.id,
                            domain: context.research.domain,
                            destinationUrl: `https://${context.research.domain}`,
                            launchedBy,
                            scheduledPublishFor: schedulePlan.scheduledFor.toISOString(),
                            scheduleMetadata: {
                                jitterMinutes: schedulePlan.jitterMinutes,
                                movedOutOfQuietHours: schedulePlan.movedOutOfQuietHours,
                                quietHoursStart: schedulePlan.quietHoursStart,
                                quietHoursEnd: schedulePlan.quietHoursEnd,
                            },
                        },
                    });
                    if (didQueue) queued += 1;
                }
            }

            const queuedMetrics = await enqueueGrowthExecutionJob({
                campaignId: context.campaign.id,
                jobType: 'sync_campaign_metrics',
                priority: 1,
                payload: {
                    sourceJobId: job.id,
                    sourceStage: 'create_promotion_plan',
                    launchedBy,
                },
            });
            if (queuedMetrics) queued += 1;

            await markJobComplete(
                job.id,
                `Activated campaign ${context.campaign.id}; queued ${queued} growth job(s)`,
            );
            break;
        }
        case 'generate_short_script': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const context = await resolvePromotionContext(job.payload);
            if (context.campaign.status !== 'active') {
                await markJobComplete(
                    job.id,
                    `Skipped script generation: campaign ${context.campaign.id} is ${context.campaign.status}`,
                );
                break;
            }

            const channel = toGrowthChannel(context.payload.channel) ?? 'youtube_shorts';
            if (channel !== 'youtube_shorts') {
                throw new Error('generate_short_script only supports youtube_shorts');
            }

            const defaultScript = [
                `Quick domain spotlight: ${context.research.domain}.`,
                `This name has monetization upside and a clear niche angle.`,
                `Review the opportunity and decide if this belongs in the portfolio.`,
            ].join(' ');
            const script = toOptionalString(context.payload.script) || defaultScript;
            const creativeHash = buildCreativeHash(`${context.campaign.id}:${channel}:${script}`);

            await recordPromotionEvent(context.campaign.id, 'script_generated', {
                channel,
                creativeHash,
                script,
                wordCount: script.split(/\s+/).filter(Boolean).length,
            });

            const queuedRender = await enqueueGrowthExecutionJob({
                campaignId: context.campaign.id,
                jobType: 'render_short_video',
                priority: job.priority ?? 2,
                    payload: {
                        channel,
                        script,
                        creativeHash,
                        domainResearchId: context.research.id,
                        destinationUrl: toOptionalString(context.payload.destinationUrl) || `https://${context.research.domain}`,
                        launchedBy: toUuid(context.payload.launchedBy)
                            ?? toUuid(context.payload.requestedBy)
                            ?? null,
                        scheduledPublishFor: toOptionalString(context.payload.scheduledPublishFor),
                        scheduleMetadata: isPlainObject(context.payload.scheduleMetadata)
                            ? context.payload.scheduleMetadata
                            : {},
                    },
                });

            await markJobComplete(
                job.id,
                queuedRender
                    ? `Script generated for ${context.research.domain}`
                    : `Script generated; render already queued for campaign ${context.campaign.id}`,
            );
            break;
        }
        case 'render_short_video': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const context = await resolvePromotionContext(job.payload);
            if (context.campaign.status !== 'active') {
                await markJobComplete(
                    job.id,
                    `Skipped render: campaign ${context.campaign.id} is ${context.campaign.status}`,
                );
                break;
            }

            const script = toOptionalString(context.payload.script)
                || `Domain spotlight for ${context.research.domain}.`;
            const creativeHash = toOptionalString(context.payload.creativeHash)
                || buildCreativeHash(`${context.campaign.id}:youtube_shorts:${script}`);
            const assetUrl = toOptionalString(context.payload.assetUrl)
                || `generated://shorts/${context.campaign.id}/${creativeHash}.mp4`;
            const tags = [context.research.domain, 'youtube_shorts', creativeHash];

            const [asset] = await db.insert(mediaAssets).values({
                type: 'video',
                url: assetUrl,
                tags,
            }).returning({ id: mediaAssets.id });
            if (!asset) {
                throw new Error('Failed to persist rendered video asset');
            }

            await recordPromotionEvent(context.campaign.id, 'video_rendered', {
                channel: 'youtube_shorts',
                creativeHash,
                assetId: asset.id,
                assetUrl,
                scriptWordCount: script.split(/\s+/).filter(Boolean).length,
            });

            const scheduledPublishFor = toOptionalDate(context.payload.scheduledPublishFor);
            const queuedPublish = await enqueueGrowthExecutionJob({
                campaignId: context.campaign.id,
                jobType: 'publish_youtube_short',
                priority: job.priority ?? 2,
                scheduledFor: scheduledPublishFor ?? null,
                payload: {
                    channel: 'youtube_shorts',
                    creativeHash,
                    assetId: asset.id,
                    domainResearchId: context.research.id,
                    destinationUrl: toOptionalString(context.payload.destinationUrl) || `https://${context.research.domain}`,
                    copy: script,
                    launchedBy: toUuid(context.payload.launchedBy)
                        ?? toUuid(context.payload.requestedBy)
                        ?? null,
                    scheduledPublishFor: scheduledPublishFor?.toISOString() ?? null,
                    scheduleMetadata: isPlainObject(context.payload.scheduleMetadata)
                        ? context.payload.scheduleMetadata
                        : {},
                },
            });

            await markJobComplete(
                job.id,
                queuedPublish
                    ? `Rendered short for ${context.research.domain}`
                    : `Render saved; publish already queued for campaign ${context.campaign.id}`,
            );
            break;
        }
        case 'publish_pinterest_pin': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const message = await runPublishJob(job, 'pinterest');
            await markJobComplete(job.id, message);
            break;
        }
        case 'publish_youtube_short': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const message = await runPublishJob(job, 'youtube_shorts');
            await markJobComplete(job.id, message);
            break;
        }
        case 'sync_campaign_metrics': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const context = await resolvePromotionContext(job.payload);
            const metrics = await syncCampaignMetrics(context.campaign.id);

            await recordPromotionEvent(context.campaign.id, 'metrics_synced', {
                sourceJobId: job.id,
                published: metrics.published,
                clicks: metrics.clicks,
                leads: metrics.leads,
                conversions: metrics.conversions,
            });

            await markJobComplete(
                job.id,
                `Metrics synced: ${metrics.published} published, ${metrics.clicks} clicks, ${metrics.leads} leads`,
            );
            break;
        }
        case 'run_media_review_escalations': {
            if (!isFeatureEnabled('growth_channels_v1')) {
                await markJobComplete(job.id, 'Skipped: growth_channels_v1 disabled');
                break;
            }

            const payload = getGrowthPayload(job.payload);
            const userId = toUuid(payload.userId);
            if (!userId) {
                await markJobFailed(job.id, 'run_media_review_escalations requires payload.userId (uuid)');
                break;
            }

            const dryRun = toOptionalBoolean(payload.dryRun) ?? false;
            const parsedLimit = toOptionalNumber(payload.limit);
            const limit = typeof parsedLimit === 'number'
                ? Math.floor(clamp(parsedLimit, 1, 500))
                : 100;
            const actorId = toUuid(payload.actorId) ?? null;

            const result = await runMediaReviewEscalationSweep({
                userId,
                actorId,
                dryRun,
                limit,
            });

            await markJobComplete(
                job.id,
                `${dryRun ? 'Dry run' : 'Sweep'} scanned ${result.scanned}; `
                + `${result.eligible} eligible, ${result.escalated} escalated, `
                + `${result.opsNotified} ops-notified, ${result.skipped} skipped`,
            );
            break;
        }
        case 'run_integration_connection_sync': {
            const payload = isPlainObject(job.payload) ? job.payload : {};
            const connectionId = toUuid(payload.connectionId);
            if (!connectionId) {
                await markJobFailed(job.id, 'run_integration_connection_sync requires payload.connectionId (uuid)');
                break;
            }

            const actorUserId = toUuid(payload.actorUserId) ?? toUuid(payload.userId);
            if (!actorUserId) {
                await markJobFailed(job.id, 'run_integration_connection_sync requires payload.actorUserId (uuid)');
                break;
            }

            const runTypeRaw = toOptionalString(payload.runType);
            const runType = runTypeRaw === 'manual' || runTypeRaw === 'webhook' ? runTypeRaw : 'scheduled';
            const parsedDays = toOptionalNumber(payload.days);
            const days = typeof parsedDays === 'number'
                ? Math.floor(clamp(parsedDays, 1, 365))
                : 30;

            const result = await runIntegrationConnectionSync(
                connectionId,
                { userId: actorUserId, role: 'admin' },
                { runType, days },
            );

            if ('error' in result) {
                await markJobFailed(
                    job.id,
                    result.error === 'not_found'
                        ? 'Integration connection not found'
                        : 'Forbidden to run integration sync',
                );
                break;
            }

            await markJobComplete(
                job.id,
                `Sync ${result.connection.provider}:${result.connection.id} -> ${result.run.status}`,
            );
            break;
        }
        case 'generate_block_content': {
            const { generatePageBlockContent } = await import('./block-pipeline');
            const blockPayload = job.payload as { pageDefinitionId?: string } | undefined;
            const pageDefId = blockPayload?.pageDefinitionId;
            if (!pageDefId) {
                await markJobFailed(job.id, 'Failed: missing pageDefinitionId in payload');
                break;
            }
            const blockResult = await generatePageBlockContent(pageDefId);
            if (blockResult.failureCount > 0 && blockResult.successCount === 0) {
                await markJobFailed(
                    job.id,
                    `All ${blockResult.failureCount} block(s) failed to generate`,
                );
            } else {
                await markJobComplete(
                    job.id,
                    `Generated ${blockResult.successCount} block(s), ${blockResult.failureCount} failed, ${blockResult.skippedCount} skipped. Cost: $${blockResult.totalCost.toFixed(4)}`,
                );
            }
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
    const transientRetriesQueued = await retryTransientFailedJobs(Math.min(maxJobs, 25));

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

    return { processed, failed, staleLocksCleaned, transientRetriesQueued, stats };
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
                await purgeExpiredPreviewBuilds().catch((err: unknown) => console.error('[PreviewBuildPurge] Error:', err));
                await purgeDeletedGrowthMediaStorage()
                    .then((summary) => {
                        if (summary.scanned > 0) {
                            console.log(
                                `[GrowthMediaPurge] scanned=${summary.scanned} purged=${summary.purged} ` +
                                `noStorageKey=${summary.noStorageKey} failures=${summary.failures}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[GrowthMediaPurge] Error:', err));
                await refreshExpiringGrowthCredentialsAudit()
                    .then((summary) => {
                        if (summary.due > 0) {
                            console.log(
                                `[GrowthCredentialAudit] due=${summary.due} refreshed=${summary.refreshed} ` +
                                `unchanged=${summary.unchanged} failed=${summary.failed} revoked=${summary.revoked}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[GrowthCredentialAudit] Error:', err));
                await scheduleMediaReviewEscalationSweeps()
                    .then((summary) => {
                        if (summary.consideredUsers > 0) {
                            console.log(
                                `[MediaReviewEscalationScheduler] users=${summary.consideredUsers} ` +
                                `queued=${summary.queuedJobs} alreadyQueued=${summary.alreadyQueued}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[MediaReviewEscalationScheduler] Error:', err));
                await scheduleIntegrationConnectionSyncJobs()
                    .then((summary) => {
                        if (summary.consideredConnections > 0) {
                            console.log(
                                `[IntegrationSyncScheduler] connections=${summary.consideredConnections} ` +
                                `queued=${summary.queuedJobs} alreadyQueued=${summary.alreadyQueued} ` +
                                `running=${summary.runningSyncs} disabled=${summary.skippedDisabled} ` +
                                `notDue=${summary.skippedNotDue} invalidConfig=${summary.skippedInvalidConfig}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[IntegrationSyncScheduler] Error:', err));
                await runRevenueReconciliationSweep()
                    .then((summary) => {
                        if (summary.domainsCompared > 0) {
                            console.log(
                                `[FinanceReconciliationSweep] domains=${summary.domainsCompared} ` +
                                `matched=${summary.matched} warning=${summary.warning} critical=${summary.critical} ` +
                                `alerts=${summary.alertsCreated}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[FinanceReconciliationSweep] Error:', err));
                await runRevenueDataContractSweep()
                    .then((summary) => {
                        if (summary.domainsChecked > 0) {
                            console.log(
                                `[RevenueContractSweep] domains=${summary.domainsChecked} pass=${summary.pass} ` +
                                `warning=${summary.warning} critical=${summary.critical} alerts=${summary.alertsCreated} ` +
                                `rowViolations=${summary.totalRowViolations}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[RevenueContractSweep] Error:', err));
                await runCapitalAllocationSweep()
                    .then((summary) => {
                        if (summary.enabled && (summary.recommendations > 0 || summary.candidateUpdates > 0)) {
                            console.log(
                                `[CapitalAllocationSweep] dryRun=${summary.dryRun} recs=${summary.recommendations} ` +
                                `candidates=${summary.candidateUpdates} applied=${summary.appliedCount} ` +
                                `missing=${summary.missingCampaignCount} hardLimited=${summary.hardLimitedCount}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[CapitalAllocationSweep] Error:', err));
                await runDomainLifecycleMonitorSweep()
                    .then((summary) => {
                        if (summary.enabled && (summary.manualReversions > 0 || summary.oscillations > 0 || summary.sloBreaches > 0)) {
                            console.log(
                                `[DomainLifecycleMonitorSweep] events=${summary.scannedEvents} ` +
                                `manualReversions=${summary.manualReversions} oscillations=${summary.oscillations} ` +
                                `sloBreaches=${summary.sloBreaches} alerts=${summary.alertsCreated} ` +
                                `opsSent=${summary.opsAlertsSent} opsFailed=${summary.opsAlertsFailed}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[DomainLifecycleMonitorSweep] Error:', err));
                await runCompetitorRefreshSweep()
                    .then((summary) => {
                        if (summary.enabled && summary.scanned > 0) {
                            console.log(
                                `[CompetitorRefreshSweep] scanned=${summary.scanned} refreshed=${summary.refreshed} ` +
                                `failed=${summary.failed} gapAlerts=${summary.gapAlerts}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[CompetitorRefreshSweep] Error:', err));
                await runStrategyPropagationSweep()
                    .then((summary) => {
                        if (summary.enabled && summary.candidateTargets > 0) {
                            console.log(
                                `[StrategyPropagationSweep] dryRun=${summary.dryRun} recs=${summary.recommendationCount} ` +
                                `sources=${summary.candidateSources} targets=${summary.candidateTargets} ` +
                                `appliedSources=${summary.appliedSources} appliedTargets=${summary.appliedTargets} ` +
                                `errors=${summary.errorCount}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[StrategyPropagationSweep] Error:', err));
                await runIntegrationHealthSweep()
                    .then((summary) => {
                        if (summary.enabled && summary.scanned > 0) {
                            console.log(
                                `[IntegrationHealthSweep] scanned=${summary.scanned} healthy=${summary.healthy} ` +
                                `warning=${summary.warning} critical=${summary.critical} alerts=${summary.alertsCreated} ` +
                                `cloudflareShardAlerts=${summary.cloudflareSaturationAlertsCreated}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[IntegrationHealthSweep] Error:', err));
                await runCampaignLaunchReviewEscalationSweep()
                    .then((summary) => {
                        if (summary.enabled && summary.scanned > 0) {
                            console.log(
                                `[CampaignLaunchReviewSweep] scanned=${summary.scanned} pending=${summary.pendingCount} ` +
                                `eligible=${summary.escalatedEligible} alerted=${summary.alerted} ` +
                                `cooldownSkipped=${summary.cooldownSkipped} cappedSkipped=${summary.cappedSkipped} ` +
                                `opsDelivered=${summary.opsDelivered} opsFailed=${summary.opsFailed} errors=${summary.errors}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[CampaignLaunchReviewSweep] Error:', err));
                await syncGrowthLaunchFreezeAuditState()
                    .then((summary) => {
                        if (summary.changed) {
                            console.log(
                                `[GrowthLaunchFreezeAudit] event=${summary.event} active=${summary.active} ` +
                                `rawActive=${summary.rawActive} recoveryHold=${summary.recoveryHoldActive} ` +
                                `recovery=${summary.recoveryHealthyWindows}/${summary.recoveryHealthyWindowsRequired}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[GrowthLaunchFreezeAudit] Error:', err));
                await runGrowthLaunchFreezePostmortemSlaSweep()
                    .then((summary) => {
                        if (summary.enabled && (summary.overdue > 0 || summary.alertsCreated > 0)) {
                            console.log(
                                `[GrowthLaunchFreezePostmortemSLA] scanned=${summary.scanned} ` +
                                `overdue=${summary.overdue} completed=${summary.postmortemsCompleted} ` +
                                `alerts=${summary.alertsCreated} opsSent=${summary.opsAlertsSent} ` +
                                `opsFailed=${summary.opsAlertsFailed}`,
                            );
                        }
                    })
                    .catch((err: unknown) => console.error('[GrowthLaunchFreezePostmortemSLA] Error:', err));
                await runAllMonitoringChecks().catch((err: unknown) => console.error('[Monitoring] Error:', err));
                lastSchedulerCheck = now;
            }

            const result = await runWorkerOnce(options);

            if (result.processed > 0 || result.failed > 0 || result.transientRetriesQueued > 0) {
                console.log(
                    `[Worker] Batch: ${result.processed} processed, ${result.failed} failed, ` +
                    `${result.staleLocksCleaned} stale recovered, ${result.transientRetriesQueued} transient retried | ` +
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

    const activityRows = await db.select({
        lastStartedAt: sql<Date | null>`max(${contentQueue.startedAt})`,
        lastCompletedAt: sql<Date | null>`max(${contentQueue.completedAt})`,
        lastQueuedAt: sql<Date | null>`max(${contentQueue.createdAt})`,
    }).from(contentQueue);

    const latestStartedAt = activityRows[0]?.lastStartedAt ?? null;
    const latestCompletedAt = activityRows[0]?.lastCompletedAt ?? null;
    const latestQueuedAt = activityRows[0]?.lastQueuedAt ?? null;
    const latestWorkerActivityAt = [latestStartedAt, latestCompletedAt]
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
    const latestWorkerActivityAgeMs = latestWorkerActivityAt
        ? Date.now() - latestWorkerActivityAt.getTime()
        : null;

    return {
        ...stats,
        oldestPendingAge: oldestPending[0]?.createdAt
            ? Date.now() - oldestPending[0].createdAt.getTime()
            : null,
        avgProcessingTimeMs: avgDuration[0]?.avgMs || null,
        throughputPerHour: throughput[0]?.count || 0,
        errorRate24h: totalRecent > 0 ? Math.round((failedRecent / totalRecent) * 10000) / 100 : 0,
        latestStartedAt,
        latestCompletedAt,
        latestQueuedAt,
        latestWorkerActivityAt,
        latestWorkerActivityAgeMs,
    };
}

/**
 * Retry failed jobs
 */
const TRANSIENT_ERROR_PATTERNS = [
    /\b429\b/i,
    /too many requests/i,
    /rate[\s-]?limit/i,
    /\btimeout\b/i,
    /timed?\s*out/i,
    /\beconnreset\b/i,
    /\betimedout\b/i,
    /\beai_again\b/i,
    /\benotfound\b/i,
    /\beconnrefused\b/i,
    /socket hang up/i,
    /network error/i,
    /fetch failed/i,
    /service unavailable/i,
    /bad gateway/i,
    /gateway timeout/i,
    /cloudflare api cooldown/i,
];

const NON_TRANSIENT_ERROR_PATTERNS = [
    /invalid payload/i,
    /not found/i,
    /requires payload/i,
    /permanent failure/i,
    /dead letter/i,
    /validation/i,
];

type RetryFailedMode = 'all' | 'transient';

type RetryFailedOptions = {
    mode?: RetryFailedMode;
    minFailedAgeMs?: number;
};

type FailedQueueRetryCandidate = {
    id: string;
    attempts: number | null;
    maxAttempts: number | null;
    errorMessage: string | null;
    result: unknown;
    completedAt: Date | null;
    createdAt: Date | null;
};

function getRetryableFailureFlag(result: unknown): boolean | null {
    if (!isPlainObject(result)) return null;
    const failure = result.failure;
    if (!isPlainObject(failure)) return null;
    if (typeof failure.retryable === 'boolean') {
        return failure.retryable;
    }
    return null;
}

function getTransientAutoRetryCount(result: unknown): number {
    if (!isPlainObject(result)) return 0;
    const failure = result.failure;
    if (!isPlainObject(failure)) return 0;
    const countValue = failure.autoRetryTransientCount;
    if (typeof countValue !== 'number' || !Number.isFinite(countValue) || countValue < 0) {
        return 0;
    }
    return Math.floor(countValue);
}

function isTransientFailedJob(candidate: FailedQueueRetryCandidate, minFailedAgeMs: number): boolean {
    const attempts = Math.max(0, Number(candidate.attempts ?? 0));
    const maxAttempts = Math.max(1, Number(candidate.maxAttempts ?? 3));
    if (attempts >= maxAttempts) {
        return false;
    }
    if (getTransientAutoRetryCount(candidate.result) >= maxAttempts) {
        return false;
    }

    const failedAt = candidate.completedAt ?? candidate.createdAt;
    if (failedAt && Number.isFinite(failedAt.getTime())) {
        const ageMs = Date.now() - failedAt.getTime();
        if (ageMs < minFailedAgeMs) {
            return false;
        }
    }

    const metadataRetryable = getRetryableFailureFlag(candidate.result);
    if (metadataRetryable === true) {
        return true;
    }
    if (metadataRetryable === false) {
        return false;
    }

    const message = (candidate.errorMessage ?? '').trim();
    if (!message) return false;
    if (NON_TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        return false;
    }
    return TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function retryTransientFailedJobs(limit = 10): Promise<number> {
    return retryFailedJobs(limit, { mode: 'transient' });
}

export async function retryFailedJobs(limit = 10, options: RetryFailedOptions = {}): Promise<number> {
    const normalizedLimit = Math.max(1, Math.min(limit, 200));
    const mode = options.mode ?? 'all';
    const minFailedAgeMs = Math.max(
        0,
        Math.min(options.minFailedAgeMs ?? 2 * 60 * 1000, 24 * 60 * 60 * 1000),
    );

    const failedJobs = await db
        .select({
            id: contentQueue.id,
            attempts: contentQueue.attempts,
            maxAttempts: contentQueue.maxAttempts,
            errorMessage: contentQueue.errorMessage,
            result: contentQueue.result,
            completedAt: contentQueue.completedAt,
            createdAt: contentQueue.createdAt,
        })
        .from(contentQueue)
        .where(eq(contentQueue.status, 'failed'))
        .orderBy(desc(contentQueue.completedAt), desc(contentQueue.createdAt))
        .limit(mode === 'transient' ? normalizedLimit * 8 : normalizedLimit);

    const candidates = mode === 'transient'
        ? failedJobs
            .filter((job) => isTransientFailedJob(job, minFailedAgeMs))
            .slice(0, normalizedLimit)
        : failedJobs.slice(0, normalizedLimit);

    const now = Date.now();
    for (const job of candidates) {
        const attempts = Math.max(0, Number(job.attempts ?? 0));
        const maxAttempts = Math.max(1, Number(job.maxAttempts ?? 3));
        const autoRetryTransientCount = getTransientAutoRetryCount(job.result);
        const nextAutoRetryTransientCount = autoRetryTransientCount + 1;
        const nextAttempt = mode === 'transient' ? attempts : 0;
        const retryDelayMs = mode === 'transient'
            ? calculateBackoff(nextAutoRetryTransientCount, {
                baseDelayMs: 60_000,
                maxDelayMs: 30 * 60_000,
                jitter: false,
            })
            : 0;
        const scheduledFor = new Date(now + retryDelayMs);
        const existingResult = isPlainObject(job.result) ? job.result : {};
        const existingFailure = isPlainObject(existingResult.failure) ? existingResult.failure : {};
        const nextResult = mode === 'transient'
            ? {
                ...existingResult,
                failure: {
                    ...existingFailure,
                    autoRetryTransientCount: nextAutoRetryTransientCount,
                    autoRetryTransientAt: new Date(now).toISOString(),
                    autoRetryMode: 'transient',
                    retryable: getRetryableFailureFlag(job.result) ?? true,
                },
            }
            : existingResult;

        await db
            .update(contentQueue)
            .set({
                status: 'pending',
                attempts: nextAttempt,
                errorMessage: mode === 'transient'
                    ? `Auto-retry ${nextAutoRetryTransientCount}/${maxAttempts}: ${job.errorMessage ?? 'Transient failure'}`
                    : null,
                result: mode === 'transient' ? nextResult : job.result,
                scheduledFor,
                lockedUntil: null,
                startedAt: null,
                completedAt: null,
            })
            .where(eq(contentQueue.id, job.id));
    }

    return candidates.length;
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
