import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { createNotification } from '@/lib/notifications';
import {
    applyGrowthLaunchFreezeOverride,
    canMutateGrowthLaunchFreezeOverride,
    clearGrowthLaunchFreezeOverride,
    decideGrowthLaunchFreezeOverrideRequest,
    evaluateGrowthLaunchFreeze,
    getActiveGrowthLaunchFreezeOverride,
    listGrowthLaunchFreezeOverrideHistory,
    listGrowthLaunchFreezeOverrideRequests,
    resolveGrowthLaunchFreezeConfig,
    resolveGrowthLaunchFreezeOverrideAllowedRoles,
    type GrowthLaunchAction,
    type GrowthLaunchChannel,
    type GrowthLaunchFreezeOverrideRequestRecord,
    validateGrowthLaunchFreezeOverride,
} from '@/lib/growth/launch-freeze';

const channelEnum = z.enum(['pinterest', 'youtube_shorts']);
const actionEnum = z.enum(['scale', 'optimize', 'recover', 'incubate']);

const postSchema = z.object({
    reason: z.string().trim().min(12).max(500),
    requestApproval: z.boolean().optional().default(false),
    expiresAt: z.string().datetime().optional().nullable(),
    postmortemUrl: z.string().trim().url().max(2000).optional().nullable(),
    incidentKey: z.string().trim().min(3).max(200).optional().nullable(),
    override: z.object({
        warningBurnPct: z.number().min(1).max(1000).optional(),
        criticalBurnPct: z.number().min(2).max(2000).optional(),
        blockedChannels: z.array(channelEnum).min(1).max(2).optional(),
        blockedActions: z.array(actionEnum).min(1).max(4).optional(),
        recoveryHealthyWindowsRequired: z.number().int().min(1).max(24).optional(),
    }).refine((value) => Object.keys(value).length > 0, {
        message: 'At least one override field is required',
    }),
});

const deleteSchema = z.object({
    reason: z.string().trim().min(12).max(500),
});

const requestStatusEnum = z.enum(['pending', 'approved', 'rejected', 'expired']);

const patchSchema = z.object({
    requestId: z.string().uuid(),
    decision: z.enum(['approved', 'rejected']),
    decisionReason: z.string().trim().min(12).max(500),
});

function toExpiresAt(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) return null;
    return parsed;
}

