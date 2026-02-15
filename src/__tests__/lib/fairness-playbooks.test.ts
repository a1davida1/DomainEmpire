import { beforeEach, describe, expect, it } from 'vitest';

import {
    getFairnessPlaybookBinding,
    resolveFairnessPlaybookBindings,
} from '@/lib/growth/fairness-playbooks';

describe('fairness playbook bindings', () => {
    beforeEach(() => {
        delete process.env.FAIRNESS_PLAYBOOK_BASE_URL;
    });

    it('resolves binding for a known signal code', () => {
        const binding = getFairnessPlaybookBinding('reviewer_pending_cap');
        expect(binding.playbookId).toBe('FAIRNESS-001');
        expect(binding.runbookUrl).toContain('#fairness-001-reviewer-pending-cap-breach');
        expect(binding.ownerRole).toBe('review_ops');
    });

    it('resolves unique bindings and ignores unknown codes', () => {
        const bindings = resolveFairnessPlaybookBindings([
            'reviewer_pending_cap',
            'reviewer_pending_cap',
            'round_robin_skew',
            'unknown_signal',
        ]);

        expect(bindings.map((item) => item.playbookId)).toEqual(['FAIRNESS-001', 'FAIRNESS-002']);
    });

    it('supports configurable runbook base url', () => {
        process.env.FAIRNESS_PLAYBOOK_BASE_URL = 'https://runbooks.example/fairness';
        const bindings = resolveFairnessPlaybookBindings(['override_applied']);

        expect(bindings).toHaveLength(1);
        expect(bindings[0].runbookUrl).toBe('https://runbooks.example/fairness#fairness-004-fairness-override-applied');
    });
});
