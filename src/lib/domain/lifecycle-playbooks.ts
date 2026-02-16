export type LifecycleAnomalyType =
    | 'manual_reversion'
    | 'oscillation'
    | 'automation_slo_breach';

export interface LifecyclePlaybookBinding {
    anomalyType: LifecycleAnomalyType;
    severity: 'warning' | 'critical';
    playbookId: string;
    title: string;
    ownerRole: 'domain_ops' | 'growth_ops' | 'engineering_oncall';
    responseSlaMinutes: number;
    escalationAfterMinutes: number;
    runbookUrl: string;
}

type LifecyclePlaybookDefinition = Omit<LifecyclePlaybookBinding, 'anomalyType' | 'severity' | 'runbookUrl'> & {
    runbookAnchor: string;
};

type LifecyclePlaybookMap = Record<
    LifecycleAnomalyType,
    {
        warning: LifecyclePlaybookDefinition;
        critical: LifecyclePlaybookDefinition;
    }
>;

function resolveRunbookBaseUrl(): string {
    const configured = process.env.DOMAIN_LIFECYCLE_PLAYBOOK_BASE_URL?.trim();
    if (configured) {
        return configured.replace(/\/$/, '');
    }
    return '/docs/ops/domain-lifecycle-alert-playbooks.md';
}

function runbookLink(anchor: string): string {
    return `${resolveRunbookBaseUrl()}#${anchor}`;
}

const LIFECYCLE_PLAYBOOKS: LifecyclePlaybookMap = {
    manual_reversion: {
        warning: {
            playbookId: 'LIFECYCLE-001',
            title: 'Manual Lifecycle Reversion',
            ownerRole: 'domain_ops',
            responseSlaMinutes: 30,
            escalationAfterMinutes: 90,
            runbookAnchor: 'lifecycle-001-manual-lifecycle-reversion',
        },
        critical: {
            playbookId: 'LIFECYCLE-001',
            title: 'Manual Lifecycle Reversion',
            ownerRole: 'domain_ops',
            responseSlaMinutes: 30,
            escalationAfterMinutes: 90,
            runbookAnchor: 'lifecycle-001-manual-lifecycle-reversion',
        },
    },
    oscillation: {
        warning: {
            playbookId: 'LIFECYCLE-002',
            title: 'Lifecycle Oscillation Warning',
            ownerRole: 'domain_ops',
            responseSlaMinutes: 30,
            escalationAfterMinutes: 90,
            runbookAnchor: 'lifecycle-002-lifecycle-oscillation-warning',
        },
        critical: {
            playbookId: 'LIFECYCLE-003',
            title: 'Lifecycle Oscillation Critical',
            ownerRole: 'engineering_oncall',
            responseSlaMinutes: 15,
            escalationAfterMinutes: 45,
            runbookAnchor: 'lifecycle-003-lifecycle-oscillation-critical',
        },
    },
    automation_slo_breach: {
        warning: {
            playbookId: 'LIFECYCLE-004',
            title: 'Lifecycle Automation SLO Breach',
            ownerRole: 'growth_ops',
            responseSlaMinutes: 60,
            escalationAfterMinutes: 180,
            runbookAnchor: 'lifecycle-004-lifecycle-automation-slo-breach-warning',
        },
        critical: {
            playbookId: 'LIFECYCLE-005',
            title: 'Lifecycle Automation SLO Breach Critical',
            ownerRole: 'engineering_oncall',
            responseSlaMinutes: 15,
            escalationAfterMinutes: 60,
            runbookAnchor: 'lifecycle-005-lifecycle-automation-slo-breach-critical',
        },
    },
};

export function getLifecyclePlaybookBinding(
    anomalyType: LifecycleAnomalyType,
    severity: 'warning' | 'critical',
): LifecyclePlaybookBinding {
    const definition = LIFECYCLE_PLAYBOOKS[anomalyType][severity];
    return {
        anomalyType,
        severity,
        playbookId: definition.playbookId,
        title: definition.title,
        ownerRole: definition.ownerRole,
        responseSlaMinutes: definition.responseSlaMinutes,
        escalationAfterMinutes: definition.escalationAfterMinutes,
        runbookUrl: runbookLink(definition.runbookAnchor),
    };
}