function parseRequestedStatuses(raw: string | null): GrowthLaunchFreezeOverrideRequestRecord['status'][] {
    if (!raw) return ['pending', 'approved', 'rejected', 'expired'];
    const parsed = raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => requestStatusEnum.options.includes(value as GrowthLaunchFreezeOverrideRequestRecord['status']))
        .map((value) => value as GrowthLaunchFreezeOverrideRequestRecord['status']);
    if (parsed.length === 0) return ['pending', 'approved', 'rejected', 'expired'];
    return [...new Set(parsed)];
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
        const parsedHistory = Number.parseInt(request.nextUrl.searchParams.get('historyLimit') || '10', 10);
        const historyLimit = Math.max(1, Math.min(
            Number.isFinite(parsedHistory) ? parsedHistory : 10,
            50,
        ));
        const parsedRequest = Number.parseInt(request.nextUrl.searchParams.get('requestLimit') || '25', 10);
        const requestLimit = Math.max(1, Math.min(
            Number.isFinite(parsedRequest) ? parsedRequest : 25,
            100,
        ));
        const requestStatuses = parseRequestedStatuses(
            request.nextUrl.searchParams.get('requestStatuses'),
        );
        const canMutate = canMutateGrowthLaunchFreezeOverride(user.role);
        const overrideAllowedRoles = [...resolveGrowthLaunchFreezeOverrideAllowedRoles()];

        const [state, baseConfig, activeOverride, history, requests] = await Promise.all([
            evaluateGrowthLaunchFreeze(),
            Promise.resolve(resolveGrowthLaunchFreezeConfig()),
            getActiveGrowthLaunchFreezeOverride(),
            listGrowthLaunchFreezeOverrideHistory(historyLimit),
            listGrowthLaunchFreezeOverrideRequests({
                limit: requestLimit,
                statuses: requestStatuses,
            }),
        ]);
        const visibleRequests = canMutate
            ? requests
            : requests.filter((entry) => entry.requestedByUserId === user.id);

        return NextResponse.json({
            state,
            baseConfig,
            activeOverride,
            history,
            requests: visibleRequests,
            overrideAllowedRoles,
            canMutate,
        });
    } catch (error) {
        console.error('Failed to load growth launch freeze override state:', error);
        return NextResponse.json(
            { error: 'Failed to load growth launch freeze override state' },
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
        const canMutate = canMutateGrowthLaunchFreezeOverride(user.role);
        const baseConfig = resolveGrowthLaunchFreezeConfig();
        const override = {
            warningBurnPct: parsed.data.override.warningBurnPct,
            criticalBurnPct: parsed.data.override.criticalBurnPct,
            blockedChannels: parsed.data.override.blockedChannels as GrowthLaunchChannel[] | undefined,
            blockedActions: parsed.data.override.blockedActions as GrowthLaunchAction[] | undefined,
            recoveryHealthyWindowsRequired: parsed.data.override.recoveryHealthyWindowsRequired,
        };
        const validation = validateGrowthLaunchFreezeOverride({
            baseConfig,
            override,
        });
        if (!validation.valid) {
            return NextResponse.json({
                error: 'Override violates governance policy',
                details: validation.errors,
            }, { status: 409 });
        }

        if (!canMutate) {
            if (!parsed.data.requestApproval) {
                return NextResponse.json(
                    { error: 'Only approved operator roles can update launch-freeze overrides' },
                    { status: 403 },
                );
            }

            const submittedAt = new Date().toISOString();
            await createNotification({
                type: 'info',
                severity: 'warning',
                title: `Launch-freeze override approval requested (${submittedAt})`,
                message: parsed.data.reason,
                actionUrl: '/dashboard/growth',
                metadata: {
                    source: 'growth_launch_freeze_override_request',
                    requestedByUserId: user.id,
                    requestedByRole: user.role,
                    reason: parsed.data.reason,
                    override,
                    expiresAt: parsed.data.expiresAt ?? null,
                    postmortemUrl: parsed.data.postmortemUrl ?? null,
                    incidentKey: parsed.data.incidentKey ?? null,
                    submittedAt,
                },
            });

            return NextResponse.json({
                approvalRequested: true,
                requestedBy: {
                    userId: user.id,
                    role: user.role,
                },
                submittedAt,
            }, { status: 202 });
        }

        const expiresAt = toExpiresAt(parsed.data.expiresAt ?? null);
        if (parsed.data.expiresAt && !expiresAt) {
            return NextResponse.json(
                { error: 'Invalid expiresAt value' },
                { status: 400 },
            );
        }
        if (expiresAt) {
            const now = Date.now();
            if (expiresAt.getTime() <= now) {
                return NextResponse.json(
                    { error: 'expiresAt must be in the future' },
                    { status: 400 },
                );
            }
            const maxWindowMs = 14 * 24 * 60 * 60 * 1000;
            if (expiresAt.getTime() - now > maxWindowMs) {
                return NextResponse.json(
                    { error: 'expiresAt cannot be more than 14 days in the future' },
                    { status: 400 },
                );
            }
        }

        const created = await applyGrowthLaunchFreezeOverride({
            actorUserId: user.id,
            reason: parsed.data.reason,
            override,
            expiresAt,
            postmortemUrl: parsed.data.postmortemUrl ?? null,
            incidentKey: parsed.data.incidentKey ?? null,
        });
        const state = await evaluateGrowthLaunchFreeze({
            override: created,
        });

        return NextResponse.json({
            applied: true,
            override: created,
            state,
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to apply growth launch freeze override:', error);
        return NextResponse.json(
            { error: 'Failed to apply growth launch freeze override' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }
    if (!canMutateGrowthLaunchFreezeOverride(user.role)) {
        return NextResponse.json(
            { error: 'Only approved operator roles can clear launch-freeze overrides' },
            { status: 403 },
        );
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const activeOverride = await getActiveGrowthLaunchFreezeOverride();
        const cleared = await clearGrowthLaunchFreezeOverride({
            actorUserId: user.id,
            reason: parsed.data.reason,
            clearedOverrideId: activeOverride?.id ?? null,
        });
        const state = await evaluateGrowthLaunchFreeze({
            override: null,
        });

        return NextResponse.json({
            cleared: true,
            override: cleared,
            state,
        });
    } catch (error) {
        console.error('Failed to clear growth launch freeze override:', error);
        return NextResponse.json(
            { error: 'Failed to clear growth launch freeze override' },
            { status: 500 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;
    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }
    if (!canMutateGrowthLaunchFreezeOverride(user.role)) {
        return NextResponse.json(
            { error: 'Only approved operator roles can decide launch-freeze override requests' },
            { status: 403 },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const result = await decideGrowthLaunchFreezeOverrideRequest({
            requestId: parsed.data.requestId,
            decision: parsed.data.decision,
            decidedByUserId: user.id,
            decisionReason: parsed.data.decisionReason,
        });
        const state = await evaluateGrowthLaunchFreeze({
            override: result.appliedOverride ?? undefined,
        });

        return NextResponse.json({
            decided: true,
            decision: result.request,
            appliedOverride: result.appliedOverride,
            state,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message === 'Override request not found') {
            return NextResponse.json({ error: message }, { status: 404 });
        }
        if (message === 'Notification is not a launch-freeze override request') {
            return NextResponse.json({ error: message }, { status: 400 });
        }
        if (
            message.includes('already')
            || message.includes('expired')
            || message.startsWith('Cannot approve override request')
        ) {
            return NextResponse.json({ error: message }, { status: 409 });
        }
        console.error('Failed to decide growth launch freeze override request:', error);
        return NextResponse.json(
            { error: 'Failed to decide growth launch freeze override request' },
            { status: 500 },
        );
    }
}
