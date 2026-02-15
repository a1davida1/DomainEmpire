import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { isFeatureEnabled } from '@/lib/feature-flags';
import {
    executeGrowthCredentialDrill,
    listGrowthCredentialDrillRuns,
    type GrowthCredentialDrillStatus,
} from '@/lib/growth/credential-drills';

const statusEnum = z.enum(['success', 'failed', 'partial']);
const scopeEnum = z.enum(['all', 'pinterest', 'youtube_shorts']);
const reconnectCredentialSchema = z.object({
    channel: z.enum(['pinterest', 'youtube_shorts']),
    accessToken: z.string().trim().min(1).max(10_000),
    refreshToken: z.string().trim().max(10_000).optional().nullable(),
    accessTokenExpiresAt: z.string().datetime().optional().nullable(),
    refreshTokenExpiresAt: z.string().datetime().optional().nullable(),
    scopes: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
    providerAccountId: z.string().trim().max(500).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

const postBodySchema = z.object({
    scope: scopeEnum.optional(),
    dryRun: z.boolean().optional(),
    validateRefresh: z.boolean().optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
    incidentChecklistId: z.string().trim().max(200).optional().nullable(),
    checklist: z.object({
        campaignLaunchFrozen: z.boolean().optional(),
        monitoringChecked: z.boolean().optional(),
        providerTokensRevoked: z.boolean().optional(),
        reconnectCompleted: z.boolean().optional(),
        testPublishValidated: z.boolean().optional(),
    }).optional().nullable(),
    reconnectCredentials: z.array(reconnectCredentialSchema).max(2).optional(),
}).superRefine((value, ctx) => {
    if (value.dryRun === false) {
        const incidentChecklistId = typeof value.incidentChecklistId === 'string'
            ? value.incidentChecklistId.trim()
            : '';
        if (incidentChecklistId.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['incidentChecklistId'],
                message: 'incidentChecklistId is required when dryRun is false',
            });
        }
    }
});

function parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toStatusCode(status: GrowthCredentialDrillStatus): number {
    if (status === 'failed') return 409;
    return 200;
}

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user?.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }
    if (!isFeatureEnabled('growth_channels_v1', { userId: user.id })) {
        return NextResponse.json({ error: 'Growth channels are disabled' }, { status: 403 });
    }

    const url = new URL(request.url);
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(parsedLimit, 100))
        : 20;
    const statusRaw = url.searchParams.get('status');
    const status = statusRaw && statusEnum.safeParse(statusRaw).success
        ? statusRaw as GrowthCredentialDrillStatus
        : undefined;

    try {
        const runs = await listGrowthCredentialDrillRuns(user.id, {
            limit,
            status,
        });
        return NextResponse.json({ runs });
    } catch (error) {
        console.error('Failed to list growth credential drill runs:', error);
        return NextResponse.json(
            { error: 'Failed to list credential drill runs' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const authError = await requireAuth(request);
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
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const result = await executeGrowthCredentialDrill({
            userId: user.id,
            initiatedBy: user.id,
            scope: parsed.data.scope ?? 'all',
            dryRun: parsed.data.dryRun ?? false,
            validateRefresh: parsed.data.validateRefresh ?? true,
            notes: parsed.data.notes ?? null,
            incidentChecklistId: parsed.data.incidentChecklistId ?? null,
            checklist: parsed.data.checklist ?? null,
            reconnectCredentials: (parsed.data.reconnectCredentials ?? []).map((credential) => ({
                channel: credential.channel,
                accessToken: credential.accessToken,
                refreshToken: credential.refreshToken ?? null,
                accessTokenExpiresAt: parseDate(credential.accessTokenExpiresAt ?? null),
                refreshTokenExpiresAt: parseDate(credential.refreshTokenExpiresAt ?? null),
                scopes: credential.scopes ?? [],
                providerAccountId: credential.providerAccountId ?? null,
                metadata: credential.metadata ?? {},
            })),
        });

        const firstError = result.results.errors[0] || null;
        const responseBody: Record<string, unknown> = {
            success: result.status === 'success',
            dryRun: result.dryRun,
            scope: result.scope,
            status: result.status,
            checklist: result.checklist,
            results: result.results,
            run: result.run,
            incidentChecklistAttachment: result.incidentChecklistAttachment,
        };
        if (result.status === 'failed') {
            responseBody.error = firstError || 'Credential drill failed';
        }

        return NextResponse.json(responseBody, { status: toStatusCode(result.status) });
    } catch (error) {
        console.error('Failed to execute growth credential drill:', error);
        return NextResponse.json(
            { error: 'Failed to execute credential drill' },
            { status: 500 },
        );
    }
}
