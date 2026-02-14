import { createHash } from 'node:crypto';
import { eq, ilike, or } from 'drizzle-orm';
import { db, researchCache } from '@/lib/db';
import { getAIClient } from '@/lib/ai/openrouter';
import { enqueueContentJob } from '@/lib/queue/content-queue';

const CACHED_KNOWLEDGE_MODEL = 'cachedKnowledgeBase';
const RESEARCH_CACHE_PROMPT_VERSION = 'research-cache.v1';
const RESEARCH_CACHE_ROUTING_VERSION = 'cachedKnowledgeBase.2026-02-14.v1';

const DEFAULT_CACHE_TTL_HOURS = Number.isFinite(Number.parseInt(process.env.RESEARCH_CACHE_TTL_HOURS || '', 10))
    ? Math.max(1, Number.parseInt(process.env.RESEARCH_CACHE_TTL_HOURS || '', 10))
    : 72;
const DEFAULT_STALENESS_HOURS = Number.isFinite(Number.parseInt(process.env.RESEARCH_CACHE_STALENESS_HOURS || '', 10))
    ? Math.max(1, Number.parseInt(process.env.RESEARCH_CACHE_STALENESS_HOURS || '', 10))
    : 72;
const DEFAULT_TOP_N = 5;
const MAX_CACHE_SCAN_ROWS = 50;

export type ResearchCacheStatus = 'hit' | 'miss';

export type ResearchGenerationResult<T> = {
    data: T;
    modelKey: string;
    model: string;
    resolvedModel: string;
    promptVersion: string;
    routingVersion: string;
    fallbackUsed: boolean;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    durationMs: number;
    cacheStatus: ResearchCacheStatus;
    cacheEntries: number;
};

type CachedEntryScore = {
    row: typeof researchCache.$inferSelect;
    score: number;
};

type ResearchCacheOptions<T> = {
    queryText: string;
    prompt: string;
    domainPriority?: number;
    stalenessHours?: number;
    ttlHours?: number;
    topN?: number;
    emptyResult: T;
    queueRefreshOnMiss?: boolean;
};

type RefreshPayload = {
    queryText: string;
    prompt: string;
    domainPriority?: number;
    ttlHours?: number;
};

function normalizeQuery(queryText: string): string {
    return queryText.trim().toLowerCase().replace(/\s+/g, ' ');
}

function queryHashFor(queryText: string): string {
    return createHash('sha256').update(normalizeQuery(queryText)).digest('hex');
}

