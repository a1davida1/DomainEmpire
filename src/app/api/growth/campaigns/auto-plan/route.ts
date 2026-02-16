import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireRole } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
    applyRoiCampaignAutoplan,
    generateRoiCampaignAutoplanPreview,
    type RoiAutoplanAction,
} from '@/lib/growth/roi-campaign-autoplan';

const autoplanLimiter = createRateLimiter('growth_campaign_roi_autoplan', {
    maxRequests: 60,
    windowMs: 60 * 1000,
});

const actionEnum = z.enum(['scale', 'optimize', 'recover', 'incubate']);

const postSchema = z.object({
    dryRun: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(25),
    windowDays: z.number().int().min(7).max(120).default(30),
    actions: z.array(actionEnum).min(1).max(4).optional(),
    autoLaunch: z.boolean().default(false),
    autoLaunchActions: z.array(actionEnum).min(1).max(4).optional(),
    launchPriority: z.number().int().min(0).max(100).optional(),
    reason: z.string().trim().min(8).max(500).optional(),
    maxCreates: z.number().int().min(1).max(200).optional(),
});

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseActions(value: string | null): RoiAutoplanAction[] {
    if (!value) {
        return ['scale', 'optimize', 'recover', 'incubate'];
    }
    const parsed = value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item): item is RoiAutoplanAction => actionEnum.options.includes(item as RoiAutoplanAction));
    if (parsed.length === 0) {
        return ['scale', 'optimize', 'recover', 'incubate'];
    }
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

    const rate = autoplanLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many ROI auto-plan requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    try {
        const limit = parseIntParam(request.nextUrl.searchParams.get('limit'), 25, 1, 200);
        const windowDays = parseIntParam(request.nextUrl.searchParams.get('windowDays'), 30, 7, 120);
        const actions = parseActions(request.nextUrl.searchParams.get('actions'));

        const preview = await generateRoiCampaignAutoplanPreview({
            limit,
            windowDays,
            actions,
        });

        return NextResponse.json(preview, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to generate ROI campaign auto-plan preview:', error);
        return NextResponse.json(
            { error: 'Failed to generate ROI campaign auto-plan preview' },
            { status: 500, headers: rate.headers },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireRole(request, 'reviewer');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const rate = autoplanLimiter(`${user.id}:${getClientIp(request)}`);
    if (!rate.allowed) {
        return NextResponse.json(
            { error: 'Too many ROI auto-plan mutation requests. Please retry shortly.' },
            { status: 429, headers: rate.headers },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON in request body' },
            { status: 400, headers: rate.headers },
        );
    }

    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400, headers: rate.headers },
        );
    }

    const isExpertLike = user.role === 'expert' || user.role === 'admin';
    if (!parsed.data.dryRun && !isExpertLike) {
        return NextResponse.json(
            {
                error: 'Forbidden',
                message: 'Applying ROI auto-plan requires expert or admin role. Reviewer can run dry-run previews.',
            },
            { status: 403, headers: rate.headers },
        );
    }

    try {
        const preview = await generateRoiCampaignAutoplanPreview({
            limit: parsed.data.limit,
            windowDays: parsed.data.windowDays,
            actions: parsed.data.actions,
        });

        if (parsed.data.dryRun) {
            return NextResponse.json({
                dryRun: true,
                ...preview,
            }, {
                headers: rate.headers,
            });
        }

        const applied = await applyRoiCampaignAutoplan({
            preview,
            createdBy: user.id,
            reason: parsed.data.reason,
            maxCreates: parsed.data.maxCreates,
            autoLaunch: parsed.data.autoLaunch,
            autoLaunchActions: parsed.data.autoLaunchActions,
            launchPriority: parsed.data.launchPriority,
            requirePreviewApproval: isFeatureEnabled('preview_gate_v1', { userId: user.id }),
        });

        return NextResponse.json({
            dryRun: false,
            autoLaunch: parsed.data.autoLaunch,
            preview: {
                count: preview.count,
                creatableCount: preview.creatableCount,
                blockedCount: preview.blockedCount,
                blockedReasonCounts: preview.blockedReasonCounts,
            },
            ...applied,
        }, {
            headers: rate.headers,
        });
    } catch (error) {
        console.error('Failed to apply ROI campaign auto-plan:', error);
        return NextResponse.json(
            { error: 'Failed to apply ROI campaign auto-plan' },
            { status: 500, headers: rate.headers },
        );
    }
}
