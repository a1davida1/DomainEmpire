import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
    db,
    domainResearch,
    domains,
    promotionCampaigns,
    reviewTasks,
} from '@/lib/db';
import { sendOpsChannelAlert } from '@/lib/alerts/ops-channel';
import { createNotification } from '@/lib/notifications';

const DEFAULT_SLA_HOURS = 24;
const DEFAULT_ESCALATE_AFTER_HOURS = 48;
const DEFAULT_DUE_SOON_WINDOW_HOURS = 6;

type PendingCampaignLaunchReviewTask = {
    taskId: string;
    campaignId: string;
    domainId: string | null;
    domainResearchId: string | null;
    domain: string;
    createdAt: Date | null;
    slaHours: number;
    escalateAfterHours: number;
    checklistJson: Record<string, unknown> | null;
};

export type CampaignLaunchReviewSlaItem = {
    taskId: string;
    campaignId: string;
    domainId: string | null;
    domainResearchId: string | null;
    domain: string;
    createdAt: string | null;
    dueAt: string;
    escalateAt: string;
    slaBreached: boolean;
    escalated: boolean;
    dueInHours: number;
    escalateInHours: number;
};

export type CampaignLaunchReviewSlaSummary = {
    generatedAt: string;
    dueSoonWindowHours: number;
    pendingCount: number;
    dueBreachedCount: number;
    escalatedCount: number;
    dueSoonCount: number;
    nextDueAt: string | null;
    topOverdue: CampaignLaunchReviewSlaItem[];
    scannedCount: number;
    truncated: boolean;
};

export type CampaignLaunchReviewEscalationConfig = {
    enabled: boolean;
    limit: number;
    maxAlertsPerSweep: number;
    alertCooldownHours: number;
    createInAppNotifications: boolean;
    notifyOps: boolean;
};

export type CampaignLaunchReviewEscalationSweepSummary = {
    enabled: boolean;
    dryRun: boolean;
    scanned: number;
    pendingCount: number;
    escalatedEligible: number;
    alerted: number;
    cooldownSkipped: number;
    cappedSkipped: number;
    opsDelivered: number;
    opsFailed: number;
    errors: number;
    generatedAt: string;
    samples: Array<{
        taskId: string;
        campaignId: string;
        domain: string;
        dueAt: string;
        escalateAt: string;
        overdueHours: number;
        action: 'alerted' | 'skipped_cooldown' | 'skipped_cap';
    }>;
};

type EscalationState = {
    alertCount: number;
    lastAlertAt: string | null;
    lastOpsAlertAt: string | null;
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
        return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
        return false;
    }
    return fallback;
}

function parseIntBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return { ...value };
}

function resolveHours(value: number | null | undefined, fallback: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return fallback;
    }
    return numeric;
}

function resolveDueAt(createdAt: Date | null, slaHours: number, now: Date): Date {
    const base = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : now;
    return new Date(base.getTime() + slaHours * 60 * 60 * 1000);
}

function resolveEscalateAt(createdAt: Date | null, escalateAfterHours: number, now: Date): Date {
    const base = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : now;
    return new Date(base.getTime() + escalateAfterHours * 60 * 60 * 1000);
}

function buildDomainLabel(task: {
    fallbackDomain: string | null;
    researchDomain: string | null;
    campaignId: string;
}): string {
    if (task.fallbackDomain && task.fallbackDomain.trim().length > 0) {
        return task.fallbackDomain.trim().toLowerCase();
    }
    if (task.researchDomain && task.researchDomain.trim().length > 0) {
        return task.researchDomain.trim().toLowerCase();
    }
    return `campaign:${task.campaignId.slice(0, 8)}`;
}

