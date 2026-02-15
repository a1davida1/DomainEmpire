import { and, desc, inArray } from 'drizzle-orm';
import { db, integrationConnections } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

type ConnectionStatus = 'pending' | 'connected' | 'error' | 'disabled';
type LastSyncStatus = 'never' | 'success' | 'failed' | 'partial';

export type IntegrationHealthSeverity = 'healthy' | 'warning' | 'critical';

export type IntegrationHealthConfig = {
    enabled: boolean;
    staleWarningHours: number;
    staleCriticalHours: number;
    neverSyncedGraceHours: number;
    maxConnections: number;
    topIssueLimit: number;
    maxAlertsPerSweep: number;
};

export type IntegrationConnectionHealth = {
    connectionId: string;
    userId: string;
    domainId: string | null;
    provider: string;
    category: string;
    status: ConnectionStatus;
    hasCredential: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: LastSyncStatus;
    syncAgeHours: number | null;
    severity: IntegrationHealthSeverity;
    reasons: string[];
};

export type IntegrationHealthSummary = {
    enabled: boolean;
    scanned: number;
    healthy: number;
    warning: number;
    critical: number;
    staleWarningHours: number;
    staleCriticalHours: number;
    topIssues: IntegrationConnectionHealth[];
};

export type IntegrationHealthSweepSummary = IntegrationHealthSummary & {
    alertsCreated: number;
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    if (raw.toLowerCase() === 'true') return true;
    if (raw.toLowerCase() === 'false') return false;
    return fallback;
}

function parseIntBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function toIso(value: Date | null | undefined): string | null {
    if (!value || Number.isNaN(value.getTime())) return null;
    return value.toISOString();
}

function hoursSince(now: Date, then: Date | null | undefined): number | null {
    if (!then || Number.isNaN(then.getTime())) return null;
    return Math.max(0, (now.getTime() - then.getTime()) / (60 * 60 * 1000));
}

function rankSeverity(severity: IntegrationHealthSeverity): number {
    if (severity === 'critical') return 2;
    if (severity === 'warning') return 1;
    return 0;
}

export function resolveIntegrationHealthConfig(
    env: Record<string, string | undefined> = process.env,
): IntegrationHealthConfig {
    const staleWarningHours = parseIntBounded(env.INTEGRATION_HEALTH_STALE_WARNING_HOURS, 24, 1, 24 * 30);
    const staleCriticalHours = parseIntBounded(env.INTEGRATION_HEALTH_STALE_CRITICAL_HOURS, 72, staleWarningHours, 24 * 90);

    return {
        enabled: parseBool(env.INTEGRATION_HEALTH_SWEEP_ENABLED, false),
        staleWarningHours,
        staleCriticalHours,
        neverSyncedGraceHours: parseIntBounded(env.INTEGRATION_HEALTH_NEVER_SYNCED_GRACE_HOURS, 24, 1, 24 * 30),
        maxConnections: parseIntBounded(env.INTEGRATION_HEALTH_MAX_CONNECTIONS, 1000, 1, 10000),
        topIssueLimit: parseIntBounded(env.INTEGRATION_HEALTH_TOP_ISSUE_LIMIT, 50, 1, 500),
        maxAlertsPerSweep: parseIntBounded(env.INTEGRATION_HEALTH_MAX_ALERTS_PER_SWEEP, 25, 1, 500),
    };
}

export function assessIntegrationConnectionHealth(input: {
    status: ConnectionStatus;
    hasCredential: boolean;
    createdAt: Date | null;
    lastSyncAt: Date | null;
    lastSyncStatus: LastSyncStatus;
    now: Date;
    config: Pick<IntegrationHealthConfig, 'staleWarningHours' | 'staleCriticalHours' | 'neverSyncedGraceHours'>;
}): {
    severity: IntegrationHealthSeverity;
    reasons: string[];
    syncAgeHours: number | null;
} {
    const reasons: string[] = [];
    const syncAgeHours = hoursSince(input.now, input.lastSyncAt);
    let severity: IntegrationHealthSeverity = 'healthy';

    if (!input.hasCredential && input.status !== 'disabled') {
        reasons.push('missing_credential');
        severity = 'warning';
    }

    if (input.status === 'error') {
        reasons.push('connection_status_error');
        severity = 'critical';
    }

    if (input.lastSyncStatus === 'failed' && input.status !== 'disabled') {
        reasons.push('last_sync_failed');
        if (severity !== 'critical') {
            severity = 'warning';
        }
    }

    if (input.lastSyncAt) {
        if (syncAgeHours !== null && syncAgeHours >= input.config.staleCriticalHours) {
            reasons.push('sync_stale_critical');
            severity = 'critical';
        } else if (syncAgeHours !== null && syncAgeHours >= input.config.staleWarningHours) {
            reasons.push('sync_stale_warning');
            if (severity !== 'critical') {
                severity = 'warning';
            }
        }
    } else if (input.status !== 'disabled') {
        const createdAgeHours = hoursSince(input.now, input.createdAt);
        if (createdAgeHours !== null && createdAgeHours >= input.config.neverSyncedGraceHours) {
            reasons.push('never_synced');
            if (severity !== 'critical') {
                severity = 'warning';
            }
        }
    }

    return {
        severity,
        reasons,
        syncAgeHours,
    };
}

