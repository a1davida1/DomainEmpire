import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
    getGrowthLaunchFreezePostmortemSlaSummary,
    listGrowthLaunchFreezePostmortemIncidents,
    recordGrowthLaunchFreezePostmortemCompletion,
} from '@/lib/growth/launch-freeze';

const postSchema = z.object({
    incidentKey: z.string().trim().min(3).max(200),
    postmortemUrl: z.string().trim().url().max(2000).optional().nullable(),
    notes: z.string().trim().min(3).max(2000).optional().nullable(),
});

function parseBooleanQuery(value: string | null, fallback: boolean): boolean {
    if (value === null) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
    }
    return fallback;
}

export async function GET(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    try {
        const includeIncidents = parseBooleanQuery(
            request.nextUrl.searchParams.get('includeIncidents'),
            false,
        );
        const overdueOnly = parseBooleanQuery(
            request.nextUrl.searchParams.get('overdueOnly'),
            false,
        );
        const [summary, incidents] = await Promise.all([
            getGrowthLaunchFreezePostmortemSlaSummary(),
            includeIncidents
                ? listGrowthLaunchFreezePostmortemIncidents({ overdueOnly })
                : Promise.resolve([]),
        ]);

        return NextResponse.json({
            summary,
            incidents,
            includeIncidents,
            overdueOnly,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Failed to load growth launch freeze postmortem SLA status:', error);
        return NextResponse.json(
            { error: 'Failed to load growth launch freeze postmortem SLA status' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const completion = await recordGrowthLaunchFreezePostmortemCompletion({
            incidentKey: parsed.data.incidentKey,
            completedByUserId: user.id,
            postmortemUrl: parsed.data.postmortemUrl ?? null,
            notes: parsed.data.notes ?? null,
        });
        const summary = await getGrowthLaunchFreezePostmortemSlaSummary();

        return NextResponse.json({
            completed: completion.record,
            created: completion.created,
            summary,
        }, { status: completion.created ? 201 : 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message === 'incidentKey is required') {
            return NextResponse.json({ error: message }, { status: 400 });
        }
        console.error('Failed to record growth launch freeze postmortem completion:', error);
        return NextResponse.json(
            { error: 'Failed to record growth launch freeze postmortem completion' },
            { status: 500 },
        );
    }
}
