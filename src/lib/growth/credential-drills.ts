import { and, desc, eq } from 'drizzle-orm';
import { db, growthCredentialDrillRuns } from '@/lib/db';
import type { GrowthPublishChannel } from '@/lib/growth/publishers';
import {
    countActiveGrowthChannelCredentials,
    getGrowthChannelCredentialStatus,
    refreshGrowthChannelCredential,
    revokeGrowthCredentialsForReconnect,
    upsertGrowthChannelCredential,
} from '@/lib/growth/channel-credentials';

const CHANNELS: GrowthPublishChannel[] = ['pinterest', 'youtube_shorts'];
const REQUIRED_CHECKLIST_FIELDS = [
    'campaignLaunchFrozen',
    'monitoringChecked',
    'providerTokensRevoked',
    'reconnectCompleted',
    'testPublishValidated',
] as const;

export type GrowthCredentialDrillScope = 'all' | GrowthPublishChannel;
export type GrowthCredentialDrillStatus = 'success' | 'failed' | 'partial';
export type GrowthCredentialDrillEvidenceStep =
    | 'checklist'
    | 'provider_token_revoke'
    | 'credential_reconnect'
    | 'refresh_validation';
export type GrowthCredentialDrillEvidenceStatus = 'pass' | 'fail' | 'not_applicable';

export interface GrowthCredentialDrillChecklist {
    campaignLaunchFrozen: boolean;
    monitoringChecked: boolean;
    providerTokensRevoked: boolean;
    reconnectCompleted: boolean;
    testPublishValidated: boolean;
}

export interface GrowthCredentialDrillCredentialInput {
    channel: GrowthPublishChannel;
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
    scopes?: string[];
    providerAccountId?: string | null;
    metadata?: Record<string, unknown>;
}

export interface GrowthCredentialDrillEvidenceRecord {
    evidenceId: string;
    channel: 'all' | GrowthPublishChannel;
    step: GrowthCredentialDrillEvidenceStep;
    status: GrowthCredentialDrillEvidenceStatus;
    details?: string | null;
}

export interface GrowthCredentialDrillIncidentChecklistAttachment {
    incidentChecklistId: string;
    drillRunId: string;
    drillStatus: GrowthCredentialDrillStatus;
    attachedAt: string;
    evidenceIds: string[];
    evidence: GrowthCredentialDrillEvidenceRecord[];
}

export interface ExecuteGrowthCredentialDrillInput {
    userId: string;
    initiatedBy?: string | null;
    scope?: GrowthCredentialDrillScope;
    dryRun?: boolean;
    checklist?: Partial<GrowthCredentialDrillChecklist> | null;
    reconnectCredentials?: GrowthCredentialDrillCredentialInput[];
    validateRefresh?: boolean;
    notes?: string | null;
    incidentChecklistId?: string | null;
}

function normalizeChecklist(
    checklist?: Partial<GrowthCredentialDrillChecklist> | null,
): GrowthCredentialDrillChecklist {
    return {
        campaignLaunchFrozen: Boolean(checklist?.campaignLaunchFrozen),
        monitoringChecked: Boolean(checklist?.monitoringChecked),
        providerTokensRevoked: Boolean(checklist?.providerTokensRevoked),
        reconnectCompleted: Boolean(checklist?.reconnectCompleted),
        testPublishValidated: Boolean(checklist?.testPublishValidated),
    };
}

function missingChecklistFields(checklist: GrowthCredentialDrillChecklist): string[] {
    return REQUIRED_CHECKLIST_FIELDS.filter((field) => !checklist[field]);
}

function resolveChannels(scope: GrowthCredentialDrillScope): GrowthPublishChannel[] {
    if (scope === 'all') {
        return [...CHANNELS];
    }
    return [scope];
}

function summarizeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

type DrillResults = {
    scope: GrowthCredentialDrillScope;
    channels: GrowthPublishChannel[];
    activeCountBefore: Record<GrowthPublishChannel, number>;
    revokedCount: Record<GrowthPublishChannel, number>;
    reconnectApplied: Record<GrowthPublishChannel, boolean>;
    refreshValidated: Record<GrowthPublishChannel, boolean>;
    refreshRefreshed: Record<GrowthPublishChannel, boolean>;
    missingChecklistFields: string[];
    errors: string[];
};

type PersistedDrillResults = DrillResults & {
    incidentChecklistAttachment?: GrowthCredentialDrillIncidentChecklistAttachment;
};

function emptyCounts(channels: GrowthPublishChannel[]): Record<GrowthPublishChannel, number> {
    return channels.reduce<Record<GrowthPublishChannel, number>>((acc, channel) => {
        acc[channel] = 0;
        return acc;
    }, { pinterest: 0, youtube_shorts: 0 });
}

function emptyFlags(channels: GrowthPublishChannel[]): Record<GrowthPublishChannel, boolean> {
    return channels.reduce<Record<GrowthPublishChannel, boolean>>((acc, channel) => {
        acc[channel] = false;
        return acc;
    }, { pinterest: false, youtube_shorts: false });
}

