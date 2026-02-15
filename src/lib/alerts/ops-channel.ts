export type OpsAlertSeverity = 'info' | 'warning' | 'critical';

export interface OpsChannelAlertInput {
    source: string;
    severity: OpsAlertSeverity;
    title: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface OpsChannelAlertResult {
    delivered: boolean;
    reason: string | null;
    statusCode?: number;
}

const lastSentAtByKey = new Map<string, number>();

function getWebhookUrl(source: string): string | null {
    if (source === 'growth_media_review_assignment') {
        const growthWebhook = process.env.GROWTH_FAIRNESS_OPS_WEBHOOK_URL;
        if (growthWebhook && growthWebhook.trim().length > 0) {
            return growthWebhook.trim();
        }
    }

    const genericWebhook = process.env.OPS_ALERT_WEBHOOK_URL;
    if (genericWebhook && genericWebhook.trim().length > 0) {
        return genericWebhook.trim();
    }

    return null;
}

export function shouldForwardFairnessWarningsToOps(): boolean {
    const raw = (process.env.GROWTH_FAIRNESS_OPS_FORWARD_WARNINGS || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}

function parseMinIntervalMs(): number {
    const raw = Number.parseInt(process.env.OPS_ALERT_MIN_INTERVAL_SECONDS || '', 10);
    if (!Number.isFinite(raw)) {
        return 5 * 60 * 1000;
    }
    return Math.max(0, Math.min(raw, 24 * 60 * 60)) * 1000;
}

function buildDedupKey(input: OpsChannelAlertInput): string {
    return `${input.source}|${input.severity}|${input.title}`.toLowerCase();
}

function isRateLimited(input: OpsChannelAlertInput, nowMs: number): boolean {
    const minIntervalMs = parseMinIntervalMs();
    if (minIntervalMs <= 0) {
        return false;
    }
    const key = buildDedupKey(input);
    const lastSentAtMs = lastSentAtByKey.get(key);
    if (lastSentAtMs && nowMs - lastSentAtMs < minIntervalMs) {
        return true;
    }
    return false;
}

function markSent(input: OpsChannelAlertInput, nowMs: number): void {
    const key = buildDedupKey(input);
    lastSentAtByKey.set(key, nowMs);

    const pruneBefore = nowMs - 24 * 60 * 60 * 1000;
    for (const [mapKey, timestampMs] of lastSentAtByKey.entries()) {
        if (timestampMs < pruneBefore) {
            lastSentAtByKey.delete(mapKey);
        }
    }
}

export function resetOpsChannelAlertDedupCache(): void {
    lastSentAtByKey.clear();
}

export async function sendOpsChannelAlert(input: OpsChannelAlertInput): Promise<OpsChannelAlertResult> {
    const webhookUrl = getWebhookUrl(input.source);
    if (!webhookUrl) {
        return {
            delivered: false,
            reason: 'webhook_not_configured',
        };
    }

    const nowMs = Date.now();
    if (isRateLimited(input, nowMs)) {
        return {
            delivered: false,
            reason: 'rate_limited',
        };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source: input.source,
                severity: input.severity,
                title: input.title,
                message: input.message,
                details: input.details || {},
                sentAt: new Date(nowMs).toISOString(),
            }),
            signal: controller.signal,
            cache: 'no-store',
        });

        if (!response.ok) {
            return {
                delivered: false,
                reason: `http_${response.status}`,
                statusCode: response.status,
            };
        }

        markSent(input, nowMs);

        return {
            delivered: true,
            reason: null,
            statusCode: response.status,
        };
    } catch (error) {
        const reason = error instanceof Error ? error.name || error.message : 'request_failed';
        return {
            delivered: false,
            reason,
        };
    } finally {
        clearTimeout(timeout);
    }
}
