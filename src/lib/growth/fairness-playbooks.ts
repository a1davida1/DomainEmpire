export type FairnessSignalCode =
    | 'reviewer_pending_cap'
    | 'round_robin_skew'
    | 'reassignment_concentration'
    | 'override_applied';

export interface FairnessPlaybookBinding {
    signalCode: FairnessSignalCode;
    playbookId: string;
    title: string;
    severity: 'warning' | 'critical';
    ownerRole: 'review_ops' | 'growth_lead' | 'engineering_oncall';
    responseSlaMinutes: number;
    escalationAfterMinutes: number;
    runbookUrl: string;
}

type FairnessPlaybookDefinition = Omit<FairnessPlaybookBinding, 'signalCode' | 'runbookUrl'> & {
    runbookAnchor: string;
};

function resolveRunbookBaseUrl(): string {
    const configured = process.env.FAIRNESS_PLAYBOOK_BASE_URL?.trim();
    if (configured) {
        return configured.replace(/\/$/, '');
    }
    return '/docs/ops/fairness-alert-playbooks.md';
}

function runbookLink(anchor: string): string {
    return `${resolveRunbookBaseUrl()}#${anchor}`;
}

const FAIRNESS_PLAYBOOKS: Record<FairnessSignalCode, FairnessPlaybookDefinition> = {
    reviewer_pending_cap: {
        playbookId: 'FAIRNESS-001',
        title: 'Reviewer Pending Cap Breach',
        severity: 'warning',
        ownerRole: 'review_ops',
        responseSlaMinutes: 15,
        escalationAfterMinutes: 45,
        runbookAnchor: 'fairness-001-reviewer-pending-cap-breach',
    },
    round_robin_skew: {
        playbookId: 'FAIRNESS-002',
        title: 'Round-Robin Skew Violation',
        severity: 'warning',
        ownerRole: 'review_ops',
        responseSlaMinutes: 15,
        escalationAfterMinutes: 45,
        runbookAnchor: 'fairness-002-round-robin-skew-violation',
    },
    reassignment_concentration: {
        playbookId: 'FAIRNESS-003',
        title: 'Reassignment Concentration Warning',
        severity: 'warning',
        ownerRole: 'growth_lead',
        responseSlaMinutes: 60,
        escalationAfterMinutes: 180,
        runbookAnchor: 'fairness-003-reassignment-concentration-warning',
    },
    override_applied: {
        playbookId: 'FAIRNESS-004',
        title: 'Fairness Override Applied',
        severity: 'critical',
        ownerRole: 'engineering_oncall',
        responseSlaMinutes: 10,
        escalationAfterMinutes: 30,
        runbookAnchor: 'fairness-004-fairness-override-applied',
    },
};

function isFairnessSignalCode(value: string): value is FairnessSignalCode {
    return Object.hasOwn(FAIRNESS_PLAYBOOKS, value);
}

export function getFairnessPlaybookBinding(signalCode: FairnessSignalCode): FairnessPlaybookBinding {
    const definition = FAIRNESS_PLAYBOOKS[signalCode];
    return {
        signalCode,
        playbookId: definition.playbookId,
        title: definition.title,
        severity: definition.severity,
        ownerRole: definition.ownerRole,
        responseSlaMinutes: definition.responseSlaMinutes,
        escalationAfterMinutes: definition.escalationAfterMinutes,
        runbookUrl: runbookLink(definition.runbookAnchor),
    };
}

export function resolveFairnessPlaybookBindings(signalCodes: string[]): FairnessPlaybookBinding[] {
    const uniqueCodes = [...new Set(signalCodes
        .map((code) => code.trim())
        .filter((code) => code.length > 0))];

    return uniqueCodes
        .filter((code): code is FairnessSignalCode => isFairnessSignalCode(code))
        .map((code) => getFairnessPlaybookBinding(code));
}
