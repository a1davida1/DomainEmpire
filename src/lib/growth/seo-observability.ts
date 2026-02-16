export type SeoObservabilityFlag =
    | 'ranking_volatility'
    | 'indexation_low'
    | 'conversion_drop'
    | 'runtime_failures';

export type SeoObservabilityRemediation = {
    flag: SeoObservabilityFlag;
    playbookId: string;
    title: string;
    severity: 'warning' | 'critical';
    ownerRole: 'seo_ops' | 'growth_ops' | 'engineering_oncall';
    responseSlaMinutes: number;
    escalationAfterMinutes: number;
    runbookUrl: string;
    immediateActions: string[];
};

export type SeoDomainObservabilityInput = {
    impressionsCurrent: number;
    clicksCurrent: number;
    currentConversions: number;
    priorConversions: number;
    runtimeFailures: number;
    latestAvgPosition: number | null;
    priorAvgPosition: number | null;
    stdDevPosition: number;
};

export type SeoDomainObservability = {
    flags: SeoObservabilityFlag[];
    rankingDelta: number | null;
    conversionDeltaPct: number | null;
    ctrPct: number | null;
    remediations: SeoObservabilityRemediation[];
};

type SeoRemediationDefinition = Omit<SeoObservabilityRemediation, 'flag' | 'runbookUrl'> & {
    runbookAnchor: string;
};

const SEO_REMEDIATIONS: Record<SeoObservabilityFlag, SeoRemediationDefinition> = {
    ranking_volatility: {
        playbookId: 'SEO-001',
        title: 'Ranking Volatility Mitigation',
        severity: 'warning',
        ownerRole: 'seo_ops',
        responseSlaMinutes: 60,
        escalationAfterMinutes: 180,
        runbookAnchor: 'seo-001-ranking-volatility-mitigation',
        immediateActions: [
            'Validate query/rank swings across prior/current windows and confirm affected landing pages.',
            'Check recent content/template/deploy changes before widening experiments.',
            'Stabilize on the last known good template/profile and re-measure for 48h.',
        ],
    },
    indexation_low: {
        playbookId: 'SEO-002',
        title: 'Indexation Recovery',
        severity: 'warning',
        ownerRole: 'seo_ops',
        responseSlaMinutes: 90,
        escalationAfterMinutes: 240,
        runbookAnchor: 'seo-002-indexation-recovery',
        immediateActions: [
            'Confirm robots/canonical/sitemap health for impacted domain and key URLs.',
            'Submit high-priority URLs in Search Console and monitor coverage state.',
            'Reduce thin/duplicate pages and re-queue refreshed crawl candidates.',
        ],
    },
    conversion_drop: {
        playbookId: 'SEO-003',
        title: 'Conversion Drop Incident',
        severity: 'critical',
        ownerRole: 'growth_ops',
        responseSlaMinutes: 30,
        escalationAfterMinutes: 120,
        runbookAnchor: 'seo-003-conversion-drop-incident',
        immediateActions: [
            'Confirm tracking integrity and funnel instrumentation before product changes.',
            'Roll back recent conversion-impacting experiment variants.',
            'Route traffic to last winning variant while incident triage is active.',
        ],
    },
    runtime_failures: {
        playbookId: 'SEO-004',
        title: 'Runtime Failure Recovery',
        severity: 'critical',
        ownerRole: 'engineering_oncall',
        responseSlaMinutes: 15,
        escalationAfterMinutes: 60,
        runbookAnchor: 'seo-004-runtime-failure-recovery',
        immediateActions: [
            'Review deploy/runtime failure logs and identify first failing release.',
            'Rollback to a healthy build and verify critical page/render routes.',
            'Re-run synthetic checks and clear incident only after sustained pass.',
        ],
    },
};

function resolveRunbookBaseUrl(): string {
    const configured = process.env.SEO_OBSERVABILITY_PLAYBOOK_BASE_URL?.trim();
    if (configured) {
        return configured.replace(/\/$/, '');
    }
    return '/docs/ops/seo-observability-playbooks.md';
}

function runbookLink(anchor: string): string {
    return `${resolveRunbookBaseUrl()}#${anchor}`;
}

export function resolveSeoObservabilityRemediations(flags: SeoObservabilityFlag[]): SeoObservabilityRemediation[] {
    const unique = [...new Set(flags)];
    return unique.map((flag) => {
        const definition = SEO_REMEDIATIONS[flag];
        return {
            flag,
            playbookId: definition.playbookId,
            title: definition.title,
            severity: definition.severity,
            ownerRole: definition.ownerRole,
            responseSlaMinutes: definition.responseSlaMinutes,
            escalationAfterMinutes: definition.escalationAfterMinutes,
            runbookUrl: runbookLink(definition.runbookAnchor),
            immediateActions: [...definition.immediateActions],
        };
    });
}

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function finite(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return value;
}

export function computeStdDev(values: number[]): number {
    if (values.length <= 1) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => {
        const delta = value - mean;
        return sum + delta * delta;
    }, 0) / values.length;
    return round(Math.sqrt(Math.max(variance, 0)), 3);
}

export function evaluateSeoDomainObservability(
    input: SeoDomainObservabilityInput,
): SeoDomainObservability {
    const impressionsCurrent = Math.max(0, finite(input.impressionsCurrent));
    const clicksCurrent = Math.max(0, finite(input.clicksCurrent));
    const currentConversions = Math.max(0, Math.trunc(finite(input.currentConversions)));
    const priorConversions = Math.max(0, Math.trunc(finite(input.priorConversions)));
    const runtimeFailures = Math.max(0, Math.trunc(finite(input.runtimeFailures)));
    const stdDevPosition = Math.max(0, finite(input.stdDevPosition));

    const flags: SeoObservabilityFlag[] = [];

    const latestAvgPosition = typeof input.latestAvgPosition === 'number' && Number.isFinite(input.latestAvgPosition)
        ? input.latestAvgPosition
        : null;
    const priorAvgPosition = typeof input.priorAvgPosition === 'number' && Number.isFinite(input.priorAvgPosition)
        ? input.priorAvgPosition
        : null;

    const ctrPct = impressionsCurrent > 0
        ? round((clicksCurrent / impressionsCurrent) * 100, 3)
        : null;

    const latest = latestAvgPosition !== null ? finite(latestAvgPosition) : null;
    const prior = priorAvgPosition !== null ? finite(priorAvgPosition) : null;
    const rankingDelta = latest !== null && prior !== null
        ? round(latest - prior, 3)
        : null;
    if (stdDevPosition >= 8 || (rankingDelta !== null && rankingDelta >= 5)) {
        flags.push('ranking_volatility');
    }

    if (impressionsCurrent < 100) {
        flags.push('indexation_low');
    }

    const conversionDeltaPct = priorConversions > 0
        ? round(((currentConversions - priorConversions) / priorConversions) * 100, 2)
        : null;
    if (priorConversions >= 10 && conversionDeltaPct !== null && conversionDeltaPct <= -40) {
        flags.push('conversion_drop');
    }

    if (runtimeFailures >= 3) {
        flags.push('runtime_failures');
    }

    return {
        flags,
        rankingDelta,
        conversionDeltaPct,
        ctrPct,
        remediations: resolveSeoObservabilityRemediations(flags),
    };
}
