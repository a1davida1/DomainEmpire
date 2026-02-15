import { describe, expect, it } from 'vitest';
import {
    evaluatePromotionIntegrityAlert,
    summarizePromotionIntegrity,
} from '@/lib/growth/integrity';

describe('growth integrity summary', () => {
    it('summarizes destination-risk and block signals', () => {
        const summary = summarizePromotionIntegrity([
            {
                eventType: 'published',
                occurredAt: new Date().toISOString(),
                attributes: {
                    channel: 'pinterest',
                    destinationHost: 'example.com',
                    destinationRiskScore: 15,
                },
            },
            {
                eventType: 'publish_blocked',
                occurredAt: new Date().toISOString(),
                attributes: {
                    channel: 'pinterest',
                    destinationHost: 'bit.ly',
                    blockReasons: ['Destination host is a link shortener'],
                },
            },
            {
                eventType: 'published',
                occurredAt: new Date().toISOString(),
                attributes: {
                    channel: 'youtube_shorts',
                    destinationHost: 'offer.example',
                    destinationRiskScore: 85,
                },
            },
        ]);

        expect(summary.evaluatedCount).toBe(3);
        expect(summary.blockedDestinationCount).toBe(1);
        expect(summary.highRiskPublishedCount).toBe(1);
        expect(summary.topHosts.length).toBeGreaterThan(0);
        expect(summary.byChannel.pinterest.evaluated).toBe(2);
    });
});

describe('growth integrity alert evaluator', () => {
    it('triggers alert when thresholds are exceeded', () => {
        const summary = summarizePromotionIntegrity([
            {
                eventType: 'publish_blocked',
                occurredAt: new Date().toISOString(),
                attributes: {
                    destinationHost: 'bad.example',
                    blockReasons: ['Destination host is not in the allowed host list'],
                },
            },
            {
                eventType: 'publish_blocked',
                occurredAt: new Date().toISOString(),
                attributes: {
                    destinationHost: 'bad.example',
                    blockReasons: ['Destination includes redirect parameter "redirect" to a different host'],
                },
            },
            {
                eventType: 'published',
                occurredAt: new Date().toISOString(),
                attributes: {
                    destinationHost: 'bad.example',
                    destinationRiskScore: 92,
                },
            },
            {
                eventType: 'published',
                occurredAt: new Date().toISOString(),
                attributes: {
                    destinationHost: 'bad.example',
                    destinationRiskScore: 91,
                },
            },
        ]);

        const alert = evaluatePromotionIntegrityAlert(summary, {
            blockedDestinationThreshold: 2,
            highRiskPublishedThreshold: 2,
            hostConcentrationThreshold: 0.7,
            hostConcentrationMinSamples: 3,
        });

        expect(alert.shouldAlert).toBe(true);
        expect(alert.reasons.length).toBeGreaterThan(0);
        expect(alert.severity).toBe('critical');
    });
});
