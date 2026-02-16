import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, cloudflareShardHealth, domains, integrationConnections } from '@/lib/db';
import { decryptSecret } from '@/lib/security/encryption';
import {
    resolveCloudflareAccountByReference,
    type CloudflareClientOptions,
    type ResolvedCloudflareAccount,
} from './cloudflare';

type ShardConnectionRow = {
    id: string;
    displayName: string | null;
    config: Record<string, unknown>;
    encryptedCredential: string | null;
};

type CloudflareShardCandidate = {
    connectionId: string;
    key: string;
    accountRef: string;
    accountId: string;
    apiToken: string;
    region: string | null;
    baseWeight: number;
};

export type CloudflareHostShard = {
    connectionId?: string;
    shardKey: string;
    region?: string | null;
    weight?: number;
    strategy: 'domain_override' | 'hash_bucket' | 'default';
    source: 'integration_connection' | 'domain_reference' | 'environment';
    cloudflare: CloudflareClientOptions;
    warnings: string[];
};

export type CloudflareHostShardPlan = {
    primary: CloudflareHostShard;
    fallbacks: CloudflareHostShard[];
    all: CloudflareHostShard[];
};

type ResolveCloudflareHostShardInput = {
    domain: string;
    cloudflareAccount?: string | null;
    domainNiche?: string | null;
    routingRegion?: string | null;
    strictRegion?: boolean;
    maxFallbacks?: number;
};

type CachedShardCandidates = {
    expiresAt: number;
    rows: CloudflareShardCandidate[];
};

type ShardHealthState = {
    penalty: number;
    cooldownUntilMs: number;
    successCount: number;
    rateLimitCount: number;
    failureCount: number;
    updatedAtMs: number;
};

type ShardHealthIdentity = {
    shardKey: string;
    accountId?: string | null;
    sourceConnectionId?: string | null;
};

type CloudflareShardOutcome = 'success' | 'rate_limited' | 'failure';

const SHARD_CACHE_TTL_MS = 60_000;
let shardCache: CachedShardCandidates | null = null;
let shardCacheInFlight: Promise<CloudflareShardCandidate[]> | null = null;
const shardHealthState = new Map<string, ShardHealthState>();

type ShardAssignmentSnapshot = {
    totalByAccountId: Map<string, number>;
    nicheByAccountId: Map<string, Map<string, number>>;
    totalByNiche: Map<string, number>;
    totalAssigned: number;
};

type CachedShardAssignmentSnapshot = {
    expiresAt: number;
    fingerprint: string;
    snapshot: ShardAssignmentSnapshot;
};

const SHARD_ASSIGNMENT_CACHE_TTL_MS = 30_000;
let shardAssignmentCache: CachedShardAssignmentSnapshot | null = null;
let shardAssignmentInFlight: { fingerprint: string; promise: Promise<ShardAssignmentSnapshot> } | null = null;

