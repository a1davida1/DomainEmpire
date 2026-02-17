import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import {
    db,
    integrationSyncRuns,
    mediaModerationTasks,
    notifications,
    promotionEvents,
} from '@/lib/db';
import { sendOpsChannelAlert } from '@/lib/alerts/ops-channel';
import { createNotification } from '@/lib/notifications';
import { assessMaxThresholdSlo, assessSuccessRateSlo, type SloStatus } from '@/lib/growth/slo';

const EVENT_TYPES = ['published', 'publish_blocked', 'publish_failed'] as const;
const SUPPORTED_CHANNELS = ['pinterest', 'youtube_shorts'] as const;
const SUPPORTED_ACTIONS = ['scale', 'optimize', 'recover', 'incubate'] as const;

export type GrowthLaunchChannel = typeof SUPPORTED_CHANNELS[number];
export type GrowthLaunchAction = typeof SUPPORTED_ACTIONS[number];

export type GrowthSloWindowSummary = {
    windowHours: number;
    publish: {
        targetSuccessRate: number;
        evaluatedCount: number;
        publishedCount: number;
        blockedCount: number;
        failedCount: number;
        successRate: number | null;
        failureRate: number | null;
        burnPct: number | null;
        status: SloStatus;
    };
    moderation: {
        targetOnTimeRate: number;
        dueCount: number;
        onTimeCount: number;
        lateCount: number;
        onTimeRate: number | null;
        lateRate: number | null;
        burnPct: number | null;
        status: SloStatus;
    };
    syncFreshness: {
        maxLagHours: number;
        latestCompletedAt: string | null;
        lagHours: number | null;
        burnPct: number | null;
        status: SloStatus;
    };
    overallStatus: SloStatus;
    generatedAt: string;
};

export type GrowthLaunchFreezeConfig = {
    enabled: boolean;
    warningBurnPct: number;
    criticalBurnPct: number;
    windowHours: number[];
    blockedChannels: GrowthLaunchChannel[];
    blockedActions: GrowthLaunchAction[];
    recoveryHealthyWindowsRequired: number;
};

export type GrowthLaunchFreezeTrigger = {
    metric: 'publish' | 'moderation' | 'sync_freshness';
    severity: 'warning' | 'critical';
    windowHours: number;
    burnPct: number;
    threshold: number;
    status: SloStatus;
    reasonCode: string;
};

export type GrowthLaunchFreezeState = {
    enabled: boolean;
    active: boolean;
    rawActive: boolean;
    blockedChannels: GrowthLaunchChannel[];
    blockedActions: GrowthLaunchAction[];
    recoveryHoldActive: boolean;
    recoveryHealthyWindows: number;
    recoveryHealthyWindowsRequired: number;
    level: 'healthy' | 'warning' | 'critical';
    warningBurnPct: number;
    criticalBurnPct: number;
    reasonCodes: string[];
    overrideActive: boolean;
    overrideId: string | null;
    overrideExpiresAt: string | null;
    overrideReason: string | null;
    triggers: GrowthLaunchFreezeTrigger[];
    windowSummaries: GrowthSloWindowSummary[];
    generatedAt: string;
};

export type GrowthLaunchFreezeAuditSnapshot = {
    active: boolean;
    rawActive: boolean;
    recoveryHoldActive: boolean;
    recoveryHealthyWindows: number;
    level: 'healthy' | 'warning' | 'critical';
    reasonCodes: string[];
    recordedAt: string;
};

export type GrowthLaunchFreezeScope = {
    channels?: string[] | null;
    action?: string | null;
};

export type GrowthLaunchFreezeIncidentResult = {
    notificationId: string | null;
    opsDelivered: boolean;
    opsReason: string | null;
};

export type GrowthLaunchFreezeOverride = {
    warningBurnPct?: number;
    criticalBurnPct?: number;
    blockedChannels?: GrowthLaunchChannel[];
    blockedActions?: GrowthLaunchAction[];
    recoveryHealthyWindowsRequired?: number;
};

export type GrowthLaunchFreezeOverrideRecord = {
    id: string;
    actorUserId: string | null;
    reason: string;
    createdAt: string;
    expiresAt: string | null;
    postmortemUrl: string | null;
    incidentKey: string | null;
    override: GrowthLaunchFreezeOverride;
    status: 'active' | 'cleared' | 'expired';
    supersededById: string | null;
};

export type GrowthLaunchFreezeOverrideRequestRecord = {
    id: string;
    requestedByUserId: string | null;
    requestedByRole: string | null;
    reason: string;
    submittedAt: string;
    expiresAt: string | null;
    postmortemUrl: string | null;
    incidentKey: string | null;
    override: GrowthLaunchFreezeOverride;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    decidedAt: string | null;
    decidedByUserId: string | null;
    decisionReason: string | null;
    appliedOverrideId: string | null;
};

export type GrowthLaunchFreezePostmortemRecord = {
    id: string;
    incidentKey: string;
    completedAt: string;
    completedByUserId: string | null;
    postmortemUrl: string | null;
    notes: string | null;
};

export type GrowthLaunchFreezeAuditSyncSummary = {
    enabled: boolean;
    active: boolean;
    rawActive: boolean;
    recoveryHoldActive: boolean;
    changed: boolean;
    event: 'entered' | 'cleared' | 'recovery_hold' | 'updated' | 'unchanged';
    reasonCodes: string[];
    recoveryHealthyWindows: number;
    recoveryHealthyWindowsRequired: number;
    incidentKey: string | null;
    postmortemUrl: string | null;
    notificationId: string | null;
    opsDelivered: boolean;
    opsReason: string | null;
};

export type GrowthLaunchFreezePostmortemSlaSummary = {
    enabled: boolean;
    scanned: number;
    overdue: number;
    alertsCreated: number;
    opsAlertsSent: number;
    opsAlertsFailed: number;
    postmortemsCompleted: number;
    overdueIncidentKeys: string[];
};

export type GrowthLaunchFreezePostmortemIncident = {
    incidentKey: string;
    enteredAt: string;
    dueAt: string;
    postmortemUrl: string | null;
    completedAt: string | null;
    overdue: boolean;
};

type GrowthLaunchFreezePostmortemSlaConfig = {
    enabled: boolean;
    slaHours: number;
    scanLimit: number;
    maxAlertsPerSweep: number;
};

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function readNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function parseNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseFloat(raw || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return fallback;
}

function parseWindowHours(raw: string | undefined): number[] {
    if (!raw || raw.trim().length === 0) {
        return [24, 168];
    }
    const parsed = raw
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.max(6, Math.min(value, 24 * 30)));
    if (parsed.length === 0) {
        return [24, 168];
    }
    return [...new Set(parsed)];
}

function parseCsvEnum<T extends readonly string[]>(
    raw: string | undefined,
    supported: T,
): T[number][] {
    if (!raw || raw.trim().length === 0) {
        return [...supported];
    }
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'all' || normalized === '*') {
        return [...supported];
    }
    const parsed = raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is T[number] => supported.includes(value as T[number]));
    if (parsed.length === 0) {
        return [...supported];
    }
    return [...new Set(parsed)];
}

function combineStatus(statuses: SloStatus[]): SloStatus {
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('warning')) return 'warning';
    if (statuses.includes('healthy')) return 'healthy';
    return 'unknown';
}

function metricReasonCode(metric: GrowthLaunchFreezeTrigger['metric'], severity: 'warning' | 'critical', windowHours: number): string {
    return `${metric}_burn_${severity}_${windowHours}h`;
}

function normalizeChannels(rawChannels: string[] | null | undefined): GrowthLaunchChannel[] {
    if (!rawChannels || rawChannels.length === 0) return [];
    return rawChannels
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is GrowthLaunchChannel => SUPPORTED_CHANNELS.includes(value as GrowthLaunchChannel));
}

