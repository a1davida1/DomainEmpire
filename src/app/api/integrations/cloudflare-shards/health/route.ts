import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getRequestUser, requireRole } from '@/lib/auth';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import { cloudflareShardHealth, db, integrationConnections } from '@/lib/db';
import {
    evaluateCloudflareShardSaturation,
    resolveCloudflareShardSaturationThresholds,
    summarizeCloudflareRegionSaturation,
} from '@/lib/integrations/cloudflare-shard-saturation';

const shardHealthLimiter = createRateLimiter('integration_cloudflare_shard_health_summary', {
    maxRequests: 90,
    windowMs: 60 * 1000,
});

const accountIdRegex = /^[a-f0-9]{32}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value.trim());
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function normalizeRegion(value: unknown): string | null {
    const parsed = asNonEmptyString(value);
    if (!parsed) return null;
    return parsed.toLowerCase().replace(/_/g, '-');
}

function normalizeKey(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

function resolveShardKey(row: {
    id: string;
    displayName: string | null;
    config: Record<string, unknown>;
}): string {
    return asNonEmptyString(row.config.shardKey)
        ?? asNonEmptyString(row.config.hostShardKey)
        ?? asNonEmptyString(row.displayName)
        ?? row.id;
}

function resolveAccountRef(config: Record<string, unknown>): string | null {
    return asNonEmptyString(config.accountId)
        ?? asNonEmptyString(config.accountRef)
        ?? asNonEmptyString(config.accountName);
}

function resolveShardWeight(config: Record<string, unknown>): number {
    const rawWeight = asFiniteNumber(config.shardWeight)
        ?? asFiniteNumber(config.capacityWeight)
        ?? asFiniteNumber(config.weight);
    if (!rawWeight || rawWeight <= 0) {
        return 100;
    }
    return Math.max(1, Math.min(Math.round(rawWeight), 1000));
}

type RegionFallbackPolicy = {
    sourceRegion: string;
    fallbackRegions: string[];
};

function parseRegionFallbacks(raw: string | undefined): RegionFallbackPolicy[] {
    if (!raw) return [];
    const parsed: RegionFallbackPolicy[] = [];
    const entries = raw.split(';');
    for (const entry of entries) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const separatorIndex = trimmed.indexOf('=');
        const altSeparatorIndex = trimmed.indexOf(':');
        const splitAt = separatorIndex >= 0 ? separatorIndex : altSeparatorIndex;
        if (splitAt < 0) continue;

        const sourceRegion = normalizeRegion(trimmed.slice(0, splitAt));
        const targetsRaw = trimmed.slice(splitAt + 1).trim();
        if (!sourceRegion || !targetsRaw) continue;
        const fallbackRegions = [...new Set(
            targetsRaw
                .split(',')
                .map((value) => normalizeRegion(value))
                .filter((value): value is string => Boolean(value) && value !== sourceRegion),
        )];
        if (fallbackRegions.length === 0) continue;
        parsed.push({ sourceRegion, fallbackRegions });
    }
    return parsed;
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const userId = getRequestUser(request).id.trim();
    if (!userId) {
        return NextResponse.json(
            { error: 'Missing authenticated user identity' },
            { status: 401 },
        );
    }

    const rate = shardHealthLimiter(`${userId}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many shard health requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const saturationThresholds = resolveCloudflareShardSaturationThresholds(process.env);

        const connections = await db
            .select({
                id: integrationConnections.id,
                displayName: integrationConnections.displayName,
                status: integrationConnections.status,
                config: integrationConnections.config,
                encryptedCredential: integrationConnections.encryptedCredential,
                updatedAt: integrationConnections.updatedAt,
            })
            .from(integrationConnections)
            .where(and(
                eq(integrationConnections.provider, 'cloudflare'),
                isNull(integrationConnections.domainId),
            ))
            .orderBy(desc(integrationConnections.updatedAt));

        const configRows = connections.map((row) => ({
            ...row,
            config: isRecord(row.config) ? row.config : {},
        }));
        const shardKeys = [...new Set(configRows.map((row) => resolveShardKey(row)))];
        const healthRows = shardKeys.length > 0
            ? await db
                .select({
                    shardKey: cloudflareShardHealth.shardKey,
                    accountId: cloudflareShardHealth.accountId,
                    penalty: cloudflareShardHealth.penalty,
                    cooldownUntil: cloudflareShardHealth.cooldownUntil,
                    successCount: cloudflareShardHealth.successCount,
                    rateLimitCount: cloudflareShardHealth.rateLimitCount,
                    failureCount: cloudflareShardHealth.failureCount,
                    lastOutcome: cloudflareShardHealth.lastOutcome,
                    lastOutcomeAt: cloudflareShardHealth.lastOutcomeAt,
                    updatedAt: cloudflareShardHealth.updatedAt,
                })
                .from(cloudflareShardHealth)
                .where(inArray(cloudflareShardHealth.shardKey, shardKeys))
            : [];

        const byShardAccount = new Map<string, typeof healthRows[number]>();
        const byShardLatest = new Map<string, typeof healthRows[number]>();
        for (const row of healthRows) {
            const shardKey = normalizeKey(row.shardKey);
            const accountId = normalizeKey(row.accountId);
            if (!shardKey || !accountId) continue;

            byShardAccount.set(`${shardKey}::${accountId}`, row);

            const current = byShardLatest.get(shardKey);
            const currentTime = current?.updatedAt instanceof Date ? current.updatedAt.getTime() : 0;
            const nextTime = row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0;
            if (!current || nextTime >= currentTime) {
                byShardLatest.set(shardKey, row);
            }
        }

        const nowMs = Date.now();
        const rows = configRows.map((connection) => {
            const shardKey = resolveShardKey(connection);
            const normalizedShardKey = normalizeKey(shardKey);
            const accountRef = resolveAccountRef(connection.config);
            const accountIdFromConfig = accountRef && accountIdRegex.test(accountRef)
                ? accountRef.toLowerCase()
                : null;
            const exactHealth = normalizedShardKey && accountIdFromConfig
                ? byShardAccount.get(`${normalizedShardKey}::${accountIdFromConfig}`)
                : null;
            const fallbackHealth = normalizedShardKey
                ? byShardLatest.get(normalizedShardKey)
                : null;
            const health = exactHealth ?? fallbackHealth ?? null;

            const cooldownUntil = health?.cooldownUntil ?? null;
            const cooldownRemainingSeconds = cooldownUntil instanceof Date
                ? Math.max(0, Math.ceil((cooldownUntil.getTime() - nowMs) / 1000))
                : 0;
            const saturation = evaluateCloudflareShardSaturation({
                region: normalizeRegion(connection.config.region)
                    ?? normalizeRegion(connection.config.routingRegion)
                    ?? normalizeRegion(connection.config.shardRegion),
                penalty: health?.penalty ?? 0,
                cooldownRemainingSeconds,
                successCount: health?.successCount ?? 0,
                rateLimitCount: health?.rateLimitCount ?? 0,
                failureCount: health?.failureCount ?? 0,
            }, saturationThresholds);

            return {
                connectionId: connection.id,
                shardKey,
                displayName: connection.displayName,
                connectionStatus: connection.status,
                hasCredential: Boolean(connection.encryptedCredential),
                accountRef,
                accountId: health?.accountId ?? accountIdFromConfig,
                region: saturation.region,
                baseWeight: resolveShardWeight(connection.config),
                penalty: saturation.penalty,
                cooldownUntil: cooldownUntil ? cooldownUntil.toISOString() : null,
                cooldownRemainingSeconds,
                successCount: saturation.successCount,
                rateLimitCount: saturation.rateLimitCount,
                failureCount: saturation.failureCount,
                observedCount: saturation.observedCount,
                instabilityRatio: saturation.instabilityRatio,
                saturationSeverity: saturation.saturationSeverity,
                lastOutcome: health?.lastOutcome ?? null,
                lastOutcomeAt: health?.lastOutcomeAt ? health.lastOutcomeAt.toISOString() : null,
                healthUpdatedAt: health?.updatedAt ? health.updatedAt.toISOString() : null,
                connectionUpdatedAt: connection.updatedAt ? connection.updatedAt.toISOString() : null,
            };
        });

        const connectionCount = rows.length;
        const coolingCount = rows.filter((row) => row.cooldownRemainingSeconds > 0).length;
        const totalPenalty = rows.reduce((sum, row) => sum + row.penalty, 0);
        const warningShards = rows.filter((row) => row.saturationSeverity === 'warning').length;
        const criticalShards = rows.filter((row) => row.saturationSeverity === 'critical').length;
        const regionSaturationSummary = summarizeCloudflareRegionSaturation({
            rows: rows.map((row) => ({
                region: row.region,
                penalty: row.penalty,
                cooldownRemainingSeconds: row.cooldownRemainingSeconds,
                instabilityRatio: row.instabilityRatio,
                saturationSeverity: row.saturationSeverity,
            })),
            thresholds: saturationThresholds,
        });
        const regionSaturation = regionSaturationSummary.rows;
        const warningRegions = regionSaturationSummary.warningRegions;
        const criticalRegions = regionSaturationSummary.criticalRegions;

        return NextResponse.json(
            {
                summary: {
                    connectionCount,
                    coolingCount,
                    avgPenalty: connectionCount > 0
                        ? Number((totalPenalty / connectionCount).toFixed(2))
                        : 0,
                    totalSuccessCount: rows.reduce((sum, row) => sum + row.successCount, 0),
                    totalRateLimitCount: rows.reduce((sum, row) => sum + row.rateLimitCount, 0),
                    totalFailureCount: rows.reduce((sum, row) => sum + row.failureCount, 0),
                    saturation: {
                        warningShards,
                        criticalShards,
                        warningRegions,
                        criticalRegions,
                        thresholds: saturationThresholds,
                    },
                },
                routingPolicy: {
                    defaultRegion: normalizeRegion(process.env.CLOUDFLARE_SHARD_DEFAULT_REGION) ?? null,
                    strictRegion: process.env.CLOUDFLARE_SHARD_STRICT_REGION === 'true',
                    globalFallbackRegions: [...new Set(
                        (process.env.CLOUDFLARE_SHARD_FALLBACK_REGIONS || '')
                            .split(',')
                            .map((value) => normalizeRegion(value))
                            .filter((value): value is string => Boolean(value)),
                    )],
                    regionFallbacks: parseRegionFallbacks(process.env.CLOUDFLARE_SHARD_REGION_FALLBACKS),
                },
                regionSaturation,
                rows,
                generatedAt: new Date().toISOString(),
            },
            { headers: rate.headers },
        );
    } catch (error) {
        console.error('Failed to load Cloudflare shard health summary:', error);
        return NextResponse.json(
            { error: 'Failed to load Cloudflare shard health summary' },
            { status: 500, headers: rate.headers },
        );
    }
}