function toStatus(results: DrillResults, dryRun: boolean): GrowthCredentialDrillStatus {
    if (results.errors.length > 0) {
        return 'failed';
    }

    if (dryRun) {
        return 'success';
    }

    const allValidated = results.channels.every((channel) => results.refreshValidated[channel]);
    if (allValidated) {
        return 'success';
    }
    return 'partial';
}

function normalizeIncidentChecklistId(value?: string | null): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

function evidenceId(
    runId: string,
    channel: 'all' | GrowthPublishChannel,
    step: GrowthCredentialDrillEvidenceStep,
): string {
    return `credential-drill:${runId}:${channel}:${step}`;
}

function buildIncidentChecklistAttachment(input: {
    runId: string;
    incidentChecklistId: string;
    status: GrowthCredentialDrillStatus;
    completedAt: Date;
    results: DrillResults;
}): GrowthCredentialDrillIncidentChecklistAttachment {
    const evidence: GrowthCredentialDrillEvidenceRecord[] = [];
    const checklistDetails = input.results.missingChecklistFields.length > 0
        ? input.results.missingChecklistFields.join(', ')
        : null;
    evidence.push({
        evidenceId: evidenceId(input.runId, 'all', 'checklist'),
        channel: 'all',
        step: 'checklist',
        status: input.results.missingChecklistFields.length === 0 ? 'pass' : 'fail',
        details: checklistDetails,
    });

    for (const channel of input.results.channels) {
        const revokeStatus: GrowthCredentialDrillEvidenceStatus = input.results.activeCountBefore[channel] > 0
            ? (input.results.revokedCount[channel] > 0 ? 'pass' : 'fail')
            : 'not_applicable';
        evidence.push({
            evidenceId: evidenceId(input.runId, channel, 'provider_token_revoke'),
            channel,
            step: 'provider_token_revoke',
            status: revokeStatus,
            details: revokeStatus === 'fail' ? 'No active credential was revoked for this channel' : null,
        });

        const reconnectStatus: GrowthCredentialDrillEvidenceStatus = input.results.reconnectApplied[channel]
            ? 'pass'
            : 'not_applicable';
        evidence.push({
            evidenceId: evidenceId(input.runId, channel, 'credential_reconnect'),
            channel,
            step: 'credential_reconnect',
            status: reconnectStatus,
            details: reconnectStatus === 'not_applicable'
                ? 'No reconnect credential payload was supplied for this channel'
                : null,
        });

        const refreshError = input.results.errors.find((entry) => (
            entry.includes(`Channel ${channel} `) && entry.toLowerCase().includes('refresh')
        ));
        evidence.push({
            evidenceId: evidenceId(input.runId, channel, 'refresh_validation'),
            channel,
            step: 'refresh_validation',
            status: input.results.refreshValidated[channel] ? 'pass' : 'fail',
            details: refreshError ?? null,
        });
    }

    return {
        incidentChecklistId: input.incidentChecklistId,
        drillRunId: input.runId,
        drillStatus: input.status,
        attachedAt: input.completedAt.toISOString(),
        evidenceIds: evidence.map((entry) => entry.evidenceId),
        evidence,
    };
}

async function persistDrillRun(input: {
    userId: string;
    initiatedBy?: string | null;
    scope: GrowthCredentialDrillScope;
    dryRun: boolean;
    checklist: GrowthCredentialDrillChecklist;
    results: DrillResults;
    status: GrowthCredentialDrillStatus;
    startedAt: Date;
    completedAt: Date;
    notes?: string | null;
}) {
    const [row] = await db.insert(growthCredentialDrillRuns)
        .values({
            userId: input.userId,
            initiatedBy: input.initiatedBy ?? input.userId,
            scope: input.scope,
            mode: input.dryRun ? 'dry_run' : 'rotation_reconnect',
            status: input.status,
            checklist: { ...input.checklist },
            results: input.results,
            notes: input.notes?.trim() || null,
            startedAt: input.startedAt,
            completedAt: input.completedAt,
            updatedAt: input.completedAt,
        })
        .returning();

    if (!row) {
        throw new Error('Failed to persist growth credential drill run');
    }

    return row;
}