function normalizeAction(rawAction: string | null | undefined): GrowthLaunchAction | 'unknown' | null {
    if (typeof rawAction !== 'string') return null;
    const normalized = rawAction.trim().toLowerCase();
    if (!normalized) return null;
    if (SUPPORTED_ACTIONS.includes(normalized as GrowthLaunchAction)) {
        return normalized as GrowthLaunchAction;
    }
    return 'unknown';
}

function normalizeOverride(input: Record<string, unknown>): GrowthLaunchFreezeOverride {
    const output: GrowthLaunchFreezeOverride = {};
    const warningBurnPct = readNumber(input.warningBurnPct);
    const criticalBurnPct = readNumber(input.criticalBurnPct);
    const recoveryHealthyWindowsRequired = readNumber(input.recoveryHealthyWindowsRequired);

    if (warningBurnPct !== null) {
        output.warningBurnPct = Math.max(1, Math.min(warningBurnPct, 1000));
    }
    if (criticalBurnPct !== null) {
        output.criticalBurnPct = Math.max(2, Math.min(criticalBurnPct, 2000));
    }
    if (Array.isArray(input.blockedChannels)) {
        output.blockedChannels = normalizeChannels(
            input.blockedChannels
                .map((value) => (typeof value === 'string' ? value : ''))
                .filter((value) => value.length > 0),
        );
    }
    if (Array.isArray(input.blockedActions)) {
        output.blockedActions = input.blockedActions
            .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
            .filter((value): value is GrowthLaunchAction => SUPPORTED_ACTIONS.includes(value as GrowthLaunchAction));
    }
    if (recoveryHealthyWindowsRequired !== null) {
        output.recoveryHealthyWindowsRequired = Math.max(1, Math.min(Math.trunc(recoveryHealthyWindowsRequired), 24));
    }

    return output;
}

function applyFreezeOverrideToConfig(baseConfig: GrowthLaunchFreezeConfig, override: GrowthLaunchFreezeOverride): GrowthLaunchFreezeConfig {
    const warningBurnPct = override.warningBurnPct ?? baseConfig.warningBurnPct;
    const criticalBurnPct = Math.max(
        warningBurnPct + 1,
        override.criticalBurnPct ?? baseConfig.criticalBurnPct,
    );
    return {
        ...baseConfig,
        warningBurnPct,
        criticalBurnPct,
        blockedChannels: (override.blockedChannels && override.blockedChannels.length > 0)
            ? [...new Set(override.blockedChannels)]
            : baseConfig.blockedChannels,
        blockedActions: (override.blockedActions && override.blockedActions.length > 0)
            ? [...new Set(override.blockedActions)]
            : baseConfig.blockedActions,
        recoveryHealthyWindowsRequired: override.recoveryHealthyWindowsRequired
            ?? baseConfig.recoveryHealthyWindowsRequired,
    };
}

function resolvePostmortemTemplateUrl(incidentKey: string | null): string | null {
    if (!incidentKey) return null;
    const base = process.env.GROWTH_LAUNCH_FREEZE_POSTMORTEM_BASE_URL?.trim();
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/${encodeURIComponent(incidentKey)}`;
}

export function resolveGrowthLaunchFreezeConfig(
    env: Record<string, string | undefined> = process.env,
): GrowthLaunchFreezeConfig {
    const warningBurnPct = parseNumber(env.GROWTH_LAUNCH_FREEZE_WARNING_BURN_PCT, 50, 1, 1000);
    const criticalBurnPct = Math.max(
        warningBurnPct + 1,
        parseNumber(env.GROWTH_LAUNCH_FREEZE_CRITICAL_BURN_PCT, 100, 2, 2000),
    );
    return {
        enabled: parseBool(env.GROWTH_LAUNCH_FREEZE_ENABLED, true),
        warningBurnPct,
        criticalBurnPct,
        windowHours: parseWindowHours(env.GROWTH_LAUNCH_FREEZE_WINDOWS_HOURS),
        blockedChannels: parseCsvEnum(env.GROWTH_LAUNCH_FREEZE_BLOCKED_CHANNELS, SUPPORTED_CHANNELS),
        blockedActions: parseCsvEnum(env.GROWTH_LAUNCH_FREEZE_BLOCKED_ACTIONS, SUPPORTED_ACTIONS),
        recoveryHealthyWindowsRequired: parseInteger(
            env.GROWTH_LAUNCH_FREEZE_RECOVERY_HEALTHY_WINDOWS,
            2,
            1,
            24,
        ),
    };
}

function resolveGrowthLaunchFreezePostmortemSlaConfig(
    env: Record<string, string | undefined> = process.env,
): GrowthLaunchFreezePostmortemSlaConfig {
    return {
        enabled: parseBool(env.GROWTH_LAUNCH_FREEZE_POSTMORTEM_SLA_ENABLED, true),
        slaHours: parseInteger(env.GROWTH_LAUNCH_FREEZE_POSTMORTEM_SLA_HOURS, 48, 1, 24 * 30),
        scanLimit: parseInteger(env.GROWTH_LAUNCH_FREEZE_POSTMORTEM_SCAN_LIMIT, 200, 10, 2000),
        maxAlertsPerSweep: parseInteger(env.GROWTH_LAUNCH_FREEZE_POSTMORTEM_MAX_ALERTS, 10, 0, 100),
    };
}

export type GrowthLaunchFreezeOverrideRole = 'admin' | 'expert';

export function resolveGrowthLaunchFreezeOverrideAllowedRoles(
    env: Record<string, string | undefined> = process.env,
): Set<GrowthLaunchFreezeOverrideRole> {
    const raw = env.GROWTH_LAUNCH_FREEZE_OVERRIDE_ALLOWED_ROLES?.trim().toLowerCase();
    if (!raw) {
        return new Set(['admin']);
    }
    const parsed = raw
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is GrowthLaunchFreezeOverrideRole => value === 'admin' || value === 'expert');
    if (parsed.length === 0) {
        return new Set(['admin']);
    }
    if (!parsed.includes('admin')) {
        parsed.unshift('admin');
    }
    return new Set(parsed);
}

export function canMutateGrowthLaunchFreezeOverride(
    role: string,
    env: Record<string, string | undefined> = process.env,
): boolean {
    if (role !== 'admin' && role !== 'expert') {
        return false;
    }
    return resolveGrowthLaunchFreezeOverrideAllowedRoles(env).has(role);
}

function parseOverrideRecordFromRow(row: {
    id: string;
    metadata: unknown;
    createdAt: Date | null;
}): GrowthLaunchFreezeOverrideRecord | null {
    const metadata = asRecord(row.metadata);
    const source = readString(metadata.source);
    if (source !== 'growth_launch_freeze_override') {
        return null;
    }

    const statusRaw = readString(metadata.status);
    const status: GrowthLaunchFreezeOverrideRecord['status'] = statusRaw === 'cleared'
        ? 'cleared'
        : statusRaw === 'expired'
            ? 'expired'
            : 'active';
    const reason = readString(metadata.reason);
    if (!reason) {
        return null;
    }

    const override = normalizeOverride(asRecord(metadata.override));
    const expiresAt = readString(metadata.expiresAt);
    const createdAt = row.createdAt ? row.createdAt.toISOString() : new Date().toISOString();

    return {
        id: row.id,
        actorUserId: readString(metadata.actorUserId),
        reason,
        createdAt,
        expiresAt,
        postmortemUrl: readString(metadata.postmortemUrl),
        incidentKey: readString(metadata.incidentKey),
        override,
        status,
        supersededById: readString(metadata.supersededById),
    };
}

function parseOverrideRequestRecordFromRow(row: {
    id: string;
    metadata: unknown;
    createdAt: Date | null;
}): GrowthLaunchFreezeOverrideRequestRecord | null {
    const metadata = asRecord(row.metadata);
    const source = readString(metadata.source);
    if (source !== 'growth_launch_freeze_override_request') {
        return null;
    }

    const reason = readString(metadata.reason);
    if (!reason) {
        return null;
    }

    const submittedAt = readString(metadata.submittedAt)
        ?? (row.createdAt ? row.createdAt.toISOString() : new Date().toISOString());
    const statusRaw = readString(metadata.status);
    const status: GrowthLaunchFreezeOverrideRequestRecord['status'] = statusRaw === 'approved'
        ? 'approved'
        : statusRaw === 'rejected'
            ? 'rejected'
            : statusRaw === 'expired'
                ? 'expired'
                : 'pending';

    return {
        id: row.id,
        requestedByUserId: readString(metadata.requestedByUserId),
        requestedByRole: readString(metadata.requestedByRole),
        reason,
        submittedAt,
        expiresAt: readString(metadata.expiresAt),
        postmortemUrl: readString(metadata.postmortemUrl),
        incidentKey: readString(metadata.incidentKey),
        override: normalizeOverride(asRecord(metadata.override)),
        status,
        decidedAt: readString(metadata.decidedAt),
        decidedByUserId: readString(metadata.decidedByUserId),
        decisionReason: readString(metadata.decisionReason),
        appliedOverrideId: readString(metadata.appliedOverrideId),
    };
}

function parsePostmortemRecordFromRow(row: {
    id: string;
    metadata: unknown;
}): GrowthLaunchFreezePostmortemRecord | null {
    const metadata = asRecord(row.metadata);
    if (readString(metadata.source) !== 'growth_launch_freeze_postmortem') {
        return null;
    }
    if (readString(metadata.status) !== 'completed') {
        return null;
    }
    const incidentKey = readString(metadata.incidentKey);
    const completedAt = readString(metadata.completedAt);
    if (!incidentKey || !completedAt) {
        return null;
    }
    return {
        id: row.id,
        incidentKey,
        completedAt,
        completedByUserId: readString(metadata.completedByUserId),
        postmortemUrl: readString(metadata.postmortemUrl),
        notes: readString(metadata.notes),
    };
}

function parseEnteredIncidentFromRow(row: {
    metadata: unknown;
    createdAt: Date | null;
}): {
    incidentKey: string;
    enteredAt: string;
    postmortemUrl: string | null;
} | null {
    const metadata = asRecord(row.metadata);
    if (readString(metadata.source) !== 'growth_launch_freeze_audit') {
        return null;
    }
    if (readString(metadata.event) !== 'entered') {
        return null;
    }
    const incidentKey = readString(metadata.incidentKey);
    if (!incidentKey) {
        return null;
    }
    const enteredAt = row.createdAt
        ? row.createdAt.toISOString()
        : new Date().toISOString();
    return {
        incidentKey,
        enteredAt,
        postmortemUrl: readString(metadata.postmortemUrl),
    };
}

function isOverrideExpired(record: GrowthLaunchFreezeOverrideRecord, now: Date): boolean {
    if (!record.expiresAt) return false;
    const expiresAt = new Date(record.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) return false;
    return expiresAt.getTime() <= now.getTime();
}

export async function listGrowthLaunchFreezeOverrideHistory(limit = 20): Promise<GrowthLaunchFreezeOverrideRecord[]> {
    const cappedLimit = Math.max(1, Math.min(limit, 100));
    const rows = await db.select({
        id: notifications.id,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'info'),
            sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_override'`,
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(cappedLimit);

    const now = new Date();
    return rows
        .map(parseOverrideRecordFromRow)
        .filter((row): row is GrowthLaunchFreezeOverrideRecord => row !== null)
        .map((row) => ({
            ...row,
            status: row.status === 'active' && isOverrideExpired(row, now)
                ? 'expired'
                : row.status,
        }));
}

