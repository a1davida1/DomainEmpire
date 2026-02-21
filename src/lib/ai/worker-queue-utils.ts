export type QueueSloAlert = {
    code: 'pending_age' | 'error_rate' | 'worker_idle' | 'pending_backlog';
    severity: 'warning' | 'critical';
    message: string;
    value: number;
    threshold: number;
};

export type QueueSloThresholds = {
    pendingAgeMs: number;
    errorRatePct: number;
    workerIdleMs: number;
    pendingBacklog: number;
};

export function parseJobTypeConcurrencyMap(raw: string | undefined): Record<string, number> {
    if (!raw) return {};

    const entries = raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

    const parsed: Record<string, number> = {};
    for (const entry of entries) {
        const [jobTypeRaw, limitRaw] = entry.split(':').map((part) => part.trim());
        if (!jobTypeRaw || !limitRaw) continue;
        if (!/^[a-z0-9_]+$/i.test(jobTypeRaw)) continue;
        const limit = Number.parseInt(limitRaw, 10);
        if (!Number.isFinite(limit) || limit <= 0) continue;
        parsed[jobTypeRaw] = Math.max(1, Math.min(limit, 32));
    }

    return parsed;
}

export function normalizeWorkerConcurrency(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return Math.max(1, Math.min(Math.floor(fallback), 32));
    }
    return Math.max(1, Math.min(Math.floor(value), 32));
}

export function normalizePerJobTypeConcurrency(
    overrides: Record<string, number> | undefined,
    defaults: Record<string, number>,
): Record<string, number> {
    const merged: Record<string, number> = { ...defaults };
    if (overrides) {
        for (const [jobType, rawLimit] of Object.entries(overrides)) {
            if (!/^[a-z0-9_]+$/i.test(jobType)) continue;
            const limit = Number.parseInt(String(rawLimit), 10);
            if (!Number.isFinite(limit) || limit <= 0) continue;
            merged[jobType] = Math.max(1, Math.min(limit, 32));
        }
    }
    return merged;
}

export function buildQueueSloAlerts(input: {
    oldestPendingAgeMs: number | null;
    errorRate24h: number;
    pending: number;
    latestWorkerActivityAgeMs: number | null;
    thresholds: QueueSloThresholds;
}): QueueSloAlert[] {
    const oldestPendingAgeMs = typeof input.oldestPendingAgeMs === 'number' && Number.isFinite(input.oldestPendingAgeMs)
        ? Math.max(0, input.oldestPendingAgeMs)
        : null;
    const errorRate24h = Number.isFinite(input.errorRate24h)
        ? Math.max(0, input.errorRate24h)
        : 0;
    const pending = Number.isFinite(input.pending)
        ? Math.max(0, Math.floor(input.pending))
        : 0;
    const latestWorkerActivityAgeMs = typeof input.latestWorkerActivityAgeMs === 'number' && Number.isFinite(input.latestWorkerActivityAgeMs)
        ? Math.max(0, input.latestWorkerActivityAgeMs)
        : null;

    const { thresholds } = input;
    const alerts: QueueSloAlert[] = [];

    if (oldestPendingAgeMs !== null && oldestPendingAgeMs > thresholds.pendingAgeMs) {
        alerts.push({
            code: 'pending_age',
            severity: oldestPendingAgeMs > thresholds.pendingAgeMs * 2 ? 'critical' : 'warning',
            message: 'Oldest pending job age exceeded SLO threshold',
            value: oldestPendingAgeMs,
            threshold: thresholds.pendingAgeMs,
        });
    }

    if (errorRate24h > thresholds.errorRatePct) {
        alerts.push({
            code: 'error_rate',
            severity: errorRate24h > thresholds.errorRatePct * 2 ? 'critical' : 'warning',
            message: '24h queue error rate exceeded SLO threshold',
            value: errorRate24h,
            threshold: thresholds.errorRatePct,
        });
    }

    if (pending > thresholds.pendingBacklog) {
        alerts.push({
            code: 'pending_backlog',
            severity: pending > thresholds.pendingBacklog * 2 ? 'critical' : 'warning',
            message: 'Pending queue backlog exceeded SLO threshold',
            value: pending,
            threshold: thresholds.pendingBacklog,
        });
    }

    if (pending > 0 && latestWorkerActivityAgeMs !== null && latestWorkerActivityAgeMs > thresholds.workerIdleMs) {
        alerts.push({
            code: 'worker_idle',
            severity: 'critical',
            message: 'Worker idle while queue has pending jobs',
            value: latestWorkerActivityAgeMs,
            threshold: thresholds.workerIdleMs,
        });
    }

    return alerts;
}
