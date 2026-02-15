export type DomainMetricsWindow = {
    pageviews: number;
    clicks: number;
    ctr: number;
    avgPosition: number | null;
    revenue: number;
};

export type DomainMetricsDelta = {
    pageviewsPct: number | null;
    clicksPct: number | null;
    ctrPct: number | null;
    avgPositionDelta: number | null;
    revenuePct: number | null;
};

export type DomainMetricsTrend = {
    score: number;
    status: 'surging' | 'improving' | 'steady' | 'declining';
    reasons: string[];
};

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function ratio(numerator: number, denominator: number): number {
    if (denominator <= 0) return 0;
    return numerator / denominator;
}

export function pctDelta(current: number, previous: number): number | null {
    if (previous === 0) {
        if (current === 0) return 0;
        return null;
    }
    return round(((current - previous) / previous) * 100, 2);
}

export function deriveDomainMetricsTrend(input: {
    current: DomainMetricsWindow;
    previous: DomainMetricsWindow;
}): DomainMetricsTrend {
    const reasons: string[] = [];

    const pageviewsDelta = pctDelta(input.current.pageviews, input.previous.pageviews);
    const clicksDelta = pctDelta(input.current.clicks, input.previous.clicks);
    const revenueDelta = pctDelta(input.current.revenue, input.previous.revenue);

    let score = 0;

    if (pageviewsDelta !== null) {
        if (pageviewsDelta >= 20) {
            score += 20;
            reasons.push('traffic_growth_strong');
        } else if (pageviewsDelta >= 5) {
            score += 10;
            reasons.push('traffic_growth_moderate');
        } else if (pageviewsDelta <= -20) {
            score -= 20;
            reasons.push('traffic_drop_strong');
        } else if (pageviewsDelta <= -5) {
            score -= 10;
            reasons.push('traffic_drop_moderate');
        }
    }

    if (clicksDelta !== null) {
        if (clicksDelta >= 20) score += 15;
        else if (clicksDelta <= -20) score -= 15;
    }

    if (revenueDelta !== null) {
        if (revenueDelta >= 15) {
            score += 20;
            reasons.push('revenue_growth');
        } else if (revenueDelta <= -15) {
            score -= 20;
            reasons.push('revenue_decline');
        }
    }

    const ctrDelta = input.current.ctr - input.previous.ctr;
    if (ctrDelta >= 0.002) {
        score += 8;
        reasons.push('ctr_up');
    } else if (ctrDelta <= -0.002) {
        score -= 8;
        reasons.push('ctr_down');
    }

    const currentPos = input.current.avgPosition;
    const prevPos = input.previous.avgPosition;
    if (currentPos !== null && prevPos !== null) {
        const posDelta = prevPos - currentPos;
        if (posDelta >= 2) {
            score += 12;
            reasons.push('rank_improved');
        } else if (posDelta <= -2) {
            score -= 12;
            reasons.push('rank_declined');
        }
    }

    let status: DomainMetricsTrend['status'] = 'steady';
    if (score >= 35) status = 'surging';
    else if (score >= 12) status = 'improving';
    else if (score <= -20) status = 'declining';

    return {
        score,
        status,
        reasons,
    };
}

export function buildDomainMetricsWindow(input: {
    pageviews: number;
    clicks: number;
    avgPositionSum: number;
    avgPositionCount: number;
    revenue: number;
}): DomainMetricsWindow {
    const pageviews = Math.max(0, Math.trunc(input.pageviews || 0));
    const clicks = Math.max(0, Math.trunc(input.clicks || 0));
    const ctr = ratio(clicks, pageviews);

    return {
        pageviews,
        clicks,
        ctr: round(ctr, 4),
        avgPosition: input.avgPositionCount > 0
            && Number.isFinite(input.avgPositionSum)
            && input.avgPositionSum >= 0
            ? round(input.avgPositionSum / input.avgPositionCount, 2)
            : null,
        revenue: round(input.revenue || 0, 2),
    };
}