type CachedPersistentShardHealth = {
    expiresAt: number;
    rows: Map<string, ShardHealthState>;
};
const PERSISTENT_SHARD_HEALTH_CACHE_TTL_MS = 15_000;
let persistentShardHealthCache: CachedPersistentShardHealth | null = null;
let persistentShardHealthInFlight: Promise<Map<string, ShardHealthState>> | null = null;
const SHARD_HEALTH_TTL_MS = 30 * 60 * 1000;
const SHARD_RATE_LIMIT_BASE_COOLDOWN_MS = 15_000;
const SHARD_RATE_LIMIT_MAX_COOLDOWN_MS = 10 * 60 * 1000;
const SHARD_FAILURE_BASE_COOLDOWN_MS = 5_000;
const SHARD_FAILURE_MAX_COOLDOWN_MS = 2 * 60 * 1000;
const SHARD_MAX_PENALTY = 8;
const DEFAULT_SHARD_TARGET_DOMAINS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeKey(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeRegion(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase().replace(/_/g, '-');
    return normalized.length > 0 ? normalized : null;
}

function normalizeNiche(value: string | null | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
}

function resolveTargetDomainsPerShard(): number {
    const envTarget = Number.parseInt(
        process.env.CLOUDFLARE_SHARD_TARGET_DOMAINS_PER_ACCOUNT
        ?? process.env.CLOUDFLARE_SHARD_TARGET_DOMAINS
        ?? '',
        10,
    );
    if (Number.isFinite(envTarget) && envTarget > 0) {
        return Math.max(1, Math.min(envTarget, 10_000));
    }
    return DEFAULT_SHARD_TARGET_DOMAINS;
}

function shardHealthKey(shardKey: string, accountId?: string | null): string {
    const normalizedShard = normalizeKey(shardKey);
    const normalizedAccount = accountId ? normalizeKey(accountId) : '';
    return `${normalizedShard}::${normalizedAccount}`;
}

function resolveShardIdentity(input: string | ShardHealthIdentity): ShardHealthIdentity {
    if (typeof input === 'string') {
        return { shardKey: input };
    }

    return {
        shardKey: input.shardKey,
        accountId: input.accountId ?? null,
        sourceConnectionId: input.sourceConnectionId ?? null,
    };
}

function purgeExpiredShardHealth(nowMs = Date.now()): void {
    for (const [key, state] of shardHealthState.entries()) {
        if (nowMs - state.updatedAtMs > SHARD_HEALTH_TTL_MS) {
            shardHealthState.delete(key);
        }
    }
}

function getShardHealthState(shardKey: string, accountId?: string | null, nowMs = Date.now()): ShardHealthState {
    purgeExpiredShardHealth(nowMs);
    const exactKey = shardHealthKey(shardKey, accountId);
    const genericKey = shardHealthKey(shardKey);
    const exact = shardHealthState.get(exactKey);
    const generic = accountId ? shardHealthState.get(genericKey) : null;
    if (exact && generic) {
        return exact.updatedAtMs >= generic.updatedAtMs ? exact : generic;
    }
    if (exact) return exact;
    if (generic) return generic;
    return {
        penalty: 0,
        cooldownUntilMs: 0,
        successCount: 0,
        rateLimitCount: 0,
        failureCount: 0,
        updatedAtMs: nowMs,
    };
}

function updateShardHealthState(shardKey: string, accountId: string | null | undefined, next: ShardHealthState): void {
    shardHealthState.set(shardHealthKey(shardKey, accountId), next);
}

function shardIsCoolingDown(shardKey: string, accountId?: string | null, nowMs = Date.now()): boolean {
    const state = getShardHealthState(shardKey, accountId, nowMs);
    return state.cooldownUntilMs > nowMs;
}

function compareCandidatesByHealth(
    left: CloudflareShardCandidate,
    right: CloudflareShardCandidate,
    nowMs = Date.now(),
): number {
    const leftHealth = getShardHealthState(left.key, left.accountId, nowMs);
    const rightHealth = getShardHealthState(right.key, right.accountId, nowMs);
    const leftCooling = leftHealth.cooldownUntilMs > nowMs ? 1 : 0;
    const rightCooling = rightHealth.cooldownUntilMs > nowMs ? 1 : 0;
    if (leftCooling !== rightCooling) return leftCooling - rightCooling;
    if (leftHealth.penalty !== rightHealth.penalty) return leftHealth.penalty - rightHealth.penalty;

    const leftKey = normalizeKey(left.key);
    const rightKey = normalizeKey(right.key);
    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    if (left.accountId < right.accountId) return -1;
    if (left.accountId > right.accountId) return 1;
    return 0;
}

function hashDomain(value: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function looksLikeCloudflareAccountId(value: string): boolean {
    return /^[a-f0-9]{32}$/i.test(value.trim());
}

function resolveShardAccountRef(row: ShardConnectionRow): string | null {
    const config = isRecord(row.config) ? row.config : {};
    return asNonEmptyString(config.accountId)
        ?? asNonEmptyString(config.accountRef)
        ?? asNonEmptyString(config.accountName)
        ?? asNonEmptyString(row.displayName);
}

function resolveShardKey(row: ShardConnectionRow, accountRef: string): string {
    const config = isRecord(row.config) ? row.config : {};
    return asNonEmptyString(config.shardKey)
        ?? asNonEmptyString(config.hostShardKey)
        ?? asNonEmptyString(row.displayName)
        ?? accountRef
        ?? row.id;
}

function resolveShardRegion(row: ShardConnectionRow): string | null {
    const config = isRecord(row.config) ? row.config : {};
    return normalizeRegion(
        asNonEmptyString(config.region)
        ?? asNonEmptyString(config.routingRegion)
        ?? asNonEmptyString(config.shardRegion),
    );
}

function resolveShardBaseWeight(row: ShardConnectionRow): number {
    const config = isRecord(row.config) ? row.config : {};
    const rawWeight = asFiniteNumber(config.shardWeight)
        ?? asFiniteNumber(config.capacityWeight)
        ?? asFiniteNumber(config.weight);
    if (!rawWeight || rawWeight <= 0) {
        return 100;
    }
    return Math.max(1, Math.min(Math.round(rawWeight), 1000));
}

function buildShardAssignmentFingerprint(candidates: CloudflareShardCandidate[]): string {
    return candidates
        .map((candidate) => `${normalizeKey(candidate.key)}:${candidate.accountId}`)
        .sort()
        .join('|');
}

function createEmptyShardAssignmentSnapshot(): ShardAssignmentSnapshot {
    return {
        totalByAccountId: new Map(),
        nicheByAccountId: new Map(),
        totalByNiche: new Map(),
        totalAssigned: 0,
    };
}

function createCandidateAliasMap(candidates: CloudflareShardCandidate[]): Map<string, Set<string>> {
    const aliasToAccountIds = new Map<string, Set<string>>();

    const addAlias = (alias: string | null, accountId: string): void => {
        if (!alias) return;
        const normalizedAlias = normalizeKey(alias);
        if (!normalizedAlias) return;
        const existing = aliasToAccountIds.get(normalizedAlias);
        if (existing) {
            existing.add(accountId);
            return;
        }
        aliasToAccountIds.set(normalizedAlias, new Set([accountId]));
    };

    for (const candidate of candidates) {
        addAlias(candidate.accountId, candidate.accountId);
        addAlias(candidate.key, candidate.accountId);
        addAlias(candidate.accountRef, candidate.accountId);
    }

    return aliasToAccountIds;
}

function resolveMappedAccountId(
    value: string,
    aliasToAccountIds: Map<string, Set<string>>,
): string | null {
    const normalizedValue = normalizeKey(value);
    if (!normalizedValue) return null;
    const mapped = aliasToAccountIds.get(normalizedValue);
    if (!mapped || mapped.size === 0) return null;
    if (mapped.size === 1) return [...mapped][0] ?? null;
    return [...mapped].sort()[0] ?? null;
}

async function loadShardAssignmentSnapshot(
    candidates: CloudflareShardCandidate[],
): Promise<ShardAssignmentSnapshot> {
    if (candidates.length === 0) {
        return createEmptyShardAssignmentSnapshot();
    }

    const now = Date.now();
    const fingerprint = buildShardAssignmentFingerprint(candidates);
    if (shardAssignmentCache
        && shardAssignmentCache.expiresAt > now
        && shardAssignmentCache.fingerprint === fingerprint) {
        return shardAssignmentCache.snapshot;
    }

    if (shardAssignmentInFlight && shardAssignmentInFlight.fingerprint === fingerprint) {
        return shardAssignmentInFlight.promise;
    }

    const promise = (async () => {
        try {
            const aliasToAccountIds = createCandidateAliasMap(candidates);
            if (aliasToAccountIds.size === 0) {
                return createEmptyShardAssignmentSnapshot();
            }

            const rows = await db
                .select({
                    cloudflareAccount: domains.cloudflareAccount,
                    niche: domains.niche,
                })
                .from(domains)
                .where(isNull(domains.deletedAt));

            const snapshot = createEmptyShardAssignmentSnapshot();
            for (const row of rows) {
                const accountRef = asNonEmptyString(row.cloudflareAccount);
                if (!accountRef) continue;

                const mappedAccountId = resolveMappedAccountId(accountRef, aliasToAccountIds);
                if (!mappedAccountId) continue;

                snapshot.totalAssigned += 1;
                snapshot.totalByAccountId.set(
                    mappedAccountId,
                    (snapshot.totalByAccountId.get(mappedAccountId) ?? 0) + 1,
                );

                const normalizedNiche = normalizeNiche(row.niche);
                if (!normalizedNiche) continue;

                snapshot.totalByNiche.set(
                    normalizedNiche,
                    (snapshot.totalByNiche.get(normalizedNiche) ?? 0) + 1,
                );

                const nicheByAccount = snapshot.nicheByAccountId.get(mappedAccountId);
                if (nicheByAccount) {
                    nicheByAccount.set(
                        normalizedNiche,
                        (nicheByAccount.get(normalizedNiche) ?? 0) + 1,
                    );
                } else {
                    snapshot.nicheByAccountId.set(mappedAccountId, new Map([[normalizedNiche, 1]]));
                }
            }

            shardAssignmentCache = {
                expiresAt: Date.now() + SHARD_ASSIGNMENT_CACHE_TTL_MS,
                fingerprint,
                snapshot,
            };
            return snapshot;
        } catch {
            // Missing table or transient DB issue should not block routing.
            return createEmptyShardAssignmentSnapshot();
        }
    })();

    shardAssignmentInFlight = {
        fingerprint,
        promise,
    };

    try {
        return await promise;
    } finally {
        if (shardAssignmentInFlight?.fingerprint === fingerprint) {
            shardAssignmentInFlight = null;
        }
    }
}

async function resolveConnectionAccountId(
    accountRef: string,
    apiToken: string,
): Promise<ResolvedCloudflareAccount | null> {
    if (looksLikeCloudflareAccountId(accountRef)) {
        return {
            id: accountRef.toLowerCase(),
            name: null,
        };
    }

    return resolveCloudflareAccountByReference(accountRef, { apiToken });
}

async function loadShardCandidates(): Promise<CloudflareShardCandidate[]> {
    const now = Date.now();
    if (shardCache && shardCache.expiresAt > now) {
        return shardCache.rows;
    }

    if (shardCacheInFlight) {
        return shardCacheInFlight;
    }

    shardCacheInFlight = (async () => {
        const rows = await db
            .select({
                id: integrationConnections.id,
                displayName: integrationConnections.displayName,
                config: integrationConnections.config,
                encryptedCredential: integrationConnections.encryptedCredential,
            })
            .from(integrationConnections)
            .where(and(
                eq(integrationConnections.provider, 'cloudflare'),
                inArray(integrationConnections.status, ['connected', 'pending']),
                isNull(integrationConnections.domainId),
            )) as ShardConnectionRow[];

        const candidates: CloudflareShardCandidate[] = [];
        for (const row of rows) {
            const encryptedCredential = asNonEmptyString(row.encryptedCredential);
            if (!encryptedCredential) continue;

            let apiToken: string;
            try {
                apiToken = decryptSecret(encryptedCredential);
            } catch {
                continue;
            }

            const accountRef = resolveShardAccountRef(row);
            if (!accountRef) continue;

            let account: ResolvedCloudflareAccount | null = null;
            try {
                account = await resolveConnectionAccountId(accountRef, apiToken);
            } catch {
                account = null;
            }
            if (!account?.id) continue;

            candidates.push({
                connectionId: row.id,
                key: resolveShardKey(row, accountRef),
                accountRef,
                accountId: account.id,
                apiToken,
                region: resolveShardRegion(row),
                baseWeight: resolveShardBaseWeight(row),
            });
        }

        const deduped = new Map<string, CloudflareShardCandidate>();
        for (const candidate of candidates) {
            const dedupeKey = `${normalizeKey(candidate.key)}:${candidate.accountId}`;
            if (!deduped.has(dedupeKey)) {
                deduped.set(dedupeKey, candidate);
            }
        }

        const sorted = [...deduped.values()].sort((left, right) => {
            const leftKey = normalizeKey(left.key);
            const rightKey = normalizeKey(right.key);
            if (leftKey < rightKey) return -1;
            if (leftKey > rightKey) return 1;
            if (left.accountId < right.accountId) return -1;
            if (left.accountId > right.accountId) return 1;
            return 0;
        });

        shardCache = {
            expiresAt: Date.now() + SHARD_CACHE_TTL_MS,
            rows: sorted,
        };
        return sorted;
    })();

    try {
        return await shardCacheInFlight;
    } finally {
        shardCacheInFlight = null;
    }
}

async function loadPersistentShardHealth(
    candidates: CloudflareShardCandidate[],
): Promise<Map<string, ShardHealthState>> {
    if (candidates.length === 0) {
        return new Map();
    }

    const nowMs = Date.now();
    if (persistentShardHealthCache && persistentShardHealthCache.expiresAt > nowMs) {
        return persistentShardHealthCache.rows;
    }

    if (persistentShardHealthInFlight) {
        return persistentShardHealthInFlight;
    }

    const shardKeys = [...new Set(candidates.map((candidate) => candidate.key.trim()).filter(Boolean))];
    const accountIds = [...new Set(candidates.map((candidate) => candidate.accountId.trim()).filter(Boolean))];
    if (shardKeys.length === 0 || accountIds.length === 0) {
        return new Map();
    }

    persistentShardHealthInFlight = (async () => {
        try {
            const rows = await db
                .select({
                    shardKey: cloudflareShardHealth.shardKey,
                    accountId: cloudflareShardHealth.accountId,
                    penalty: cloudflareShardHealth.penalty,
                    cooldownUntil: cloudflareShardHealth.cooldownUntil,
                    successCount: cloudflareShardHealth.successCount,
                    rateLimitCount: cloudflareShardHealth.rateLimitCount,
                    failureCount: cloudflareShardHealth.failureCount,
                    updatedAt: cloudflareShardHealth.updatedAt,
                })
                .from(cloudflareShardHealth)
                .where(and(
                    inArray(cloudflareShardHealth.shardKey, shardKeys),
                    inArray(cloudflareShardHealth.accountId, accountIds),
                ));

            const map = new Map<string, ShardHealthState>();
            for (const row of rows) {
                if (!row.shardKey || !row.accountId) continue;
                const updatedAtMs = row.updatedAt instanceof Date && Number.isFinite(row.updatedAt.getTime())
                    ? row.updatedAt.getTime()
                    : nowMs;
                const cooldownUntilMs = row.cooldownUntil instanceof Date && Number.isFinite(row.cooldownUntil.getTime())
                    ? row.cooldownUntil.getTime()
                    : 0;
                map.set(
                    shardHealthKey(row.shardKey, row.accountId),
                    {
                        penalty: Math.max(0, row.penalty ?? 0),
                        cooldownUntilMs,
                        successCount: Math.max(0, row.successCount ?? 0),
                        rateLimitCount: Math.max(0, row.rateLimitCount ?? 0),
                        failureCount: Math.max(0, row.failureCount ?? 0),
                        updatedAtMs,
                    },
                );
            }

            persistentShardHealthCache = {
                expiresAt: Date.now() + PERSISTENT_SHARD_HEALTH_CACHE_TTL_MS,
                rows: map,
            };

            return map;
        } catch {
            // Missing table or transient DB issue should not block routing.
            return new Map<string, ShardHealthState>();
        }
    })();

    try {
        return await persistentShardHealthInFlight;
    } finally {
        persistentShardHealthInFlight = null;
    }
}

function applyPersistentShardHealth(
    map: Map<string, ShardHealthState>,
): void {
    if (map.size === 0) return;
    for (const [key, state] of map.entries()) {
        const current = shardHealthState.get(key);
        if (!current || state.updatedAtMs >= current.updatedAtMs) {
            shardHealthState.set(key, state);
        }
    }
}

function findOverrideCandidate(
    override: string,
    candidates: CloudflareShardCandidate[],
): CloudflareShardCandidate | null {
    const normalizedOverride = normalizeKey(override);
    for (const candidate of candidates) {
        if (normalizeKey(candidate.key) === normalizedOverride) return candidate;
        if (normalizeKey(candidate.accountRef) === normalizedOverride) return candidate;
        if (normalizeKey(candidate.accountId) === normalizedOverride) return candidate;
    }
    return null;
}

async function resolveDomainReferenceOverride(
    override: string,
): Promise<CloudflareHostShard | null> {
    if (looksLikeCloudflareAccountId(override)) {
        return {
            shardKey: override,
            strategy: 'domain_override',
            source: 'domain_reference',
            cloudflare: { accountId: override.toLowerCase() },
            warnings: [],
        };
    }

    let resolved: ResolvedCloudflareAccount | null = null;
    try {
        resolved = await resolveCloudflareAccountByReference(override);
    } catch {
        resolved = null;
    }
    if (!resolved?.id) return null;

    return {
        shardKey: resolved.name ?? override,
        strategy: 'domain_override',
        source: 'domain_reference',
        cloudflare: { accountId: resolved.id },
        warnings: [],
    };
}

type RoutingPolicy = {
    routingRegion: string | null;
    strictRegion: boolean;
    fallbackRegions: string[];
};

function parseRegionFallbackMatrix(raw: string | undefined): Map<string, string[]> {
    const matrix = new Map<string, string[]>();
    if (!raw) return matrix;
    const entries = raw.split(';');
    for (const entry of entries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const separatorIndex = trimmed.indexOf('=');
        const altSeparatorIndex = trimmed.indexOf(':');
        const splitAt = separatorIndex >= 0
            ? separatorIndex
            : altSeparatorIndex;
        if (splitAt < 0) continue;

        const source = normalizeRegion(trimmed.slice(0, splitAt));
        const rawTargets = trimmed.slice(splitAt + 1).trim();
        if (!source || !rawTargets) continue;
        const targets = [...new Set(
            rawTargets
                .split(',')
                .map((item) => normalizeRegion(item))
                .filter((item): item is string => Boolean(item) && item !== source),
        )];
        if (targets.length === 0) continue;
        matrix.set(source, targets);
    }
    return matrix;
}

function resolveRoutingPolicy(input: ResolveCloudflareHostShardInput): RoutingPolicy {
    const routingRegion = normalizeRegion(
        asNonEmptyString(input.routingRegion)
        ?? asNonEmptyString(process.env.CLOUDFLARE_SHARD_DEFAULT_REGION),
    );
    const strictRegion = input.strictRegion === true || process.env.CLOUDFLARE_SHARD_STRICT_REGION === 'true';

    const matrix = parseRegionFallbackMatrix(process.env.CLOUDFLARE_SHARD_REGION_FALLBACKS);
    const explicitFallbacks = routingRegion
        ? matrix.get(routingRegion) ?? []
        : [];

    const globalFallbacks = [...new Set(
        (process.env.CLOUDFLARE_SHARD_FALLBACK_REGIONS || '')
            .split(',')
            .map((value) => normalizeRegion(value))
            .filter((value): value is string => Boolean(value) && value !== routingRegion),
    )];

    return {
        routingRegion,
        strictRegion,
        fallbackRegions: [...new Set([...explicitFallbacks, ...globalFallbacks])],
    };
}

function resolveRegionPriority(
    region: string | null,
    policy: RoutingPolicy,
): number {
    if (!policy.routingRegion) return 0;
    if (region === policy.routingRegion) return 0;
    const fallbackIndex = region ? policy.fallbackRegions.indexOf(region) : -1;
    if (fallbackIndex >= 0) return fallbackIndex + 1;
    if (!region) return policy.fallbackRegions.length + 1;
    return policy.fallbackRegions.length + 2;
}

function resolveRegionMultiplier(priority: number): number {
    if (priority <= 0) return 1;
    if (priority === 1) return 0.82;
    if (priority === 2) return 0.65;
    if (priority === 3) return 0.5;
    return 0.35;
}

function resolveHealthMultiplier(
    candidate: CloudflareShardCandidate,
    health: ShardHealthState,
    nowMs: number,
): number {
    if (shardIsCoolingDown(candidate.key, candidate.accountId, nowMs)) {
        return 0.05;
    }

    const penaltyMultiplier = Math.max(0.2, 1 - Math.min(health.penalty, SHARD_MAX_PENALTY) * 0.09);
    const observed = health.successCount + health.rateLimitCount + health.failureCount;
    if (observed < 20) {
        return penaltyMultiplier;
    }
    const instability = (health.rateLimitCount + health.failureCount) / Math.max(1, observed);
    const reliabilityMultiplier = Math.max(0.4, 1 - instability);
    return penaltyMultiplier * reliabilityMultiplier;
}

function resolveCapacityMultiplier(
    candidate: CloudflareShardCandidate,
    snapshot: ShardAssignmentSnapshot,
): number {
    const target = resolveTargetDomainsPerShard();
    if (target <= 0) return 1;

    const currentCount = snapshot.totalByAccountId.get(candidate.accountId) ?? 0;
    const projectedCount = currentCount + 1;
    const utilization = projectedCount / target;
    if (utilization <= 1) {
        return 1 + Math.min(0.35, (1 - utilization) * 0.35);
    }
    if (utilization <= 1.2) return 0.9;
    if (utilization <= 1.5) return 0.75;
    if (utilization <= 2) return 0.55;
    return 0.35;
}

type NicheBalanceContext = {
    minCount: number;
    maxCount: number;
    targetCountPerShard: number;
    countByAccountId: Map<string, number>;
};

function buildNicheBalanceContext(
    candidates: CloudflareShardCandidate[],
    snapshot: ShardAssignmentSnapshot,
    domainNiche: string | null | undefined,
): NicheBalanceContext | null {
    const normalizedNiche = normalizeNiche(domainNiche);
    if (!normalizedNiche) return null;

    const countByAccountId = new Map<string, number>();
    for (const candidate of candidates) {
        const count = snapshot.nicheByAccountId.get(candidate.accountId)?.get(normalizedNiche) ?? 0;
        countByAccountId.set(candidate.accountId, count);
    }

    if (countByAccountId.size === 0) return null;
    const values = [...countByAccountId.values()];
    const minCount = Math.min(...values);
    const maxCount = Math.max(...values);
    const globalNicheCount = snapshot.totalByNiche.get(normalizedNiche) ?? 0;
    const targetCountPerShard = (globalNicheCount + 1) / Math.max(1, candidates.length);

    return {
        minCount,
        maxCount,
        targetCountPerShard,
        countByAccountId,
    };
}

function resolveNicheBalanceMultiplier(
    candidate: CloudflareShardCandidate,
    context: NicheBalanceContext | null,
): number {
    if (!context) return 1;

    const candidateCount = context.countByAccountId.get(candidate.accountId) ?? 0;
    const spread = context.maxCount - context.minCount;
    const spreadMultiplier = spread > 0
        ? 1.2 - ((candidateCount - context.minCount) / spread) * 0.5
        : 1;

    const projected = candidateCount + 1;
    const deviationFromTarget = Math.abs(projected - context.targetCountPerShard);
    const targetMultiplier = Math.max(0.8, 1 - deviationFromTarget * 0.12);

    return spreadMultiplier * targetMultiplier;
}

function deterministicShardScore(
    domain: string,
    candidate: CloudflareShardCandidate,
): number {
    const seed = `${normalizeKey(domain)}::${normalizeKey(candidate.key)}::${candidate.accountId}`;
    return hashDomain(seed) / 0xffffffff;
}

function rankCandidatesForDomain(
    domain: string,
    candidates: CloudflareShardCandidate[],
    policy: RoutingPolicy,
    warnings: string[],
    assignmentSnapshot: ShardAssignmentSnapshot,
    domainNiche?: string | null,
): CloudflareShardCandidate[] {
    if (candidates.length === 0) return [];

    const nowMs = Date.now();
    const preferredCandidates = policy.routingRegion
        ? candidates.filter((candidate) => candidate.region === policy.routingRegion)
        : candidates;
    if (policy.routingRegion && preferredCandidates.length === 0) {
        warnings.push(
            `No Cloudflare shards are tagged for routing region "${policy.routingRegion}"; falling back to region-agnostic routing.`,
        );
    }

    const strictCandidates = policy.routingRegion && policy.strictRegion
        ? preferredCandidates
        : candidates;
    const basePool = strictCandidates.length > 0
        ? strictCandidates
        : candidates;

    if (policy.routingRegion && policy.strictRegion && strictCandidates.length === 0) {
        warnings.push(
            `No Cloudflare shards matched strict routing region "${policy.routingRegion}"; falling back to all configured shards.`,
        );
    }

    const targetDomainsPerShard = resolveTargetDomainsPerShard();
    if (targetDomainsPerShard > 0) {
        const allAtOrAboveTarget = basePool.every((candidate) =>
            (assignmentSnapshot.totalByAccountId.get(candidate.accountId) ?? 0) >= targetDomainsPerShard,
        );
        if (allAtOrAboveTarget) {
            warnings.push(
                `All Cloudflare shards are at/above the target capacity of ${targetDomainsPerShard} domains; routing will use best-fit balancing.`,
            );
        }
    }

    const nicheBalance = buildNicheBalanceContext(basePool, assignmentSnapshot, domainNiche);

    type RankedCandidate = {
        candidate: CloudflareShardCandidate;
        score: number;
        regionPriority: number;
    };

    const ranked: RankedCandidate[] = basePool.map((candidate) => {
        const health = getShardHealthState(candidate.key, candidate.accountId, nowMs);
        const regionPriority = resolveRegionPriority(candidate.region, policy);
        const regionMultiplier = resolveRegionMultiplier(regionPriority);
        const healthMultiplier = resolveHealthMultiplier(candidate, health, nowMs);
        const capacityMultiplier = resolveCapacityMultiplier(candidate, assignmentSnapshot);
        const nicheMultiplier = resolveNicheBalanceMultiplier(candidate, nicheBalance);
        const dynamicWeight = candidate.baseWeight
            * regionMultiplier
            * healthMultiplier
            * capacityMultiplier
            * nicheMultiplier;
        const score = deterministicShardScore(domain, candidate) * dynamicWeight;
        return {
            candidate,
            score,
            regionPriority,
        };
    });

    const nonCooling = ranked.some((entry) =>
        !shardIsCoolingDown(entry.candidate.key, entry.candidate.accountId, nowMs),
    );
    if (!nonCooling) {
        warnings.push(
            'All configured Cloudflare host shards are temporarily cooling down due recent rate-limit/error events; using best-effort routing.',
        );
    }

    ranked.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (left.regionPriority !== right.regionPriority) return left.regionPriority - right.regionPriority;
        return compareCandidatesByHealth(left.candidate, right.candidate, nowMs);
    });
    return ranked.map((entry) => entry.candidate);
}

