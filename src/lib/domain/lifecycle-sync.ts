import { and, eq } from 'drizzle-orm';
import { db, domainLifecycleEvents, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import {
    canTransitionLifecycle,
    isDomainLifecycleState,
    type DomainLifecycleState,
} from '@/lib/domain/lifecycle';

type LifecycleDbClient = Pick<typeof db, 'select' | 'update' | 'insert'>;

type AcquisitionProgressState =
    | 'sourced'
    | 'underwriting'
    | 'approved'
    | 'acquired'
    | 'build'
    | 'growth'
    | 'monetized';

const ACQUISITION_PROGRESS_ORDER: AcquisitionProgressState[] = [
    'sourced',
    'underwriting',
    'approved',
    'acquired',
    'build',
    'growth',
    'monetized',
];

export type AcquisitionLifecycleTargetState = 'underwriting' | 'approved' | 'acquired';

function resolveLifecycleState(rawState: string | null | undefined): DomainLifecycleState {
    if (isDomainLifecycleState(rawState)) return rawState;
    return 'sourced';
}

function isAcquisitionProgressState(value: DomainLifecycleState): value is AcquisitionProgressState {
    return ACQUISITION_PROGRESS_ORDER.includes(value as AcquisitionProgressState);
}

export type AcquisitionLifecycleAdvanceResult = {
    changed: boolean;
    fromState: DomainLifecycleState | null;
    toState: DomainLifecycleState | null;
    appliedStates: DomainLifecycleState[];
    skippedReason: string | null;
};

export async function advanceDomainLifecycleForAcquisition(input: {
    domainId: string;
    targetState: AcquisitionLifecycleTargetState;
    actorId?: string | null;
    actorRole?: string | null;
    reason: string;
    metadata?: Record<string, unknown>;
    now?: Date;
}, client: LifecycleDbClient = db): Promise<AcquisitionLifecycleAdvanceResult> {
    const now = input.now ?? new Date();
    const actorRole = input.actorRole ?? 'admin';

    const [domain] = await client.select({
        id: domains.id,
        lifecycleState: domains.lifecycleState,
    })
        .from(domains)
        .where(and(
            eq(domains.id, input.domainId),
            notDeleted(domains),
        ))
        .limit(1);

    if (!domain) {
        return {
            changed: false,
            fromState: null,
            toState: null,
            appliedStates: [],
            skippedReason: 'domain_not_found',
        };
    }

    const startingState = resolveLifecycleState(domain.lifecycleState);
    if (!isAcquisitionProgressState(startingState)) {
        return {
            changed: false,
            fromState: startingState,
            toState: startingState,
            appliedStates: [],
            skippedReason: `state_${startingState}_outside_acquisition_progress_order`,
        };
    }

    const currentIndex = ACQUISITION_PROGRESS_ORDER.indexOf(startingState);
    const targetIndex = ACQUISITION_PROGRESS_ORDER.indexOf(input.targetState);
    if (targetIndex < 0) {
        return {
            changed: false,
            fromState: startingState,
            toState: startingState,
            appliedStates: [],
            skippedReason: 'unsupported_target_state',
        };
    }
    if (currentIndex >= targetIndex) {
        return {
            changed: false,
            fromState: startingState,
            toState: startingState,
            appliedStates: [],
            skippedReason: 'already_at_or_beyond_target',
        };
    }

    const appliedStates: DomainLifecycleState[] = [];
    let fromState = startingState;
    for (let idx = currentIndex + 1; idx <= targetIndex; idx += 1) {
        const toState = ACQUISITION_PROGRESS_ORDER[idx];
        const policy = canTransitionLifecycle({
            from: fromState,
            to: toState,
            actorRole,
            reason: input.reason,
        });
        if (!policy.allowed) {
            return {
                changed: appliedStates.length > 0,
                fromState: startingState,
                toState: fromState,
                appliedStates,
                skippedReason: policy.reason ?? 'transition_denied',
            };
        }

        const [updated] = await client.update(domains)
            .set({
                lifecycleState: toState,
                updatedAt: now,
            })
            .where(and(
                eq(domains.id, input.domainId),
                eq(domains.lifecycleState, fromState),
                notDeleted(domains),
            ))
            .returning({
                lifecycleState: domains.lifecycleState,
            });
        if (!updated) {
            return {
                changed: appliedStates.length > 0,
                fromState: startingState,
                toState: fromState,
                appliedStates,
                skippedReason: 'concurrent_update_detected',
            };
        }

        await client.insert(domainLifecycleEvents).values({
            domainId: input.domainId,
            actorId: input.actorId ?? null,
            fromState,
            toState,
            reason: input.reason,
            metadata: {
                source: 'acquisition_pipeline',
                actorRole,
                targetState: input.targetState,
                ...(input.metadata ?? {}),
            },
            createdAt: now,
        });

        appliedStates.push(toState);
        fromState = toState;
    }

    return {
        changed: appliedStates.length > 0,
        fromState: startingState,
        toState: fromState,
        appliedStates,
        skippedReason: null,
    };
}
