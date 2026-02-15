import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth, requireRole } from '@/lib/auth';
import { db, domainOwnershipEvents, domainRegistrarProfiles, domains, users } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
    REGISTRAR_DNSSEC_STATUSES,
    REGISTRAR_LOCK_STATUSES,
    REGISTRAR_OWNERSHIP_STATUSES,
    REGISTRAR_TRANSFER_STATUSES,
    computeRegistrarExpirationRisk,
    isRegistrarExpirationRisk,
    isRegistrarDnssecStatus,
    isRegistrarLockStatus,
    isRegistrarOwnershipStatus,
    isRegistrarTransferStatus,
    type RegistrarExpirationRisk,
    type RegistrarDnssecStatus,
    type RegistrarLockStatus,
    type RegistrarOwnershipStatus,
    type RegistrarTransferStatus,
} from '@/lib/domain/registrar-operations';

const EVENT_SOURCES = ['manual', 'integration_sync', 'system'] as const;
const ownershipReadLimiter = createRateLimiter('domain_ownership_read', {
    maxRequests: 120,
    windowMs: 60 * 1000,
});
const ownershipMutationLimiter = createRateLimiter('domain_ownership_mutation', {
    maxRequests: 20,
    windowMs: 60 * 1000,
});

const patchSchema = z.object({
    connectionId: z.string().uuid().nullable().optional(),
    ownershipStatus: z.enum(REGISTRAR_OWNERSHIP_STATUSES).optional(),
    transferStatus: z.enum(REGISTRAR_TRANSFER_STATUSES).optional(),
    transferTargetRegistrar: z.string().trim().max(255).nullable().optional(),
    transferRequestedAt: z.string().datetime().nullable().optional(),
    transferCompletedAt: z.string().datetime().nullable().optional(),
    autoRenewEnabled: z.boolean().optional(),
    lockStatus: z.enum(REGISTRAR_LOCK_STATUSES).optional(),
    dnssecStatus: z.enum(REGISTRAR_DNSSEC_STATUSES).optional(),
    ownerHandle: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    recomputeRisk: z.boolean().optional(),
    reason: z.string().trim().min(8).max(1000).nullable().optional(),
    source: z.enum(EVENT_SOURCES).optional(),
}).superRefine((value, ctx) => {
    const hasField = [
        'connectionId',
        'ownershipStatus',
        'transferStatus',
        'transferTargetRegistrar',
        'transferRequestedAt',
        'transferCompletedAt',
        'autoRenewEnabled',
        'lockStatus',
        'dnssecStatus',
        'ownerHandle',
        'notes',
        'metadata',
        'recomputeRisk',
    ].some((key) => Object.prototype.hasOwnProperty.call(value, key));

    if (!hasField) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'At least one profile field must be provided',
        });
    }

    if (value.transferStatus && (value.transferStatus === 'initiated' || value.transferStatus === 'failed')) {
        const reason = (value.reason ?? '').trim();
        if (reason.length < 8) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['reason'],
                message: 'reason is required (min 8 chars) for initiated/failed transfer updates',
            });
        }
    }

    if (value.transferRequestedAt && value.transferCompletedAt) {
        const requested = new Date(value.transferRequestedAt);
        const completed = new Date(value.transferCompletedAt);
        if (completed.getTime() < requested.getTime()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['transferCompletedAt'],
                message: 'transferCompletedAt cannot be before transferRequestedAt',
            });
        }
    }
});

type RouteParams = {
    params: Promise<{ id: string }>;
};

type ProfileState = {
    connectionId: string | null;
    ownershipStatus: RegistrarOwnershipStatus;
    transferStatus: RegistrarTransferStatus;
    transferTargetRegistrar: string | null;
    transferRequestedAt: Date | null;
    transferCompletedAt: Date | null;
    autoRenewEnabled: boolean;
    lockStatus: RegistrarLockStatus;
    dnssecStatus: RegistrarDnssecStatus;
    ownerHandle: string | null;
    notes: string | null;
    metadata: Record<string, unknown>;
    expirationRisk: RegistrarExpirationRisk;
    expirationRiskScore: number;
    expirationRiskUpdatedAt: Date | null;
    ownershipLastChangedAt: Date | null;
    ownershipChangedBy: string | null;
    lastSyncedAt: Date | null;
};