export async function getActiveGrowthLaunchFreezeOverride(now = new Date()): Promise<GrowthLaunchFreezeOverrideRecord | null> {
    const history = await listGrowthLaunchFreezeOverrideHistory(30);
    for (const entry of history) {
        if (entry.status === 'cleared') {
            return null;
        }
        if (entry.status === 'active' && !isOverrideExpired(entry, now)) {
            return entry;
        }
    }
    return null;
}

function isRequestExpired(record: GrowthLaunchFreezeOverrideRequestRecord, now: Date): boolean {
    if (!record.expiresAt) return false;
    const expiresAt = new Date(record.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) return false;
    return expiresAt.getTime() <= now.getTime();
}

export async function listGrowthLaunchFreezeOverrideRequests(input?: {
    limit?: number;
    statuses?: Array<'pending' | 'approved' | 'rejected' | 'expired'>;
}): Promise<GrowthLaunchFreezeOverrideRequestRecord[]> {
    const limit = Math.max(1, Math.min(input?.limit ?? 50, 200));
    const statusFilter = input?.statuses && input.statuses.length > 0
        ? new Set(input.statuses)
        : null;

    const rows = await db.select({
        id: notifications.id,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'info'),
            sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_override_request'`,
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

    const now = new Date();
    const parsed = rows
        .map(parseOverrideRequestRecordFromRow)
        .filter((row): row is GrowthLaunchFreezeOverrideRequestRecord => row !== null)
        .map((row) => ({
            ...row,
            status: row.status === 'pending' && isRequestExpired(row, now)
                ? 'expired' as const
                : row.status,
        }));

    if (!statusFilter) {
        return parsed;
    }
    return parsed.filter((row) => statusFilter.has(row.status));
}

export async function getGrowthLaunchFreezeOverrideRequestById(requestId: string): Promise<GrowthLaunchFreezeOverrideRequestRecord | null> {
    const [row] = await db.select({
        id: notifications.id,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    })
        .from(notifications)
        .where(eq(notifications.id, requestId))
        .limit(1);
    if (!row) return null;
    const parsed = parseOverrideRequestRecordFromRow(row);
    if (!parsed) return null;
    if (parsed.status === 'pending' && isRequestExpired(parsed, new Date())) {
        return {
            ...parsed,
            status: 'expired',
        };
    }
    return parsed;
}

type GrowthLaunchFreezePostmortemSlaEvaluation = {
    config: GrowthLaunchFreezePostmortemSlaConfig;
    scanned: number;
    postmortemsCompleted: number;
    overdueIncidentKeys: string[];
    overdueIncidents: GrowthLaunchFreezePostmortemIncident[];
    incidents: GrowthLaunchFreezePostmortemIncident[];
};

async function evaluateGrowthLaunchFreezePostmortemSlaInternal(input?: {
    now?: Date;
    config?: GrowthLaunchFreezePostmortemSlaConfig;
}): Promise<GrowthLaunchFreezePostmortemSlaEvaluation> {
    const now = input?.now ?? new Date();
    const config = input?.config ?? resolveGrowthLaunchFreezePostmortemSlaConfig();
    if (!config.enabled) {
        return {
            config,
            scanned: 0,
            postmortemsCompleted: 0,
            overdueIncidentKeys: [],
            overdueIncidents: [],
            incidents: [],
        };
    }

    const [enteredRows, completedRows] = await Promise.all([
        db.select({
            metadata: notifications.metadata,
            createdAt: notifications.createdAt,
        })
            .from(notifications)
            .where(and(
                eq(notifications.type, 'info'),
                sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_audit'`,
                sql`${notifications.metadata} ->> 'event' = 'entered'`,
            ))
            .orderBy(desc(notifications.createdAt))
            .limit(config.scanLimit),
        db.select({
            id: notifications.id,
            metadata: notifications.metadata,
        })
            .from(notifications)
            .where(and(
                eq(notifications.type, 'info'),
                sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_postmortem'`,
                sql`${notifications.metadata} ->> 'status' = 'completed'`,
            ))
            .orderBy(desc(notifications.createdAt))
            .limit(config.scanLimit),
    ]);

    const incidentByKey = new Map<string, {
        incidentKey: string;
        enteredAt: string;
        postmortemUrl: string | null;
    }>();
    for (const row of enteredRows) {
        const parsed = parseEnteredIncidentFromRow(row);
        if (!parsed) continue;
        if (!incidentByKey.has(parsed.incidentKey)) {
            incidentByKey.set(parsed.incidentKey, parsed);
        }
    }

    const completedByIncidentKey = new Map<string, GrowthLaunchFreezePostmortemRecord>();
    for (const row of completedRows) {
        const parsed = parsePostmortemRecordFromRow(row);
        if (!parsed) continue;
        if (!completedByIncidentKey.has(parsed.incidentKey)) {
            completedByIncidentKey.set(parsed.incidentKey, parsed);
        }
    }

    const incidents: GrowthLaunchFreezePostmortemIncident[] = [];
    const overdueIncidents: GrowthLaunchFreezePostmortemIncident[] = [];
    const dueWindowMs = config.slaHours * 60 * 60 * 1000;
    for (const incident of incidentByKey.values()) {
        const enteredAtDate = new Date(incident.enteredAt);
        if (!Number.isFinite(enteredAtDate.getTime())) continue;
        const dueAtDate = new Date(enteredAtDate.getTime() + dueWindowMs);
        const completed = completedByIncidentKey.get(incident.incidentKey) ?? null;
        const overdue = !completed && dueAtDate.getTime() <= now.getTime();
        const mapped: GrowthLaunchFreezePostmortemIncident = {
            incidentKey: incident.incidentKey,
            enteredAt: enteredAtDate.toISOString(),
            dueAt: dueAtDate.toISOString(),
            postmortemUrl: incident.postmortemUrl,
            completedAt: completed?.completedAt ?? null,
            overdue,
        };
        incidents.push(mapped);
        if (overdue) {
            overdueIncidents.push(mapped);
        }
    }

    incidents.sort((left, right) => right.enteredAt.localeCompare(left.enteredAt));
    overdueIncidents.sort((left, right) => right.enteredAt.localeCompare(left.enteredAt));

    return {
        config,
        scanned: incidents.length,
        postmortemsCompleted: incidents.filter((incident) => incident.completedAt !== null).length,
        overdueIncidentKeys: overdueIncidents.map((incident) => incident.incidentKey),
        overdueIncidents,
        incidents,
    };
}

export async function getGrowthLaunchFreezePostmortemSlaSummary(input?: {
    now?: Date;
}): Promise<GrowthLaunchFreezePostmortemSlaSummary> {
    const evaluation = await evaluateGrowthLaunchFreezePostmortemSlaInternal(input);
    return {
        enabled: evaluation.config.enabled,
        scanned: evaluation.scanned,
        overdue: evaluation.overdueIncidentKeys.length,
        alertsCreated: 0,
        opsAlertsSent: 0,
        opsAlertsFailed: 0,
        postmortemsCompleted: evaluation.postmortemsCompleted,
        overdueIncidentKeys: evaluation.overdueIncidentKeys,
    };
}

export async function listGrowthLaunchFreezePostmortemIncidents(input?: {
    now?: Date;
    overdueOnly?: boolean;
}): Promise<GrowthLaunchFreezePostmortemIncident[]> {
    const evaluation = await evaluateGrowthLaunchFreezePostmortemSlaInternal(input);
    if (input?.overdueOnly) {
        return evaluation.overdueIncidents;
    }
    return evaluation.incidents;
}

export async function recordGrowthLaunchFreezePostmortemCompletion(input: {
    incidentKey: string;
    completedByUserId: string;
    postmortemUrl?: string | null;
    notes?: string | null;
}): Promise<{
    record: GrowthLaunchFreezePostmortemRecord;
    created: boolean;
}> {
    const incidentKey = input.incidentKey.trim();
    if (!incidentKey) {
        throw new Error('incidentKey is required');
    }

    const [existing] = await db.select({
        id: notifications.id,
        metadata: notifications.metadata,
    })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'info'),
            sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_postmortem'`,
            sql`${notifications.metadata} ->> 'status' = 'completed'`,
            sql`${notifications.metadata} ->> 'incidentKey' = ${incidentKey}`,
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(1);

    const existingRecord = existing ? parsePostmortemRecordFromRow(existing) : null;
    if (existingRecord) {
        return {
            record: existingRecord,
            created: false,
        };
    }

    const completedAt = new Date().toISOString();
    const [row] = await db.insert(notifications).values({
        type: 'info',
        severity: 'info',
        title: `Growth launch freeze postmortem completed (${incidentKey})`,
        message: input.notes?.trim() || 'Postmortem completed and logged.',
        actionUrl: '/dashboard/growth',
        emailSent: false,
        isRead: false,
        metadata: {
            source: 'growth_launch_freeze_postmortem',
            status: 'completed',
            incidentKey,
            completedAt,
            completedByUserId: input.completedByUserId,
            postmortemUrl: input.postmortemUrl ?? null,
            notes: input.notes?.trim() || null,
        },
    }).returning({
        id: notifications.id,
        metadata: notifications.metadata,
    });

    const parsed = row ? parsePostmortemRecordFromRow(row) : null;
    if (!parsed) {
        throw new Error('Failed to persist growth launch freeze postmortem completion');
    }
    return {
        record: parsed,
        created: true,
    };
}