function sortFallbackCandidates(
    domain: string,
    candidates: CloudflareShardCandidate[],
    policy: RoutingPolicy,
    warnings: string[],
    assignmentSnapshot: ShardAssignmentSnapshot,
    domainNiche?: string | null,
): CloudflareShardCandidate[] {
    return rankCandidatesForDomain(
        domain,
        candidates,
        policy,
        warnings,
        assignmentSnapshot,
        domainNiche,
    );
}

function normalizeFallbackCount(input?: number): number {
    if (typeof input === 'number' && Number.isFinite(input)) {
        return Math.max(0, Math.min(Math.trunc(input), 5));
    }

    const fromEnv = Number.parseInt(process.env.CLOUDFLARE_SHARD_MAX_FALLBACKS || '', 10);
    if (Number.isFinite(fromEnv)) {
        return Math.max(0, Math.min(fromEnv, 5));
    }

    return 2;
}

function candidateToShard(
    candidate: CloudflareShardCandidate,
    strategy: CloudflareHostShard['strategy'],
): CloudflareHostShard {
    return {
        connectionId: candidate.connectionId,
        shardKey: candidate.key,
        region: candidate.region,
        weight: candidate.baseWeight,
        strategy,
        source: 'integration_connection',
        cloudflare: {
            accountId: candidate.accountId,
            apiToken: candidate.apiToken,
        },
        warnings: [],
    };
}

