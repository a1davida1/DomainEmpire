import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getRequestUser, requireRole } from '@/lib/auth';
import {
    db,
    mediaModerationEvents,
    mediaModerationTasks,
    mediaReviewPolicyAlertCodeDailySnapshots,
    mediaReviewPolicyDailySnapshots,
    mediaReviewPolicyPlaybookDailySnapshots,
} from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

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

function readBoolean(value: Record<string, unknown>, key: string): boolean {
    return value[key] === true;
}

function readAlertCodes(value: Record<string, unknown>): string[] {
    const raw = value.policyAlerts;
    if (!Array.isArray(raw)) return [];
    const codes: string[] = [];
    for (const item of raw) {
        if (!item || Array.isArray(item) || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const code = typeof record.code === 'string' ? record.code.trim() : '';
        if (code.length > 0) {
            codes.push(code);
        }
    }
    return codes;
}

function readPlaybookIds(value: Record<string, unknown>): string[] {
    const raw = value.playbookBindings;
    if (!Array.isArray(raw)) return [];
    const playbookIds: string[] = [];
    for (const item of raw) {
        if (!item || Array.isArray(item) || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const playbookId = typeof record.playbookId === 'string' ? record.playbookId.trim() : '';
        if (playbookId.length > 0) {
            playbookIds.push(playbookId);
        }
    }
    return playbookIds;
}

function toDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function toUtcDayKey(value: Date): string {
    return value.toISOString().slice(0, 10);
}

function toUtcDayStart(value: Date): Date {
    return new Date(Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
    ));
}

function escapeCsv(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

const QUERY_CAP = 5001;

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        const url = new URL(request.url);
        const format = (url.searchParams.get('format') || 'json').toLowerCase();
        const windowHoursRaw = Number.parseInt(url.searchParams.get('windowHours') || '72', 10);
        const windowHours = Number.isFinite(windowHoursRaw)
            ? Math.max(6, Math.min(windowHoursRaw, 24 * 30))
            : 72;
        const trendDaysRaw = Number.parseInt(url.searchParams.get('trendDays') || '14', 10);
        const trendDays = Number.isFinite(trendDaysRaw)
            ? Math.max(3, Math.min(trendDaysRaw, 365))
            : 14;

        const now = new Date();
        const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
        const trendStart = new Date(now.getTime() - trendDays * 24 * 60 * 60 * 1000);
        const trendStartDay = toUtcDayStart(trendStart);
        const trendEndDay = toUtcDayStart(now);

        const [
            pendingRows,
            assignmentRows,
            trendSnapshotRows,
            trendAlertRows,
            trendPlaybookRows,
        ] = await Promise.all([
            db.select({
                reviewerId: mediaModerationTasks.reviewerId,
            })
                .from(mediaModerationTasks)
                .where(and(
                    eq(mediaModerationTasks.userId, user.id),
                    eq(mediaModerationTasks.status, 'pending'),
                ))
                .limit(QUERY_CAP),
            db.select({
                payload: mediaModerationEvents.payload,
                createdAt: mediaModerationEvents.createdAt,
            })
                .from(mediaModerationEvents)
                .where(and(
                    eq(mediaModerationEvents.userId, user.id),
                    eq(mediaModerationEvents.eventType, 'assigned'),
                    gte(mediaModerationEvents.createdAt, windowStart),
                ))
                .limit(QUERY_CAP),
            db.select({
                snapshotDate: mediaReviewPolicyDailySnapshots.snapshotDate,
                assignments: mediaReviewPolicyDailySnapshots.assignments,
                overrides: mediaReviewPolicyDailySnapshots.overrides,
                alertEvents: mediaReviewPolicyDailySnapshots.alertEvents,
            })
                .from(mediaReviewPolicyDailySnapshots)
                .where(and(
                    eq(mediaReviewPolicyDailySnapshots.userId, user.id),
                    gte(mediaReviewPolicyDailySnapshots.snapshotDate, trendStartDay),
                    lte(mediaReviewPolicyDailySnapshots.snapshotDate, trendEndDay),
                )),
            db.select({
                snapshotDate: mediaReviewPolicyAlertCodeDailySnapshots.snapshotDate,
                alertCode: mediaReviewPolicyAlertCodeDailySnapshots.alertCode,
                count: mediaReviewPolicyAlertCodeDailySnapshots.count,
            })
                .from(mediaReviewPolicyAlertCodeDailySnapshots)
                .where(and(
                    eq(mediaReviewPolicyAlertCodeDailySnapshots.userId, user.id),
                    gte(mediaReviewPolicyAlertCodeDailySnapshots.snapshotDate, trendStartDay),
                    lte(mediaReviewPolicyAlertCodeDailySnapshots.snapshotDate, trendEndDay),
                )),
            db.select({
                snapshotDate: mediaReviewPolicyPlaybookDailySnapshots.snapshotDate,
                playbookId: mediaReviewPolicyPlaybookDailySnapshots.playbookId,
                count: mediaReviewPolicyPlaybookDailySnapshots.count,
            })
                .from(mediaReviewPolicyPlaybookDailySnapshots)
                .where(and(
                    eq(mediaReviewPolicyPlaybookDailySnapshots.userId, user.id),
                    gte(mediaReviewPolicyPlaybookDailySnapshots.snapshotDate, trendStartDay),
                    lte(mediaReviewPolicyPlaybookDailySnapshots.snapshotDate, trendEndDay),
                )),
        ]);

        const pendingTruncated = pendingRows.length >= QUERY_CAP;
        let assignmentsTruncated = assignmentRows.length >= QUERY_CAP;

        const pendingByReviewer: Record<string, number> = {};
        for (const row of pendingRows) {
            if (!row.reviewerId) continue;
            pendingByReviewer[row.reviewerId] = (pendingByReviewer[row.reviewerId] || 0) + 1;
        }

        const pendingCounts = Object.values(pendingByReviewer);
        const pendingSkew = pendingCounts.length > 0
            ? Math.max(...pendingCounts) - Math.min(...pendingCounts)
            : 0;

        let assignmentCount = 0;
        let overrideCount = 0;
        let alertEventCount = 0;
        const assignmentByReviewer: Record<string, number> = {};
        const alertCodeCounts: Record<string, number> = {};
        const playbookCounts: Record<string, number> = {};
        const trendByDay: Record<string, {
            assignments: number;
            overrides: number;
            alertEvents: number;
            alertCodeCounts: Record<string, number>;
            playbookCounts: Record<string, number>;
        }> = {};

        for (let index = trendDays - 1; index >= 0; index -= 1) {
            const bucketDate = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
            trendByDay[toUtcDayKey(bucketDate)] = {
                assignments: 0,
                overrides: 0,
                alertEvents: 0,
                alertCodeCounts: {},
                playbookCounts: {},
            };
        }

        const snapshotTrendAvailable = (
            trendSnapshotRows.length > 0
            || trendAlertRows.length > 0
            || trendPlaybookRows.length > 0
        );

        let trendSource: 'snapshot' | 'events' = snapshotTrendAvailable ? 'snapshot' : 'events';

        for (const row of assignmentRows) {
            const createdAt = toDate(row.createdAt);
            if (!createdAt) continue;

            const payload = asPayload(row.payload);
            const action = readString(payload, 'action');
            if (action === 'release') continue;

            const nextReviewerId = readString(payload, 'nextReviewerId');
            const inSummaryWindow = createdAt.getTime() >= windowStart.getTime();
            if (nextReviewerId && inSummaryWindow) {
                assignmentCount += 1;
                assignmentByReviewer[nextReviewerId] = (assignmentByReviewer[nextReviewerId] || 0) + 1;
            }

            const overrideApplied = readBoolean(payload, 'policyOverrideApplied');
            if (overrideApplied && inSummaryWindow) {
                overrideCount += 1;
            }

            const alertCodes = readAlertCodes(payload);
            if (alertCodes.length > 0 && inSummaryWindow) {
                alertEventCount += 1;
                for (const code of alertCodes) {
                    alertCodeCounts[code] = (alertCodeCounts[code] || 0) + 1;
                }
            }

            const playbookIds = readPlaybookIds(payload);
            if (playbookIds.length > 0 && inSummaryWindow) {
                for (const playbookId of playbookIds) {
                    playbookCounts[playbookId] = (playbookCounts[playbookId] || 0) + 1;
                }
            }
        }

        if (snapshotTrendAvailable) {
            for (const row of trendSnapshotRows) {
                const snapshotDate = toDate(row.snapshotDate);
                if (!snapshotDate) continue;
                const bucket = trendByDay[toUtcDayKey(snapshotDate)];
                if (!bucket) continue;
                bucket.assignments += Number(row.assignments) || 0;
                bucket.overrides += Number(row.overrides) || 0;
                bucket.alertEvents += Number(row.alertEvents) || 0;
            }

            for (const row of trendAlertRows) {
                const snapshotDate = toDate(row.snapshotDate);
                if (!snapshotDate) continue;
                const bucket = trendByDay[toUtcDayKey(snapshotDate)];
                if (!bucket) continue;
                const code = row.alertCode?.trim();
                if (!code) continue;
                bucket.alertCodeCounts[code] = (bucket.alertCodeCounts[code] || 0) + (Number(row.count) || 0);
            }

            for (const row of trendPlaybookRows) {
                const snapshotDate = toDate(row.snapshotDate);
                if (!snapshotDate) continue;
                const bucket = trendByDay[toUtcDayKey(snapshotDate)];
                if (!bucket) continue;
                const playbookId = row.playbookId?.trim();
                if (!playbookId) continue;
                bucket.playbookCounts[playbookId] = (bucket.playbookCounts[playbookId] || 0) + (Number(row.count) || 0);
            }
        } else {
            const trendRows = await db.select({
                payload: mediaModerationEvents.payload,
                createdAt: mediaModerationEvents.createdAt,
            })
                .from(mediaModerationEvents)
                .where(and(
                    eq(mediaModerationEvents.userId, user.id),
                    eq(mediaModerationEvents.eventType, 'assigned'),
                    gte(mediaModerationEvents.createdAt, trendStart),
                ))
                .limit(QUERY_CAP);

            if (trendRows.length >= QUERY_CAP) {
                assignmentsTruncated = true;
            }

            for (const row of trendRows) {
                const createdAt = toDate(row.createdAt);
                if (!createdAt) continue;

                const payload = asPayload(row.payload);
                const action = readString(payload, 'action');
                if (action === 'release') continue;
                const nextReviewerId = readString(payload, 'nextReviewerId');
                const overrideApplied = readBoolean(payload, 'policyOverrideApplied');
                const alertCodes = readAlertCodes(payload);
                const playbookIds = readPlaybookIds(payload);

                const bucket = trendByDay[toUtcDayKey(createdAt)];
                if (!bucket) continue;
                if (nextReviewerId) {
                    bucket.assignments += 1;
                }
                if (overrideApplied) {
                    bucket.overrides += 1;
                }
                if (alertCodes.length > 0) {
                    bucket.alertEvents += 1;
                    for (const code of alertCodes) {
                        bucket.alertCodeCounts[code] = (bucket.alertCodeCounts[code] || 0) + 1;
                    }
                }
                if (playbookIds.length > 0) {
                    for (const playbookId of playbookIds) {
                        bucket.playbookCounts[playbookId] = (bucket.playbookCounts[playbookId] || 0) + 1;
                    }
                }
            }
            trendSource = 'events';
        }

        const topAssignmentEntry = Object.entries(assignmentByReviewer)
            .sort((left, right) => right[1] - left[1])[0] || null;

        const topReviewerShare = (topAssignmentEntry && assignmentCount > 0)
            ? topAssignmentEntry[1] / assignmentCount
            : 0;

        const trends = Object.entries(trendByDay)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, values]) => {
                const topAlert = Object.entries(values.alertCodeCounts)
                    .sort((left, right) => right[1] - left[1])[0];
                const topPlaybook = Object.entries(values.playbookCounts)
                    .sort((left, right) => right[1] - left[1])[0];
                return {
                    date,
                    assignments: values.assignments,
                    overrides: values.overrides,
                    alertEvents: values.alertEvents,
                    topAlertCode: topAlert?.[0] ?? null,
                    topPlaybookId: topPlaybook?.[0] ?? null,
                };
            });

        if (format === 'csv') {
            const rows = [
                'date,assignments,overrides,alert_events,top_alert_code,top_playbook_id',
                ...trends.map((row) => (
                    [
                        escapeCsv(row.date),
                        escapeCsv(row.assignments),
                        escapeCsv(row.overrides),
                        escapeCsv(row.alertEvents),
                        escapeCsv(row.topAlertCode),
                        escapeCsv(row.topPlaybookId),
                    ].join(',')
                )),
            ];
            return new NextResponse(rows.join('\n'), {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename=\"moderation-policy-insights-${new Date().toISOString().slice(0, 10)}.csv\"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        return NextResponse.json({
            windowHours,
            trendDays,
            pendingTruncated,
            assignmentsTruncated,
            pending: {
                total: pendingRows.length,
                pendingByReviewer,
                pendingSkew,
            },
            assignments: {
                total: assignmentCount,
                overrideCount,
                alertEventCount,
                assignmentByReviewer,
                topReviewerId: topAssignmentEntry?.[0] ?? null,
                topReviewerShare,
                alertCodeCounts,
                playbookCounts,
            },
            trends,
            trendSource,
            generatedAt: now.toISOString(),
        });
    } catch (error) {
        console.error('Failed to load moderation policy insights:', error);
        return NextResponse.json(
            { error: 'Failed to load moderation policy insights' },
            { status: 500 },
        );
    }
}
