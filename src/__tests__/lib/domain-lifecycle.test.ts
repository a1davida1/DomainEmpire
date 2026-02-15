import { describe, expect, it } from 'vitest';
import {
    canTransitionLifecycle,
    getAllowedLifecycleTransitions,
    isDomainLifecycleState,
} from '@/lib/domain/lifecycle';

describe('domain lifecycle policy', () => {
    it('recognizes valid lifecycle states', () => {
        expect(isDomainLifecycleState('sourced')).toBe(true);
        expect(isDomainLifecycleState('sunset')).toBe(true);
        expect(isDomainLifecycleState('active')).toBe(false);
    });

    it('enforces role constraints on transitions', () => {
        const reviewerToAcquired = canTransitionLifecycle({
            from: 'approved',
            to: 'acquired',
            actorRole: 'reviewer',
        });
        expect(reviewerToAcquired.allowed).toBe(false);

        const expertToAcquired = canTransitionLifecycle({
            from: 'approved',
            to: 'acquired',
            actorRole: 'expert',
        });
        expect(expertToAcquired.allowed).toBe(true);
    });

    it('requires reason for sensitive transitions', () => {
        const noReason = canTransitionLifecycle({
            from: 'growth',
            to: 'hold',
            actorRole: 'expert',
            reason: '',
        });
        expect(noReason.allowed).toBe(false);

        const withReason = canTransitionLifecycle({
            from: 'growth',
            to: 'hold',
            actorRole: 'expert',
            reason: 'Traffic quality dropped for 14 days',
        });
        expect(withReason.allowed).toBe(true);
    });

    it('returns actor-specific allowed transitions', () => {
        const editorTransitions = getAllowedLifecycleTransitions('approved', 'editor');
        const adminTransitions = getAllowedLifecycleTransitions('approved', 'admin');

        expect(editorTransitions).not.toContain('acquired');
        expect(adminTransitions).toContain('acquired');
    });
});
