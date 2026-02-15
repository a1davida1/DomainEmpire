import { describe, expect, it } from 'vitest';
import { evaluateClickIntegrity } from '@/lib/growth/click-integrity';

describe('growth click integrity', () => {
    it('scores bot-like high velocity traffic as risky', () => {
        const result = evaluateClickIntegrity({
            fullUrl: 'https://example.com?utm_source=x&utm_medium=y',
            userAgent: 'Mozilla/5.0 HeadlessChrome',
            referrer: 'https://traffic-bot.example',
            utmSource: 'x',
            utmMedium: 'y',
            ipHash: 'ip-1',
            visitorId: 'visitor-1',
            recentIpClicks: 25,
            recentVisitorClicks: 20,
            recentCampaignClicks: 400,
        });

        expect(result.riskScore).toBeGreaterThanOrEqual(90);
        expect(result.severity).toBe('critical');
        expect(result.signals).toContain('bot_user_agent');
    });

    it('keeps normal attributed traffic low risk', () => {
        const result = evaluateClickIntegrity({
            fullUrl: 'https://example.com?utm_source=google&utm_medium=cpc',
            userAgent: 'Mozilla/5.0',
            referrer: 'https://google.com',
            utmSource: 'google',
            utmMedium: 'cpc',
            ipHash: 'ip-2',
            visitorId: 'visitor-2',
            recentIpClicks: 1,
            recentVisitorClicks: 1,
            recentCampaignClicks: 20,
        });

        expect(result.riskScore).toBeLessThan(40);
        expect(result.severity).toBe('info');
    });
});