type OwnershipEventDraft = {
    eventType: 'ownership_verified' | 'ownership_changed' | 'registrar_changed' | 'transfer_initiated' | 'transfer_completed' | 'transfer_failed' | 'lock_changed' | 'dnssec_changed' | 'auto_renew_changed' | 'risk_recomputed';
    summary: string;
    previousState: Record<string, unknown>;
    nextState: Record<string, unknown>;
};

function toDateOrNull(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function asProfileState(row: {
    connectionId: string | null;
    ownershipStatus: string | null;
    transferStatus: string | null;
    transferTargetRegistrar: string | null;
    transferRequestedAt: Date | null;
    transferCompletedAt: Date | null;
    autoRenewEnabled: boolean | null;
    lockStatus: string | null;
    dnssecStatus: string | null;
    ownerHandle: string | null;
    notes: string | null;
    metadata: Record<string, unknown> | null;
    expirationRisk: string | null;
    expirationRiskScore: number | null;
    expirationRiskUpdatedAt: Date | null;
    ownershipLastChangedAt: Date | null;
    ownershipChangedBy: string | null;
    lastSyncedAt: Date | null;
} | null | undefined): ProfileState {
    return {
        connectionId: row?.connectionId ?? null,
        ownershipStatus: isRegistrarOwnershipStatus(row?.ownershipStatus) ? row.ownershipStatus : 'unknown',
        transferStatus: isRegistrarTransferStatus(row?.transferStatus) ? row.transferStatus : 'none',
        transferTargetRegistrar: row?.transferTargetRegistrar ?? null,
        transferRequestedAt: toDateOrNull(row?.transferRequestedAt),
        transferCompletedAt: toDateOrNull(row?.transferCompletedAt),
        autoRenewEnabled: row?.autoRenewEnabled !== false,
        lockStatus: isRegistrarLockStatus(row?.lockStatus) ? row.lockStatus : 'unknown',
        dnssecStatus: isRegistrarDnssecStatus(row?.dnssecStatus) ? row.dnssecStatus : 'unknown',
        ownerHandle: row?.ownerHandle ?? null,
        notes: row?.notes ?? null,
        metadata: row?.metadata ?? {},
        expirationRisk: isRegistrarExpirationRisk(row?.expirationRisk) ? row.expirationRisk : 'unknown',
        expirationRiskScore: row?.expirationRiskScore ?? 0,
        expirationRiskUpdatedAt: toDateOrNull(row?.expirationRiskUpdatedAt),
        ownershipLastChangedAt: toDateOrNull(row?.ownershipLastChangedAt),
        ownershipChangedBy: row?.ownershipChangedBy ?? null,
        lastSyncedAt: toDateOrNull(row?.lastSyncedAt),
    };
}

function sameDate(left: Date | null, right: Date | null): boolean {
    if (left === null && right === null) return true;
    if (left === null || right === null) return false;
    return left.getTime() === right.getTime();
}

function transferEventType(status: RegistrarTransferStatus): OwnershipEventDraft['eventType'] {
    if (status === 'initiated' || status === 'pending') return 'transfer_initiated';
    if (status === 'completed') return 'transfer_completed';
    if (status === 'failed') return 'transfer_failed';
    return 'ownership_changed';
}

// GET /api/domains/[id]/ownership
export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;
    const user = getRequestUser(request);

    const readRate = ownershipReadLimiter(`${user.id}:${getClientIp(request)}`);
    if (!readRate.allowed) {
        return NextResponse.json(
            { error: 'Too many ownership reads. Please retry shortly.' },
            {
                status: 429,
                headers: readRate.headers,
            },
        );
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const parsedLimit = Number.parseInt(new URL(request.url).searchParams.get('limit') || '25', 10);
        const eventLimit = Number.isFinite(parsedLimit)
            ? Math.max(1, Math.min(parsedLimit, 200))
            : 25;

        const [row] = await db.select({
            id: domains.id,
            domain: domains.domain,
            registrar: domains.registrar,
            lifecycleState: domains.lifecycleState,
            renewalDate: domains.renewalDate,
            renewalPrice: domains.renewalPrice,
            profileId: domainRegistrarProfiles.id,
            connectionId: domainRegistrarProfiles.connectionId,
            ownershipStatus: domainRegistrarProfiles.ownershipStatus,
            transferStatus: domainRegistrarProfiles.transferStatus,
            transferTargetRegistrar: domainRegistrarProfiles.transferTargetRegistrar,
            transferRequestedAt: domainRegistrarProfiles.transferRequestedAt,
            transferCompletedAt: domainRegistrarProfiles.transferCompletedAt,
            autoRenewEnabled: domainRegistrarProfiles.autoRenewEnabled,
            lockStatus: domainRegistrarProfiles.lockStatus,
            dnssecStatus: domainRegistrarProfiles.dnssecStatus,
            ownerHandle: domainRegistrarProfiles.ownerHandle,
            notes: domainRegistrarProfiles.notes,
            metadata: domainRegistrarProfiles.metadata,
            expirationRisk: domainRegistrarProfiles.expirationRisk,
            expirationRiskScore: domainRegistrarProfiles.expirationRiskScore,
            expirationRiskUpdatedAt: domainRegistrarProfiles.expirationRiskUpdatedAt,
            ownershipLastChangedAt: domainRegistrarProfiles.ownershipLastChangedAt,
            ownershipChangedBy: domainRegistrarProfiles.ownershipChangedBy,
            lastSyncedAt: domainRegistrarProfiles.lastSyncedAt,
            createdAt: domainRegistrarProfiles.createdAt,
            updatedAt: domainRegistrarProfiles.updatedAt,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!row) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const profile = asProfileState(row.profileId ? row : null);
        const renewalRisk = computeRegistrarExpirationRisk({
            renewalDate: row.renewalDate,
            autoRenewEnabled: profile.autoRenewEnabled,
            transferStatus: profile.transferStatus,
        });

        const events = await db.select({
            id: domainOwnershipEvents.id,
            profileId: domainOwnershipEvents.profileId,
            eventType: domainOwnershipEvents.eventType,
            source: domainOwnershipEvents.source,
            summary: domainOwnershipEvents.summary,
            previousState: domainOwnershipEvents.previousState,
            nextState: domainOwnershipEvents.nextState,
            reason: domainOwnershipEvents.reason,
            metadata: domainOwnershipEvents.metadata,
            createdAt: domainOwnershipEvents.createdAt,
            actorId: users.id,
            actorName: users.name,
        })
            .from(domainOwnershipEvents)
            .leftJoin(users, eq(domainOwnershipEvents.actorId, users.id))
            .where(eq(domainOwnershipEvents.domainId, id))
            .orderBy(desc(domainOwnershipEvents.createdAt))
            .limit(eventLimit);

        return NextResponse.json({
            domain: {
                id: row.id,
                domain: row.domain,
                registrar: row.registrar,
                lifecycleState: row.lifecycleState,
                renewalDate: row.renewalDate,
                renewalPrice: row.renewalPrice,
            },
            permissions: {
                canEdit: user.role === 'admin' || user.role === 'expert',
                role: user.role,
            },
            profile: row.profileId ? {
                id: row.profileId,
                ...profile,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            } : null,
            renewalRisk,
            events,
        });
    } catch (error) {
        console.error('Failed to fetch domain ownership profile:', error);
        return NextResponse.json(
            { error: 'Failed to fetch domain ownership profile' },
            { status: 500 },
        );
    }
}

// PATCH /api/domains/[id]/ownership
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const authError = await requireRole(request, 'expert');
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const mutationRate = ownershipMutationLimiter(`${user.id}:${getClientIp(request)}`);
    if (!mutationRate.allowed) {
        return NextResponse.json(
            { error: 'Too many ownership updates. Please retry shortly.' },
            {
                status: 429,
                headers: mutationRate.headers,
            },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    const source = parsed.data.source ?? 'manual';
    if (source !== 'manual' && user.role !== 'admin') {
        return NextResponse.json(
            { error: 'Only admins can emit non-manual ownership event sources' },
            { status: 403 },
        );
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const [row] = await db.select({
            id: domains.id,
            domain: domains.domain,
            renewalDate: domains.renewalDate,
            profileId: domainRegistrarProfiles.id,
            connectionId: domainRegistrarProfiles.connectionId,
            ownershipStatus: domainRegistrarProfiles.ownershipStatus,
            transferStatus: domainRegistrarProfiles.transferStatus,
            transferTargetRegistrar: domainRegistrarProfiles.transferTargetRegistrar,
            transferRequestedAt: domainRegistrarProfiles.transferRequestedAt,
            transferCompletedAt: domainRegistrarProfiles.transferCompletedAt,
            autoRenewEnabled: domainRegistrarProfiles.autoRenewEnabled,
            lockStatus: domainRegistrarProfiles.lockStatus,
            dnssecStatus: domainRegistrarProfiles.dnssecStatus,
            ownerHandle: domainRegistrarProfiles.ownerHandle,
            notes: domainRegistrarProfiles.notes,
            metadata: domainRegistrarProfiles.metadata,
            expirationRisk: domainRegistrarProfiles.expirationRisk,
            expirationRiskScore: domainRegistrarProfiles.expirationRiskScore,
            expirationRiskUpdatedAt: domainRegistrarProfiles.expirationRiskUpdatedAt,
            ownershipLastChangedAt: domainRegistrarProfiles.ownershipLastChangedAt,
            ownershipChangedBy: domainRegistrarProfiles.ownershipChangedBy,
            lastSyncedAt: domainRegistrarProfiles.lastSyncedAt,
        })
            .from(domains)
            .leftJoin(domainRegistrarProfiles, eq(domainRegistrarProfiles.domainId, domains.id))
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!row) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const payload = parsed.data;
        const now = new Date();
        const previous = asProfileState(row.profileId ? row : null);
        const next: ProfileState = {
            ...previous,
            connectionId: payload.connectionId !== undefined ? payload.connectionId : previous.connectionId,
            ownershipStatus: payload.ownershipStatus ?? previous.ownershipStatus,
            transferStatus: payload.transferStatus ?? previous.transferStatus,
            transferTargetRegistrar: payload.transferTargetRegistrar !== undefined
                ? payload.transferTargetRegistrar
                : previous.transferTargetRegistrar,
            transferRequestedAt: payload.transferRequestedAt !== undefined
                ? toDateOrNull(payload.transferRequestedAt)
                : previous.transferRequestedAt,
            transferCompletedAt: payload.transferCompletedAt !== undefined
                ? toDateOrNull(payload.transferCompletedAt)
                : previous.transferCompletedAt,
            autoRenewEnabled: payload.autoRenewEnabled ?? previous.autoRenewEnabled,
            lockStatus: payload.lockStatus ?? previous.lockStatus,
            dnssecStatus: payload.dnssecStatus ?? previous.dnssecStatus,
            ownerHandle: payload.ownerHandle !== undefined ? payload.ownerHandle : previous.ownerHandle,
            notes: payload.notes !== undefined ? payload.notes : previous.notes,
            metadata: payload.metadata !== undefined
                ? { ...(previous.metadata ?? {}), ...payload.metadata }
                : previous.metadata,
        };

        const risk = computeRegistrarExpirationRisk({
            renewalDate: row.renewalDate,
            autoRenewEnabled: next.autoRenewEnabled,
            transferStatus: next.transferStatus,
            now,
        });
        next.expirationRisk = risk.risk;
        next.expirationRiskScore = risk.riskScore;
        next.expirationRiskUpdatedAt = now;

        if (next.transferStatus === 'completed' && !next.transferCompletedAt) {
            next.transferCompletedAt = now;
        }
        if ((next.transferStatus === 'initiated' || next.transferStatus === 'pending') && !next.transferRequestedAt) {
            next.transferRequestedAt = now;
        }

        if (next.ownershipStatus !== previous.ownershipStatus || next.ownerHandle !== previous.ownerHandle) {
            next.ownershipLastChangedAt = now;
            next.ownershipChangedBy = user.id;
        }

        const events: OwnershipEventDraft[] = [];

        if (next.connectionId !== previous.connectionId) {
            events.push({
                eventType: 'registrar_changed',
                summary: `Registrar connection updated`,
                previousState: { connectionId: previous.connectionId },
                nextState: { connectionId: next.connectionId },
            });
        }

        if (next.ownershipStatus !== previous.ownershipStatus) {
            events.push({
                eventType: next.ownershipStatus === 'verified' ? 'ownership_verified' : 'ownership_changed',
                summary: `Ownership status changed from ${previous.ownershipStatus} to ${next.ownershipStatus}`,
                previousState: { ownershipStatus: previous.ownershipStatus },
                nextState: { ownershipStatus: next.ownershipStatus },
            });
        }

        if (next.transferStatus !== previous.transferStatus) {
            events.push({
                eventType: transferEventType(next.transferStatus),
                summary: `Transfer status changed from ${previous.transferStatus} to ${next.transferStatus}`,
                previousState: { transferStatus: previous.transferStatus },
                nextState: {
                    transferStatus: next.transferStatus,
                    transferTargetRegistrar: next.transferTargetRegistrar,
                    transferRequestedAt: next.transferRequestedAt?.toISOString() ?? null,
                    transferCompletedAt: next.transferCompletedAt?.toISOString() ?? null,
                },
            });
        }

        if (next.lockStatus !== previous.lockStatus) {
            events.push({
                eventType: 'lock_changed',
                summary: `Domain lock status changed from ${previous.lockStatus} to ${next.lockStatus}`,
                previousState: { lockStatus: previous.lockStatus },
                nextState: { lockStatus: next.lockStatus },
            });
        }

        if (next.dnssecStatus !== previous.dnssecStatus) {
            events.push({
                eventType: 'dnssec_changed',
                summary: `DNSSEC status changed from ${previous.dnssecStatus} to ${next.dnssecStatus}`,
                previousState: { dnssecStatus: previous.dnssecStatus },
                nextState: { dnssecStatus: next.dnssecStatus },
            });
        }

        if (next.autoRenewEnabled !== previous.autoRenewEnabled) {
            events.push({
                eventType: 'auto_renew_changed',
                summary: `Auto-renew ${next.autoRenewEnabled ? 'enabled' : 'disabled'}`,
                previousState: { autoRenewEnabled: previous.autoRenewEnabled },
                nextState: { autoRenewEnabled: next.autoRenewEnabled },
            });
        }

        if (
            next.expirationRisk !== previous.expirationRisk
            || next.expirationRiskScore !== previous.expirationRiskScore
            || payload.recomputeRisk === true
        ) {
            events.push({
                eventType: 'risk_recomputed',
                summary: `Renewal risk recalculated to ${next.expirationRisk} (${next.expirationRiskScore})`,
                previousState: {
                    expirationRisk: previous.expirationRisk,
                    expirationRiskScore: previous.expirationRiskScore,
                },
                nextState: {
                    expirationRisk: next.expirationRisk,
                    expirationRiskScore: next.expirationRiskScore,
                    renewalWindow: risk.renewalWindow,
                    daysUntilRenewal: risk.daysUntilRenewal,
                },
            });
        }

        const metadataChanged = JSON.stringify(previous.metadata) !== JSON.stringify(next.metadata);
        const notesChanged = previous.notes !== next.notes;
        const ownerHandleChanged = previous.ownerHandle !== next.ownerHandle;
        const transferTargetChanged = previous.transferTargetRegistrar !== next.transferTargetRegistrar;
        const transferRequestedChanged = !sameDate(previous.transferRequestedAt, next.transferRequestedAt);
        const transferCompletedChanged = !sameDate(previous.transferCompletedAt, next.transferCompletedAt);

        const hasMaterialChange = events.length > 0
            || metadataChanged
            || notesChanged
            || ownerHandleChanged
            || transferTargetChanged
            || transferRequestedChanged
            || transferCompletedChanged
            || payload.recomputeRisk === true
            || !row.profileId;

        if (!hasMaterialChange) {
            return NextResponse.json({
                success: true,
                noChange: true,
                domain: { id: row.id, domain: row.domain },
                profile: { id: row.profileId, ...previous },
                renewalRisk: risk,
            });
        }

        const result = await db.transaction(async (tx) => {
            const [profile] = await tx.insert(domainRegistrarProfiles)
                .values({
                    domainId: id,
                    connectionId: next.connectionId,
                    ownershipStatus: next.ownershipStatus,
                    transferStatus: next.transferStatus,
                    transferTargetRegistrar: next.transferTargetRegistrar,
                    transferRequestedAt: next.transferRequestedAt,
                    transferCompletedAt: next.transferCompletedAt,
                    autoRenewEnabled: next.autoRenewEnabled,
                    lockStatus: next.lockStatus,
                    dnssecStatus: next.dnssecStatus,
                    expirationRisk: next.expirationRisk,
                    expirationRiskScore: next.expirationRiskScore,
                    expirationRiskUpdatedAt: next.expirationRiskUpdatedAt,
                    ownershipLastChangedAt: next.ownershipLastChangedAt,
                    ownershipChangedBy: next.ownershipChangedBy,
                    ownerHandle: next.ownerHandle,
                    notes: next.notes,
                    metadata: next.metadata,
                    lastSyncedAt: source === 'integration_sync' ? now : next.lastSyncedAt,
                    createdAt: now,
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: domainRegistrarProfiles.domainId,
                    set: {
                        connectionId: next.connectionId,
                        ownershipStatus: next.ownershipStatus,
                        transferStatus: next.transferStatus,
                        transferTargetRegistrar: next.transferTargetRegistrar,
                        transferRequestedAt: next.transferRequestedAt,
                        transferCompletedAt: next.transferCompletedAt,
                        autoRenewEnabled: next.autoRenewEnabled,
                        lockStatus: next.lockStatus,
                        dnssecStatus: next.dnssecStatus,
                        expirationRisk: next.expirationRisk,
                        expirationRiskScore: next.expirationRiskScore,
                        expirationRiskUpdatedAt: next.expirationRiskUpdatedAt,
                        ownershipLastChangedAt: next.ownershipLastChangedAt,
                        ownershipChangedBy: next.ownershipChangedBy,
                        ownerHandle: next.ownerHandle,
                        notes: next.notes,
                        metadata: next.metadata,
                        lastSyncedAt: source === 'integration_sync' ? now : next.lastSyncedAt,
                        updatedAt: now,
                    },
                })
                .returning();

            if (!profile) {
                return null;
            }

            const eventValues = events.map((event) => ({
                domainId: id,
                profileId: profile.id,
                actorId: user.id,
                eventType: event.eventType,
                source,
                summary: event.summary,
                previousState: event.previousState,
                nextState: event.nextState,
                reason: payload.reason ?? null,
                metadata: {
                    ...(payload.metadata ?? {}),
                    recommendation: risk.recommendation,
                    renewalWindow: risk.renewalWindow,
                    daysUntilRenewal: risk.daysUntilRenewal,
                },
                createdAt: now,
            }));

            if (eventValues.length === 0) {
                eventValues.push({
                    domainId: id,
                    profileId: profile.id,
                    actorId: user.id,
                    eventType: 'ownership_changed',
                    source,
                    summary: row.profileId ? 'Registrar profile updated' : 'Registrar profile initialized',
                    previousState: { profileExisted: Boolean(row.profileId) },
                    nextState: { profileExisted: true },
                    reason: payload.reason ?? null,
                    metadata: {
                        ...(payload.metadata ?? {}),
                        recommendation: risk.recommendation,
                        renewalWindow: risk.renewalWindow,
                        daysUntilRenewal: risk.daysUntilRenewal,
                    },
                    createdAt: now,
                });
            }

            const insertedEvents = await tx.insert(domainOwnershipEvents)
                .values(eventValues)
                .returning();

            return { profile, insertedEvents };
        });

        if (!result) {
            return NextResponse.json({ error: 'Failed to persist registrar profile update' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            domain: {
                id: row.id,
                domain: row.domain,
            },
            profile: result.profile,
            renewalRisk: risk,
            events: result.insertedEvents,
        });
    } catch (error) {
        console.error('Failed to update domain ownership profile:', error);
        return NextResponse.json(
            { error: 'Failed to update domain ownership profile' },
            { status: 500 },
        );
    }
}