async function listOpenGrowthLaunchFreezePostmortemSlaAlerts(limit: number): Promise<Set<string>> {
    const rows = await db.select({
        metadata: notifications.metadata,
    })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'info'),
            sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_postmortem_sla'`,
            sql`${notifications.metadata} ->> 'status' = 'open'`,
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

    const keys = new Set<string>();
    for (const row of rows) {
        const metadata = asRecord(row.metadata);
        const incidentKey = readString(metadata.incidentKey);
        if (incidentKey) {
            keys.add(incidentKey);
        }
    }
    return keys;
}

export async function runGrowthLaunchFreezePostmortemSlaSweep(input?: {
    now?: Date;
    notifyOps?: boolean;
}): Promise<GrowthLaunchFreezePostmortemSlaSummary> {
    const config = resolveGrowthLaunchFreezePostmortemSlaConfig();
    if (!config.enabled) {
        return {
            enabled: false,
            scanned: 0,
            overdue: 0,
            alertsCreated: 0,
            opsAlertsSent: 0,
            opsAlertsFailed: 0,
            postmortemsCompleted: 0,
            overdueIncidentKeys: [],
        };
    }

    const now = input?.now ?? new Date();
    const evaluation = await evaluateGrowthLaunchFreezePostmortemSlaInternal({
        now,
        config,
    });
    if (evaluation.overdueIncidents.length === 0 || config.maxAlertsPerSweep <= 0) {
        return {
            enabled: true,
            scanned: evaluation.scanned,
            overdue: evaluation.overdueIncidentKeys.length,
            alertsCreated: 0,
            opsAlertsSent: 0,
            opsAlertsFailed: 0,
            postmortemsCompleted: evaluation.postmortemsCompleted,
            overdueIncidentKeys: evaluation.overdueIncidentKeys,
        };
    }

    const openAlertIncidentKeys = await listOpenGrowthLaunchFreezePostmortemSlaAlerts(config.scanLimit);
    let alertsCreated = 0;
    let opsAlertsSent = 0;
    let opsAlertsFailed = 0;

    for (const incident of evaluation.overdueIncidents) {
        if (alertsCreated >= config.maxAlertsPerSweep) {
            break;
        }
        if (openAlertIncidentKeys.has(incident.incidentKey)) {
            continue;
        }

        const dueAt = new Date(incident.dueAt);
        const overdueHours = Math.max(0, (now.getTime() - dueAt.getTime()) / (60 * 60 * 1000));
        const severity = overdueHours >= config.slaHours ? 'critical' : 'warning';
        const message = `Postmortem for launch-freeze incident ${incident.incidentKey} ` +
            `was due at ${incident.dueAt} (${config.slaHours}h SLA) and remains incomplete.`;

        try {
            await createNotification({
                type: 'info',
                severity,
                title: `Growth launch freeze postmortem overdue (${incident.incidentKey})`,
                message,
                actionUrl: '/dashboard/growth',
                metadata: {
                    source: 'growth_launch_freeze_postmortem_sla',
                    status: 'open',
                    incidentKey: incident.incidentKey,
                    enteredAt: incident.enteredAt,
                    dueAt: incident.dueAt,
                    postmortemUrl: incident.postmortemUrl,
                    slaHours: config.slaHours,
                },
            });
            alertsCreated += 1;
            openAlertIncidentKeys.add(incident.incidentKey);
        } catch (notificationError) {
            console.error('Failed to create launch-freeze postmortem SLA notification', {
                incidentKey: incident.incidentKey,
                error: notificationError,
            });
            continue;
        }

        if (input?.notifyOps === false) {
            continue;
        }
        try {
            const ops = await sendOpsChannelAlert({
                source: 'growth_launch_freeze_postmortem_sla',
                severity,
                title: `Growth launch freeze postmortem overdue (${incident.incidentKey})`,
                message,
                details: {
                    incidentKey: incident.incidentKey,
                    enteredAt: incident.enteredAt,
                    dueAt: incident.dueAt,
                    postmortemUrl: incident.postmortemUrl,
                    slaHours: config.slaHours,
                    overdueHours: Number(overdueHours.toFixed(2)),
                },
            });
            if (ops.delivered) {
                opsAlertsSent += 1;
            } else {
                opsAlertsFailed += 1;
            }
        } catch (opsError) {
            opsAlertsFailed += 1;
            console.error('Failed to send launch-freeze postmortem SLA ops alert', {
                incidentKey: incident.incidentKey,
                error: opsError,
            });
        }
    }

    return {
        enabled: true,
        scanned: evaluation.scanned,
        overdue: evaluation.overdueIncidentKeys.length,
        alertsCreated,
        opsAlertsSent,
        opsAlertsFailed,
        postmortemsCompleted: evaluation.postmortemsCompleted,
        overdueIncidentKeys: evaluation.overdueIncidentKeys,
    };
}

