import { and, eq, inArray, sql } from 'drizzle-orm';
import {
    db,
    domainFinanceLedgerEntries,
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
    isRegistrarDnssecStatus,
    isRegistrarLockStatus,
    isRegistrarOwnershipStatus,
    isRegistrarTransferStatus,
} from '@/lib/domain/registrar-operations';
import { getCloudflareApiRateLimitCooldown, getDomainAnalyticsTyped } from '@/lib/analytics/cloudflare';
import { getDomainGSCSummary } from '@/lib/analytics/search-console';
import { getGoDaddyRegistrarSignals } from '@/lib/deploy/godaddy';

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

type RevenueSourceType = 'affiliate' | 'parking' | 'lead_gen' | 'ad';

type RevenueSyncRecord = {
    domainId: string;
    snapshotDate: Date;
    amount: number;
    sourceType: RevenueSourceType;
    currency: string;
    clicks: number;
    impressions: number;
    sourceRef: string;
    metadata: Record<string, unknown>;
};

type RevenueSnapshotAggregate = {
    domainId: string;
    snapshotDate: Date;
    adRevenue: number;
    affiliateRevenue: number;
    leadGenRevenue: number;
    totalRevenue: number;
    clicks: number;
    impressions: number;
};

function toSyncStatusForConnection(status: Exclude<RunStatus, 'running'>): 'success' | 'failed' | 'partial' {
    if (status === 'success') return 'success';
    if (status === 'failed') return 'failed';
    return 'partial';
}

