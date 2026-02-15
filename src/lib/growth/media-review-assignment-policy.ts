import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db, mediaModerationEvents, mediaModerationTasks, users } from '@/lib/db';

type PolicySeverity = 'error' | 'warning';

export type MediaReviewAssignmentPolicySignal = {
    code: 'reviewer_pending_cap' | 'round_robin_skew' | 'reassignment_concentration';
    severity: PolicySeverity;
    message: string;
    details: Record<string, unknown>;
};

export type MediaReviewAssignmentPolicyResult = {
    violations: MediaReviewAssignmentPolicySignal[];
    alerts: MediaReviewAssignmentPolicySignal[];
    snapshot: {
        targetReviewerId: string;
        projectedTargetPending: number;
        minPendingAcrossReviewers: number;
        projectedSkew: number;
        maxPendingPerReviewer: number;
        maxAssignmentSkew: number;
        reviewerPendingCounts: Record<string, number>;
        concentrationWindowHours: number;
        concentrationThreshold: number;
        concentrationMinSamples: number;
        concentrationShare: number | null;
        concentrationReviewerId: string | null;
        concentrationAssignments: number;
    };
};

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

function parseEnvFloat(name: string, fallback: number, min: number, max: number): number {
    const raw = Number.parseFloat(process.env[name] || '');
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(raw, max));
}

