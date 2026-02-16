import { and, desc, eq, gte } from 'drizzle-orm';
import { sendOpsChannelAlert } from '@/lib/alerts/ops-channel';
import { db, domainLifecycleEvents, domains } from '@/lib/db';
import { notDeleted } from '@/lib/db/soft-delete';
import { type DomainLifecycleState, isDomainLifecycleState } from '@/lib/domain/lifecycle';
import { getLifecyclePlaybookBinding, type LifecycleAnomalyType } from '@/lib/domain/lifecycle-playbooks';
import { createNotification } from '@/lib/notifications';

const CORE_PROGRESS_ORDER: DomainLifecycleState[] = [
    'sourced',
    'underwriting',
    'approved',
    'acquired',
    'build',
    'growth',
    'monetized',
];

const CORE_PROGRESS_INDEX = new Map(
    CORE_PROGRESS_ORDER.map((state, index) => [state, index]),
);

export const LIFECYCLE_AUTOMATION_SOURCES = [
    'acquisition_pipeline',
    'deploy_processor',
    'growth_campaign_launch',
    'finance_ledger',
] as const;

type LifecycleAutomationSource = typeof LIFECYCLE_AUTOMATION_SOURCES[number];

const AUTOMATION_SOURCE_SET = new Set<string>(LIFECYCLE_AUTOMATION_SOURCES);

const SOURCE_TARGET_STATES: Record<LifecycleAutomationSource, DomainLifecycleState[]> = {
    acquisition_pipeline: ['underwriting', 'approved', 'acquired'],
    deploy_processor: ['build'],
    growth_campaign_launch: ['growth'],
    finance_ledger: ['monetized'],
};

const SOURCE_THRESHOLD_ENV: Record<LifecycleAutomationSource, string> = {
    acquisition_pipeline: 'DOMAIN_LIFECYCLE_SLO_ACQUISITION_PIPELINE_MIN_RATE',
    deploy_processor: 'DOMAIN_LIFECYCLE_SLO_DEPLOY_PROCESSOR_MIN_RATE',
    growth_campaign_launch: 'DOMAIN_LIFECYCLE_SLO_GROWTH_CAMPAIGN_LAUNCH_MIN_RATE',
    finance_ledger: 'DOMAIN_LIFECYCLE_SLO_FINANCE_LEDGER_MIN_RATE',
};

const DEFAULT_SOURCE_THRESHOLDS: Record<LifecycleAutomationSource, number> = {
    acquisition_pipeline: 0.65,
    deploy_processor: 0.7,
    growth_campaign_launch: 0.7,
    finance_ledger: 0.7,
};

type LifecycleEventRow = {
    id: string;
    domainId: string;
    domain: string;
    fromState: string;
    toState: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
};

type ManualReversionAlertSample = {
    eventId: string;
    domainId: string;
    domain: string;
    fromState: string;
    toState: string;
    source: string;
    createdAt: string;
};

type OscillationAlertSample = {
    domainId: string;
    domain: string;
    fromState: string;
    toState: string;
    sourceA: string;
    sourceB: string;
    atA: string;
    atB: string;
};

export type LifecycleAutomationSloStat = {
    source: LifecycleAutomationSource;
    targetStates: DomainLifecycleState[];
    expectedTransitions: number;
    automatedTransitions: number;
    automationRate: number;
    threshold: number;
    breached: boolean;
    severity: 'warning' | 'critical' | null;
};

export type DomainLifecycleMonitorSweepSummary = {
    enabled: boolean;
    dryRun: boolean;
    windowHours: number;
    scannedEvents: number;
    manualReversions: number;
    oscillations: number;
    sloBreaches: number;
    alertsCreated: number;
    opsAlertsSent: number;
    opsAlertsFailed: number;
    generatedAt: string;
    windowStart: string;
    sourceStats: LifecycleAutomationSloStat[];
    samples: {
        manualReversions: ManualReversionAlertSample[];
        oscillations: OscillationAlertSample[];
    };
};

