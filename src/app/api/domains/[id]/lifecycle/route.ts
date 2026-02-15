import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getRequestUser, requireAuth } from '@/lib/auth';
import { db, domainLifecycleEvents, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { createRateLimiter, getClientIp } from '@/lib/rate-limit';
import {
    DOMAIN_LIFECYCLE_STATES,
    canTransitionLifecycle,
    getAllowedLifecycleTransitions,
    isDomainLifecycleState,
    type DomainLifecycleState,
} from '@/lib/domain/lifecycle';

const transitionSchema = z.object({
    toState: z.enum(DOMAIN_LIFECYCLE_STATES),
    reason: z.string().trim().min(8).max(1000).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

type RouteParams = {
    params: Promise<{ id: string }>;
};

const lifecycleMutationLimiter = createRateLimiter('domain_lifecycle_mutation', {
    maxRequests: 30,
    windowMs: 60 * 1000,
});

function resolveLifecycleState(value: string | null | undefined): DomainLifecycleState {
    if (isDomainLifecycleState(value)) {
        return value;
    }
    return 'sourced';
}

// GET /api/domains/[id]/lifecycle
export async function GET(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const parsedLimit = Number.parseInt(new URL(request.url).searchParams.get('limit') || '50', 10);
        const eventLimit = Number.isFinite(parsedLimit)
            ? Math.max(1, Math.min(parsedLimit, 200))
            : 50;

        const [domain] = await db.select({
            id: domains.id,
            domain: domains.domain,
            lifecycleState: domains.lifecycleState,
            updatedAt: domains.updatedAt,
        })
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const currentState = resolveLifecycleState(domain.lifecycleState);
        const events = await db.select()
            .from(domainLifecycleEvents)
            .where(eq(domainLifecycleEvents.domainId, id))
            .orderBy(desc(domainLifecycleEvents.createdAt))
            .limit(eventLimit);

        return NextResponse.json({
            domain: {
                id: domain.id,
                domain: domain.domain,
                lifecycleState: currentState,
                updatedAt: domain.updatedAt,
            },
            allowedTransitions: getAllowedLifecycleTransitions(currentState, user.role),
            events,
        });
    } catch (error) {
        console.error('Failed to fetch domain lifecycle state:', error);
        return NextResponse.json(
            { error: 'Failed to fetch domain lifecycle state' },
            { status: 500 },
        );
    }
}

// POST /api/domains/[id]/lifecycle
export async function POST(request: NextRequest, { params }: RouteParams) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const user = getRequestUser(request);
    if (!user.id) {
        return NextResponse.json({ error: 'Unable to identify user' }, { status: 401 });
    }

    const lifecycleRate = lifecycleMutationLimiter(`${user.id}:${getClientIp(request)}`);
    if (!lifecycleRate.allowed) {
        return NextResponse.json(
            { error: 'Too many lifecycle updates. Please retry shortly.' },
            {
                status: 429,
                headers: lifecycleRate.headers,
            },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.issues },
            { status: 400 },
        );
    }

    try {
        const { id } = await params;
        if (!z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'Invalid domain id' }, { status: 400 });
        }

        const payload = parsed.data;
        const now = new Date();

        const [domain] = await db.select({
            id: domains.id,
            domain: domains.domain,
            lifecycleState: domains.lifecycleState,
        })
            .from(domains)
            .where(and(eq(domains.id, id), notDeleted(domains)))
            .limit(1);

        if (!domain) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }

        const fromState = resolveLifecycleState(domain.lifecycleState);
        const decision = canTransitionLifecycle({
            from: fromState,
            to: payload.toState,
            actorRole: user.role,
            reason: payload.reason ?? null,
        });
        if (!decision.allowed) {
            return NextResponse.json(
                { error: decision.reason || 'Lifecycle transition denied' },
                { status: 403 },
            );
        }

        if (fromState === payload.toState) {
            return NextResponse.json({
                success: true,
                noChange: true,
                domain: {
                    id: domain.id,
                    domain: domain.domain,
                    lifecycleState: fromState,
                },
                allowedTransitions: getAllowedLifecycleTransitions(fromState, user.role),
            });
        }

        const result = await db.transaction(async (tx) => {
            const [updatedDomain] = await tx.update(domains)
                .set({
                    lifecycleState: payload.toState,
                    updatedAt: now,
                })
                .where(and(
                    eq(domains.id, id),
                    eq(domains.lifecycleState, fromState),
                    notDeleted(domains),
                ))
                .returning({
                    id: domains.id,
                    domain: domains.domain,
                    lifecycleState: domains.lifecycleState,
                    updatedAt: domains.updatedAt,
                });

            if (!updatedDomain) {
                return null;
            }

            const [event] = await tx.insert(domainLifecycleEvents)
                .values({
                    domainId: id,
                    actorId: user.id,
                    fromState,
                    toState: payload.toState,
                    reason: payload.reason ?? null,
                    metadata: payload.metadata ?? {},
                    createdAt: now,
                })
                .returning();

            return { updatedDomain, event: event ?? null };
        });

        if (!result) {
            return NextResponse.json(
                { error: 'Lifecycle state changed by another process; retry' },
                { status: 409 },
            );
        }

        const currentState = resolveLifecycleState(result.updatedDomain.lifecycleState);
        return NextResponse.json({
            success: true,
            domain: result.updatedDomain,
            event: result.event,
            allowedTransitions: getAllowedLifecycleTransitions(currentState, user.role),
        });
    } catch (error) {
        console.error('Failed to transition domain lifecycle state:', error);
        return NextResponse.json(
            { error: 'Failed to transition domain lifecycle state' },
            { status: 500 },
        );
    }
}
