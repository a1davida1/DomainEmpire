import { describe, expect, it } from 'vitest';
import { getLifecyclePlaybookBinding } from '@/lib/domain/lifecycle-playbooks';

describe('getLifecyclePlaybookBinding', () => {
    it('returns manual reversion warning binding', () => {
        const binding = getLifecyclePlaybookBinding('manual_reversion', 'warning');

        expect(binding.playbookId).toBe('LIFECYCLE-001');
        expect(binding.ownerRole).toBe('domain_ops');
        expect(binding.runbookUrl).toContain('#lifecycle-001-manual-lifecycle-reversion');
    });

    it('returns critical SLO breach binding', () => {
        const binding = getLifecyclePlaybookBinding('automation_slo_breach', 'critical');

        expect(binding.playbookId).toBe('LIFECYCLE-005');
        expect(binding.ownerRole).toBe('engineering_oncall');
        expect(binding.runbookUrl).toContain('#lifecycle-005-lifecycle-automation-slo-breach-critical');
    });
});
