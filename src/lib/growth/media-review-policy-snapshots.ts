import { sql } from 'drizzle-orm';
import {
    db,
    mediaReviewPolicyAlertCodeDailySnapshots,
    mediaReviewPolicyDailySnapshots,
    mediaReviewPolicyPlaybookDailySnapshots,
} from '@/lib/db';

function toUtcDay(value: Date): Date {
    return new Date(Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
    ));
}

function normalizeCount(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

function buildCounter(values: string[]): Record<string, number> {
    const counter: Record<string, number> = {};
    for (const value of values) {
        const key = value.trim();
        if (!key) continue;
        counter[key] = (counter[key] || 0) + 1;
    }
    return counter;
}

export async function recordMediaReviewAssignmentPolicySnapshot(input: {
    userId: string;
    occurredAt?: Date;
    assignmentDelta?: number;
    overrideApplied?: boolean;
    alertCodes?: string[];
    playbookIds?: string[];
}): Promise<void> {
    const occurredAt = input.occurredAt ?? new Date();
    const snapshotDate = toUtcDay(occurredAt);
    const assignmentDelta = normalizeCount(input.assignmentDelta);
    const overrideDelta = input.overrideApplied ? 1 : 0;
    const alertCodes = Array.isArray(input.alertCodes)
        ? input.alertCodes.filter((item) => typeof item === 'string')
        : [];
    const playbookIds = Array.isArray(input.playbookIds)
        ? input.playbookIds.filter((item) => typeof item === 'string')
        : [];
    const alertEventDelta = alertCodes.length > 0 ? 1 : 0;
    const alertCodeCounts = buildCounter(alertCodes);
    const playbookCounts = buildCounter(playbookIds);

    if (
        assignmentDelta === 0
        && overrideDelta === 0
        && alertEventDelta === 0
        && Object.keys(alertCodeCounts).length === 0
        && Object.keys(playbookCounts).length === 0
    ) {
        return;
    }

    await db.transaction(async (tx) => {
        await tx.insert(mediaReviewPolicyDailySnapshots)
            .values({
                userId: input.userId,
                snapshotDate,
                assignments: assignmentDelta,
                overrides: overrideDelta,
                alertEvents: alertEventDelta,
                createdAt: occurredAt,
                updatedAt: occurredAt,
            })
            .onConflictDoUpdate({
                target: [
                    mediaReviewPolicyDailySnapshots.userId,
                    mediaReviewPolicyDailySnapshots.snapshotDate,
                ],
                set: {
                    assignments: sql`${mediaReviewPolicyDailySnapshots.assignments} + ${assignmentDelta}`,
                    overrides: sql`${mediaReviewPolicyDailySnapshots.overrides} + ${overrideDelta}`,
                    alertEvents: sql`${mediaReviewPolicyDailySnapshots.alertEvents} + ${alertEventDelta}`,
                    updatedAt: occurredAt,
                },
            });

        const alertEntries = Object.entries(alertCodeCounts);
        for (const [alertCode, count] of alertEntries) {
            await tx.insert(mediaReviewPolicyAlertCodeDailySnapshots)
                .values({
                    userId: input.userId,
                    snapshotDate,
                    alertCode,
                    count,
                    createdAt: occurredAt,
                    updatedAt: occurredAt,
                })
                .onConflictDoUpdate({
                    target: [
                        mediaReviewPolicyAlertCodeDailySnapshots.userId,
                        mediaReviewPolicyAlertCodeDailySnapshots.snapshotDate,
                        mediaReviewPolicyAlertCodeDailySnapshots.alertCode,
                    ],
                    set: {
                        count: sql`${mediaReviewPolicyAlertCodeDailySnapshots.count} + ${count}`,
                        updatedAt: occurredAt,
                    },
                });
        }

        const playbookEntries = Object.entries(playbookCounts);
        for (const [playbookId, count] of playbookEntries) {
            await tx.insert(mediaReviewPolicyPlaybookDailySnapshots)
                .values({
                    userId: input.userId,
                    snapshotDate,
                    playbookId,
                    count,
                    createdAt: occurredAt,
                    updatedAt: occurredAt,
                })
                .onConflictDoUpdate({
                    target: [
                        mediaReviewPolicyPlaybookDailySnapshots.userId,
                        mediaReviewPolicyPlaybookDailySnapshots.snapshotDate,
                        mediaReviewPolicyPlaybookDailySnapshots.playbookId,
                    ],
                    set: {
                        count: sql`${mediaReviewPolicyPlaybookDailySnapshots.count} + ${count}`,
                        updatedAt: occurredAt,
                    },
                });
        }
    });
}
