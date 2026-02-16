import { describe, expect, it } from 'vitest';
import {
    areSameNameserverSet,
    classifyNameserverMatch,
    resolveNameserverOnboardingStatus,
} from '@/lib/domain/nameserver-status';

describe('domain nameserver status helpers', () => {
    it('matches nameserver sets regardless of case/dots/order', () => {
        expect(areSameNameserverSet(
            ['LUCY.NS.CLOUDFLARE.COM.', 'KEN.NS.CLOUDFLARE.COM'],
            ['ken.ns.cloudflare.com.', 'lucy.ns.cloudflare.com'],
        )).toBe(true);
    });

    it('classifies nameserver match state', () => {
        expect(classifyNameserverMatch(
            ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
            ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
        )).toBe('match');

        expect(classifyNameserverMatch(
            ['a.ns.cloudflare.com'],
            ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
        )).toBe('partial');

        expect(classifyNameserverMatch(
            ['ns1.domaincontrol.com', 'ns2.domaincontrol.com'],
            ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
        )).toBe('mismatch');
    });

    it('resolves onboarding stage transitions', () => {
        expect(resolveNameserverOnboardingStatus({
            registrarAutomated: false,
            cloudflareZoneAvailable: true,
            targetNameservers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
            lastConfiguredNameservers: [],
            liveMatch: 'unknown',
            liveLookupSucceeded: false,
        }).stage).toBe('manual_required');

        expect(resolveNameserverOnboardingStatus({
            registrarAutomated: true,
            cloudflareZoneAvailable: false,
            targetNameservers: [],
            lastConfiguredNameservers: [],
            liveMatch: 'unknown',
            liveLookupSucceeded: false,
        }).stage).toBe('zone_missing');

        expect(resolveNameserverOnboardingStatus({
            registrarAutomated: true,
            cloudflareZoneAvailable: true,
            targetNameservers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
            lastConfiguredNameservers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
            liveMatch: 'partial',
            liveLookupSucceeded: true,
        }).stage).toBe('propagating');

        expect(resolveNameserverOnboardingStatus({
            registrarAutomated: true,
            cloudflareZoneAvailable: true,
            targetNameservers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
            lastConfiguredNameservers: ['a.ns.cloudflare.com', 'b.ns.cloudflare.com'],
            liveMatch: 'match',
            liveLookupSucceeded: true,
        }).stage).toBe('verified');
    });
});