function tokenizeQuery(queryText: string): string[] {
    return normalizeQuery(queryText)
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .slice(0, 8);
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function mergeUniqueArray(values: unknown[]): unknown[] {
    const seen = new Set<string>();
    const merged: unknown[] = [];
    for (const value of values) {
        const key = JSON.stringify(value);
        if (!seen.has(key)) {
            seen.add(key);
            merged.push(value);
        }
    }
    return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeResearchValues(values: unknown[]): unknown {
    if (values.length === 0) return {};
    if (values.length === 1) return values[0];

    if (values.every((value) => Array.isArray(value))) {
        const arrays = values as unknown[][];
        return mergeUniqueArray(arrays.flat());
    }

    if (values.every((value) => isPlainObject(value))) {
        const objects = values as Record<string, unknown>[];
        const keys = [...new Set(objects.flatMap((obj) => Object.keys(obj)))];
        const merged: Record<string, unknown> = {};
        for (const key of keys) {
            const keyValues = objects
                .map((obj) => obj[key])
                .filter((value) => value !== undefined && value !== null);
            if (keyValues.length === 0) continue;
            merged[key] = mergeResearchValues(keyValues);
        }
        return merged;
    }

    return values[0];
}

function scoreCacheEntry(
    row: typeof researchCache.$inferSelect,
    queryHash: string,
    tokens: string[],
    requiredPriority: number,
    stalenessWindowMs: number,
    now: Date,
): number {
    const rowQueryText = normalizeQuery(row.queryText);
    const relevance = row.queryHash === queryHash
        ? 1
        : tokens.length === 0
            ? 0
            : tokens.filter((token) => rowQueryText.includes(token)).length / tokens.length;
    const ageMs = Math.max(0, now.getTime() - row.fetchedAt.getTime());
    const recency = clamp(1 - (ageMs / stalenessWindowMs), 0, 1);
    const domainPriorityScore = requiredPriority <= 0
        ? clamp(row.domainPriority / 10, 0, 1)
        : row.domainPriority >= requiredPriority
            ? 1
            : clamp(row.domainPriority / requiredPriority, 0, 1);

    // Deterministic merge scoring from plan: 0.6 relevance + 0.3 recency + 0.1 domain priority.
    return (0.6 * relevance) + (0.3 * recency) + (0.1 * domainPriorityScore);
}

async function getRankedCacheEntries(opts: {
    queryText: string;
    domainPriority: number;
    stalenessHours: number;
    topN: number;
}): Promise<CachedEntryScore[]> {
    const now = new Date();
    const normalizedQuery = normalizeQuery(opts.queryText);
    const hash = queryHashFor(normalizedQuery);
    const tokens = tokenizeQuery(normalizedQuery);
    const stalenessWindowMs = opts.stalenessHours * 60 * 60 * 1000;
    const staleBefore = new Date(now.getTime() - stalenessWindowMs);

    const searchClauses = [eq(researchCache.queryHash, hash)];
    for (const token of tokens.slice(0, 5)) {
        searchClauses.push(ilike(researchCache.queryText, `%${token}%`));
    }
    const whereClause = searchClauses.length === 1
        ? searchClauses[0]
        : or(...searchClauses);

    const rows = await db.select()
        .from(researchCache)
        .where(whereClause)
        .limit(MAX_CACHE_SCAN_ROWS);

    const freshRows = rows.filter((row) => row.expiresAt > now && row.fetchedAt >= staleBefore);
    if (freshRows.length === 0) return [];

    const preferredRows = opts.domainPriority > 0
        ? freshRows.filter((row) => row.domainPriority >= opts.domainPriority)
        : freshRows;
    const scoringPool = preferredRows.length > 0 ? preferredRows : freshRows;

    return scoringPool
        .map((row) => ({
            row,
            score: scoreCacheEntry(row, hash, tokens, opts.domainPriority, stalenessWindowMs, now),
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.row.fetchedAt.getTime() !== a.row.fetchedAt.getTime()) {
                return b.row.fetchedAt.getTime() - a.row.fetchedAt.getTime();
            }
            return a.row.id.localeCompare(b.row.id);
        })
        .slice(0, opts.topN);
}

export async function upsertResearchCacheEntry(opts: {
    queryText: string;
    resultJson: unknown;
    sourceModel: string;
    domainPriority?: number;
    ttlHours?: number;
}): Promise<void> {
    const fetchedAt = new Date();
    const ttlHours = opts.ttlHours ?? DEFAULT_CACHE_TTL_HOURS;
    const expiresAt = new Date(fetchedAt.getTime() + (ttlHours * 60 * 60 * 1000));
    const normalizedQuery = normalizeQuery(opts.queryText);

    await db.insert(researchCache).values({
        queryHash: queryHashFor(normalizedQuery),
        queryText: normalizedQuery,
        resultJson: opts.resultJson,
        sourceModel: opts.sourceModel,
        fetchedAt,
        expiresAt,
        domainPriority: Math.max(0, Math.floor(opts.domainPriority ?? 0)),
    }).onConflictDoUpdate({
        target: researchCache.queryHash,
        set: {
            queryText: normalizedQuery,
            resultJson: opts.resultJson,
            sourceModel: opts.sourceModel,
            fetchedAt,
            expiresAt,
            domainPriority: Math.max(0, Math.floor(opts.domainPriority ?? 0)),
        },
    });
}

export async function queueResearchCacheRefreshJob(payload: RefreshPayload): Promise<string> {
    return enqueueContentJob({
        jobType: 'refresh_research_cache',
        status: 'pending',
        priority: 1,
        payload: {
            queryText: payload.queryText,
            prompt: payload.prompt,
            domainPriority: payload.domainPriority ?? 0,
            ttlHours: payload.ttlHours ?? DEFAULT_CACHE_TTL_HOURS,
        },
    });
}

export async function refreshResearchCacheEntry(payload: unknown): Promise<void> {
    if (!isPlainObject(payload)) {
        throw new Error('Invalid refresh payload');
    }
    const queryText = typeof payload.queryText === 'string' ? payload.queryText.trim() : '';
    const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    if (!queryText || !prompt) {
        throw new Error('refresh_research_cache requires queryText and prompt');
    }

    const domainPriority = typeof payload.domainPriority === 'number'
        ? Math.max(0, Math.floor(payload.domainPriority))
        : 0;
    const ttlHours = typeof payload.ttlHours === 'number' && Number.isFinite(payload.ttlHours)
        ? Math.max(1, Math.floor(payload.ttlHours))
        : DEFAULT_CACHE_TTL_HOURS;

    const ai = getAIClient();
    const live = await ai.generateJSON<Record<string, unknown>>('research', prompt);
    await upsertResearchCacheEntry({
        queryText,
        resultJson: live.data,
        sourceModel: live.resolvedModel || live.model,
        domainPriority,
        ttlHours,
    });
}

export async function generateResearchWithCache<T>(
    opts: ResearchCacheOptions<T>,
): Promise<ResearchGenerationResult<T>> {
    const start = Date.now();
    const topN = opts.topN ?? DEFAULT_TOP_N;
    const stalenessHours = opts.stalenessHours ?? DEFAULT_STALENESS_HOURS;
    const domainPriority = Math.max(0, Math.floor(opts.domainPriority ?? 0));

    const ranked = await getRankedCacheEntries({
        queryText: opts.queryText,
        domainPriority,
        stalenessHours,
        topN,
    });

    if (ranked.length > 0) {
        const mergedData = mergeResearchValues(ranked.map((entry) => entry.row.resultJson)) as T;
        return {
            data: mergedData,
            modelKey: 'research',
            model: CACHED_KNOWLEDGE_MODEL,
            resolvedModel: CACHED_KNOWLEDGE_MODEL,
            promptVersion: RESEARCH_CACHE_PROMPT_VERSION,
            routingVersion: RESEARCH_CACHE_ROUTING_VERSION,
            fallbackUsed: false,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            durationMs: Date.now() - start,
            cacheStatus: 'hit',
            cacheEntries: ranked.length,
        };
    }

    const ai = getAIClient();
    try {
        const live = await ai.generateJSON<T>('research', opts.prompt);
        await upsertResearchCacheEntry({
            queryText: opts.queryText,
            resultJson: live.data,
            sourceModel: live.resolvedModel || live.model,
            domainPriority,
            ttlHours: opts.ttlHours,
        });

        return {
            data: live.data,
            modelKey: live.modelKey,
            model: live.model,
            resolvedModel: live.resolvedModel,
            promptVersion: live.promptVersion,
            routingVersion: live.routingVersion,
            fallbackUsed: live.fallbackUsed,
            inputTokens: live.inputTokens,
            outputTokens: live.outputTokens,
            cost: live.cost,
            durationMs: live.durationMs,
            cacheStatus: 'miss',
            cacheEntries: 0,
        };
    } catch (error) {
        if (opts.queueRefreshOnMiss !== false) {
            await queueResearchCacheRefreshJob({
                queryText: opts.queryText,
                prompt: opts.prompt,
                domainPriority,
                ttlHours: opts.ttlHours,
            }).catch((queueError) => {
                console.error('Failed to queue refresh_research_cache job:', queueError);
            });
        }

        if (error instanceof Error) {
            console.error('Research cache miss and external research failed:', error.message);
        } else {
            console.error('Research cache miss and external research failed:', error);
        }

        return {
            data: opts.emptyResult,
            modelKey: 'research',
            model: CACHED_KNOWLEDGE_MODEL,
            resolvedModel: CACHED_KNOWLEDGE_MODEL,
            promptVersion: RESEARCH_CACHE_PROMPT_VERSION,
            routingVersion: RESEARCH_CACHE_ROUTING_VERSION,
            fallbackUsed: true,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            durationMs: Date.now() - start,
            cacheStatus: 'miss',
            cacheEntries: 0,
        };
    }
}
