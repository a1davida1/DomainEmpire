import { and, eq } from 'drizzle-orm';
import {
    db,
    domainOwnershipEvents,
    domainRegistrarProfiles,
    domains,
    integrationConnections,
    integrationSyncRuns,
    revenueSnapshots,
} from '@/lib/db';
import { syncRenewalDates } from '@/lib/domain/renewals';
import {
    computeRegistrarExpirationRisk,
    isRegistrarTransferStatus,
} from '@/lib/domain/registrar-operations';
import { getDomainAnalytics } from '@/lib/analytics/cloudflare';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';

type ActorContext = {
    userId: string;
    role: string;
};

type RunType = 'manual' | 'scheduled' | 'webhook';
type RunStatus = 'running' | 'success' | 'failed' | 'partial';

type SyncResult = {
    status: Exclude<RunStatus, 'running'>;
    recordsProcessed: number;
    recordsUpserted: number;
    recordsFailed: number;
    details: Record<string, unknown>;
    errorMessage?: string;
};

type ExecuteOptions = {
    runType?: RunType;
    days?: number;
};

function toSyncStatusForConnection(status: Exclude<RunStatus, 'running'>): 'success' | 'failed' | 'partial' {
    if (status === 'success') return 'success';
    if (status === 'failed') return 'failed';
    return 'partial';
}

function normalizeStartOfDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

