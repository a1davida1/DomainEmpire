export type ClickIntegrityInput = {
    fullUrl: string;
    userAgent?: string | null;
    referrer?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    ipHash?: string | null;
    visitorId?: string | null;
    recentIpClicks: number;
    recentVisitorClicks: number;
    recentCampaignClicks: number;
};

export type ClickIntegrityResult = {
    riskScore: number;
    signals: string[];
    severity: 'info' | 'warning' | 'critical';
};

const BOT_UA_PATTERNS = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /headless/i,
    /phantom/i,
    /selenium/i,
    /playwright/i,
    /puppeteer/i,
    /python-requests/i,
    /curl\//i,
    /wget\//i,
];

const SUSPICIOUS_REFERRER_PATTERNS = [
    /traffic-bot/i,
    /clickfarm/i,
    /fake-traffic/i,
];

function clampScore(value: number): number {
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

function hasBotUserAgent(userAgent: string | null | undefined): boolean {
    if (!userAgent) return false;
    return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function hasSuspiciousReferrer(referrer: string | null | undefined): boolean {
    if (!referrer) return false;
    return SUSPICIOUS_REFERRER_PATTERNS.some((pattern) => pattern.test(referrer));
}

export function evaluateClickIntegrity(input: ClickIntegrityInput): ClickIntegrityResult {
    let riskScore = 0;
    const signals: string[] = [];

    if (hasBotUserAgent(input.userAgent)) {
        riskScore += 45;
        signals.push('bot_user_agent');
    }

    if (hasSuspiciousReferrer(input.referrer)) {
        riskScore += 35;
        signals.push('suspicious_referrer');
    }

    if (!input.ipHash && !input.visitorId) {
        riskScore += 15;
        signals.push('missing_click_identity');
    }

    if (!input.utmSource || !input.utmMedium) {
        riskScore += 8;
        signals.push('missing_utm_attribution');
    }

    if (input.recentIpClicks >= 20) {
        riskScore += 35;
        signals.push('ip_velocity_critical');
    } else if (input.recentIpClicks >= 10) {
        riskScore += 20;
        signals.push('ip_velocity_high');
    } else if (input.recentIpClicks >= 5) {
        riskScore += 10;
        signals.push('ip_velocity_medium');
    }

    if (input.recentVisitorClicks >= 15) {
        riskScore += 25;
        signals.push('visitor_velocity_high');
    } else if (input.recentVisitorClicks >= 8) {
        riskScore += 12;
        signals.push('visitor_velocity_medium');
    }

    if (input.recentCampaignClicks >= 300) {
        riskScore += 18;
        signals.push('campaign_spike_high');
    } else if (input.recentCampaignClicks >= 150) {
        riskScore += 8;
        signals.push('campaign_spike_medium');
    }

    riskScore = clampScore(riskScore);

    const severity: ClickIntegrityResult['severity'] = riskScore >= 90
        ? 'critical'
        : riskScore >= 70
            ? 'warning'
            : 'info';

    return {
        riskScore,
        signals,
        severity,
    };
}
