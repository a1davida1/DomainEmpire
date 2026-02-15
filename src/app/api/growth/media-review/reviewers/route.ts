import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { getRequestUser, requireRole } from '@/lib/auth';
import { db, mediaModerationTasks, users } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';

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
        const limitParam = Number.parseInt(url.searchParams.get('limit') || '200', 10);
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 200;

        const reviewerRows = await db.select({
            id: users.id,
            name: users.name,
            role: users.role,
        })
            .from(users)
            .where(and(
                eq(users.isActive, true),
                inArray(users.role, ['reviewer', 'expert', 'admin']),
            ))
            .orderBy(asc(users.name))
            .limit(limit);

        if (reviewerRows.length === 0) {
            return NextResponse.json({ count: 0, reviewers: [] });
        }

        const pendingCountRows = await db.select({
            reviewerId: mediaModerationTasks.reviewerId,
            taskCount: count(),
        })
            .from(mediaModerationTasks)
            .where(and(
                eq(mediaModerationTasks.userId, user.id),
                eq(mediaModerationTasks.status, 'pending'),
                inArray(mediaModerationTasks.reviewerId, reviewerRows.map((row) => row.id)),
            ))
            .groupBy(mediaModerationTasks.reviewerId);

        const pendingCounts = pendingCountRows.reduce<Record<string, number>>((acc, row) => {
            if (!row.reviewerId) return acc;
            acc[row.reviewerId] = Number(row.taskCount) || 0;
            return acc;
        }, {});

        const reviewers = reviewerRows
            .map((row) => ({
                ...row,
                pendingTasks: pendingCounts[row.id] || 0,
            }))
            .sort((left, right) => {
                if (left.pendingTasks !== right.pendingTasks) {
                    return left.pendingTasks - right.pendingTasks;
                }
                const leftName = left.name ?? '';
                const rightName = right.name ?? '';
                return leftName.localeCompare(rightName);
            });

        return NextResponse.json({
            count: reviewers.length,
            reviewers,
        });
    } catch (error) {
        console.error('Failed to list moderation reviewers:', error);
        return NextResponse.json(
            { error: 'Failed to list moderation reviewers' },
            { status: 500 },
        );
    }
}
