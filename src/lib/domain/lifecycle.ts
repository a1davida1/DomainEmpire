export const DOMAIN_LIFECYCLE_STATES = [
    'sourced',
    'underwriting',
    'approved',
    'acquired',
    'build',
    'growth',
    'monetized',
    'hold',
    'sell',
    'sunset',
] as const;

export type DomainLifecycleState = typeof DOMAIN_LIFECYCLE_STATES[number];
export type DomainLifecycleActorRole = 'admin' | 'expert' | 'reviewer' | 'editor';

type TransitionRule = {
    to: DomainLifecycleState;
    allowedRoles: DomainLifecycleActorRole[];
    reasonRequired?: boolean;
};

const TRANSITIONS: Record<DomainLifecycleState, TransitionRule[]> = {
    sourced: [
        { to: 'underwriting', allowedRoles: ['editor', 'reviewer', 'expert', 'admin'] },
        { to: 'hold', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sunset', allowedRoles: ['admin'], reasonRequired: true },
    ],
    underwriting: [
        { to: 'approved', allowedRoles: ['reviewer', 'expert', 'admin'] },
        { to: 'hold', allowedRoles: ['reviewer', 'expert', 'admin'], reasonRequired: true },
        { to: 'sunset', allowedRoles: ['expert', 'admin'], reasonRequired: true },
    ],
    approved: [
        { to: 'acquired', allowedRoles: ['expert', 'admin'] },
        { to: 'hold', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sunset', allowedRoles: ['admin'], reasonRequired: true },
    ],
    acquired: [
        { to: 'build', allowedRoles: ['editor', 'expert', 'admin'] },
        { to: 'hold', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sell', allowedRoles: ['expert', 'admin'], reasonRequired: true },
    ],
    build: [
        { to: 'growth', allowedRoles: ['editor', 'expert', 'admin'] },
        { to: 'hold', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sell', allowedRoles: ['expert', 'admin'], reasonRequired: true },
    ],
    growth: [
        { to: 'monetized', allowedRoles: ['editor', 'expert', 'admin'] },
        { to: 'hold', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sell', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sunset', allowedRoles: ['admin'], reasonRequired: true },
    ],
    monetized: [
        { to: 'growth', allowedRoles: ['editor', 'expert', 'admin'] },
        { to: 'hold', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sell', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sunset', allowedRoles: ['admin'], reasonRequired: true },
    ],
    hold: [
        { to: 'growth', allowedRoles: ['expert', 'admin'] },
        { to: 'sell', allowedRoles: ['expert', 'admin'], reasonRequired: true },
        { to: 'sunset', allowedRoles: ['admin'], reasonRequired: true },
    ],
    sell: [
        { to: 'sunset', allowedRoles: ['admin'], reasonRequired: true },
    ],
    sunset: [],
};

export function isDomainLifecycleState(value: string | null | undefined): value is DomainLifecycleState {
    return Boolean(value) && DOMAIN_LIFECYCLE_STATES.includes(value as DomainLifecycleState);
}

export function getLifecycleTransitionRules(from: DomainLifecycleState): TransitionRule[] {
    return TRANSITIONS[from] ?? [];
}

export function getAllowedLifecycleTransitions(
    from: DomainLifecycleState,
    actorRole: string | null | undefined,
): DomainLifecycleState[] {
    const normalizedRole = (actorRole || 'editor') as DomainLifecycleActorRole;
    return getLifecycleTransitionRules(from)
        .filter((rule) => rule.allowedRoles.includes(normalizedRole))
        .map((rule) => rule.to);
}

export function canTransitionLifecycle(input: {
    from: DomainLifecycleState;
    to: DomainLifecycleState;
    actorRole: string | null | undefined;
    reason?: string | null;
}): { allowed: boolean; reason: string | null } {
    if (input.from === input.to) {
        return { allowed: true, reason: null };
    }

    const normalizedRole = (input.actorRole || 'editor') as DomainLifecycleActorRole;
    const rule = getLifecycleTransitionRules(input.from).find((candidate) => candidate.to === input.to);
    if (!rule) {
        return {
            allowed: false,
            reason: `Transition ${input.from} -> ${input.to} is not allowed by lifecycle policy`,
        };
    }

    if (!rule.allowedRoles.includes(normalizedRole)) {
        return {
            allowed: false,
            reason: `Role ${normalizedRole} cannot transition ${input.from} -> ${input.to}`,
        };
    }

    if (rule.reasonRequired) {
        const normalizedReason = (input.reason || '').trim();
        if (normalizedReason.length < 8) {
            return {
                allowed: false,
                reason: `Transition ${input.from} -> ${input.to} requires a reason (min 8 chars)`,
            };
        }
    }

    return { allowed: true, reason: null };
}
