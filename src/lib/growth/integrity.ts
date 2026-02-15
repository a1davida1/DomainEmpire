type GrowthChannel = 'pinterest' | 'youtube_shorts';

type IntegrityEvent = {
    eventType: string;
    occurredAt: Date | string | null;
    attributes: unknown;
};

type IntegrityThresholds = {
    blockedDestinationThreshold: number;
    highRiskPublishedThreshold: number;
    hostConcentrationThreshold: number;
    hostConcentrationMinSamples: number;
};

type IntegrityOptions = {
    highRiskScoreThreshold?: number;
};

type ChannelMetrics = {
    evaluated: number;
    published: number;
    blocked: number;
};

type TopHost = {
    host: string;
    count: number;
    share: number;
};

export type PromotionIntegritySummary = {
    evaluatedCount: number;
    publishedCount: number;
    blockedCount: number;
    blockedDestinationCount: number;
    highRiskPublishedCount: number;
    topHosts: TopHost[];
    hostConcentration: {
        topHost: string | null;
        share: number;
        sampleSize: number;
    };
    byChannel: Record<GrowthChannel, ChannelMetrics>;
    recentBlockedDestinationReasons: string[];
};

export type PromotionIntegrityAlert = {
    shouldAlert: boolean;
    severity: 'warning' | 'critical';
    reasons: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
        return {};
    }
    return value as Record<string, unknown>;
}

function readString(value: Record<string, unknown>, key: string): string | null {
    const raw = value[key];
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
    const raw = value[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
    const raw = value[key];
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function normalizeChannel(value: string | null): GrowthChannel | null {
    if (value === 'pinterest' || value === 'youtube_shorts') return value;
    return null;
}

function isDestinationBlock(reason: string): boolean {
    return reason.toLowerCase().includes('destination');
}

export function summarizePromotionIntegrity(
    events: IntegrityEvent[],
    options: IntegrityOptions = {},
): PromotionIntegritySummary {
    const highRiskScoreThreshold = options.highRiskScoreThreshold ?? 70;
    const hostCounter: Record<string, number> = {};
    const blockedDestinationReasons: Record<string, number> = {};
    let evaluatedCount = 0;
    let publishedCount = 0;
    let blockedCount = 0;
    let blockedDestinationCount = 0;
    let highRiskPublishedCount = 0;
    let hostSampleSize = 0;

    const byChannel: Record<GrowthChannel, ChannelMetrics> = {
        pinterest: { evaluated: 0, published: 0, blocked: 0 },
        youtube_shorts: { evaluated: 0, published: 0, blocked: 0 },
    };

    for (const row of events) {
        if (row.eventType !== 'published' && row.eventType !== 'publish_blocked') continue;
        evaluatedCount += 1;

        const attributes = asRecord(row.attributes);
        const channel = normalizeChannel(readString(attributes, 'channel'));
        const destinationHost = readString(attributes, 'destinationHost');
        const destinationRiskScore = readNumber(attributes, 'destinationRiskScore');
        const blockReasons = readStringArray(attributes, 'blockReasons');

        if (destinationHost) {
            hostCounter[destinationHost] = (hostCounter[destinationHost] || 0) + 1;
            hostSampleSize += 1;
        }

        if (row.eventType === 'published') {
            publishedCount += 1;
            if (destinationRiskScore !== null && destinationRiskScore >= highRiskScoreThreshold) {
                highRiskPublishedCount += 1;
            }
            if (channel) {
                byChannel[channel].evaluated += 1;
                byChannel[channel].published += 1;
            }
            continue;
        }

        blockedCount += 1;
        const destinationReasons = blockReasons.filter(isDestinationBlock);
        if (destinationReasons.length > 0) {
            blockedDestinationCount += 1;
            for (const reason of destinationReasons) {
                blockedDestinationReasons[reason] = (blockedDestinationReasons[reason] || 0) + 1;
            }
        }
        if (channel) {
            byChannel[channel].evaluated += 1;
            byChannel[channel].blocked += 1;
        }
    }

    const topHosts = Object.entries(hostCounter)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([host, count]) => ({
            host,
            count,
            share: hostSampleSize > 0 ? count / hostSampleSize : 0,
        }));

    const topHost = topHosts[0] ?? null;
    const recentBlockedDestinationReasons = Object.entries(blockedDestinationReasons)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([reason]) => reason);

    return {
        evaluatedCount,
        publishedCount,
        blockedCount,
        blockedDestinationCount,
        highRiskPublishedCount,
        topHosts,
        hostConcentration: {
            topHost: topHost?.host ?? null,
            share: topHost?.share ?? 0,
            sampleSize: hostSampleSize,
        },
        byChannel,
        recentBlockedDestinationReasons,
    };
}

export function evaluatePromotionIntegrityAlert(
    summary: PromotionIntegritySummary,
    thresholds: IntegrityThresholds,
): PromotionIntegrityAlert {
    const reasons: string[] = [];
    let severity: 'warning' | 'critical' = 'warning';

    if (summary.blockedDestinationCount >= thresholds.blockedDestinationThreshold) {
        reasons.push(
            `Destination-policy blocked publishes reached ${summary.blockedDestinationCount} in window`,
        );
    }

    if (summary.highRiskPublishedCount >= thresholds.highRiskPublishedThreshold) {
        reasons.push(
            `High-risk published destinations reached ${summary.highRiskPublishedCount} in window`,
        );
        severity = 'critical';
    }

    const concentrationTriggered = (
        summary.hostConcentration.sampleSize >= thresholds.hostConcentrationMinSamples
        && summary.hostConcentration.share >= thresholds.hostConcentrationThreshold
    );
    if (concentrationTriggered && summary.hostConcentration.topHost) {
        reasons.push(
            `Destination host concentration is high (${Math.round(summary.hostConcentration.share * 100)}% to ${summary.hostConcentration.topHost})`,
        );
    }

    return {
        shouldAlert: reasons.length > 0,
        severity,
        reasons,
    };
}
