import { and, eq, gte } from 'drizzle-orm';
import { db, mediaModerationEvents, notifications } from '@/lib/db';
import {
    getFairnessPlaybookBinding,
    resolveFairnessPlaybookBindings,
    type FairnessPlaybookBinding,
    type FairnessSignalCode,
} from '@/lib/growth/fairness-playbooks';
import { sanitizeNotificationActionUrl } from '@/lib/notifications';

type NotificationSeverity = 'info' | 'warning' | 'critical';

const REPEATED_SIGNALS = new Set<FairnessSignalCode>([
    'reviewer_pending_cap',
    'round_robin_skew',
]);

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

function toNotificationSeverity(value: FairnessPlaybookBinding['severity']): NotificationSeverity {
    return value === 'critical' ? 'critical' : 'warning';
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string | null {
    const raw = value[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function extractSignalCodes(payload: Record<string, unknown>): string[] {
    const direct = payload.policySignalCodes;
    if (Array.isArray(direct)) {
        return direct
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);
    }

    const violationCodes: string[] = [];
    if (Array.isArray(payload.policyViolations)) {
        for (const entry of payload.policyViolations) {
            const item = asRecord(entry);
            const code = readString(item, 'code');
            if (code) violationCodes.push(code);
        }
    }

    const alertCodes: string[] = [];
    if (Array.isArray(payload.policyAlerts)) {
        for (const entry of payload.policyAlerts) {
            const item = asRecord(entry);
            const code = readString(item, 'code');
            if (code) alertCodes.push(code);
        }
    }

    const combined = [...new Set([...violationCodes, ...alertCodes])];
    return combined;
}

function severityRank(severity: NotificationSeverity): number {
    if (severity === 'critical') return 3;
    if (severity === 'warning') return 2;
    return 1;
}

function higherSeverity(left: NotificationSeverity, right: NotificationSeverity): NotificationSeverity {
    return severityRank(left) >= severityRank(right) ? left : right;
}

function buildIncidentKey(input: {
    userId: string;
    signalCode: FairnessSignalCode;
    playbookId: string;
    scope: string;
}): string {
    return `fairness:${input.userId}:${input.signalCode}:${input.playbookId}:${input.scope}`.toLowerCase();
}

function resolveScope(input: {
    signalCode: FairnessSignalCode;
    targetReviewerId?: string | null;
    taskId?: string | null;
}): string {
    if (REPEATED_SIGNALS.has(input.signalCode) && input.targetReviewerId) {
        return `reviewer:${input.targetReviewerId}`;
    }
    if (input.taskId) {
        return `task:${input.taskId}`;
    }
    return 'global';
}

async function countRecentSignalOccurrences(input: {
    userId: string;
    signalCode: FairnessSignalCode;
    now: Date;
    windowHours: number;
}): Promise<number> {
    const windowStart = new Date(input.now.getTime() - input.windowHours * 60 * 60 * 1000);

    const rows = await db.select({
        payload: mediaModerationEvents.payload,
    })
        .from(mediaModerationEvents)
        .where(and(
            eq(mediaModerationEvents.userId, input.userId),
            eq(mediaModerationEvents.eventType, 'assigned'),
            gte(mediaModerationEvents.createdAt, windowStart),
        ))
        .limit(5000);

    let count = 0;
    for (const row of rows) {
        const payload = asRecord(row.payload);
        const signalCodes = extractSignalCodes(payload);
        if (signalCodes.includes(input.signalCode)) {
            count += 1;
        }
    }

    return count;
}

async function upsertIncidentTicket(input: {
    userId: string;
    actorId: string | null;
    taskId?: string | null;
    signalCode: FairnessSignalCode;
    playbook: FairnessPlaybookBinding;
    incidentKey: string;
    summary: string;
    details?: Record<string, unknown>;
    recentSignalCount: number;
    repeatThreshold: number;
    repeatWindowHours: number;
    now: Date;
}): Promise<{
    notificationId: string;
    incidentKey: string;
    playbookId: string;
    signalCode: FairnessSignalCode;
    created: boolean;
    occurrenceCount: number;
}> {
    const ticketSeverity = toNotificationSeverity(input.playbook.severity);
    const nowIso = input.now.toISOString();
    const safeRunbookUrl = sanitizeNotificationActionUrl(input.playbook.runbookUrl);

    return db.transaction(async (tx) => {
        const loadExisting = async () => {
            const [row] = await tx.select({
                id: notifications.id,
                severity: notifications.severity,
                metadata: notifications.metadata,
            })
                .from(notifications)
                .where(eq(notifications.fingerprint, input.incidentKey))
                .limit(1)
                .for('update');
            return row;
        };

        let existing = await loadExisting();

        if (!existing) {
            const [inserted] = await tx.insert(notifications)
                .values({
                    type: 'info',
                    severity: ticketSeverity,
                    title: `Incident ${input.playbook.playbookId}: ${input.playbook.title}`,
                    message: input.summary,
                    actionUrl: safeRunbookUrl,
                    isRead: false,
                    emailSent: false,
                    fingerprint: input.incidentKey,
                    metadata: {
                        userId: input.userId,
                        incident: {
                            source: 'growth_media_review_assignment',
                            signalCode: input.signalCode,
                            playbookId: input.playbook.playbookId,
                            ownerRole: input.playbook.ownerRole,
                            responseSlaMinutes: input.playbook.responseSlaMinutes,
                            escalationAfterMinutes: input.playbook.escalationAfterMinutes,
                            runbookUrl: input.playbook.runbookUrl,
                            taskId: input.taskId ?? null,
                            actorId: input.actorId,
                            occurrenceCount: 1,
                            firstSeenAt: nowIso,
                            lastSeenAt: nowIso,
                            repeatThreshold: input.repeatThreshold,
                            repeatWindowHours: input.repeatWindowHours,
                            recentSignalCount: input.recentSignalCount,
                            details: input.details ?? {},
                        },
                    },
                    createdAt: input.now,
                })
                .onConflictDoNothing({ target: notifications.fingerprint })
                .returning({ id: notifications.id });

            if (inserted) {
                return {
                    notificationId: inserted.id,
                    incidentKey: input.incidentKey,
                    playbookId: input.playbook.playbookId,
                    signalCode: input.signalCode,
                    created: true,
                    occurrenceCount: 1,
                };
            }

            existing = await loadExisting();
            if (!existing) {
                throw new Error(`Failed to upsert fairness incident for fingerprint ${input.incidentKey}`);
            }
        }

        const existingMetadata = asRecord(existing.metadata);
        const incidentMetadata = asRecord(existingMetadata.incident);
        const existingOccurrenceCount = readNumber(incidentMetadata, 'occurrenceCount') ?? 1;
        const nextOccurrenceCount = existingOccurrenceCount + 1;

        const currentSeverity: NotificationSeverity = existing.severity === 'critical'
            ? 'critical'
            : existing.severity === 'warning'
                ? 'warning'
                : 'info';

        const nextSeverity = higherSeverity(currentSeverity, ticketSeverity);

        await tx.update(notifications)
            .set({
                severity: nextSeverity,
                title: `Incident ${input.playbook.playbookId}: ${input.playbook.title}`,
                message: input.summary,
                actionUrl: safeRunbookUrl,
                isRead: false,
                metadata: {
                    ...existingMetadata,
                    userId: input.userId,
                    incident: {
                        ...incidentMetadata,
                        source: 'growth_media_review_assignment',
                        signalCode: input.signalCode,
                        playbookId: input.playbook.playbookId,
                        ownerRole: input.playbook.ownerRole,
                        responseSlaMinutes: input.playbook.responseSlaMinutes,
                        escalationAfterMinutes: input.playbook.escalationAfterMinutes,
                        runbookUrl: input.playbook.runbookUrl,
                        taskId: input.taskId ?? null,
                        actorId: input.actorId,
                        occurrenceCount: nextOccurrenceCount,
                        firstSeenAt: readString(incidentMetadata, 'firstSeenAt') ?? nowIso,
                        lastSeenAt: nowIso,
                        repeatThreshold: input.repeatThreshold,
                        repeatWindowHours: input.repeatWindowHours,
                        recentSignalCount: input.recentSignalCount,
                        details: input.details ?? {},
                    },
                },
            })
            .where(eq(notifications.id, existing.id));

        return {
            notificationId: existing.id,
            incidentKey: input.incidentKey,
            playbookId: input.playbook.playbookId,
            signalCode: input.signalCode,
            created: false,
            occurrenceCount: nextOccurrenceCount,
        };
    });
}

export async function createFairnessIncidentTickets(input: {
    userId: string;
    actorId: string | null;
    taskId?: string | null;
    targetReviewerId?: string | null;
    signalCodes: string[];
    summaryPrefix: string;
    details?: Record<string, unknown>;
    now?: Date;
}): Promise<Array<{
    notificationId: string;
    incidentKey: string;
    playbookId: string;
    signalCode: FairnessSignalCode;
    created: boolean;
    occurrenceCount: number;
    recentSignalCount: number;
    threshold: number;
    windowHours: number;
}>> {
    const now = input.now ?? new Date();
    const repeatThreshold = parseEnvInt('GROWTH_FAIRNESS_INCIDENT_REPEAT_THRESHOLD', 3, 2, 100);
    const repeatWindowHours = parseEnvInt('GROWTH_FAIRNESS_INCIDENT_REPEAT_WINDOW_HOURS', 24, 1, 24 * 14);

    const playbooks = resolveFairnessPlaybookBindings(input.signalCodes);
    if (playbooks.length === 0) {
        return [];
    }

    const results: Array<{
        notificationId: string;
        incidentKey: string;
        playbookId: string;
        signalCode: FairnessSignalCode;
        created: boolean;
        occurrenceCount: number;
        recentSignalCount: number;
        threshold: number;
        windowHours: number;
    }> = [];

    for (const playbook of playbooks) {
        const signalCode = playbook.signalCode;
        let recentSignalCount = 1;
        let shouldCreateIncident = signalCode === 'override_applied';

        if (!shouldCreateIncident && REPEATED_SIGNALS.has(signalCode)) {
            recentSignalCount = await countRecentSignalOccurrences({
                userId: input.userId,
                signalCode,
                now,
                windowHours: repeatWindowHours,
            });
            shouldCreateIncident = recentSignalCount >= repeatThreshold;
        }

        if (!shouldCreateIncident) {
            continue;
        }

        const scope = resolveScope({
            signalCode,
            targetReviewerId: input.targetReviewerId,
            taskId: input.taskId,
        });

        const incidentKey = buildIncidentKey({
            userId: input.userId,
            signalCode,
            playbookId: playbook.playbookId,
            scope,
        });

        const summary = `${input.summaryPrefix} (${playbook.playbookId}, signal ${signalCode})`;
        const ticket = await upsertIncidentTicket({
            userId: input.userId,
            actorId: input.actorId,
            taskId: input.taskId,
            signalCode,
            playbook,
            incidentKey,
            summary,
            details: input.details,
            recentSignalCount,
            repeatThreshold,
            repeatWindowHours,
            now,
        });

        results.push({
            ...ticket,
            recentSignalCount,
            threshold: repeatThreshold,
            windowHours: repeatWindowHours,
        });
    }

    return results;
}

export function getFairnessIncidentPlaybook(signalCode: FairnessSignalCode): FairnessPlaybookBinding {
    return getFairnessPlaybookBinding(signalCode);
}
