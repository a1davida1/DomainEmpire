import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireRole } from '@/lib/auth';
import {
    getCampaignLaunchReviewSlaSummary,
    listPendingCampaignLaunchReviews,
} from '@/lib/review/campaign-launch-sla';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';

const summaryLimiter = createRateLimiter('campaign_launch_review_summary', {
    maxRequests: 120,
    windowMs: 60 * 1000,
});

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.max(min, Math.min(parsed, max));
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const rate = summaryLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many campaign launch review summary requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const limit = parseIntParam(request.nextUrl.searchParams.get('limit'), 250, 10, 2000);
        const dueSoonWindowHours = parseIntParam(request.nextUrl.searchParams.get('dueSoonWindowHours'), 6, 1, 72);
        const topIssueLimit = parseIntParam(request.nextUrl.searchParams.get('topIssueLimit'), 5, 1, 50);
        const format = (request.nextUrl.searchParams.get('format') || '').trim().toLowerCase();

        const summary = await getCampaignLaunchReviewSlaSummary({
            limit,
            dueSoonWindowHours,
            topIssueLimit,
        });

        if (format === 'csv') {
            const items = await listPendingCampaignLaunchReviews({ limit });
            const lines: string[] = [];
            lines.push('metric,value');
            lines.push(`generatedAt,${escapeCsv(summary.generatedAt)}`);
            lines.push(`pendingCount,${escapeCsv(summary.pendingCount)}`);
            lines.push(`dueBreachedCount,${escapeCsv(summary.dueBreachedCount)}`);
            lines.push(`escalatedCount,${escapeCsv(summary.escalatedCount)}`);
            lines.push(`dueSoonCount,${escapeCsv(summary.dueSoonCount)}`);
            lines.push(`nextDueAt,${escapeCsv(summary.nextDueAt)}`);
            lines.push('');
            lines.push('taskId,campaignId,domain,createdAt,dueAt,escalateAt,slaBreached,escalated,dueInHours,escalateInHours');
            for (const item of items) {
                lines.push([
                    escapeCsv(item.taskId),
                    escapeCsv(item.campaignId),
                    escapeCsv(item.domain),
                    escapeCsv(item.createdAt),
                    escapeCsv(item.dueAt),
                    escapeCsv(item.escalateAt),
                    escapeCsv(item.slaBreached),
                    escapeCsv(item.escalated),
                    escapeCsv(Number(item.dueInHours.toFixed(2))),
                    escapeCsv(Number(item.escalateInHours.toFixed(2))),
                ].join(','));
            }

            return new NextResponse(lines.join('\n'), {
                status: 200,
                headers: {
                    ...rate.headers,
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="campaign-launch-review-summary-${new Date().toISOString().slice(0, 10)}.csv"`,
                },
            });
        }

        return NextResponse.json(summary, { headers: rate.headers });
    } catch (error) {
        console.error('Failed to load campaign launch review summary:', error);
        return NextResponse.json(
            { error: 'Failed to load campaign launch review summary' },
            { status: 500, headers: rate.headers },
        );
    }
}