function dedupeShards(shards: CloudflareHostShard[]): CloudflareHostShard[] {
    const seen = new Set<string>();
    const deduped: CloudflareHostShard[] = [];
    for (const shard of shards) {
        const key = `${shard.cloudflare.accountId || ''}:${shard.cloudflare.apiToken || ''}:${normalizeKey(shard.shardKey)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(shard);
    }
    return deduped;
}

async function persistShardHealthOutcome(
    identity: ShardHealthIdentity,
    outcome: CloudflareShardOutcome,
    nextState: ShardHealthState,
): Promise<void> {
    if (!identity.accountId) return;

    const now = new Date(nextState.updatedAtMs);
    const cooldownUntil = nextState.cooldownUntilMs > 0
        ? new Date(nextState.cooldownUntilMs)
        : null;
    const successInc = outcome === 'success' ? 1 : 0;
    const rateLimitInc = outcome === 'rate_limited' ? 1 : 0;
    const failureInc = outcome === 'failure' ? 1 : 0;

    try {
        await db.insert(cloudflareShardHealth).values({
            shardKey: identity.shardKey,
            accountId: identity.accountId,
            sourceConnectionId: identity.sourceConnectionId ?? null,
            penalty: nextState.penalty,
            cooldownUntil,
            successCount: successInc,
            rateLimitCount: rateLimitInc,
            failureCount: failureInc,
            lastOutcome: outcome,
            lastOutcomeAt: now,
            updatedAt: now,
        }).onConflictDoUpdate({
            target: [cloudflareShardHealth.shardKey, cloudflareShardHealth.accountId],
            set: {
                sourceConnectionId: sql`coalesce(excluded.source_connection_id, ${cloudflareShardHealth.sourceConnectionId})`,
                penalty: nextState.penalty,
                cooldownUntil,
                successCount: sql`${cloudflareShardHealth.successCount} + ${successInc}`,
                rateLimitCount: sql`${cloudflareShardHealth.rateLimitCount} + ${rateLimitInc}`,
                failureCount: sql`${cloudflareShardHealth.failureCount} + ${failureInc}`,
                lastOutcome: outcome,
                lastOutcomeAt: now,
                updatedAt: now,
            },
        });

        if (persistentShardHealthCache) {
            const cacheRows = new Map(persistentShardHealthCache.rows);
            cacheRows.set(
                shardHealthKey(identity.shardKey, identity.accountId),
                nextState,
            );
            persistentShardHealthCache = {
                expiresAt: Date.now() + PERSISTENT_SHARD_HEALTH_CACHE_TTL_MS,
                rows: cacheRows,
            };
        }
    } catch {
        // Best-effort persistence; routing should continue using in-memory health.
    }
}

export function recordCloudflareHostShardOutcome(
    shard: string | ShardHealthIdentity,
    outcome: CloudflareShardOutcome,
): void {
    const identity = resolveShardIdentity(shard);
    const nowMs = Date.now();
    const current = getShardHealthState(identity.shardKey, identity.accountId, nowMs);
    let penalty = current.penalty;
    let cooldownUntilMs = current.cooldownUntilMs;

    if (outcome === 'success') {
        penalty = Math.max(0, penalty - 1);
        if (cooldownUntilMs <= nowMs) {
            cooldownUntilMs = 0;
        }
    } else if (outcome === 'rate_limited') {
        penalty = Math.min(SHARD_MAX_PENALTY, penalty + 2);
        const cooldownMs = Math.min(
            SHARD_RATE_LIMIT_MAX_COOLDOWN_MS,
            SHARD_RATE_LIMIT_BASE_COOLDOWN_MS * 2 ** Math.max(0, penalty - 1),
        );
        cooldownUntilMs = nowMs + cooldownMs;
    } else {
        penalty = Math.min(SHARD_MAX_PENALTY, penalty + 1);
        const cooldownMs = Math.min(
            SHARD_FAILURE_MAX_COOLDOWN_MS,
            SHARD_FAILURE_BASE_COOLDOWN_MS * 2 ** Math.max(0, penalty - 1),
        );
        cooldownUntilMs = Math.max(cooldownUntilMs, nowMs + cooldownMs);
    }

    const nextState: ShardHealthState = {
        penalty,
        cooldownUntilMs,
        successCount: current.successCount + (outcome === 'success' ? 1 : 0),
        rateLimitCount: current.rateLimitCount + (outcome === 'rate_limited' ? 1 : 0),
        failureCount: current.failureCount + (outcome === 'failure' ? 1 : 0),
        updatedAtMs: nowMs,
    };
    updateShardHealthState(identity.shardKey, identity.accountId, nextState);

    void persistShardHealthOutcome(identity, outcome, nextState);
}

export function clearCloudflareHostShardCache(): void {
    shardCache = null;
    shardCacheInFlight = null;
    shardAssignmentCache = null;
    shardAssignmentInFlight = null;
    shardHealthState.clear();
    persistentShardHealthCache = null;
    persistentShardHealthInFlight = null;
}

export function clearCloudflareHostShardHealth(): void {
    shardHealthState.clear();
    persistentShardHealthCache = null;
    persistentShardHealthInFlight = null;
}

export async function resolveCloudflareHostShardPlan(
    input: ResolveCloudflareHostShardInput,
): Promise<CloudflareHostShardPlan> {
    const override = asNonEmptyString(input.cloudflareAccount);
    const warnings: string[] = [];
    const maxFallbacks = normalizeFallbackCount(input.maxFallbacks);
    const routingPolicy = resolveRoutingPolicy(input);

    let candidates: CloudflareShardCandidate[] = [];
    try {
        candidates = await loadShardCandidates();
    } catch {
        // Fallback to environment defaults when shard lookup is unavailable.
        candidates = [];
    }

    if (candidates.length > 0) {
        const persistentHealth = await loadPersistentShardHealth(candidates);
        applyPersistentShardHealth(persistentHealth);
    }

    let assignmentSnapshot = createEmptyShardAssignmentSnapshot();
    if (candidates.length > 0) {
        assignmentSnapshot = await loadShardAssignmentSnapshot(candidates);
    }

    if (override) {
        const matched = findOverrideCandidate(override, candidates);
        if (matched) {
            const primary = candidateToShard(matched, 'domain_override');
            if (shardIsCoolingDown(primary.shardKey, primary.cloudflare.accountId)) {
                primary.warnings.push(
                    `Cloudflare shard "${primary.shardKey}" is in temporary cooldown due recent rate-limit/error events; fallbacks are recommended.`,
                );
            }
            if (routingPolicy.routingRegion && primary.region !== routingPolicy.routingRegion) {
                primary.warnings.push(
                    `Domain requested region "${routingPolicy.routingRegion}", but override shard "${primary.shardKey}" is region "${primary.region ?? 'unknown'}".`,
                );
            }
            const fallbackCandidates = sortFallbackCandidates(
                input.domain,
                candidates.filter((candidate) => candidate.accountId !== matched.accountId),
                routingPolicy,
                warnings,
                assignmentSnapshot,
                input.domainNiche,
            );
            const fallbacks = dedupeShards(fallbackCandidates.map((candidate) => candidateToShard(candidate, 'hash_bucket')))
                .slice(0, maxFallbacks);
            primary.warnings.push(...warnings);
            return {
                primary,
                fallbacks,
                all: [primary, ...fallbacks],
            };
        }

        const domainReference = await resolveDomainReferenceOverride(override);
        if (domainReference) {
            if (routingPolicy.routingRegion) {
                domainReference.warnings.push(
                    `Domain routing region "${routingPolicy.routingRegion}" was bypassed because account override "${override}" was resolved directly.`,
                );
            }
            const fallbacks = dedupeShards(
                sortFallbackCandidates(
                    input.domain,
                    candidates
                        .filter((candidate) => candidate.accountId !== domainReference.cloudflare.accountId),
                    routingPolicy,
                    warnings,
                    assignmentSnapshot,
                    input.domainNiche,
                )
                    .map((candidate) => candidateToShard(candidate, 'hash_bucket')),
            ).slice(0, maxFallbacks);
            return {
                primary: domainReference,
                fallbacks,
                all: [domainReference, ...fallbacks],
            };
        }

        warnings.push(`Unable to resolve configured Cloudflare shard "${override}" for ${input.domain}; using default account routing.`);
    }

    if (candidates.length > 0) {
        const rankedCandidates = rankCandidatesForDomain(
            input.domain,
            candidates,
            routingPolicy,
            warnings,
            assignmentSnapshot,
            input.domainNiche,
        );
        const primaryCandidate = rankedCandidates[0]!;
        const primary = candidateToShard(primaryCandidate, 'hash_bucket');
        primary.warnings.push(...warnings);

        const fallbacks = dedupeShards(
            rankedCandidates
                .slice(1)
                .map((candidate) => candidateToShard(candidate, 'hash_bucket')),
        )
            .slice(0, maxFallbacks);

        return {
            primary,
            fallbacks,
            all: [primary, ...fallbacks],
        };
    }

    const primary: CloudflareHostShard = {
        shardKey: 'default',
        strategy: 'default',
        source: 'environment',
        cloudflare: {},
        warnings,
    };
    return {
        primary,
        fallbacks: [],
        all: [primary],
    };
}

export async function resolveCloudflareHostShard(
    input: ResolveCloudflareHostShardInput,
): Promise<CloudflareHostShard> {
    const plan = await resolveCloudflareHostShardPlan(input);
    return plan.primary;
}