async function fetchPendingCampaignLaunchReviews(limit: number): Promise<{
    pendingCount: number;
    rows: PendingCampaignLaunchReviewTask[];
}> {
    const [pendingCountRow, taskRows] = await Promise.all([
        db.select({
            pendingCount: sql<number>`count(*)::int`,
        })
            .from(reviewTasks)
            .where(and(
                eq(reviewTasks.taskType, 'campaign_launch'),
                eq(reviewTasks.status, 'pending'),
            )),
        db.select({
            taskId: reviewTasks.id,
            campaignId: reviewTasks.entityId,
            domainId: reviewTasks.domainId,
            domainResearchId: reviewTasks.domainResearchId,
            createdAt: reviewTasks.createdAt,
            slaHours: reviewTasks.slaHours,
            escalateAfterHours: reviewTasks.escalateAfterHours,
            checklistJson: reviewTasks.checklistJson,
            fallbackDomain: domains.domain,
            researchDomain: domainResearch.domain,
        })
            .from(reviewTasks)
            .leftJoin(promotionCampaigns, eq(reviewTasks.entityId, promotionCampaigns.id))
            .leftJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
            .leftJoin(domains, eq(reviewTasks.domainId, domains.id))
            .where(and(
                eq(reviewTasks.taskType, 'campaign_launch'),
                eq(reviewTasks.status, 'pending'),
            ))
            .orderBy(asc(reviewTasks.createdAt))
            .limit(limit),
    ]);

    const rows: PendingCampaignLaunchReviewTask[] = taskRows.map((task) => ({
        taskId: task.taskId,
        campaignId: task.campaignId,
        domainId: task.domainId ?? null,
        domainResearchId: task.domainResearchId ?? null,
        domain: buildDomainLabel({
            fallbackDomain: task.fallbackDomain,
            researchDomain: task.researchDomain,
            campaignId: task.campaignId,
        }),
        createdAt: task.createdAt ?? null,
        slaHours: resolveHours(task.slaHours, DEFAULT_SLA_HOURS),
        escalateAfterHours: resolveHours(task.escalateAfterHours, DEFAULT_ESCALATE_AFTER_HOURS),
        checklistJson: (task.checklistJson as Record<string, unknown> | null) ?? null,
    }));

    return {
        pendingCount: pendingCountRow[0]?.pendingCount ?? 0,
        rows,
    };
}