async function executeRegistrarRenewalSync(
    connection: { id: string; provider: string; domainId: string | null },
): Promise<SyncResult> {
    const updated = await syncRenewalDates(connection.domainId ?? undefined);
    const now = new Date();
    let riskSnapshot: Record<string, unknown> | null = null;

    if (connection.domainId) {
        const [domainRow] = await db.select({
            id: domains.id,
            renewalDate: domains.renewalDate,
            profileId: domainRegistrarProfiles.id,
            autoRenewEnabled: domainRegistrarProfiles.autoRenewEnabled,
            transferStatus: domainRegistrarProfiles.transferStatus,
            expirationRisk: domainRegistrarProfiles.expirationRisk,
            expirationRiskScore: domainRegistrarProfiles.expirationRiskScore,
            metadata: domainRegistrarProfiles.metadata,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(eq(domains.id, connection.domainId))
            .limit(1);

        if (domainRow) {
            const resolvedTransferStatus = isRegistrarTransferStatus(domainRow.transferStatus)
                ? domainRow.transferStatus
                : 'none';
            const risk = computeRegistrarExpirationRisk({
                renewalDate: domainRow.renewalDate,
                autoRenewEnabled: domainRow.autoRenewEnabled !== false,
                transferStatus: resolvedTransferStatus,
                now,
            });

            const [profile] = await db.insert(domainRegistrarProfiles)
                .values({
                    domainId: connection.domainId,
                    connectionId: connection.id,
                    autoRenewEnabled: domainRow.autoRenewEnabled !== false,
                    transferStatus: resolvedTransferStatus,
                    expirationRisk: risk.risk,
                    expirationRiskScore: risk.riskScore,
                    expirationRiskUpdatedAt: now,
                    lastSyncedAt: now,
                    metadata: domainRow.metadata ?? {},
                    createdAt: now,
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: domainRegistrarProfiles.domainId,
                    set: {
                        connectionId: connection.id,
                        expirationRisk: risk.risk,
                        expirationRiskScore: risk.riskScore,
                        expirationRiskUpdatedAt: now,
                        lastSyncedAt: now,
                        updatedAt: now,
                    },
                })
                .returning({
                    id: domainRegistrarProfiles.id,
                    expirationRisk: domainRegistrarProfiles.expirationRisk,
                    expirationRiskScore: domainRegistrarProfiles.expirationRiskScore,
                });

            if (
                profile
                && (
                    !domainRow.profileId
                    || domainRow.expirationRisk !== risk.risk
                    || Number(domainRow.expirationRiskScore ?? 0) !== risk.riskScore
                )
            ) {
                await db.insert(domainOwnershipEvents).values({
                    domainId: connection.domainId,
                    profileId: profile.id,
                    actorId: null,
                    eventType: 'risk_recomputed',
                    source: 'integration_sync',
                    summary: `Renewal risk synced as ${risk.risk} (${risk.riskScore})`,
                    previousState: {
                        expirationRisk: domainRow.expirationRisk ?? 'unknown',
                        expirationRiskScore: Number(domainRow.expirationRiskScore ?? 0),
                    },
                    nextState: {
                        expirationRisk: risk.risk,
                        expirationRiskScore: risk.riskScore,
                        renewalWindow: risk.renewalWindow,
                        daysUntilRenewal: risk.daysUntilRenewal,
                    },
                    metadata: {
                        provider: connection.provider,
                        recommendation: risk.recommendation,
                    },
                    createdAt: now,
                });
            }

            riskSnapshot = {
                risk: risk.risk,
                riskScore: risk.riskScore,
                renewalWindow: risk.renewalWindow,
                daysUntilRenewal: risk.daysUntilRenewal,
            };
        }
    }

    return {
        status: 'success',
        recordsProcessed: updated,
        recordsUpserted: updated,
        recordsFailed: 0,
        details: {
            provider: connection.provider,
            scope: connection.domainId ? 'domain' : 'portfolio',
            updatedDomains: updated,
            ...(riskSnapshot ? { riskSnapshot } : {}),
        },
    };
}

async function executeCloudflareAnalyticsSync(
    connection: { domainId: string | null; domainName: string | null },
    days: number,
): Promise<SyncResult> {
    if (!connection.domainId || !connection.domainName) {
        return {
            status: 'failed',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed: 0,
            errorMessage: 'Cloudflare analytics sync requires a domain-scoped connection',
            details: {},
        };
    }

    const analytics = await getDomainAnalytics(connection.domainName, days);
    if (analytics.length === 0) {
        return {
            status: 'failed',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed: 0,
            errorMessage: 'No Cloudflare analytics data available',
            details: { domain: connection.domainName, days },
        };
    }

    let upserted = 0;
    for (const row of analytics) {
        const snapshotDate = normalizeStartOfDay(new Date(row.date));
        await db.insert(revenueSnapshots).values({
            domainId: connection.domainId,
            snapshotDate,
            pageviews: row.views,
            uniqueVisitors: row.visitors,
        }).onConflictDoUpdate({
            target: [revenueSnapshots.domainId, revenueSnapshots.snapshotDate],
            set: {
                pageviews: row.views,
                uniqueVisitors: row.visitors,
            },
        });
        upserted += 1;
    }

    return {
        status: 'success',
        recordsProcessed: analytics.length,
        recordsUpserted: upserted,
        recordsFailed: 0,
        details: {
            domain: connection.domainName,
            days,
            firstDate: analytics[0]?.date ?? null,
            lastDate: analytics[analytics.length - 1]?.date ?? null,
        },
    };
}

async function executeSearchConsoleSync(
    connection: { domainId: string | null; domainName: string | null },
    days: number,
): Promise<SyncResult> {
    if (!connection.domainId || !connection.domainName) {
        return {
            status: 'failed',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed: 0,
            errorMessage: 'Search Console sync requires a domain-scoped connection',
            details: {},
        };
    }

    const summary = await getDomainGSCSummary(connection.domainName, days);
    if (!summary) {
        return {
            status: 'failed',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed: 0,
            errorMessage: 'Search Console not configured or no data available',
            details: { domain: connection.domainName, days },
        };
    }

    const snapshotDate = normalizeStartOfDay(new Date());
    await db.insert(revenueSnapshots).values({
        domainId: connection.domainId,
        snapshotDate,
        impressions: summary.totalImpressions,
        clicks: summary.totalClicks,
        ctr: summary.avgCtr.toString(),
        avgPosition: summary.avgPosition.toString(),
    }).onConflictDoUpdate({
        target: [revenueSnapshots.domainId, revenueSnapshots.snapshotDate],
        set: {
            impressions: summary.totalImpressions,
            clicks: summary.totalClicks,
            ctr: summary.avgCtr.toString(),
            avgPosition: summary.avgPosition.toString(),
        },
    });

    return {
        status: 'success',
        recordsProcessed: 1,
        recordsUpserted: 1,
        recordsFailed: 0,
        details: {
            domain: connection.domainName,
            days,
            totalClicks: summary.totalClicks,
            totalImpressions: summary.totalImpressions,
            avgCtr: summary.avgCtr,
            avgPosition: summary.avgPosition,
            topQueriesCount: summary.topQueries.length,
            topPagesCount: summary.topPages.length,
        },
    };
}

async function executeProviderSync(
    provider: string,
    connection: { id: string; provider: string; domainId: string | null; domainName: string | null },
    days: number,
): Promise<SyncResult> {
    switch (provider) {
        case 'godaddy':
        case 'namecheap':
            return executeRegistrarRenewalSync(connection);
        case 'cloudflare':
            return executeCloudflareAnalyticsSync(connection, days);
        case 'google_search_console':
            return executeSearchConsoleSync(connection, days);
        default:
            return {
                status: 'failed',
                recordsProcessed: 0,
                recordsUpserted: 0,
                recordsFailed: 0,
                errorMessage: `Provider "${provider}" is not wired for executable sync yet`,
                details: { provider },
            };
    }
}

export async function runIntegrationConnectionSync(
    connectionId: string,
    actor: ActorContext,
    options: ExecuteOptions = {},
) {
    const runType = options.runType ?? 'manual';
    const days = Math.max(1, Math.min(options.days ?? 30, 365));

    const connectionRows = await db
        .select({
            id: integrationConnections.id,
            userId: integrationConnections.userId,
            provider: integrationConnections.provider,
            status: integrationConnections.status,
            domainId: integrationConnections.domainId,
            domainName: domains.domain,
        })
        .from(integrationConnections)
        .leftJoin(domains, eq(integrationConnections.domainId, domains.id))
        .where(eq(integrationConnections.id, connectionId))
        .limit(1);

    if (connectionRows.length === 0) {
        return { error: 'not_found' as const };
    }

    const connection = connectionRows[0];
    if (actor.role !== 'admin' && connection.userId !== actor.userId) {
        return { error: 'forbidden' as const };
    }

    const [runStart] = await db.insert(integrationSyncRuns).values({
        connectionId: connection.id,
        runType,
        status: 'running',
        triggeredBy: actor.userId,
        details: {
            provider: connection.provider,
            days,
        },
    }).returning({ id: integrationSyncRuns.id });

    try {
        const result = await executeProviderSync(connection.provider, connection, days);
        const completedAt = new Date();

        const [updatedRun] = await db.update(integrationSyncRuns)
            .set({
                status: result.status,
                completedAt,
                recordsProcessed: result.recordsProcessed,
                recordsUpserted: result.recordsUpserted,
                recordsFailed: result.recordsFailed,
                errorMessage: result.errorMessage ?? null,
                details: result.details,
            })
            .where(eq(integrationSyncRuns.id, runStart.id))
            .returning();

        await db.update(integrationConnections).set({
            status: result.status === 'success'
                ? (connection.status === 'disabled' ? 'disabled' : 'connected')
                : 'error',
            lastSyncAt: completedAt,
            lastSyncStatus: toSyncStatusForConnection(result.status),
            lastSyncError: result.errorMessage ?? null,
            updatedAt: new Date(),
        }).where(and(eq(integrationConnections.id, connection.id), eq(integrationConnections.userId, connection.userId)));

        return { run: updatedRun, connection };
    } catch (error) {
        const completedAt = new Date();
        const message = error instanceof Error ? error.message : 'Unknown sync error';

        const [failedRun] = await db.update(integrationSyncRuns)
            .set({
                status: 'failed',
                completedAt,
                errorMessage: message,
                details: {
                    provider: connection.provider,
                    days,
                },
            })
            .where(eq(integrationSyncRuns.id, runStart.id))
            .returning();

        await db.update(integrationConnections).set({
            status: 'error',
            lastSyncAt: completedAt,
            lastSyncStatus: 'failed',
            lastSyncError: message,
            updatedAt: new Date(),
        }).where(and(eq(integrationConnections.id, connection.id), eq(integrationConnections.userId, connection.userId)));

        return { run: failedRun, connection };
    }
}
