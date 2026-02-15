import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, contentQueue, integrationConnections, integrationSyncRuns } from '@/lib/db';
import { enqueueContentJob } from '@/lib/queue/content-queue';
import { SCHEDULED_SYNC_PROVIDERS, getIntegrationProviderDefinition } from '@/lib/integrations/catalog';

const DEFAULT_SYNC_INTERVAL_MINUTES = 24 * 60;
const DEFAULT_LOOKBACK_DAYS = 30;
const MIN_SYNC_INTERVAL_MINUTES = 15;
const MAX_SYNC_INTERVAL_MINUTES = 7 * 24 * 60;
const MIN_LOOKBACK_DAYS = 1;
const MAX_LOOKBACK_DAYS = 365;
const DEFAULT_SCHEDULER_LIMIT = 200;

type RawConnectionConfig = Record<string, unknown>;
type ConnectionStatus = 'pending' | 'connected' | 'error' | 'disabled';

type SchedulerPolicy = {
    autoSyncEnabled: boolean;
    syncIntervalMinutes: number;
    syncLookbackDays: number;
    nextSyncAt: Date | null;
};

export type IntegrationSyncScheduleSummary = {
    consideredConnections: number;
    queuedJobs: number;
    alreadyQueued: number;
    runningSyncs: number;
    skippedDisabled: number;
    skippedNotDue: number;
    skippedInvalidConfig: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalBoolean(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return null;
}

function toOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function toOptionalDate(value: unknown): Date | null {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (Number.isFinite(parsed.getTime())) return parsed;
    }
    return null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function resolvePolicyFromConfig(
    provider: string,
    rawConfig: unknown,
): SchedulerPolicy | null {
    const providerDefinition = getIntegrationProviderDefinition(provider);
    if (!providerDefinition || !providerDefinition.executableSync || !providerDefinition.supportsScheduledSync) {
        return null;
    }

    const fallbackInterval = providerDefinition.defaultSyncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES;
    const fallbackLookback = providerDefinition.defaultLookbackDays ?? DEFAULT_LOOKBACK_DAYS;

    const config: RawConnectionConfig = isPlainObject(rawConfig) ? rawConfig : {};
    const syncConfig = isPlainObject(config.sync) ? config.sync : {};

    const enabledValue = toOptionalBoolean(config.autoSyncEnabled) ?? toOptionalBoolean(syncConfig.enabled);
    const autoSyncEnabled = enabledValue ?? true;

    const intervalHoursRoot = toOptionalNumber(config.syncIntervalHours);
    const intervalHoursNested = toOptionalNumber(syncConfig.intervalHours);

    const intervalMinutes =
        toOptionalNumber(config.syncIntervalMinutes)
        ?? toOptionalNumber(syncConfig.intervalMinutes)
        ?? (intervalHoursRoot !== null
            ? intervalHoursRoot * 60
            : null)
        ?? (intervalHoursNested !== null
            ? intervalHoursNested * 60
            : null)
        ?? fallbackInterval;

    const syncLookbackDays =
        toOptionalNumber(config.syncLookbackDays)
        ?? toOptionalNumber(syncConfig.lookbackDays)
        ?? fallbackLookback;

    const nextSyncAt = toOptionalDate(config.nextSyncAt)
        ?? toOptionalDate(syncConfig.nextSyncAt)
        ?? toOptionalDate(syncConfig.nextRunAt);

    if (!Number.isFinite(intervalMinutes) || !Number.isFinite(syncLookbackDays)) {
        return null;
    }

    return {
        autoSyncEnabled,
        syncIntervalMinutes: Math.round(clamp(intervalMinutes, MIN_SYNC_INTERVAL_MINUTES, MAX_SYNC_INTERVAL_MINUTES)),
        syncLookbackDays: Math.round(clamp(syncLookbackDays, MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS)),
        nextSyncAt,
    };
}

function resolveNextRunAt(
    policy: SchedulerPolicy,
    connection: { lastSyncAt: Date | null; createdAt: Date | null },
): Date {
    if (policy.nextSyncAt) {
        return policy.nextSyncAt;
    }

    if (connection.lastSyncAt) {
        return new Date(connection.lastSyncAt.getTime() + policy.syncIntervalMinutes * 60_000);
    }

    return connection.createdAt ?? new Date(0);
}

async function hasPendingOrProcessingJob(connectionId: string): Promise<boolean> {
    const existing = await db
        .select({ id: contentQueue.id })
        .from(contentQueue)
        .where(and(
            eq(contentQueue.jobType, 'run_integration_connection_sync'),
            inArray(contentQueue.status, ['pending', 'processing']),
            sql`${contentQueue.payload} ->> 'connectionId' = ${connectionId}`,
        ))
        .limit(1);

    return existing.length > 0;
}

async function hasRunningSync(connectionId: string): Promise<boolean> {
    const running = await db
        .select({ id: integrationSyncRuns.id })
        .from(integrationSyncRuns)
        .where(and(
            eq(integrationSyncRuns.connectionId, connectionId),
            eq(integrationSyncRuns.status, 'running'),
        ))
        .limit(1);

    return running.length > 0;
}

export async function scheduleIntegrationConnectionSyncJobs(
    limit = DEFAULT_SCHEDULER_LIMIT,
): Promise<IntegrationSyncScheduleSummary> {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 1_000));
    const schedulableStatuses: ConnectionStatus[] = ['pending', 'connected', 'error'];
    const scheduledProviders = SCHEDULED_SYNC_PROVIDERS as Array<typeof integrationConnections.$inferSelect.provider>;

    if (SCHEDULED_SYNC_PROVIDERS.length === 0) {
        return {
            consideredConnections: 0,
            queuedJobs: 0,
            alreadyQueued: 0,
            runningSyncs: 0,
            skippedDisabled: 0,
            skippedNotDue: 0,
            skippedInvalidConfig: 0,
        };
    }

    const rows = await db
        .select({
            id: integrationConnections.id,
            userId: integrationConnections.userId,
            provider: integrationConnections.provider,
            status: integrationConnections.status,
            config: integrationConnections.config,
            lastSyncAt: integrationConnections.lastSyncAt,
            createdAt: integrationConnections.createdAt,
        })
        .from(integrationConnections)
        .where(and(
            inArray(integrationConnections.provider, scheduledProviders),
            inArray(integrationConnections.status, schedulableStatuses),
        ))
        .limit(boundedLimit);

    let queuedJobs = 0;
    let alreadyQueued = 0;
    let runningSyncs = 0;
    let skippedDisabled = 0;
    let skippedNotDue = 0;
    let skippedInvalidConfig = 0;
    const now = new Date();

    for (const connection of rows) {
        const policy = resolvePolicyFromConfig(connection.provider, connection.config);
        if (!policy) {
            skippedInvalidConfig += 1;
            continue;
        }

        if (!policy.autoSyncEnabled) {
            skippedDisabled += 1;
            continue;
        }

        const nextRunAt = resolveNextRunAt(policy, connection);
        if (nextRunAt.getTime() > now.getTime()) {
            skippedNotDue += 1;
            continue;
        }

        if (await hasPendingOrProcessingJob(connection.id)) {
            alreadyQueued += 1;
            continue;
        }

        if (await hasRunningSync(connection.id)) {
            runningSyncs += 1;
            continue;
        }

        await enqueueContentJob({
            jobType: 'run_integration_connection_sync',
            status: 'pending',
            priority: connection.status === 'error' ? 3 : 1,
            payload: {
                connectionId: connection.id,
                actorUserId: connection.userId,
                actorRole: 'admin',
                runType: 'scheduled',
                days: policy.syncLookbackDays,
                source: 'hourly_scheduler',
            },
        });

        queuedJobs += 1;
    }

    return {
        consideredConnections: rows.length,
        queuedJobs,
        alreadyQueued,
        runningSyncs,
        skippedDisabled,
        skippedNotDue,
        skippedInvalidConfig,
    };
}