export async function executeGrowthCredentialDrill(
    input: ExecuteGrowthCredentialDrillInput,
): Promise<{
    run: typeof growthCredentialDrillRuns.$inferSelect;
    status: GrowthCredentialDrillStatus;
    dryRun: boolean;
    scope: GrowthCredentialDrillScope;
    checklist: GrowthCredentialDrillChecklist;
    results: PersistedDrillResults;
    incidentChecklistAttachment: GrowthCredentialDrillIncidentChecklistAttachment | null;
}> {
    const scope = input.scope ?? 'all';
    const dryRun = input.dryRun ?? false;
    const validateRefresh = input.validateRefresh ?? true;
    const incidentChecklistId = normalizeIncidentChecklistId(input.incidentChecklistId);
    const checklist = normalizeChecklist(input.checklist);
    const channels = resolveChannels(scope);
    const startedAt = new Date();

    const results: DrillResults = {
        scope,
        channels,
        activeCountBefore: emptyCounts(channels),
        revokedCount: emptyCounts(channels),
        reconnectApplied: emptyFlags(channels),
        refreshValidated: emptyFlags(channels),
        refreshRefreshed: emptyFlags(channels),
        missingChecklistFields: [],
        errors: [],
    };

    const reconnectByChannel = new Map<GrowthPublishChannel, GrowthCredentialDrillCredentialInput>();
    for (const credential of input.reconnectCredentials ?? []) {
        reconnectByChannel.set(credential.channel, credential);
    }

    for (const channel of channels) {
        results.activeCountBefore[channel] = await countActiveGrowthChannelCredentials(input.userId, channel);
    }

    if (!dryRun) {
        if (!incidentChecklistId) {
            results.errors.push('Incident checklist ID is required for non-dry-run drills');
        }
        results.missingChecklistFields = missingChecklistFields(checklist);
        if (results.missingChecklistFields.length > 0) {
            results.errors.push(
                `Incident checklist incomplete: ${results.missingChecklistFields.join(', ')}`,
            );
        }
    }

    if (!dryRun && results.errors.length === 0) {
        for (const channel of channels) {
            results.revokedCount[channel] = await revokeGrowthCredentialsForReconnect(input.userId, channel);
        }

        for (const channel of channels) {
            const reconnect = reconnectByChannel.get(channel);
            if (!reconnect) {
                continue;
            }

            await upsertGrowthChannelCredential({
                userId: input.userId,
                channel,
                accessToken: reconnect.accessToken,
                refreshToken: reconnect.refreshToken ?? null,
                accessTokenExpiresAt: reconnect.accessTokenExpiresAt ?? null,
                refreshTokenExpiresAt: reconnect.refreshTokenExpiresAt ?? null,
                scopes: reconnect.scopes ?? [],
                providerAccountId: reconnect.providerAccountId ?? null,
                metadata: reconnect.metadata ?? {},
            });
            results.reconnectApplied[channel] = true;
        }

        for (const channel of channels) {
            const credential = await getGrowthChannelCredentialStatus(input.userId, channel);
            if (!credential || credential.revoked) {
                results.errors.push(`Channel ${channel} has no active credential after reconnect step`);
                continue;
            }

            if (!validateRefresh) {
                results.refreshValidated[channel] = true;
                continue;
            }

            try {
                const refreshed = await refreshGrowthChannelCredential(
                    input.userId,
                    channel,
                    { force: true },
                );
                if (!refreshed || refreshed.credential.revoked) {
                    results.errors.push(`Channel ${channel} refresh validation failed`);
                    continue;
                }
                results.refreshValidated[channel] = true;
                results.refreshRefreshed[channel] = refreshed.refreshed;
            } catch (error) {
                results.errors.push(`Channel ${channel} refresh error: ${summarizeError(error)}`);
            }
        }
    }

    const completedAt = new Date();
    const status = toStatus(results, dryRun);
    let run = await persistDrillRun({
        userId: input.userId,
        initiatedBy: input.initiatedBy ?? input.userId,
        scope,
        dryRun,
        checklist,
        results,
        status,
        startedAt,
        completedAt,
        notes: input.notes ?? null,
    });
    let persistedResults: PersistedDrillResults = results;
    let incidentChecklistAttachment: GrowthCredentialDrillIncidentChecklistAttachment | null = null;

    if (!dryRun && incidentChecklistId) {
        incidentChecklistAttachment = buildIncidentChecklistAttachment({
            runId: run.id,
            incidentChecklistId,
            status,
            completedAt,
            results,
        });
        persistedResults = {
            ...results,
            incidentChecklistAttachment,
        };
        const [updatedRun] = await db.update(growthCredentialDrillRuns)
            .set({
                results: persistedResults,
                updatedAt: completedAt,
            })
            .where(eq(growthCredentialDrillRuns.id, run.id))
            .returning();
        if (updatedRun) {
            run = updatedRun;
        }
    }

    return {
        run,
        status,
        dryRun,
        scope,
        checklist,
        results: persistedResults,
        incidentChecklistAttachment,
    };
}

export async function listGrowthCredentialDrillRuns(
    userId: string,
    opts: { limit?: number; status?: GrowthCredentialDrillStatus } = {},
): Promise<Array<typeof growthCredentialDrillRuns.$inferSelect>> {
    const parsedLimit = Number.isFinite(opts.limit) ? Number(opts.limit) : 20;
    const limit = Math.max(1, Math.min(100, Math.floor(parsedLimit)));
    const conditions = [eq(growthCredentialDrillRuns.userId, userId)];
    if (opts.status) {
        conditions.push(eq(growthCredentialDrillRuns.status, opts.status));
    }

    return db.select()
        .from(growthCredentialDrillRuns)
        .where(and(...conditions))
        .orderBy(desc(growthCredentialDrillRuns.startedAt))
        .limit(limit);
}
