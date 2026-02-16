export type NameserverMatchState = 'match' | 'partial' | 'mismatch' | 'unknown';

export type NameserverOnboardingStage =
    | 'manual_required'
    | 'zone_missing'
    | 'ready_to_switch'
    | 'switch_recorded_waiting_dns'
    | 'propagating'
    | 'verified';

export type NameserverOnboardingStatus = {
    stage: NameserverOnboardingStage;
    summary: string;
    nextAction: string;
};

export function normalizeNameserver(value: string): string {
    return value.trim().toLowerCase().replace(/\.+$/g, '');
}

export function uniqueNameservers(values: string[]): string[] {
    return [...new Set(
        values
            .map((value) => normalizeNameserver(value))
            .filter((value) => value.length > 0),
    )];
}

export function classifyNameserverMatch(
    liveNameservers: string[],
    targetNameservers: string[],
): NameserverMatchState {
    const live = uniqueNameservers(liveNameservers);
    const target = uniqueNameservers(targetNameservers);

    if (live.length === 0 || target.length === 0) {
        return 'unknown';
    }

    const liveSet = new Set(live);
    const matches = target.filter((item) => liveSet.has(item)).length;
    if (matches === 0) return 'mismatch';
    if (matches === target.length) return 'match';
    return 'partial';
}

export function areSameNameserverSet(left: string[], right: string[]): boolean {
    const normalizedLeft = uniqueNameservers(left);
    const normalizedRight = uniqueNameservers(right);
    if (normalizedLeft.length !== normalizedRight.length) return false;
    const rightSet = new Set(normalizedRight);
    return normalizedLeft.every((item) => rightSet.has(item));
}

export function resolveNameserverOnboardingStatus(input: {
    registrarAutomated: boolean;
    cloudflareZoneAvailable: boolean;
    targetNameservers: string[];
    lastConfiguredNameservers: string[];
    liveMatch: NameserverMatchState;
    liveLookupSucceeded: boolean;
}): NameserverOnboardingStatus {
    if (!input.registrarAutomated) {
        return {
            stage: 'manual_required',
            summary: 'Registrar automation is unavailable for this domain.',
            nextAction: 'Update nameservers manually at your registrar using the Cloudflare nameservers.',
        };
    }

    if (!input.cloudflareZoneAvailable || input.targetNameservers.length < 2) {
        return {
            stage: 'zone_missing',
            summary: 'Cloudflare zone is missing, so nameserver cutover is not ready.',
            nextAction: 'Create the Cloudflare zone first.',
        };
    }

    if (input.liveMatch === 'match') {
        return {
            stage: 'verified',
            summary: 'Live DNS nameservers match Cloudflare.',
            nextAction: 'Proceed with deploy/custom-domain operations.',
        };
    }

    const switchRecorded = areSameNameserverSet(
        input.lastConfiguredNameservers,
        input.targetNameservers,
    );

    if (switchRecorded && !input.liveLookupSucceeded) {
        return {
            stage: 'switch_recorded_waiting_dns',
            summary: 'Registrar switch was recorded; waiting to verify live DNS.',
            nextAction: 'Refresh DNS status in a few minutes.',
        };
    }

    if (switchRecorded) {
        return {
            stage: 'propagating',
            summary: 'Registrar switch recorded, but DNS propagation is still in progress.',
            nextAction: 'Wait for propagation, then refresh status.',
        };
    }

    return {
        stage: 'ready_to_switch',
        summary: 'Cloudflare zone is ready and registrar cutover can be executed.',
        nextAction: 'Run nameserver cutover now.',
    };
}