function toSlaItem(task: PendingCampaignLaunchReviewTask, now: Date): CampaignLaunchReviewSlaItem {
    const dueAt = resolveDueAt(task.createdAt, task.slaHours, now);
    const escalateAt = resolveEscalateAt(task.createdAt, task.escalateAfterHours, now);

    const dueInHours = (dueAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    const escalateInHours = (escalateAt.getTime() - now.getTime()) / (60 * 60 * 1000);

    return {
        taskId: task.taskId,
        campaignId: task.campaignId,
        domainId: task.domainId,
        domainResearchId: task.domainResearchId,
        domain: task.domain,
        createdAt: task.createdAt?.toISOString() ?? null,
        dueAt: dueAt.toISOString(),
        escalateAt: escalateAt.toISOString(),
        slaBreached: dueInHours < 0,
        escalated: escalateInHours < 0,
        dueInHours,
        escalateInHours,
    };
}

function readEscalationState(checklistJson: Record<string, unknown> | null): EscalationState {
    const checklist = asRecord(checklistJson);
    const system = asRecord(checklist._system);
    const launchReviewEscalation = asRecord(system.launchReviewEscalation);
    const alertCountRaw = Number(launchReviewEscalation.alertCount);
    return {
        alertCount: Number.isFinite(alertCountRaw) && alertCountRaw >= 0
            ? Math.floor(alertCountRaw)
            : 0,
        lastAlertAt: typeof launchReviewEscalation.lastAlertAt === 'string'
            ? launchReviewEscalation.lastAlertAt
            : null,
        lastOpsAlertAt: typeof launchReviewEscalation.lastOpsAlertAt === 'string'
            ? launchReviewEscalation.lastOpsAlertAt
            : null,
    };
}

function mergeEscalationState(
    checklistJson: Record<string, unknown> | null,
    state: EscalationState,
): Record<string, unknown> {
    const checklist = asRecord(checklistJson);
    const system = asRecord(checklist._system);
    return {
        ...checklist,
        _system: {
            ...system,
            launchReviewEscalation: {
                ...asRecord(system.launchReviewEscalation),
                alertCount: state.alertCount,
                lastAlertAt: state.lastAlertAt,
                lastOpsAlertAt: state.lastOpsAlertAt,
            },
        },
    };
}

function isWithinCooldown(lastAlertAt: string | null, now: Date, cooldownHours: number): boolean {
    if (!lastAlertAt) return false;
    const timestampMs = new Date(lastAlertAt).getTime();
    if (!Number.isFinite(timestampMs)) {
        return false;
    }
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    return now.getTime() - timestampMs < cooldownMs;
}

function mergeConfig(
    base: CampaignLaunchReviewEscalationConfig,
    override: Partial<CampaignLaunchReviewEscalationConfig>,
): CampaignLaunchReviewEscalationConfig {
    return {
        ...base,
        ...override,
    };
}

export function resolveCampaignLaunchReviewEscalationConfig(
    env: Record<string, string | undefined> = process.env,
): CampaignLaunchReviewEscalationConfig {
    return {
        enabled: parseBool(env.CAMPAIGN_LAUNCH_REVIEW_SWEEP_ENABLED, true),
        limit: parseIntBounded(env.CAMPAIGN_LAUNCH_REVIEW_SWEEP_LIMIT, 250, 10, 2000),
        maxAlertsPerSweep: parseIntBounded(env.CAMPAIGN_LAUNCH_REVIEW_MAX_ALERTS_PER_SWEEP, 25, 1, 500),
        alertCooldownHours: parseIntBounded(env.CAMPAIGN_LAUNCH_REVIEW_ALERT_COOLDOWN_HOURS, 24, 1, 24 * 30),
        createInAppNotifications: parseBool(env.CAMPAIGN_LAUNCH_REVIEW_IN_APP_NOTIFICATIONS, true),
        notifyOps: parseBool(env.CAMPAIGN_LAUNCH_REVIEW_NOTIFY_OPS, true),
    };
}

export async function getCampaignLaunchReviewSlaSummary(input: {
    now?: Date;
    limit?: number;
    dueSoonWindowHours?: number;
    topIssueLimit?: number;
} = {}): Promise<CampaignLaunchReviewSlaSummary> {
    const now = input.now ?? new Date();
    const limit = Number.isFinite(input.limit)
        ? Math.max(10, Math.min(Math.floor(input.limit ?? 250), 2000))
        : 250;
    const topIssueLimit = Number.isFinite(input.topIssueLimit)
        ? Math.max(1, Math.min(Math.floor(input.topIssueLimit ?? 5), 100))
        : 5;
    const dueSoonWindowHours = Number.isFinite(input.dueSoonWindowHours)
        ? Math.max(1, Math.min(Math.floor(input.dueSoonWindowHours ?? DEFAULT_DUE_SOON_WINDOW_HOURS), 72))
        : DEFAULT_DUE_SOON_WINDOW_HOURS;

    const { pendingCount, rows } = await fetchPendingCampaignLaunchReviews(limit);
    const items = rows.map((task) => toSlaItem(task, now));
    const nowMs = now.getTime();
    const dueSoonCutoffMs = nowMs + dueSoonWindowHours * 60 * 60 * 1000;

    const dueBreachedCount = items.filter((item) => item.slaBreached).length;
    const escalatedCount = items.filter((item) => item.escalated).length;
    const dueSoonCount = items.filter((item) => {
        const dueAtMs = new Date(item.dueAt).getTime();
        return dueAtMs >= nowMs && dueAtMs <= dueSoonCutoffMs;
    }).length;

    const nextDueAt = items
        .map((item) => new Date(item.dueAt).getTime())
        .filter((timestampMs) => Number.isFinite(timestampMs) && timestampMs >= nowMs)
        .sort((left, right) => left - right)[0];

    const topOverdue = items
        .filter((item) => item.slaBreached || item.escalated)
        .sort((left, right) => {
            const leftOverdueHours = Math.abs(Math.min(left.escalateInHours, left.dueInHours));
            const rightOverdueHours = Math.abs(Math.min(right.escalateInHours, right.dueInHours));
            return rightOverdueHours - leftOverdueHours;
        })
        .slice(0, topIssueLimit);

    return {
        generatedAt: now.toISOString(),
        dueSoonWindowHours,
        pendingCount,
        dueBreachedCount,
        escalatedCount,
        dueSoonCount,
        nextDueAt: Number.isFinite(nextDueAt) ? new Date(nextDueAt).toISOString() : null,
        topOverdue,
        scannedCount: items.length,
        truncated: pendingCount > items.length,
    };
}

export async function runCampaignLaunchReviewEscalationSweep(input: {
    force?: boolean;
    dryRun?: boolean;
    notify?: boolean;
} & Partial<CampaignLaunchReviewEscalationConfig> = {}): Promise<CampaignLaunchReviewEscalationSweepSummary> {
    const config = mergeConfig(resolveCampaignLaunchReviewEscalationConfig(), input);
    const now = new Date();
    const dryRun = input.dryRun ?? false;
    const shouldNotify = input.notify ?? true;

    if (!config.enabled && !input.force) {
        return {
            enabled: false,
            dryRun,
            scanned: 0,
            pendingCount: 0,
            escalatedEligible: 0,
            alerted: 0,
            cooldownSkipped: 0,
            cappedSkipped: 0,
            opsDelivered: 0,
            opsFailed: 0,
            errors: 0,
            generatedAt: now.toISOString(),
            samples: [],
        };
    }

    const { pendingCount, rows } = await fetchPendingCampaignLaunchReviews(config.limit);

    let escalatedEligible = 0;
    let alerted = 0;
    let cooldownSkipped = 0;
    let cappedSkipped = 0;
    let opsDelivered = 0;
    let opsFailed = 0;
    let errors = 0;

    const samples: CampaignLaunchReviewEscalationSweepSummary['samples'] = [];

    for (const row of rows) {
        const dueAt = resolveDueAt(row.createdAt, row.slaHours, now);
        const escalateAt = resolveEscalateAt(row.createdAt, row.escalateAfterHours, now);
        if (now.getTime() < escalateAt.getTime()) {
            continue;
        }

        escalatedEligible += 1;

        const state = readEscalationState(row.checklistJson);
        if (isWithinCooldown(state.lastAlertAt, now, config.alertCooldownHours)) {
            cooldownSkipped += 1;
            samples.push({
                taskId: row.taskId,
                campaignId: row.campaignId,
                domain: row.domain,
                dueAt: dueAt.toISOString(),
                escalateAt: escalateAt.toISOString(),
                overdueHours: (now.getTime() - escalateAt.getTime()) / (60 * 60 * 1000),
                action: 'skipped_cooldown',
            });
            continue;
        }

        if (alerted >= config.maxAlertsPerSweep) {
            cappedSkipped += 1;
            samples.push({
                taskId: row.taskId,
                campaignId: row.campaignId,
                domain: row.domain,
                dueAt: dueAt.toISOString(),
                escalateAt: escalateAt.toISOString(),
                overdueHours: (now.getTime() - escalateAt.getTime()) / (60 * 60 * 1000),
                action: 'skipped_cap',
            });
            continue;
        }

        if (shouldNotify && !dryRun) {
            try {
                if (config.createInAppNotifications) {
                    await createNotification({
                        type: 'info',
                        severity: 'critical',
                        title: `Campaign launch review overdue: ${row.domain}`,
                        message: `Campaign launch review task ${row.taskId} is overdue and escalated.`,
                        domainId: row.domainId ?? undefined,
                        actionUrl: '/dashboard/review',
                        metadata: {
                            source: 'campaign_launch_review_escalation',
                            taskId: row.taskId,
                            campaignId: row.campaignId,
                            domain: row.domain,
                            dueAt: dueAt.toISOString(),
                            escalateAt: escalateAt.toISOString(),
                            overdueHours: (now.getTime() - dueAt.getTime()) / (60 * 60 * 1000),
                            escalatedHours: (now.getTime() - escalateAt.getTime()) / (60 * 60 * 1000),
                        },
                    });
                }

                let lastOpsAlertAt: string | null = null;
                if (config.notifyOps) {
                    const opsResult = await sendOpsChannelAlert({
                        source: 'campaign_launch_review_escalation',
                        severity: 'critical',
                        title: `Campaign launch review escalated: ${row.domain}`,
                        message: `Task ${row.taskId} (campaign ${row.campaignId}) requires immediate review.`,
                        details: {
                            taskId: row.taskId,
                            campaignId: row.campaignId,
                            domain: row.domain,
                            dueAt: dueAt.toISOString(),
                            escalateAt: escalateAt.toISOString(),
                            overdueHours: (now.getTime() - dueAt.getTime()) / (60 * 60 * 1000),
                        },
                    });
                    if (opsResult.delivered) {
                        opsDelivered += 1;
                        lastOpsAlertAt = now.toISOString();
                    } else {
                        opsFailed += 1;
                    }
                }

                const nextState: EscalationState = {
                    alertCount: state.alertCount + 1,
                    lastAlertAt: now.toISOString(),
                    lastOpsAlertAt: lastOpsAlertAt ?? state.lastOpsAlertAt,
                };

                await db.update(reviewTasks).set({
                    checklistJson: mergeEscalationState(row.checklistJson, nextState),
                    updatedAt: now,
                }).where(and(
                    eq(reviewTasks.id, row.taskId),
                    eq(reviewTasks.status, 'pending'),
                ));
            } catch (error) {
                errors += 1;
                console.error('Failed to process campaign launch review escalation alert', {
                    taskId: row.taskId,
                    campaignId: row.campaignId,
                    domain: row.domain,
                    error,
                });
                continue;
            }
        }

        alerted += 1;
        samples.push({
            taskId: row.taskId,
            campaignId: row.campaignId,
            domain: row.domain,
            dueAt: dueAt.toISOString(),
            escalateAt: escalateAt.toISOString(),
            overdueHours: (now.getTime() - escalateAt.getTime()) / (60 * 60 * 1000),
            action: 'alerted',
        });
    }

    return {
        enabled: true,
        dryRun,
        scanned: rows.length,
        pendingCount,
        escalatedEligible,
        alerted,
        cooldownSkipped,
        cappedSkipped,
        opsDelivered,
        opsFailed,
        errors,
        generatedAt: now.toISOString(),
        samples: samples.slice(0, 50),
    };
}

export async function listPendingCampaignLaunchReviews(input: {
    limit?: number;
    now?: Date;
} = {}): Promise<CampaignLaunchReviewSlaItem[]> {
    const now = input.now ?? new Date();
    const limit = Number.isFinite(input.limit)
        ? Math.max(1, Math.min(Math.floor(input.limit ?? 100), 500))
        : 100;

    const { rows } = await fetchPendingCampaignLaunchReviews(limit);
    return rows
        .map((row) => toSlaItem(row, now))
        .sort((left, right) => {
            if (left.escalated !== right.escalated) {
                return left.escalated ? -1 : 1;
            }
            if (left.slaBreached !== right.slaBreached) {
                return left.slaBreached ? -1 : 1;
            }
            return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
        });
}

export async function listRecentCampaignLaunchReviews(limit = 50): Promise<CampaignLaunchReviewSlaItem[]> {
    const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 200));
    const rows = await db.select({
        taskId: reviewTasks.id,
        campaignId: reviewTasks.entityId,
        domainId: reviewTasks.domainId,
        domainResearchId: reviewTasks.domainResearchId,
        createdAt: reviewTasks.createdAt,
        slaHours: reviewTasks.slaHours,
        escalateAfterHours: reviewTasks.escalateAfterHours,
        checklistJson: reviewTasks.checklistJson,
        fallbackDomain: domains.domain,
        researchDomain: domainResearch.domain,
    })
        .from(reviewTasks)
        .leftJoin(promotionCampaigns, eq(reviewTasks.entityId, promotionCampaigns.id))
        .leftJoin(domainResearch, eq(promotionCampaigns.domainResearchId, domainResearch.id))
        .leftJoin(domains, eq(reviewTasks.domainId, domains.id))
        .where(eq(reviewTasks.taskType, 'campaign_launch'))
        .orderBy(desc(reviewTasks.createdAt))
        .limit(boundedLimit);

    const now = new Date();
    return rows.map((row) =>
        toSlaItem({
            taskId: row.taskId,
            campaignId: row.campaignId,
            domainId: row.domainId,
            domainResearchId: row.domainResearchId,
            domain: buildDomainLabel({
                fallbackDomain: row.fallbackDomain,
                researchDomain: row.researchDomain,
                campaignId: row.campaignId,
            }),
            createdAt: row.createdAt ?? null,
            slaHours: resolveHours(row.slaHours, DEFAULT_SLA_HOURS),
            escalateAfterHours: resolveHours(row.escalateAfterHours, DEFAULT_ESCALATE_AFTER_HOURS),
            checklistJson: (row.checklistJson as Record<string, unknown> | null) ?? null,
        }, now),
    );
}