export type DomainLifecycleMonitorSweepInput = {
    force?: boolean;
    notify?: boolean;
    dryRun?: boolean;
    windowHours?: number;
    maxEvents?: number;
    maxAlertsPerSweep?: number;
    oscillationWindowHours?: number;
    sloMinSamples?: number;
    sourceThresholds?: Partial<Record<LifecycleAutomationSource, number>>;
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
    if (raw === undefined) return fallback;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
        return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
        return false;
    }
    return fallback;
}

function parseIntBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(raw || '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function parseFloatBounded(raw: string | undefined, fallback: number, min: number, max: number): number {
    const parsed = Number.parseFloat(raw || '');
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(parsed, max));
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return { ...value };
}

function normalizeSource(metadata: Record<string, unknown> | null): string {
    const raw = typeof metadata?.source === 'string' ? metadata.source : '';
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return 'manual';
    return normalized;
}

function resolveProgressIndex(state: string): number | null {
    if (!isDomainLifecycleState(state)) return null;
    const index = CORE_PROGRESS_INDEX.get(state);
    return typeof index === 'number' ? index : null;
}

function isAutomationSource(source: string): source is LifecycleAutomationSource {
    return AUTOMATION_SOURCE_SET.has(source);
}

function severityForSloBreach(rate: number, threshold: number): 'warning' | 'critical' {
    if (threshold <= 0) return 'warning';
    if (rate < threshold * 0.5) return 'critical';
    return 'warning';
}

function resolveSourceThresholds(input?: Partial<Record<LifecycleAutomationSource, number>>): Record<LifecycleAutomationSource, number> {
    const resolved: Record<LifecycleAutomationSource, number> = { ...DEFAULT_SOURCE_THRESHOLDS };
    for (const source of LIFECYCLE_AUTOMATION_SOURCES) {
        const fromInput = input?.[source];
        if (typeof fromInput === 'number' && Number.isFinite(fromInput)) {
            resolved[source] = Math.max(0, Math.min(fromInput, 1));
            continue;
        }
        resolved[source] = parseFloatBounded(
            process.env[SOURCE_THRESHOLD_ENV[source]],
            DEFAULT_SOURCE_THRESHOLDS[source],
            0,
            1,
        );
    }
    return resolved;
}