function asPayload(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string | null {
    const raw = value[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

export async function evaluateMediaReviewAssignmentPolicy(input: {
    userId: string;
    taskId: string;
    targetReviewerId: string;
    previousReviewerId: string | null;
    now?: Date;
}): Promise<MediaReviewAssignmentPolicyResult> {
    const now = input.now ?? new Date();
    const maxPendingPerReviewer = parseEnvInt('GROWTH_REVIEW_MAX_PENDING_PER_REVIEWER', 25, 1, 250);
    const maxAssignmentSkew = parseEnvInt('GROWTH_REVIEW_MAX_ASSIGNMENT_SKEW', 6, 1, 100);
    const concentrationWindowHours = parseEnvInt('GROWTH_REVIEW_CONCENTRATION_WINDOW_HOURS', 72, 6, 24 * 14);
    const concentrationMinSamples = parseEnvInt('GROWTH_REVIEW_CONCENTRATION_MIN_SAMPLES', 15, 5, 1000);
    const concentrationThreshold = parseEnvFloat('GROWTH_REVIEW_CONCENTRATION_THRESHOLD', 0.6, 0.3, 0.95);

    const activeReviewerRows = await db.select({
        id: users.id,
    })
        .from(users)
        .where(and(
            eq(users.isActive, true),
            inArray(users.role, ['reviewer', 'expert', 'admin']),
        ))
        .orderBy(asc(users.name))
        .limit(500);

    const activeReviewerIds = [...new Set(activeReviewerRows.map((row) => row.id))];
    if (!activeReviewerIds.includes(input.targetReviewerId)) {
        activeReviewerIds.push(input.targetReviewerId);
    }

    const pendingRows = await db.select({
        id: mediaModerationTasks.id,
        reviewerId: mediaModerationTasks.reviewerId,
    })
        .from(mediaModerationTasks)
        .where(and(
            eq(mediaModerationTasks.userId, input.userId),
            eq(mediaModerationTasks.status, 'pending'),
        ))
        .limit(5000);

    const projectedCounts: Record<string, number> = {};
    for (const reviewerId of activeReviewerIds) {
        projectedCounts[reviewerId] = 0;
    }

    for (const row of pendingRows) {
        if (!row.reviewerId) continue;
        if (!Object.hasOwn(projectedCounts, row.reviewerId)) {
            continue;
        }
        projectedCounts[row.reviewerId] += 1;
    }

    if (
        input.previousReviewerId
        && input.previousReviewerId !== input.targetReviewerId
        && Object.hasOwn(projectedCounts, input.previousReviewerId)
        && projectedCounts[input.previousReviewerId] > 0
    ) {
        projectedCounts[input.previousReviewerId] -= 1;
    }

    if (input.previousReviewerId !== input.targetReviewerId) {
        projectedCounts[input.targetReviewerId] = (projectedCounts[input.targetReviewerId] || 0) + 1;
    }

    const reviewerCounts = Object.values(projectedCounts);
    const minPendingAcrossReviewers = reviewerCounts.length > 0
        ? Math.min(...reviewerCounts)
        : 0;
    const projectedTargetPending = projectedCounts[input.targetReviewerId] || 0;
    const projectedSkew = projectedTargetPending - minPendingAcrossReviewers;

    const violations: MediaReviewAssignmentPolicySignal[] = [];
    if (projectedTargetPending > maxPendingPerReviewer) {
        violations.push({
            code: 'reviewer_pending_cap',
            severity: 'error',
            message: `Target reviewer would exceed max pending cap (${projectedTargetPending} > ${maxPendingPerReviewer})`,
            details: {
                targetReviewerId: input.targetReviewerId,
                projectedTargetPending,
                maxPendingPerReviewer,
            },
        });
    }

    if (activeReviewerIds.length > 1 && projectedSkew > maxAssignmentSkew) {
        violations.push({
            code: 'round_robin_skew',
            severity: 'error',
            message: `Assignment would exceed round-robin skew (${projectedSkew} > ${maxAssignmentSkew})`,
            details: {
                targetReviewerId: input.targetReviewerId,
                projectedSkew,
                maxAssignmentSkew,
                minPendingAcrossReviewers,
                projectedTargetPending,
            },
        });
    }

    const alerts: MediaReviewAssignmentPolicySignal[] = [];
    const windowStart = new Date(now.getTime() - concentrationWindowHours * 60 * 60 * 1000);
    const assignmentEvents = await db.select({
        payload: mediaModerationEvents.payload,
    })
        .from(mediaModerationEvents)
        .where(and(
            eq(mediaModerationEvents.userId, input.userId),
            eq(mediaModerationEvents.eventType, 'assigned'),
            gte(mediaModerationEvents.createdAt, windowStart),
        ))
        .limit(3000);

    const concentrationCounts: Record<string, number> = {};
    let concentrationAssignments = 0;

    for (const row of assignmentEvents) {
        const payload = asPayload(row.payload);
        const action = readString(payload, 'action');
        if (action === 'release') continue;
        const nextReviewerId = readString(payload, 'nextReviewerId');
        if (!nextReviewerId) continue;
        concentrationAssignments += 1;
        concentrationCounts[nextReviewerId] = (concentrationCounts[nextReviewerId] || 0) + 1;
    }

    let concentrationReviewerId: string | null = null;
    let concentrationShare: number | null = null;
    if (concentrationAssignments >= concentrationMinSamples) {
        const topEntry = Object.entries(concentrationCounts)
            .sort((left, right) => right[1] - left[1])[0];
        if (topEntry) {
            concentrationReviewerId = topEntry[0];
            concentrationShare = topEntry[1] / concentrationAssignments;
            if (concentrationShare >= concentrationThreshold) {
                alerts.push({
                    code: 'reassignment_concentration',
                    severity: 'warning',
                    message: `Assignment concentration warning: ${Math.round(concentrationShare * 100)}% routed to one reviewer in the recent window`,
                    details: {
                        reviewerId: concentrationReviewerId,
                        concentrationShare,
                        concentrationAssignments,
                        concentrationWindowHours,
                        concentrationThreshold,
                    },
                });
            }
        }
    }

    return {
        violations,
        alerts,
        snapshot: {
            targetReviewerId: input.targetReviewerId,
            projectedTargetPending,
            minPendingAcrossReviewers,
            projectedSkew,
            maxPendingPerReviewer,
            maxAssignmentSkew,
            reviewerPendingCounts: projectedCounts,
            concentrationWindowHours,
            concentrationThreshold,
            concentrationMinSamples,
            concentrationShare,
            concentrationReviewerId,
            concentrationAssignments,
        },
    };
}