export async function getGrowthSloWindowSummary(input: {
    windowHours: number;
    now?: Date;
}): Promise<GrowthSloWindowSummary> {
    const windowHours = Math.max(6, Math.min(Math.trunc(input.windowHours), 24 * 30));
    const now = input.now ?? new Date();
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

    const [eventCounts] = await db.select({
        publishedCount: sql<number>`count(*) filter (where ${promotionEvents.eventType} = 'published')::int`,
        blockedCount: sql<number>`count(*) filter (where ${promotionEvents.eventType} = 'publish_blocked')::int`,
        failedCount: sql<number>`count(*) filter (where ${promotionEvents.eventType} = 'publish_failed')::int`,
    })
        .from(promotionEvents)
        .where(and(
            gte(promotionEvents.occurredAt, windowStart),
            inArray(promotionEvents.eventType, EVENT_TYPES),
        ));

    const publishedCount = eventCounts?.publishedCount ?? 0;
    const blockedCount = eventCounts?.blockedCount ?? 0;
    const failedCount = eventCounts?.failedCount ?? 0;
    const evaluatedCount = publishedCount + blockedCount + failedCount;
    const publishSuccessRate = evaluatedCount > 0 ? publishedCount / evaluatedCount : null;

    const publishSlo = assessSuccessRateSlo({
        successRate: publishSuccessRate,
        target: 0.97,
    });

    const [moderationCounts] = await db.select({
        dueCount: sql<number>`count(*) filter (where ${mediaModerationTasks.dueAt} is not null)::int`,
        onTimeCount: sql<number>`count(*) filter (where ${mediaModerationTasks.dueAt} is not null and coalesce(${mediaModerationTasks.reviewedAt}, now()) <= ${mediaModerationTasks.dueAt})::int`,
        lateCount: sql<number>`count(*) filter (where ${mediaModerationTasks.dueAt} is not null and coalesce(${mediaModerationTasks.reviewedAt}, now()) > ${mediaModerationTasks.dueAt})::int`,
    })
        .from(mediaModerationTasks)
        .where(gte(mediaModerationTasks.createdAt, windowStart));

    const moderationDueCount = moderationCounts?.dueCount ?? 0;
    const moderationOnTimeCount = moderationCounts?.onTimeCount ?? 0;
    const moderationLateCount = moderationCounts?.lateCount ?? 0;
    const moderationOnTimeRate = moderationDueCount > 0
        ? moderationOnTimeCount / moderationDueCount
        : null;

    const moderationSlo = assessSuccessRateSlo({
        successRate: moderationOnTimeRate,
        target: 0.95,
    });

    const [syncLagRow] = await db.select({
        latestCompletedAt: sql<Date | null>`max(${integrationSyncRuns.completedAt})`,
    })
        .from(integrationSyncRuns)
        .where(isNotNull(integrationSyncRuns.completedAt));

    const latestCompletedAt = syncLagRow?.latestCompletedAt ?? null;
    const lagHours = latestCompletedAt
        ? Math.max(0, (now.getTime() - latestCompletedAt.getTime()) / (60 * 60 * 1000))
        : null;
    const freshnessSlo = assessMaxThresholdSlo({
        actual: lagHours,
        maxThreshold: 6,
    });

    const overallStatus = combineStatus([
        publishSlo.status,
        moderationSlo.status,
        freshnessSlo.status,
    ]);

    return {
        windowHours,
        publish: {
            targetSuccessRate: publishSlo.target,
            evaluatedCount,
            publishedCount,
            blockedCount,
            failedCount,
            successRate: publishSlo.actual,
            failureRate: publishSlo.failureRate,
            burnPct: publishSlo.burnPct,
            status: publishSlo.status,
        },
        moderation: {
            targetOnTimeRate: moderationSlo.target,
            dueCount: moderationDueCount,
            onTimeCount: moderationOnTimeCount,
            lateCount: moderationLateCount,
            onTimeRate: moderationSlo.actual,
            lateRate: moderationSlo.failureRate,
            burnPct: moderationSlo.burnPct,
            status: moderationSlo.status,
        },
        syncFreshness: {
            maxLagHours: freshnessSlo.maxThreshold,
            latestCompletedAt: latestCompletedAt?.toISOString() ?? null,
            lagHours,
            burnPct: freshnessSlo.burnPct,
            status: freshnessSlo.status,
        },
        overallStatus,
        generatedAt: now.toISOString(),
    };
}

export function deriveGrowthLaunchFreezeState(input: {
    config?: GrowthLaunchFreezeConfig;
    windowSummaries: GrowthSloWindowSummary[];
    now?: Date;
}): GrowthLaunchFreezeState {
    const config = input.config ?? resolveGrowthLaunchFreezeConfig();
    const warningTriggers: GrowthLaunchFreezeTrigger[] = [];
    const criticalTriggers: GrowthLaunchFreezeTrigger[] = [];

    for (const summary of input.windowSummaries) {
        const candidates = [
            {
                metric: 'publish' as const,
                burnPct: summary.publish.burnPct,
                status: summary.publish.status,
            },
            {
                metric: 'moderation' as const,
                burnPct: summary.moderation.burnPct,
                status: summary.moderation.status,
            },
            {
                metric: 'sync_freshness' as const,
                burnPct: summary.syncFreshness.burnPct,
                status: summary.syncFreshness.status,
            },
        ];

        for (const candidate of candidates) {
            if (candidate.burnPct === null || !Number.isFinite(candidate.burnPct)) {
                continue;
            }
            if (candidate.burnPct > config.criticalBurnPct) {
                criticalTriggers.push({
                    metric: candidate.metric,
                    severity: 'critical',
                    windowHours: summary.windowHours,
                    burnPct: candidate.burnPct,
                    threshold: config.criticalBurnPct,
                    status: candidate.status,
                    reasonCode: metricReasonCode(candidate.metric, 'critical', summary.windowHours),
                });
                continue;
            }
            if (candidate.burnPct > config.warningBurnPct) {
                warningTriggers.push({
                    metric: candidate.metric,
                    severity: 'warning',
                    windowHours: summary.windowHours,
                    burnPct: candidate.burnPct,
                    threshold: config.warningBurnPct,
                    status: candidate.status,
                    reasonCode: metricReasonCode(candidate.metric, 'warning', summary.windowHours),
                });
            }
        }
    }

    const rawActive = config.enabled && criticalTriggers.length > 0;
    const level: GrowthLaunchFreezeState['level'] = rawActive
        ? 'critical'
        : warningTriggers.length > 0
            ? 'warning'
            : 'healthy';
    const triggers = rawActive ? criticalTriggers : warningTriggers;
    const reasonCodes = [...new Set(triggers.map((trigger) => trigger.reasonCode))];

    return {
        enabled: config.enabled,
        active: rawActive,
        rawActive,
        blockedChannels: [...config.blockedChannels],
        blockedActions: [...config.blockedActions],
        recoveryHoldActive: false,
        recoveryHealthyWindows: 0,
        recoveryHealthyWindowsRequired: config.recoveryHealthyWindowsRequired,
        level,
        warningBurnPct: config.warningBurnPct,
        criticalBurnPct: config.criticalBurnPct,
        reasonCodes,
        overrideActive: false,
        overrideId: null,
        overrideExpiresAt: null,
        overrideReason: null,
        triggers,
        windowSummaries: input.windowSummaries,
        generatedAt: (input.now ?? new Date()).toISOString(),
    };
}