function mergeConfig(base: IntegrationHealthConfig, override: Partial<IntegrationHealthConfig>): IntegrationHealthConfig {
    return {
        ...base,
        ...override,
    };
}

export async function getIntegrationHealthSummary(
    input: Partial<IntegrationHealthConfig> = {},
): Promise<IntegrationHealthSummary> {
    const config = mergeConfig(resolveIntegrationHealthConfig(), input);
    const now = new Date();

    const rows = await db.select({
        id: integrationConnections.id,
        userId: integrationConnections.userId,
        domainId: integrationConnections.domainId,
        provider: integrationConnections.provider,
        category: integrationConnections.category,
        status: integrationConnections.status,
        encryptedCredential: integrationConnections.encryptedCredential,
        lastSyncAt: integrationConnections.lastSyncAt,
        lastSyncStatus: integrationConnections.lastSyncStatus,
        createdAt: integrationConnections.createdAt,
        updatedAt: integrationConnections.updatedAt,
    })
        .from(integrationConnections)
        .where(and(
            inArray(integrationConnections.status, ['pending', 'connected', 'error', 'disabled']),
        ))
        .orderBy(desc(integrationConnections.updatedAt))
        .limit(config.maxConnections);

    const healthRows: IntegrationConnectionHealth[] = rows.map((row) => {
        const assessment = assessIntegrationConnectionHealth({
            status: row.status as ConnectionStatus,
            hasCredential: Boolean(row.encryptedCredential),
            createdAt: row.createdAt,
            lastSyncAt: row.lastSyncAt,
            lastSyncStatus: row.lastSyncStatus as LastSyncStatus,
            now,
            config,
        });

        return {
            connectionId: row.id,
            userId: row.userId,
            domainId: row.domainId,
            provider: row.provider,
            category: row.category,
            status: row.status as ConnectionStatus,
            hasCredential: Boolean(row.encryptedCredential),
            lastSyncAt: toIso(row.lastSyncAt),
            lastSyncStatus: row.lastSyncStatus as LastSyncStatus,
            syncAgeHours: assessment.syncAgeHours,
            severity: assessment.severity,
            reasons: assessment.reasons,
        };
    });

    const summary = {
        enabled: config.enabled,
        scanned: healthRows.length,
        healthy: healthRows.filter((row) => row.severity === 'healthy').length,
        warning: healthRows.filter((row) => row.severity === 'warning').length,
        critical: healthRows.filter((row) => row.severity === 'critical').length,
        staleWarningHours: config.staleWarningHours,
        staleCriticalHours: config.staleCriticalHours,
        topIssues: healthRows
            .filter((row) => row.severity !== 'healthy')
            .sort((left, right) => {
                const severityDelta = rankSeverity(right.severity) - rankSeverity(left.severity);
                if (severityDelta !== 0) return severityDelta;
                const rightAge = right.syncAgeHours ?? -1;
                const leftAge = left.syncAgeHours ?? -1;
                return rightAge - leftAge;
            })
            .slice(0, config.topIssueLimit),
    };

    return summary;
}

export async function runIntegrationHealthSweep(input: {
    force?: boolean;
    notify?: boolean;
} & Partial<IntegrationHealthConfig> = {}): Promise<IntegrationHealthSweepSummary> {
    const config = mergeConfig(resolveIntegrationHealthConfig(), input);
    if (!config.enabled && !input.force) {
        return {
            enabled: false,
            scanned: 0,
            healthy: 0,
            warning: 0,
            critical: 0,
            staleWarningHours: config.staleWarningHours,
            staleCriticalHours: config.staleCriticalHours,
            topIssues: [],
            alertsCreated: 0,
        };
    }

    const summary = await getIntegrationHealthSummary(config);
    let alertsCreated = 0;
    const emittedDedupKeys = new Set<string>();

    const shouldNotify = input.notify ?? true;
    if (shouldNotify) {
        for (const row of summary.topIssues.slice(0, config.maxAlertsPerSweep)) {
            const deduplicationKey = [
                row.connectionId,
                row.provider,
                row.category,
                [...row.reasons].sort().join('|'),
            ].join(':');
            if (emittedDedupKeys.has(deduplicationKey)) {
                continue;
            }
            emittedDedupKeys.add(deduplicationKey);

            try {
                await createNotification({
                    type: 'info',
                    severity: row.severity === 'critical' ? 'critical' : 'warning',
                    domainId: row.domainId ?? undefined,
                    title: `Integration health ${row.severity}: ${row.provider}`,
                    message: `Connection ${row.connectionId} flagged for ${row.reasons.join(', ')}.`,
                    actionUrl: '/dashboard/integrations',
                    metadata: {
                        source: 'integration_health_sweep',
                        deduplicationKey,
                        connectionId: row.connectionId,
                        provider: row.provider,
                        category: row.category,
                        status: row.status,
                        lastSyncStatus: row.lastSyncStatus,
                        lastSyncAt: row.lastSyncAt,
                        syncAgeHours: row.syncAgeHours,
                        reasons: row.reasons,
                    },
                });
                alertsCreated += 1;
            } catch (error) {
                console.error('Failed to create integration health notification', {
                    connectionId: row.connectionId,
                    provider: row.provider,
                    error,
                });
            }
        }
    }

    return {
        ...summary,
        enabled: true,
        alertsCreated,
    };
}