function normalizeStartOfDay(value: Date): Date {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function asInteger(value: unknown, fallback = 0): number {
    const parsed = asNumber(value);
    if (parsed === null) return fallback;
    return Math.max(0, Math.trunc(parsed));
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeSnapshotDate(raw: unknown): Date | null {
    if (typeof raw !== 'string' && typeof raw !== 'number' && !(raw instanceof Date)) {
        return null;
    }
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
        return new Date(`${raw.trim()}T00:00:00.000Z`);
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return normalizeStartOfDay(parsed);
}

function defaultRevenueSourceTypeForProvider(provider: string): RevenueSourceType {
    if (provider === 'impact' || provider === 'cj' || provider === 'awin' || provider === 'rakuten') {
        return 'affiliate';
    }
    if (provider === 'sedo' || provider === 'bodis') {
        return 'parking';
    }
    return 'ad';
}

function normalizeRevenueSourceType(raw: unknown, provider: string): RevenueSourceType {
    const value = asString(raw)?.toLowerCase();
    if (value === 'affiliate' || value === 'parking' || value === 'lead_gen' || value === 'ad') {
        return value;
    }
    return defaultRevenueSourceTypeForProvider(provider);
}

function aggregateSnapshotKey(domainId: string, snapshotDate: Date): string {
    return `${domainId}:${snapshotDate.toISOString().slice(0, 10)}`;
}

function addRevenueBySource(aggregate: RevenueSnapshotAggregate, sourceType: RevenueSourceType, amount: number): void {
    if (sourceType === 'affiliate') {
        aggregate.affiliateRevenue += amount;
    } else if (sourceType === 'lead_gen') {
        aggregate.leadGenRevenue += amount;
    } else if (sourceType === 'parking') {
        // Parking is intentionally folded into adRevenue until revenueSnapshots has a dedicated parking column.
        aggregate.adRevenue += amount;
    } else {
        aggregate.adRevenue += amount;
    }
    aggregate.totalRevenue += amount;
}

function resolveLedgerSourceRef(input: {
    sourceRef: string | null;
    provider: string;
    connectionId: string;
    domainId: string;
    snapshotDate: Date;
    sourceType: RevenueSourceType;
    rowIndex: number;
}): string {
    if (input.sourceRef) {
        return input.sourceRef;
    }

    return [
        'auto',
        input.provider,
        input.connectionId,
        input.domainId,
        input.snapshotDate.toISOString().slice(0, 10),
        input.sourceType,
        String(input.rowIndex),
    ].join(':');
}

function transferEventTypeForStatus(status: string): 'transfer_initiated' | 'transfer_completed' | 'transfer_failed' | 'ownership_changed' {
    if (status === 'initiated' || status === 'pending') return 'transfer_initiated';
    if (status === 'completed') return 'transfer_completed';
    if (status === 'failed') return 'transfer_failed';
    return 'ownership_changed';
}

async function executeRevenueProviderSync(
    connection: {
        id: string;
        provider: string;
        domainId: string | null;
        config: Record<string, unknown>;
    },
    days: number,
    actorUserId: string,
): Promise<SyncResult> {
    const now = new Date();
    const lookbackStart = normalizeStartOfDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
    const config = isRecord(connection.config) ? connection.config : {};
    const recordsRaw = Array.isArray(config.revenueRecords)
        ? config.revenueRecords
        : Array.isArray(config.mockRevenueRows)
            ? config.mockRevenueRows
            : [];

    if (recordsRaw.length === 0) {
        return {
            status: 'failed',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed: 0,
            errorMessage: 'No revenueRecords configured on connection.config',
            details: {
                provider: connection.provider,
                hint: 'Populate connection.config.revenueRecords with sync rows',
            },
        };
    }

    const validRecords: RevenueSyncRecord[] = [];
    let recordsFailed = 0;
    const domainIds = new Set<string>();

    for (const [rowIndex, raw] of recordsRaw.entries()) {
        if (!isRecord(raw)) {
            recordsFailed += 1;
            continue;
        }

        const domainId = asString(raw.domainId) ?? connection.domainId;
        const snapshotDate = normalizeSnapshotDate(raw.snapshotDate ?? raw.date);
        const amount = asNumber(raw.amount ?? raw.revenue);
        if (!domainId || !snapshotDate || amount === null) {
            recordsFailed += 1;
            continue;
        }
        if (snapshotDate.getTime() < lookbackStart.getTime()) {
            continue;
        }

        const sourceType = normalizeRevenueSourceType(raw.sourceType, connection.provider);
        const currency = (asString(raw.currency)?.toUpperCase() ?? 'USD').slice(0, 3);
        const clicks = asInteger(raw.clicks, 0);
        const impressions = asInteger(raw.impressions, 0);
        const sourceRef = resolveLedgerSourceRef({
            sourceRef: asString(raw.sourceRef),
            provider: connection.provider,
            connectionId: connection.id,
            domainId,
            snapshotDate,
            sourceType,
            rowIndex,
        });

        const metadata = isRecord(raw.metadata) ? raw.metadata : {};
        validRecords.push({
            domainId,
            snapshotDate,
            amount,
            sourceType,
            currency,
            clicks,
            impressions,
            sourceRef,
            metadata,
        });
        domainIds.add(domainId);
    }

    if (validRecords.length === 0) {
        return {
            status: recordsFailed > 0 ? 'failed' : 'success',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed,
            ...(recordsFailed > 0
                ? { errorMessage: 'All configured revenue records were invalid for this lookback' }
                : {}),
            details: {
                provider: connection.provider,
                lookbackDays: days,
            },
        };
    }

    const existingDomains = await db.select({ id: domains.id })
        .from(domains)
        .where(inArray(domains.id, [...domainIds]));
    const existingDomainSet = new Set(existingDomains.map((row) => row.id));

    const filteredRecords = validRecords.filter((record) => existingDomainSet.has(record.domainId));
    recordsFailed += validRecords.length - filteredRecords.length;
    if (filteredRecords.length === 0) {
        return {
            status: 'failed',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed,
            errorMessage: 'No records mapped to existing domains',
            details: {
                provider: connection.provider,
                configuredRows: recordsRaw.length,
            },
        };
    }

    const insertedRecords: RevenueSyncRecord[] = [];
    let affectedSnapshotRows = 0;

    await db.transaction(async (tx) => {
        for (const record of filteredRecords) {
            const [insertedLedger] = await tx.insert(domainFinanceLedgerEntries).values({
                domainId: record.domainId,
                entryDate: record.snapshotDate,
                entryType: 'revenue',
                impact: 'revenue',
                amount: record.amount.toFixed(2),
                currency: record.currency,
                source: `${connection.provider}:${record.sourceType}`,
                sourceRef: record.sourceRef,
                notes: null,
                metadata: {
                    provider: connection.provider,
                    sourceType: record.sourceType,
                    connectionId: connection.id,
                    clicks: record.clicks,
                    impressions: record.impressions,
                    ...record.metadata,
                },
                createdBy: actorUserId,
                createdAt: now,
                updatedAt: now,
            }).onConflictDoNothing({
                target: [
                    domainFinanceLedgerEntries.domainId,
                    domainFinanceLedgerEntries.entryDate,
                    domainFinanceLedgerEntries.source,
                    domainFinanceLedgerEntries.sourceRef,
                ],
            }).returning({ id: domainFinanceLedgerEntries.id });

            if (insertedLedger) {
                insertedRecords.push(record);
            }
        }

        const aggregates = new Map<string, RevenueSnapshotAggregate>();
        for (const record of insertedRecords) {
            const key = aggregateSnapshotKey(record.domainId, record.snapshotDate);
            if (!aggregates.has(key)) {
                aggregates.set(key, {
                    domainId: record.domainId,
                    snapshotDate: record.snapshotDate,
                    adRevenue: 0,
                    affiliateRevenue: 0,
                    leadGenRevenue: 0,
                    totalRevenue: 0,
                    clicks: 0,
                    impressions: 0,
                });
            }
            const aggregate = aggregates.get(key)!;
            addRevenueBySource(aggregate, record.sourceType, record.amount);
            aggregate.clicks += record.clicks;
            aggregate.impressions += record.impressions;
        }
        affectedSnapshotRows = aggregates.size;

        for (const aggregate of aggregates.values()) {
            await tx.insert(revenueSnapshots).values({
                domainId: aggregate.domainId,
                snapshotDate: aggregate.snapshotDate,
                adRevenue: aggregate.adRevenue.toFixed(2),
                affiliateRevenue: aggregate.affiliateRevenue.toFixed(2),
                leadGenRevenue: aggregate.leadGenRevenue.toFixed(2),
                totalRevenue: aggregate.totalRevenue.toFixed(2),
                clicks: aggregate.clicks,
                impressions: aggregate.impressions,
                createdAt: now,
            }).onConflictDoUpdate({
                target: [revenueSnapshots.domainId, revenueSnapshots.snapshotDate],
                set: {
                    adRevenue: sql`coalesce(${revenueSnapshots.adRevenue}, 0)::numeric + ${aggregate.adRevenue.toFixed(2)}::numeric`,
                    affiliateRevenue: sql`coalesce(${revenueSnapshots.affiliateRevenue}, 0)::numeric + ${aggregate.affiliateRevenue.toFixed(2)}::numeric`,
                    leadGenRevenue: sql`coalesce(${revenueSnapshots.leadGenRevenue}, 0)::numeric + ${aggregate.leadGenRevenue.toFixed(2)}::numeric`,
                    totalRevenue: sql`coalesce(${revenueSnapshots.totalRevenue}, 0)::numeric + ${aggregate.totalRevenue.toFixed(2)}::numeric`,
                    clicks: sql`coalesce(${revenueSnapshots.clicks}, 0) + ${aggregate.clicks}`,
                    impressions: sql`coalesce(${revenueSnapshots.impressions}, 0) + ${aggregate.impressions}`,
                },
            });
        }
    });

    const duplicatesSkipped = filteredRecords.length - insertedRecords.length;

    const status: SyncResult['status'] = recordsFailed > 0 ? 'partial' : 'success';
    return {
        status,
        recordsProcessed: filteredRecords.length,
        recordsUpserted: insertedRecords.length + affectedSnapshotRows,
        recordsFailed,
        details: {
            provider: connection.provider,
            lookbackDays: days,
            ingestedRows: insertedRecords.length,
            duplicatesSkipped,
            affectedDomains: new Set(insertedRecords.map((record) => record.domainId)).size,
            affectedSnapshotRows,
            source: 'connection.config.revenueRecords',
        },
        ...(recordsFailed > 0
            ? { errorMessage: `${recordsFailed} configured revenue records were skipped` }
            : {}),
    };
}

async function executeRegistrarRenewalSync(
    connection: { id: string; provider: string; domainId: string | null; domainName: string | null },
): Promise<SyncResult> {
    const updated = await syncRenewalDates(connection.domainId ?? undefined);
    const now = new Date();
    let riskSnapshot: Record<string, unknown> | null = null;
    let registrarSignalsSnapshot: Record<string, unknown> | null = null;
    let providerSignalError: string | null = null;
    let profileUpserted = 0;
    let domainRenewalUpdated = 0;

    if (connection.domainId) {
        const [domainRow] = await db.select({
            id: domains.id,
            domain: domains.domain,
            renewalDate: domains.renewalDate,
            profileId: domainRegistrarProfiles.id,
            ownershipStatus: domainRegistrarProfiles.ownershipStatus,
            transferStatus: domainRegistrarProfiles.transferStatus,
            autoRenewEnabled: domainRegistrarProfiles.autoRenewEnabled,
            lockStatus: domainRegistrarProfiles.lockStatus,
            dnssecStatus: domainRegistrarProfiles.dnssecStatus,
            ownerHandle: domainRegistrarProfiles.ownerHandle,
            expirationRisk: domainRegistrarProfiles.expirationRisk,
            expirationRiskScore: domainRegistrarProfiles.expirationRiskScore,
            ownershipLastChangedAt: domainRegistrarProfiles.ownershipLastChangedAt,
            ownershipChangedBy: domainRegistrarProfiles.ownershipChangedBy,
            metadata: domainRegistrarProfiles.metadata,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(eq(domains.id, connection.domainId))
            .limit(1);

        if (domainRow) {
            let registrarSignals: Awaited<ReturnType<typeof getGoDaddyRegistrarSignals>> | null = null;
            if (connection.provider === 'godaddy' && connection.domainName) {
                try {
                    registrarSignals = await getGoDaddyRegistrarSignals(connection.domainName);
                } catch (error) {
                    providerSignalError = error instanceof Error ? error.message : String(error);
                }
            }

            const previousOwnershipStatus = isRegistrarOwnershipStatus(domainRow.ownershipStatus)
                ? domainRow.ownershipStatus
                : 'unknown';
            const previousTransferStatus = isRegistrarTransferStatus(domainRow.transferStatus)
                ? domainRow.transferStatus
                : 'none';
            const previousLockStatus = isRegistrarLockStatus(domainRow.lockStatus)
                ? domainRow.lockStatus
                : 'unknown';
            const previousDnssecStatus = isRegistrarDnssecStatus(domainRow.dnssecStatus)
                ? domainRow.dnssecStatus
                : 'unknown';
            const previousAutoRenewEnabled = domainRow.autoRenewEnabled !== false;
            const previousOwnerHandle = domainRow.ownerHandle ?? null;

            const resolvedOwnershipStatus = registrarSignals?.ownershipStatus ?? previousOwnershipStatus;
            const resolvedTransferStatus = registrarSignals?.transferStatus ?? previousTransferStatus;
            const resolvedLockStatus = registrarSignals?.lockStatus ?? previousLockStatus;
            const resolvedDnssecStatus = registrarSignals?.dnssecStatus ?? previousDnssecStatus;
            const resolvedAutoRenewEnabled = registrarSignals?.autoRenewEnabled ?? previousAutoRenewEnabled;
            const resolvedOwnerHandle = registrarSignals?.ownerHandle ?? previousOwnerHandle;

            let resolvedRenewalDate = domainRow.renewalDate;
            if (registrarSignals?.renewalDate) {
                const changed = !resolvedRenewalDate
                    || registrarSignals.renewalDate.getTime() !== resolvedRenewalDate.getTime();
                if (changed) {
                    await db.update(domains).set({
                        renewalDate: registrarSignals.renewalDate,
                    }).where(eq(domains.id, connection.domainId));
                    resolvedRenewalDate = registrarSignals.renewalDate;
                    domainRenewalUpdated += 1;
                }
            }

            const risk = computeRegistrarExpirationRisk({
                renewalDate: resolvedRenewalDate,
                autoRenewEnabled: resolvedAutoRenewEnabled,
                transferStatus: resolvedTransferStatus,
                now,
            });

            const previousMetadata = isRecord(domainRow.metadata) ? domainRow.metadata : {};
            const nextMetadata: Record<string, unknown> = {
                ...previousMetadata,
                registrarSync: {
                    provider: connection.provider,
                    syncedAt: now.toISOString(),
                    statusTokens: registrarSignals?.statusTokens ?? [],
                    lockStatus: resolvedLockStatus,
                    dnssecStatus: resolvedDnssecStatus,
                    transferStatus: resolvedTransferStatus,
                    ownershipStatus: resolvedOwnershipStatus,
                    ownerHandle: resolvedOwnerHandle,
                    ...(providerSignalError ? { providerSignalError } : {}),
                },
            };

            const ownershipChanged = resolvedOwnershipStatus !== previousOwnershipStatus
                || resolvedOwnerHandle !== previousOwnerHandle;

            const [profile] = await db.insert(domainRegistrarProfiles)
                .values({
                    domainId: connection.domainId,
                    connectionId: connection.id,
                    ownershipStatus: resolvedOwnershipStatus,
                    transferStatus: resolvedTransferStatus,
                    autoRenewEnabled: resolvedAutoRenewEnabled,
                    lockStatus: resolvedLockStatus,
                    dnssecStatus: resolvedDnssecStatus,
                    ownerHandle: resolvedOwnerHandle,
                    expirationRisk: risk.risk,
                    expirationRiskScore: risk.riskScore,
                    expirationRiskUpdatedAt: now,
                    ownershipLastChangedAt: ownershipChanged ? now : domainRow.ownershipLastChangedAt,
                    ownershipChangedBy: ownershipChanged ? null : domainRow.ownershipChangedBy,
                    metadata: nextMetadata,
                    lastSyncedAt: now,
                    createdAt: now,
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: domainRegistrarProfiles.domainId,
                    set: {
                        connectionId: connection.id,
                        ownershipStatus: resolvedOwnershipStatus,
                        transferStatus: resolvedTransferStatus,
                        autoRenewEnabled: resolvedAutoRenewEnabled,
                        lockStatus: resolvedLockStatus,
                        dnssecStatus: resolvedDnssecStatus,
                        ownerHandle: resolvedOwnerHandle,
                        expirationRisk: risk.risk,
                        expirationRiskScore: risk.riskScore,
                        expirationRiskUpdatedAt: now,
                        ownershipLastChangedAt: ownershipChanged ? now : domainRow.ownershipLastChangedAt,
                        ownershipChangedBy: ownershipChanged ? null : domainRow.ownershipChangedBy,
                        metadata: nextMetadata,
                        lastSyncedAt: now,
                        updatedAt: now,
                    },
                })
                .returning({
                    id: domainRegistrarProfiles.id,
                });
            if (profile) {
                profileUpserted += 1;
            }

            const eventRows: Array<typeof domainOwnershipEvents.$inferInsert> = [];

            if (resolvedOwnershipStatus !== previousOwnershipStatus || resolvedOwnerHandle !== previousOwnerHandle) {
                eventRows.push({
                    domainId: connection.domainId,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
                    actorId: null,
                    eventType: resolvedOwnershipStatus === 'verified' ? 'ownership_verified' : 'ownership_changed',
                    source: 'integration_sync',
                    summary: `Ownership profile synced (${previousOwnershipStatus} -> ${resolvedOwnershipStatus})`,
                    previousState: {
                        ownershipStatus: previousOwnershipStatus,
                        ownerHandle: previousOwnerHandle,
                    },
                    nextState: {
                        ownershipStatus: resolvedOwnershipStatus,
                        ownerHandle: resolvedOwnerHandle,
                    },
                    metadata: {
                        provider: connection.provider,
                    },
                    createdAt: now,
                });
            }

            if (resolvedTransferStatus !== previousTransferStatus) {
                eventRows.push({
                    domainId: connection.domainId,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
                    actorId: null,
                    eventType: transferEventTypeForStatus(resolvedTransferStatus),
                    source: 'integration_sync',
                    summary: `Transfer status synced (${previousTransferStatus} -> ${resolvedTransferStatus})`,
                    previousState: { transferStatus: previousTransferStatus },
                    nextState: { transferStatus: resolvedTransferStatus },
                    metadata: {
                        provider: connection.provider,
                    },
                    createdAt: now,
                });
            }

            if (resolvedLockStatus !== previousLockStatus) {
                eventRows.push({
                    domainId: connection.domainId,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
                    actorId: null,
                    eventType: 'lock_changed',
                    source: 'integration_sync',
                    summary: `Domain lock status synced (${previousLockStatus} -> ${resolvedLockStatus})`,
                    previousState: { lockStatus: previousLockStatus },
                    nextState: { lockStatus: resolvedLockStatus },
                    metadata: {
                        provider: connection.provider,
                    },
                    createdAt: now,
                });
            }

            if (resolvedDnssecStatus !== previousDnssecStatus) {
                eventRows.push({
                    domainId: connection.domainId,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
                    actorId: null,
                    eventType: 'dnssec_changed',
                    source: 'integration_sync',
                    summary: `DNSSEC status synced (${previousDnssecStatus} -> ${resolvedDnssecStatus})`,
                    previousState: { dnssecStatus: previousDnssecStatus },
                    nextState: { dnssecStatus: resolvedDnssecStatus },
                    metadata: {
                        provider: connection.provider,
                    },
                    createdAt: now,
                });
            }

            if (resolvedAutoRenewEnabled !== previousAutoRenewEnabled) {
                eventRows.push({
                    domainId: connection.domainId,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
                    actorId: null,
                    eventType: 'auto_renew_changed',
                    source: 'integration_sync',
                    summary: `Auto-renew synced (${previousAutoRenewEnabled ? 'enabled' : 'disabled'} -> ${resolvedAutoRenewEnabled ? 'enabled' : 'disabled'})`,
                    previousState: { autoRenewEnabled: previousAutoRenewEnabled },
                    nextState: { autoRenewEnabled: resolvedAutoRenewEnabled },
                    metadata: {
                        provider: connection.provider,
                    },
                    createdAt: now,
                });
            }

            if (
                !domainRow.profileId
                || domainRow.expirationRisk !== risk.risk
                || Number(domainRow.expirationRiskScore ?? 0) !== risk.riskScore
            ) {
                eventRows.push({
                    domainId: connection.domainId,
                    profileId: profile?.id ?? domainRow.profileId ?? null,
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

            if (eventRows.length > 0) {
                await db.insert(domainOwnershipEvents).values(eventRows);
            }

            riskSnapshot = {
                risk: risk.risk,
                riskScore: risk.riskScore,
                renewalWindow: risk.renewalWindow,
                daysUntilRenewal: risk.daysUntilRenewal,
            };

            registrarSignalsSnapshot = registrarSignals
                ? {
                    lockStatus: registrarSignals.lockStatus,
                    dnssecStatus: registrarSignals.dnssecStatus,
                    transferStatus: registrarSignals.transferStatus,
                    ownershipStatus: registrarSignals.ownershipStatus,
                    autoRenewEnabled: registrarSignals.autoRenewEnabled,
                    statusTokens: registrarSignals.statusTokens,
                }
                : null;
        }
    }

    const partial = Boolean(providerSignalError);
    return {
        status: partial ? 'partial' : 'success',
        recordsProcessed: updated,
        recordsUpserted: updated + profileUpserted + domainRenewalUpdated,
        recordsFailed: partial ? 1 : 0,
        details: {
            provider: connection.provider,
            scope: connection.domainId ? 'domain' : 'portfolio',
            updatedDomains: updated,
            profileUpserted,
            domainRenewalUpdated,
            ...(riskSnapshot ? { riskSnapshot } : {}),
            ...(registrarSignalsSnapshot ? { registrarSignals: registrarSignalsSnapshot } : {}),
            ...(providerSignalError ? { providerSignalError } : {}),
        },
        ...(providerSignalError ? { errorMessage: providerSignalError } : {}),
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

    const analyticsResult = await getDomainAnalyticsTyped(connection.domainName, days);
    if (analyticsResult.status === 'error') {
        const rateLimited = analyticsResult.message.includes('429');
        const cooldown = rateLimited ? getCloudflareApiRateLimitCooldown() : null;
        return {
            status: 'partial',
            recordsProcessed: 0,
            recordsUpserted: 0,
            recordsFailed: 1,
            errorMessage: rateLimited
                ? 'Cloudflare analytics rate-limited; retry shortly.'
                : analyticsResult.message,
            details: {
                domain: connection.domainName,
                days,
                reason: rateLimited ? 'rate_limited' : 'api_error',
                ...(rateLimited && cooldown
                    ? {
                        rateLimitCooldownSeconds: Math.max(0, Math.ceil(cooldown.remainingMs / 1000)),
                        rateLimitCooldownReason: cooldown.reason,
                    }
                    : {}),
            },
        };
    }

    const analytics = analyticsResult.status === 'ok' ? analyticsResult.data : [];
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
    connection: {
        id: string;
        provider: string;
        domainId: string | null;
        domainName: string | null;
        config: Record<string, unknown>;
    },
    days: number,
    actorUserId: string,
): Promise<SyncResult> {
    switch (provider) {
        case 'godaddy':
        case 'namecheap':
            return executeRegistrarRenewalSync(connection);
        case 'sedo':
        case 'bodis':
        case 'impact':
        case 'cj':
        case 'awin':
        case 'rakuten':
            return executeRevenueProviderSync(connection, days, actorUserId);
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
            config: integrationConnections.config,
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

    const [runningRun] = await db
        .select({
            id: integrationSyncRuns.id,
            status: integrationSyncRuns.status,
        })
        .from(integrationSyncRuns)
        .where(and(
            eq(integrationSyncRuns.connectionId, connection.id),
            eq(integrationSyncRuns.status, 'running'),
        ))
        .limit(1);

    if (runningRun) {
        return {
            error: 'already_running' as const,
            runId: runningRun.id,
        };
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
        const result = await executeProviderSync(connection.provider, connection, days, actor.userId);
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

        const nextConnectionStatus = connection.status === 'disabled'
            ? 'disabled'
            : result.status === 'failed'
                ? 'error'
                : 'connected';

        await db.update(integrationConnections).set({
            status: nextConnectionStatus,
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