export function applyGrowthLaunchFreezeRecoveryPolicy(input: {
    rawState: GrowthLaunchFreezeState;
    previousAudit?: GrowthLaunchFreezeAuditSnapshot | null;
    config?: GrowthLaunchFreezeConfig;
    now?: Date;
}): GrowthLaunchFreezeState {
    const config = input.config ?? resolveGrowthLaunchFreezeConfig();
    const rawState = input.rawState;
    const previous = input.previousAudit ?? null;

    if (!config.enabled) {
        return {
            ...rawState,
            active: false,
            rawActive: false,
            recoveryHoldActive: false,
            recoveryHealthyWindows: 0,
            recoveryHealthyWindowsRequired: config.recoveryHealthyWindowsRequired,
            level: 'healthy',
            reasonCodes: [],
            generatedAt: (input.now ?? new Date()).toISOString(),
        };
    }

    if (rawState.rawActive) {
        return {
            ...rawState,
            active: true,
            recoveryHoldActive: false,
            recoveryHealthyWindows: 0,
            recoveryHealthyWindowsRequired: config.recoveryHealthyWindowsRequired,
            generatedAt: (input.now ?? new Date()).toISOString(),
        };
    }

    const previousActive = previous?.active ?? false;
    const previousRecoveryWindows = Math.max(0, previous?.recoveryHealthyWindows ?? 0);
    const recoveryHealthyWindows = previousActive ? previousRecoveryWindows + 1 : 0;
    const recoveryHoldActive = previousActive && recoveryHealthyWindows < config.recoveryHealthyWindowsRequired;
    const reasonCodes = recoveryHoldActive
        ? [...new Set([...rawState.reasonCodes, 'recovery_hold'])]
        : rawState.reasonCodes;

    return {
        ...rawState,
        active: recoveryHoldActive,
        recoveryHoldActive,
        recoveryHealthyWindows,
        recoveryHealthyWindowsRequired: config.recoveryHealthyWindowsRequired,
        level: recoveryHoldActive
            ? 'warning'
            : rawState.level,
        reasonCodes,
        generatedAt: (input.now ?? new Date()).toISOString(),
    };
}