function dedupeManualReversionSamples(samples: ManualReversionAlertSample[]): ManualReversionAlertSample[] {
    const seen = new Set<string>();
    const deduped: ManualReversionAlertSample[] = [];
    for (const sample of samples) {
        const key = `${sample.domainId}:${sample.fromState}:${sample.toState}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(sample);
    }
    return deduped;
}

function detectOscillationSamples(
    events: LifecycleEventRow[],
    oscillationWindowHours: number,
): OscillationAlertSample[] {
    const byDomain = new Map<string, LifecycleEventRow[]>();
    for (const row of events) {
        if (!byDomain.has(row.domainId)) {
            byDomain.set(row.domainId, []);
        }
        byDomain.get(row.domainId)?.push(row);
    }

    const oscillationWindowMs = oscillationWindowHours * 60 * 60 * 1000;
    const samples: OscillationAlertSample[] = [];

    for (const rows of byDomain.values()) {
        rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        for (let idx = 1; idx < rows.length; idx += 1) {
            const previous = rows[idx - 1];
            const current = rows[idx];
            if (previous.fromState === previous.toState) continue;
            if (previous.fromState !== current.toState || previous.toState !== current.fromState) {
                continue;
            }

            const deltaMs = current.createdAt.getTime() - previous.createdAt.getTime();
            if (!Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > oscillationWindowMs) {
                continue;
            }

            const previousSource = normalizeSource(previous.metadata);
            const currentSource = normalizeSource(current.metadata);
            samples.push({
                domainId: current.domainId,
                domain: current.domain,
                fromState: current.fromState,
                toState: current.toState,
                sourceA: previousSource,
                sourceB: currentSource,
                atA: previous.createdAt.toISOString(),
                atB: current.createdAt.toISOString(),
            });
        }
    }

    return samples;
}

function formatSource(source: string): string {
    return source.replaceAll('_', ' ');
}

export async function runDomainLifecycleMonitorSweep(input: DomainLifecycleMonitorSweepInput = {}): Promise<DomainLifecycleMonitorSweepSummary> {
    const enabled = parseBool(process.env.DOMAIN_LIFECYCLE_MONITOR_SWEEP_ENABLED, true);
    const dryRun = Boolean(input.dryRun);
    const notify = input.notify ?? true;
    const force = Boolean(input.force);
    const windowHours = input.windowHours
        ?? parseIntBounded(process.env.DOMAIN_LIFECYCLE_MONITOR_WINDOW_HOURS, 24 * 7, 1, 24 * 180);
    const maxEvents = input.maxEvents
        ?? parseIntBounded(process.env.DOMAIN_LIFECYCLE_MONITOR_MAX_EVENTS, 10_000, 1, 50_000);
    const maxAlertsPerSweep = input.maxAlertsPerSweep
        ?? parseIntBounded(process.env.DOMAIN_LIFECYCLE_MONITOR_MAX_ALERTS, 50, 1, 1000);
    const oscillationWindowHours = input.oscillationWindowHours
        ?? parseIntBounded(process.env.DOMAIN_LIFECYCLE_MONITOR_OSCILLATION_WINDOW_HOURS, 48, 1, 24 * 30);
    const sloMinSamples = input.sloMinSamples
        ?? parseIntBounded(process.env.DOMAIN_LIFECYCLE_SLO_MIN_SAMPLES, 5, 1, 1000);

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
    const sourceThresholds = resolveSourceThresholds(input.sourceThresholds);

    if (!enabled && !force) {
        return {
            enabled: false,
            dryRun,
            windowHours,
            scannedEvents: 0,
            manualReversions: 0,
            oscillations: 0,
            sloBreaches: 0,
            alertsCreated: 0,
            opsAlertsSent: 0,
            opsAlertsFailed: 0,
            generatedAt: now.toISOString(),
            windowStart: windowStart.toISOString(),
            sourceStats: LIFECYCLE_AUTOMATION_SOURCES.map((source) => ({
                source,
                targetStates: SOURCE_TARGET_STATES[source],
                expectedTransitions: 0,
                automatedTransitions: 0,
                automationRate: 1,
                threshold: sourceThresholds[source],
                breached: false,
                severity: null,
            })),
            samples: {
                manualReversions: [],
                oscillations: [],
            },
        };
    }

    const eventRows = await db.select({
        id: domainLifecycleEvents.id,
        domainId: domainLifecycleEvents.domainId,
        domain: domains.domain,
        fromState: domainLifecycleEvents.fromState,
        toState: domainLifecycleEvents.toState,
        metadata: domainLifecycleEvents.metadata,
        createdAt: domainLifecycleEvents.createdAt,
    })
        .from(domainLifecycleEvents)
        .innerJoin(domains, eq(domainLifecycleEvents.domainId, domains.id))
        .where(and(
            gte(domainLifecycleEvents.createdAt, windowStart),
            notDeleted(domains),
        ))
        .orderBy(desc(domainLifecycleEvents.createdAt))
        .limit(maxEvents);

    const events: LifecycleEventRow[] = eventRows.map((row) => ({
        id: row.id,
        domainId: row.domainId,
        domain: row.domain,
        fromState: row.fromState,
        toState: row.toState,
        metadata: asRecord(row.metadata),
        createdAt: row.createdAt,
    }));

    const manualReversionSamples = dedupeManualReversionSamples(events.flatMap((event) => {
        const source = normalizeSource(event.metadata);
        if (isAutomationSource(source)) return [];

        const fromIndex = resolveProgressIndex(event.fromState);
        const toIndex = resolveProgressIndex(event.toState);
        if (fromIndex === null || toIndex === null || toIndex >= fromIndex) {
            return [];
        }

        return [{
            eventId: event.id,
            domainId: event.domainId,
            domain: event.domain,
            fromState: event.fromState,
            toState: event.toState,
            source,
            createdAt: event.createdAt.toISOString(),
        } satisfies ManualReversionAlertSample];
    }));

    const oscillationSamples = detectOscillationSamples(events, oscillationWindowHours);

    const sourceStats: LifecycleAutomationSloStat[] = LIFECYCLE_AUTOMATION_SOURCES.map((source) => {
        const targetStates = SOURCE_TARGET_STATES[source];
        const expectedTransitions = events.filter((event) => targetStates.includes(event.toState as DomainLifecycleState)).length;
        const automatedTransitions = events.filter((event) =>
            targetStates.includes(event.toState as DomainLifecycleState)
            && normalizeSource(event.metadata) === source,
        ).length;
        const automationRate = expectedTransitions > 0 ? automatedTransitions / expectedTransitions : 1;
        const threshold = sourceThresholds[source];
        const breached = expectedTransitions >= sloMinSamples && automationRate < threshold;
        const severity = breached ? severityForSloBreach(automationRate, threshold) : null;
        return {
            source,
            targetStates,
            expectedTransitions,
            automatedTransitions,
            automationRate,
            threshold,
            breached,
            severity,
        };
    });

    const breachStats = sourceStats.filter((stat) => stat.breached);

    let alertsCreated = 0;
    let opsAlertsSent = 0;
    let opsAlertsFailed = 0;

    async function emitAlert(inputAlert: {
        anomalyType: LifecycleAnomalyType;
        title: string;
        message: string;
        severity: 'warning' | 'critical';
        domainId?: string;
        metadata: Record<string, unknown>;
        opsDetails?: Record<string, unknown>;
    }): Promise<void> {
        if (!notify || dryRun || alertsCreated >= maxAlertsPerSweep) {
            return;
        }

        const playbook = getLifecyclePlaybookBinding(inputAlert.anomalyType, inputAlert.severity);

        await createNotification({
            type: 'info',
            severity: inputAlert.severity,
            domainId: inputAlert.domainId,
            title: inputAlert.title,
            message: inputAlert.message,
            actionUrl: playbook.runbookUrl,
            metadata: {
                source: 'domain_lifecycle_monitor',
                anomalyType: inputAlert.anomalyType,
                playbookId: playbook.playbookId,
                playbookTitle: playbook.title,
                playbookOwnerRole: playbook.ownerRole,
                playbookResponseSlaMinutes: playbook.responseSlaMinutes,
                playbookEscalationAfterMinutes: playbook.escalationAfterMinutes,
                playbookRunbookUrl: playbook.runbookUrl,
                ...inputAlert.metadata,
            },
        });
        alertsCreated += 1;

        if (inputAlert.severity !== 'critical') return;

        const ops = await sendOpsChannelAlert({
            source: 'domain_lifecycle_monitor',
            severity: 'critical',
            title: inputAlert.title,
            message: inputAlert.message,
            details: {
                windowHours,
                generatedAt: now.toISOString(),
                anomalyType: inputAlert.anomalyType,
                playbookId: playbook.playbookId,
                playbookTitle: playbook.title,
                playbookOwnerRole: playbook.ownerRole,
                playbookResponseSlaMinutes: playbook.responseSlaMinutes,
                playbookEscalationAfterMinutes: playbook.escalationAfterMinutes,
                playbookRunbookUrl: playbook.runbookUrl,
                ...(inputAlert.opsDetails ?? {}),
            },
        });
        if (ops.delivered) {
            opsAlertsSent += 1;
        } else {
            opsAlertsFailed += 1;
        }
    }

    const manualByDomain = new Map<string, ManualReversionAlertSample[]>();
    for (const sample of manualReversionSamples) {
        if (!manualByDomain.has(sample.domainId)) {
            manualByDomain.set(sample.domainId, []);
        }
        manualByDomain.get(sample.domainId)?.push(sample);
    }
    for (const [domainId, samples] of manualByDomain.entries()) {
        const domain = samples[0]?.domain || domainId;
        const latest = samples[0];
        await emitAlert({
            anomalyType: 'manual_reversion',
            severity: 'warning',
            domainId,
            title: `Lifecycle manual reversion detected: ${domain}`,
            message: latest
                ? `Detected ${samples.length} manual reversion(s) in the last ${windowHours}h. Latest: ${latest.fromState} -> ${latest.toState}.`
                : `Detected manual lifecycle reversion(s) in the last ${windowHours}h.`,
            metadata: {
                anomalyType: 'manual_reversion',
                count: samples.length,
                samples: samples.slice(0, 5),
            },
        });
    }

    const oscillationByDomain = new Map<string, OscillationAlertSample[]>();
    for (const sample of oscillationSamples) {
        if (!oscillationByDomain.has(sample.domainId)) {
            oscillationByDomain.set(sample.domainId, []);
        }
        oscillationByDomain.get(sample.domainId)?.push(sample);
    }
    for (const [domainId, samples] of oscillationByDomain.entries()) {
        const domain = samples[0]?.domain || domainId;
        const severity: 'warning' | 'critical' = samples.length >= 2 ? 'critical' : 'warning';
        const latest = samples[0];
        await emitAlert({
            anomalyType: 'oscillation',
            severity,
            domainId,
            title: `Lifecycle oscillation detected: ${domain}`,
            message: latest
                ? `Detected ${samples.length} oscillation pair(s) in ${windowHours}h. Latest bounce: ${latest.fromState} -> ${latest.toState} after ${latest.toState} -> ${latest.fromState}.`
                : `Detected lifecycle oscillation pattern in the last ${windowHours}h.`,
            metadata: {
                anomalyType: 'oscillation',
                count: samples.length,
                samples: samples.slice(0, 5),
            },
            opsDetails: {
                anomalyType: 'oscillation',
                domain,
                samples: samples.slice(0, 3),
            },
        });
    }

    for (const stat of breachStats) {
        await emitAlert({
            anomalyType: 'automation_slo_breach',
            severity: stat.severity ?? 'warning',
            title: `Lifecycle automation SLO breach: ${formatSource(stat.source)}`,
            message: `${formatSource(stat.source)} automated ${stat.automatedTransitions}/${stat.expectedTransitions} transitions ` +
                `in the last ${windowHours}h (${(stat.automationRate * 100).toFixed(1)}%, threshold ${(stat.threshold * 100).toFixed(1)}%).`,
            metadata: {
                anomalyType: 'automation_slo_breach',
                source: stat.source,
                targetStates: stat.targetStates,
                expectedTransitions: stat.expectedTransitions,
                automatedTransitions: stat.automatedTransitions,
                automationRate: stat.automationRate,
                threshold: stat.threshold,
            },
            opsDetails: {
                anomalyType: 'automation_slo_breach',
                source: stat.source,
                automationRate: stat.automationRate,
                threshold: stat.threshold,
                expectedTransitions: stat.expectedTransitions,
                automatedTransitions: stat.automatedTransitions,
            },
        });
    }

    return {
        enabled,
        dryRun,
        windowHours,
        scannedEvents: events.length,
        manualReversions: manualReversionSamples.length,
        oscillations: oscillationSamples.length,
        sloBreaches: breachStats.length,
        alertsCreated,
        opsAlertsSent,
        opsAlertsFailed,
        generatedAt: now.toISOString(),
        windowStart: windowStart.toISOString(),
        sourceStats,
        samples: {
            manualReversions: manualReversionSamples.slice(0, 20),
            oscillations: oscillationSamples.slice(0, 20),
        },
    };
}
