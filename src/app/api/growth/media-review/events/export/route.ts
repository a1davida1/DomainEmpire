import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, mediaModerationEvents } from '@/lib/db';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { verifyMediaModerationEventChain } from '@/lib/growth/media-review-audit';

const formatEnum = z.enum(['json', 'csv']);

function csvEscape(value: unknown): string {
    const raw = value === null || typeof value === 'undefined' ? '' : String(value);
    const escaped = raw.replaceAll('"', '""');
    return `"${escaped}"`;
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
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
        const taskId = url.searchParams.get('taskId');
        const assetId = url.searchParams.get('assetId');
        const formatRaw = url.searchParams.get('format');
        const format = formatEnum.safeParse(formatRaw).success ? formatEnum.parse(formatRaw) : 'json';

        const conditions = [eq(mediaModerationEvents.userId, user.id)];
        if (taskId) {
            if (!z.string().uuid().safeParse(taskId).success) {
                return NextResponse.json({ error: 'Invalid taskId filter' }, { status: 400 });
            }
            conditions.push(eq(mediaModerationEvents.taskId, taskId));
        }
        if (assetId) {
            if (!z.string().uuid().safeParse(assetId).success) {
                return NextResponse.json({ error: 'Invalid assetId filter' }, { status: 400 });
            }
            conditions.push(eq(mediaModerationEvents.assetId, assetId));
        }

        const events = await db.select().from(mediaModerationEvents)
            .where(and(...conditions))
            .orderBy(asc(mediaModerationEvents.createdAt), asc(mediaModerationEvents.id));

        const chain = verifyMediaModerationEventChain(events.map((event) => ({
            userId: event.userId,
            taskId: event.taskId,
            assetId: event.assetId,
            eventType: event.eventType,
            payload: event.payload,
            prevEventHash: event.prevEventHash,
            eventHash: event.eventHash,
            createdAt: event.createdAt,
        })));

        if (format === 'csv') {
            const headers = [
                'id',
                'userId',
                'taskId',
                'assetId',
                'actorId',
                'eventType',
                'createdAt',
                'prevEventHash',
                'eventHash',
                'payload',
            ];
            const rows = events.map((event) => [
                event.id,
                event.userId,
                event.taskId,
                event.assetId,
                event.actorId,
                event.eventType,
                event.createdAt ? event.createdAt.toISOString() : null,
                event.prevEventHash,
                event.eventHash,
                JSON.stringify(event.payload ?? {}),
            ]);
            const csv = [
                `# chain_valid=${chain.valid},latest_hash=${chain.latestHash ?? ''},reason=${chain.reason ?? ''}`,
                headers.map((value) => csvEscape(value)).join(','),
                ...rows.map((row) => row.map((value) => csvEscape(value)).join(',')),
            ].join('\n');

            return new NextResponse(csv, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="media-moderation-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
                },
            });
        }

        return NextResponse.json({
            generatedAt: new Date().toISOString(),
            count: events.length,
            filter: {
                taskId: taskId ?? null,
                assetId: assetId ?? null,
            },
            chain,
            events,
        });
    } catch (error) {
        console.error('Failed to export media moderation events:', error);
        return NextResponse.json(
            { error: 'Failed to export media moderation events' },
            { status: 500 },
        );
    }
}