export async function getLatestGrowthLaunchFreezeAuditSnapshot(): Promise<GrowthLaunchFreezeAuditSnapshot | null> {
    const [row] = await db.select({
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'info'),
            sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_audit'`,
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(1);

    if (!row) return null;

    const metadata = asRecord(row.metadata);
    const active = readBoolean(metadata.active);
    const rawActive = readBoolean(metadata.rawActive);
    const recoveryHoldActive = readBoolean(metadata.recoveryHoldActive);
    const recoveryHealthyWindows = readNumber(metadata.recoveryHealthyWindows);
    const levelRaw = readString(metadata.level);
    const reasonCodesRaw = Array.isArray(metadata.reasonCodes) ? metadata.reasonCodes : [];

    if (active === null || rawActive === null || recoveryHoldActive === null || recoveryHealthyWindows === null) {
        return null;
    }

    const level: GrowthLaunchFreezeAuditSnapshot['level'] = levelRaw === 'critical' || levelRaw === 'warning'
        ? levelRaw
        : 'healthy';

    return {
        active,
        rawActive,
        recoveryHoldActive,
        recoveryHealthyWindows: Math.max(0, Math.trunc(recoveryHealthyWindows)),
        level,
        reasonCodes: reasonCodesRaw
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0),
        recordedAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
}

export async function evaluateGrowthLaunchFreeze(input?: {
    now?: Date;
    config?: GrowthLaunchFreezeConfig;
    previousAudit?: GrowthLaunchFreezeAuditSnapshot | null;
    override?: GrowthLaunchFreezeOverrideRecord | null;
}): Promise<GrowthLaunchFreezeState> {
    const baseConfig = input?.config ?? resolveGrowthLaunchFreezeConfig();
    const now = input?.now ?? new Date();
    const override = input?.override !== undefined
        ? input.override
        : await getActiveGrowthLaunchFreezeOverride(now);
    const effectiveConfig = override
        ? applyFreezeOverrideToConfig(baseConfig, override.override)
        : baseConfig;
    const summaries = await Promise.all(
        effectiveConfig.windowHours.map((windowHours) => getGrowthSloWindowSummary({ windowHours, now })),
    );
    const rawState = deriveGrowthLaunchFreezeState({
        config: effectiveConfig,
        windowSummaries: summaries,
        now,
    });
    const previousAudit = input?.previousAudit !== undefined
        ? input.previousAudit
        : await getLatestGrowthLaunchFreezeAuditSnapshot();
    const state = applyGrowthLaunchFreezeRecoveryPolicy({
        rawState,
        previousAudit,
        config: effectiveConfig,
        now,
    });
    return {
        ...state,
        overrideActive: Boolean(override),
        overrideId: override?.id ?? null,
        overrideExpiresAt: override?.expiresAt ?? null,
        overrideReason: override?.reason ?? null,
    };
}

export function shouldBlockGrowthLaunchForScope(input: {
    state: GrowthLaunchFreezeState;
    scope?: GrowthLaunchFreezeScope;
    config?: GrowthLaunchFreezeConfig;
}): boolean {
    if (!input.state.enabled || !input.state.active) return false;

    const blockedChannels = input.config?.blockedChannels ?? input.state.blockedChannels;
    const blockedActions = input.config?.blockedActions ?? input.state.blockedActions;
    const channels = normalizeChannels(input.scope?.channels ?? null);
    const action = normalizeAction(input.scope?.action ?? null);

    const channelMatches = channels.length === 0
        ? true
        : channels.some((channel) => blockedChannels.includes(channel));
    const actionMatches = action === null || action === 'unknown'
        ? true
        : blockedActions.includes(action);

    return channelMatches && actionMatches;
}

function buildOverrideFingerprint(prefix: 'apply' | 'clear', actorUserId: string, createdAt: Date): string {
    return `growth_launch_freeze_override:${prefix}:${actorUserId}:${createdAt.toISOString()}`;
}

export function validateGrowthLaunchFreezeOverride(input: {
    baseConfig: GrowthLaunchFreezeConfig;
    override: GrowthLaunchFreezeOverride;
}): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { baseConfig, override } = input;

    if (override.warningBurnPct !== undefined && override.warningBurnPct < baseConfig.warningBurnPct) {
        errors.push('warningBurnPct must be greater than or equal to baseline policy.');
    }
    if (override.criticalBurnPct !== undefined && override.criticalBurnPct < baseConfig.criticalBurnPct) {
        errors.push('criticalBurnPct must be greater than or equal to baseline policy.');
    }
    if (override.blockedChannels && override.blockedChannels.some((channel) => !baseConfig.blockedChannels.includes(channel))) {
        errors.push('blockedChannels must be a subset of baseline blocked channels.');
    }
    if (override.blockedActions && override.blockedActions.some((action) => !baseConfig.blockedActions.includes(action))) {
        errors.push('blockedActions must be a subset of baseline blocked actions.');
    }
    if (
        override.recoveryHealthyWindowsRequired !== undefined
        && override.recoveryHealthyWindowsRequired > baseConfig.recoveryHealthyWindowsRequired
    ) {
        errors.push('recoveryHealthyWindowsRequired cannot exceed baseline policy.');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

export async function applyGrowthLaunchFreezeOverride(input: {
    actorUserId: string;
    reason: string;
    override: GrowthLaunchFreezeOverride;
    expiresAt?: Date | null;
    postmortemUrl?: string | null;
    incidentKey?: string | null;
}): Promise<GrowthLaunchFreezeOverrideRecord> {
    const now = new Date();
    const title = `Growth launch freeze override applied (${now.toISOString()})`;

    const [row] = await db.insert(notifications).values({
        type: 'info',
        severity: 'warning',
        title,
        message: input.reason,
        actionUrl: '/dashboard/growth',
        emailSent: false,
        isRead: false,
        fingerprint: buildOverrideFingerprint('apply', input.actorUserId, now),
        metadata: {
            source: 'growth_launch_freeze_override',
            status: 'active',
            actorUserId: input.actorUserId,
            reason: input.reason,
            override: input.override,
            expiresAt: input.expiresAt?.toISOString() ?? null,
            postmortemUrl: input.postmortemUrl ?? null,
            incidentKey: input.incidentKey ?? null,
            createdAt: now.toISOString(),
        },
        createdAt: now,
    }).returning({
        id: notifications.id,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    });

    const parsed = row ? parseOverrideRecordFromRow(row) : null;
    if (!parsed) {
        throw new Error('Failed to persist launch freeze override');
    }
    return parsed;
}

export async function clearGrowthLaunchFreezeOverride(input: {
    actorUserId: string;
    reason: string;
    clearedOverrideId?: string | null;
}): Promise<GrowthLaunchFreezeOverrideRecord> {
    const now = new Date();
    const title = `Growth launch freeze override cleared (${now.toISOString()})`;

    const [row] = await db.insert(notifications).values({
        type: 'info',
        severity: 'info',
        title,
        message: input.reason,
        actionUrl: '/dashboard/growth',
        emailSent: false,
        isRead: false,
        fingerprint: buildOverrideFingerprint('clear', input.actorUserId, now),
        metadata: {
            source: 'growth_launch_freeze_override',
            status: 'cleared',
            actorUserId: input.actorUserId,
            reason: input.reason,
            supersededById: input.clearedOverrideId ?? null,
            createdAt: now.toISOString(),
            override: {},
        },
        createdAt: now,
    }).returning({
        id: notifications.id,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    });

    const parsed = row ? parseOverrideRecordFromRow(row) : null;
    if (!parsed) {
        throw new Error('Failed to persist launch freeze override clear event');
    }
    return parsed;
}

export async function decideGrowthLaunchFreezeOverrideRequest(input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    decidedByUserId: string;
    decisionReason: string;
}): Promise<{
    request: GrowthLaunchFreezeOverrideRequestRecord;
    appliedOverride: GrowthLaunchFreezeOverrideRecord | null;
}> {
    const [row] = await db.select({
        id: notifications.id,
        metadata: notifications.metadata,
        createdAt: notifications.createdAt,
    })
        .from(notifications)
        .where(eq(notifications.id, input.requestId))
        .limit(1);

    if (!row) {
        throw new Error('Override request not found');
    }

    const request = parseOverrideRequestRecordFromRow(row);
    if (!request) {
        throw new Error('Notification is not a launch-freeze override request');
    }

    const now = new Date();
    if (request.status !== 'pending') {
        throw new Error(`Override request is already ${request.status}`);
    }
    if (isRequestExpired(request, now)) {
        throw new Error('Override request is expired');
    }

    let appliedOverride: GrowthLaunchFreezeOverrideRecord | null = null;
    if (input.decision === 'approved') {
        const baseConfig = resolveGrowthLaunchFreezeConfig();
        const validation = validateGrowthLaunchFreezeOverride({
            baseConfig,
            override: request.override,
        });
        if (!validation.valid) {
            throw new Error(`Cannot approve override request: ${validation.errors.join(' ')}`);
        }

        appliedOverride = await applyGrowthLaunchFreezeOverride({
            actorUserId: input.decidedByUserId,
            reason: `Approved request ${request.id}: ${input.decisionReason}`,
            override: request.override,
            expiresAt: request.expiresAt && !Number.isNaN(new Date(request.expiresAt).getTime()) ? new Date(request.expiresAt) : null,
            postmortemUrl: request.postmortemUrl,
            incidentKey: request.incidentKey,
        });
    }

    const existingMetadata = asRecord(row.metadata);
    const decidedAt = now.toISOString();
    const nextMetadata = {
        ...existingMetadata,
        status: input.decision,
        decidedAt,
        decidedByUserId: input.decidedByUserId,
        decisionReason: input.decisionReason,
        appliedOverrideId: appliedOverride?.id ?? null,
    };

    await db.update(notifications)
        .set({
            metadata: nextMetadata,
        })
        .where(eq(notifications.id, request.id));

    return {
        request: {
            ...request,
            status: input.decision,
            decidedAt,
            decidedByUserId: input.decidedByUserId,
            decisionReason: input.decisionReason,
            appliedOverrideId: appliedOverride?.id ?? null,
        },
        appliedOverride,
    };
}

function summarizeTopTriggers(triggers: GrowthLaunchFreezeTrigger[]): string {
    if (triggers.length === 0) return 'No launch-freeze triggers.';
    return triggers
        .slice(0, 3)
        .map((trigger) => `${trigger.metric}@${trigger.windowHours}h burn=${trigger.burnPct.toFixed(1)}%`)
        .join(', ');
}

export async function emitGrowthLaunchFreezeIncident(input: {
    state: GrowthLaunchFreezeState;
    actorUserId?: string | null;
    context: string;
    campaignId?: string | null;
}): Promise<GrowthLaunchFreezeIncidentResult> {
    if (!input.state.active) {
        return {
            notificationId: null,
            opsDelivered: false,
            opsReason: 'freeze_inactive',
        };
    }

    const title = 'Growth launch freeze active (SLO error budget exceeded)';
    const message = `${summarizeTopTriggers(input.state.triggers)} Launches are blocked until burn recovers or an explicit force override is used.`;

    let notificationId: string | null = null;
    try {
        notificationId = await createNotification({
            type: 'info',
            severity: 'critical',
            title,
            message,
            actionUrl: '/dashboard/growth',
            metadata: {
                source: 'growth_launch_freeze',
                context: input.context,
                campaignId: input.campaignId ?? null,
                actorUserId: input.actorUserId ?? null,
                level: input.state.level,
                active: input.state.active,
                rawActive: input.state.rawActive,
                recoveryHoldActive: input.state.recoveryHoldActive,
                recoveryHealthyWindows: input.state.recoveryHealthyWindows,
                recoveryHealthyWindowsRequired: input.state.recoveryHealthyWindowsRequired,
                reasonCodes: input.state.reasonCodes,
                warningBurnPct: input.state.warningBurnPct,
                criticalBurnPct: input.state.criticalBurnPct,
                triggers: input.state.triggers,
                windows: input.state.windowSummaries.map((summary) => ({
                    windowHours: summary.windowHours,
                    overallStatus: summary.overallStatus,
                    publishBurnPct: summary.publish.burnPct,
                    moderationBurnPct: summary.moderation.burnPct,
                    syncFreshnessBurnPct: summary.syncFreshness.burnPct,
                })),
            },
        });
    } catch (notificationError) {
        console.error('Failed to create growth launch freeze notification', {
            context: input.context,
            campaignId: input.campaignId ?? null,
            actorUserId: input.actorUserId ?? null,
            reasonCodes: input.state.reasonCodes,
            error: notificationError,
        });
    }

    const ops = await sendOpsChannelAlert({
        source: 'growth_launch_freeze',
        severity: 'critical',
        title,
        message,
        details: {
            context: input.context,
            campaignId: input.campaignId ?? null,
            actorUserId: input.actorUserId ?? null,
            level: input.state.level,
            active: input.state.active,
            rawActive: input.state.rawActive,
            recoveryHoldActive: input.state.recoveryHoldActive,
            recoveryHealthyWindows: input.state.recoveryHealthyWindows,
            recoveryHealthyWindowsRequired: input.state.recoveryHealthyWindowsRequired,
            reasonCodes: input.state.reasonCodes,
            triggerCount: input.state.triggers.length,
            windows: input.state.windowSummaries.map((summary) => ({
                windowHours: summary.windowHours,
                overallStatus: summary.overallStatus,
                publishBurnPct: summary.publish.burnPct,
                moderationBurnPct: summary.moderation.burnPct,
                syncFreshnessBurnPct: summary.syncFreshness.burnPct,
            })),
        },
    });

    return {
        notificationId,
        opsDelivered: ops.delivered,
        opsReason: ops.reason,
    };
}

async function getLatestGrowthLaunchFreezeEnteredIncidentContext(): Promise<{
    incidentKey: string | null;
    postmortemUrl: string | null;
}> {
    const [row] = await db.select({
        metadata: notifications.metadata,
    })
        .from(notifications)
        .where(and(
            eq(notifications.type, 'info'),
            sql`${notifications.metadata} ->> 'source' = 'growth_launch_freeze_audit'`,
            sql`${notifications.metadata} ->> 'event' = 'entered'`,
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(1);

    if (!row) {
        return {
            incidentKey: null,
            postmortemUrl: null,
        };
    }
    const metadata = asRecord(row.metadata);
    return {
        incidentKey: readString(metadata.incidentKey),
        postmortemUrl: readString(metadata.postmortemUrl),
    };
}

export async function syncGrowthLaunchFreezeAuditState(input?: {
    now?: Date;
    notifyOps?: boolean;
}): Promise<GrowthLaunchFreezeAuditSyncSummary> {
    const previous = await getLatestGrowthLaunchFreezeAuditSnapshot();
    const state = await evaluateGrowthLaunchFreeze({
        now: input?.now,
        previousAudit: previous,
    });

    const activeChanged = previous ? previous.active !== state.active : state.active;
    const rawChanged = previous ? previous.rawActive !== state.rawActive : state.rawActive;
    const recoveryChanged = previous
        ? (
            previous.recoveryHoldActive !== state.recoveryHoldActive
            || previous.recoveryHealthyWindows !== state.recoveryHealthyWindows
        )
        : state.recoveryHoldActive;
    const levelChanged = previous ? previous.level !== state.level : state.active;

    let event: GrowthLaunchFreezeAuditSyncSummary['event'] = 'unchanged';
    if (activeChanged && state.active) {
        event = 'entered';
    } else if (activeChanged && !state.active) {
        event = 'cleared';
    } else if (state.active && !state.rawActive && (rawChanged || recoveryChanged)) {
        event = 'recovery_hold';
    } else if (rawChanged || levelChanged || recoveryChanged) {
        event = 'updated';
    }

    const changed = event !== 'unchanged';
    if (!changed) {
        return {
            enabled: state.enabled,
            active: state.active,
            rawActive: state.rawActive,
            recoveryHoldActive: state.recoveryHoldActive,
            changed: false,
            event,
            reasonCodes: state.reasonCodes,
            recoveryHealthyWindows: state.recoveryHealthyWindows,
            recoveryHealthyWindowsRequired: state.recoveryHealthyWindowsRequired,
            incidentKey: null,
            postmortemUrl: null,
            notificationId: null,
            opsDelivered: false,
            opsReason: null,
        };
    }

    const enteredContext = event === 'cleared'
        ? await getLatestGrowthLaunchFreezeEnteredIncidentContext()
        : { incidentKey: null, postmortemUrl: null };
    const incidentKey = event === 'entered'
        ? `growth-launch-freeze:${new Date(state.generatedAt).toISOString().slice(0, 13)}`
        : enteredContext.incidentKey;
    const postmortemUrl = event === 'entered'
        ? resolvePostmortemTemplateUrl(incidentKey)
        : enteredContext.postmortemUrl;

    const timestamp = state.generatedAt;
    const title = event === 'cleared'
        ? `Growth launch freeze cleared (${timestamp})`
        : event === 'recovery_hold'
            ? `Growth launch freeze recovery hold (${timestamp})`
            : event === 'updated'
                ? `Growth launch freeze updated (${timestamp})`
                : `Growth launch freeze activated (${timestamp})`;
    const message = event === 'cleared'
        ? `Launch freeze cleared after ${state.recoveryHealthyWindows}/${state.recoveryHealthyWindowsRequired} healthy windows.`
        : `${summarizeTopTriggers(state.triggers)} Recovery windows: ${state.recoveryHealthyWindows}/${state.recoveryHealthyWindowsRequired}.`
            + (postmortemUrl ? ` Postmortem: ${postmortemUrl}` : '');

    let notificationId: string | null = null;
    let opsDelivered = false;
    let opsReason: string | null = null;

    try {
        notificationId = await createNotification({
            type: 'info',
            severity: event === 'entered' ? 'critical' : event === 'cleared' ? 'info' : 'warning',
            title,
            message,
            actionUrl: '/dashboard/growth',
            metadata: {
                source: 'growth_launch_freeze_audit',
                event,
                active: state.active,
                rawActive: state.rawActive,
                recoveryHoldActive: state.recoveryHoldActive,
                recoveryHealthyWindows: state.recoveryHealthyWindows,
                recoveryHealthyWindowsRequired: state.recoveryHealthyWindowsRequired,
                level: state.level,
                reasonCodes: state.reasonCodes,
                incidentKey,
                postmortemUrl,
                triggers: state.triggers,
                windows: state.windowSummaries.map((summary) => ({
                    windowHours: summary.windowHours,
                    overallStatus: summary.overallStatus,
                    publishBurnPct: summary.publish.burnPct,
                    moderationBurnPct: summary.moderation.burnPct,
                    syncFreshnessBurnPct: summary.syncFreshness.burnPct,
                })),
            },
        });
    } catch (notificationError) {
        console.error('Failed to create growth launch freeze audit notification', {
            event,
            error: notificationError,
        });
    }

    if (input?.notifyOps !== false && (event === 'entered' || event === 'cleared')) {
        const ops = await sendOpsChannelAlert({
            source: 'growth_launch_freeze',
            severity: event === 'entered' ? 'critical' : 'info',
            title,
            message,
            details: {
                event,
                active: state.active,
                rawActive: state.rawActive,
                recoveryHoldActive: state.recoveryHoldActive,
                recoveryHealthyWindows: state.recoveryHealthyWindows,
                recoveryHealthyWindowsRequired: state.recoveryHealthyWindowsRequired,
                level: state.level,
                reasonCodes: state.reasonCodes,
                incidentKey,
                postmortemUrl,
            },
        });
        opsDelivered = ops.delivered;
        opsReason = ops.reason;
    }

    return {
        enabled: state.enabled,
        active: state.active,
        rawActive: state.rawActive,
        recoveryHoldActive: state.recoveryHoldActive,
        changed: true,
        event,
        reasonCodes: state.reasonCodes,
        recoveryHealthyWindows: state.recoveryHealthyWindows,
        recoveryHealthyWindowsRequired: state.recoveryHealthyWindowsRequired,
        incidentKey,
        postmortemUrl,
        notificationId,
        opsDelivered,
        opsReason,
    };
}
