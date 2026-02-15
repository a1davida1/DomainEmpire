export type DomainRoiAction = 'scale' | 'optimize' | 'recover' | 'incubate' | 'hold';

export type DomainRoiScoreInput = {
    lifecycleState: string | null | undefined;
    revenue30d: number;
    cost30d: number;
    pageviews30d: number;
    clicks30d: number;
};

export type DomainRoiScoreResult = {
    score: number;
    action: DomainRoiAction;
    reasons: string[];
    net30d: number;
    roiPct: number | null;
    ctrPct: number | null;
};

function clamp(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

function normalizeLifecycleState(value: string | null | undefined): string {
    return (value || 'sourced').toLowerCase();
}

export function scoreDomainRoiPriority(input: DomainRoiScoreInput): DomainRoiScoreResult {
    const reasons: string[] = [];
    const lifecycleState = normalizeLifecycleState(input.lifecycleState);
    const revenue30d = Math.max(0, input.revenue30d || 0);
    const cost30d = Math.max(0, input.cost30d || 0);
    const pageviews30d = Math.max(0, Math.floor(input.pageviews30d || 0));
    const clicks30d = Math.max(0, Math.floor(input.clicks30d || 0));
    const net30d = revenue30d - cost30d;
    const roiPct = cost30d > 0 ? (net30d / cost30d) * 100 : null;
    const ctrPct = pageviews30d > 0 ? (clicks30d / pageviews30d) * 100 : null;

    let score = 50;

    if (net30d > 0) {
        score += 15;
        reasons.push('Positive net in last 30 days');
    } else if (net30d < 0) {
        score -= 15;
        reasons.push('Negative net in last 30 days');
    }

    if (roiPct !== null) {
        if (roiPct >= 80) {
            score += 15;
            reasons.push('Strong ROI');
        } else if (roiPct >= 20) {
            score += 10;
            reasons.push('Positive ROI');
        } else if (roiPct < 0) {
            score -= 15;
            reasons.push('Negative ROI');
        }
    }

    if (pageviews30d >= 5000) {
        score += 10;
        reasons.push('Strong traffic volume');
    } else if (pageviews30d < 200) {
        score -= 5;
        reasons.push('Low traffic volume');
    }

    if (ctrPct !== null) {
        if (ctrPct >= 3) {
            score += 8;
            reasons.push('Healthy CTR');
        } else if (ctrPct < 0.5) {
            score -= 6;
            reasons.push('Weak CTR');
        }
    }

    if (lifecycleState === 'monetized') {
        score += 10;
    } else if (lifecycleState === 'growth') {
        score += 8;
    } else if (lifecycleState === 'build') {
        score += 5;
    } else if (lifecycleState === 'hold') {
        score -= 8;
    } else if (lifecycleState === 'sell' || lifecycleState === 'sunset') {
        score -= 20;
    }

    if (revenue30d === 0 && (lifecycleState === 'build' || lifecycleState === 'growth')) {
        score += 6;
        reasons.push('Active lifecycle with unrealized monetization');
    }

    score = clamp(Math.round(score), 0, 100);

    let action: DomainRoiAction = 'hold';
    if (score >= 75 && net30d > 0) {
        action = 'scale';
    } else if (score >= 55) {
        action = 'optimize';
    } else if (net30d < 0 && pageviews30d > 1000) {
        action = 'recover';
    } else if (lifecycleState === 'build' || lifecycleState === 'growth') {
        action = 'incubate';
    }

    return {
        score,
        action,
        reasons,
        net30d,
        roiPct: roiPct === null ? null : Number(roiPct.toFixed(2)),
        ctrPct: ctrPct === null ? null : Number(ctrPct.toFixed(2)),
    };
}
