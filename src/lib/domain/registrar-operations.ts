const DAY_MS = 24 * 60 * 60 * 1000;

export const REGISTRAR_OWNERSHIP_STATUSES = [
    'unknown',
    'unverified',
    'verified',
    'pending_transfer',
    'transferred',
] as const;

export const REGISTRAR_TRANSFER_STATUSES = [
    'none',
    'initiated',
    'pending',
    'completed',
    'failed',
] as const;

export const REGISTRAR_LOCK_STATUSES = [
    'unknown',
    'locked',
    'unlocked',
] as const;

export const REGISTRAR_DNSSEC_STATUSES = [
    'unknown',
    'enabled',
    'disabled',
] as const;

export const REGISTRAR_EXPIRATION_RISKS = [
    'unknown',
    'none',
    'low',
    'medium',
    'high',
    'critical',
    'expired',
] as const;

export type RegistrarOwnershipStatus = typeof REGISTRAR_OWNERSHIP_STATUSES[number];
export type RegistrarTransferStatus = typeof REGISTRAR_TRANSFER_STATUSES[number];
export type RegistrarLockStatus = typeof REGISTRAR_LOCK_STATUSES[number];
export type RegistrarDnssecStatus = typeof REGISTRAR_DNSSEC_STATUSES[number];
export type RegistrarExpirationRisk = typeof REGISTRAR_EXPIRATION_RISKS[number];

export type RenewalWindow =
    | 'unknown'
    | 'expired'
    | 'within_7_days'
    | 'within_30_days'
    | 'within_60_days'
    | 'within_90_days'
    | 'beyond_90_days';

export type RenewalRoiBand =
    | 'renew'
    | 'monitor'
    | 'review'
    | 'drop_candidate'
    | 'insufficient_data';

export function isRegistrarOwnershipStatus(
    value: string | null | undefined,
): value is RegistrarOwnershipStatus {
    return Boolean(value) && REGISTRAR_OWNERSHIP_STATUSES.includes(value as RegistrarOwnershipStatus);
}

export function isRegistrarTransferStatus(
    value: string | null | undefined,
): value is RegistrarTransferStatus {
    return Boolean(value) && REGISTRAR_TRANSFER_STATUSES.includes(value as RegistrarTransferStatus);
}

export function isRegistrarLockStatus(
    value: string | null | undefined,
): value is RegistrarLockStatus {
    return Boolean(value) && REGISTRAR_LOCK_STATUSES.includes(value as RegistrarLockStatus);
}

export function isRegistrarDnssecStatus(
    value: string | null | undefined,
): value is RegistrarDnssecStatus {
    return Boolean(value) && REGISTRAR_DNSSEC_STATUSES.includes(value as RegistrarDnssecStatus);
}

export function isRegistrarExpirationRisk(
    value: string | null | undefined,
): value is RegistrarExpirationRisk {
    return Boolean(value) && REGISTRAR_EXPIRATION_RISKS.includes(value as RegistrarExpirationRisk);
}

function riskFromScore(score: number, daysUntilRenewal: number | null): RegistrarExpirationRisk {
    if (daysUntilRenewal !== null && daysUntilRenewal <= 0) {
        return 'expired';
    }
    if (score >= 85) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 30) return 'low';
    return 'none';
}

function clampScore(value: number): number {
    if (value < 0) return 0;
    if (value > 100) return 100;
    return value;
}

function resolveRenewalWindow(daysUntilRenewal: number | null): RenewalWindow {
    if (daysUntilRenewal === null) return 'unknown';
    if (daysUntilRenewal <= 0) return 'expired';
    if (daysUntilRenewal <= 7) return 'within_7_days';
    if (daysUntilRenewal <= 30) return 'within_30_days';
    if (daysUntilRenewal <= 60) return 'within_60_days';
    if (daysUntilRenewal <= 90) return 'within_90_days';
    return 'beyond_90_days';
}

function riskRecommendation(risk: RegistrarExpirationRisk, daysUntilRenewal: number | null): string {
    switch (risk) {
        case 'expired':
            return 'Renew immediately and confirm DNS/hosting continuity.';
        case 'critical':
            return `Renew within ${Math.max(1, daysUntilRenewal ?? 1)} day(s), verify lock + DNSSEC + auto-renew.`;
        case 'high':
            return 'Finalize renewal this month and clear transfer blockers.';
        case 'medium':
            return 'Schedule renewal this cycle and confirm payment method readiness.';
        case 'low':
            return 'Monitor renewal window and keep registrar profile current.';
        case 'none':
            return 'No immediate renewal action required.';
        case 'unknown':
        default:
            return 'Set renewal date to compute risk and alert windows accurately.';
    }
}

function toDateOrNull(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

export function computeRegistrarExpirationRisk(input: {
    renewalDate: Date | string | null | undefined;
    autoRenewEnabled: boolean | null | undefined;
    transferStatus: string | null | undefined;
    now?: Date;
}) {
    const now = input.now ?? new Date();
    const renewalDate = toDateOrNull(input.renewalDate);
    const transferStatus = isRegistrarTransferStatus(input.transferStatus)
        ? input.transferStatus
        : 'none';
    const autoRenewEnabled = input.autoRenewEnabled !== false;

    if (!renewalDate) {
        return {
            risk: 'unknown' as RegistrarExpirationRisk,
            riskScore: 35,
            daysUntilRenewal: null,
            renewalWindow: 'unknown' as RenewalWindow,
            recommendation: riskRecommendation('unknown', null),
        };
    }

    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - now.getTime()) / DAY_MS);
    let score = 0;

    if (daysUntilRenewal <= 0) {
        score = 100;
    } else if (daysUntilRenewal <= 7) {
        score = 90;
    } else if (daysUntilRenewal <= 30) {
        score = 75;
    } else if (daysUntilRenewal <= 60) {
        score = 55;
    } else if (daysUntilRenewal <= 90) {
        score = 35;
    } else {
        score = 10;
    }

    if (!autoRenewEnabled) {
        score += 10;
    }

    if (transferStatus === 'initiated' || transferStatus === 'pending') {
        score += 8;
    } else if (transferStatus === 'failed') {
        score += 5;
    }

    const riskScore = clampScore(score);
    const risk = riskFromScore(riskScore, daysUntilRenewal);
    const renewalWindow = resolveRenewalWindow(daysUntilRenewal);

    return {
        risk,
        riskScore,
        daysUntilRenewal,
        renewalWindow,
        recommendation: riskRecommendation(risk, daysUntilRenewal),
    };
}

export function computeRenewalRoiRecommendation(input: {
    renewalPrice: number | null | undefined;
    trailingRevenue90d: number | null | undefined;
    trailingCost90d?: number | null | undefined;
    risk: RegistrarExpirationRisk;
    daysUntilRenewal: number | null;
}) {
    const renewalPrice = typeof input.renewalPrice === 'number' && Number.isFinite(input.renewalPrice)
        ? Math.max(0, input.renewalPrice)
        : null;
    const trailingRevenue90d = typeof input.trailingRevenue90d === 'number' && Number.isFinite(input.trailingRevenue90d)
        ? Math.max(0, input.trailingRevenue90d)
        : 0;
    const trailingCost90d = typeof input.trailingCost90d === 'number' && Number.isFinite(input.trailingCost90d)
        ? Math.max(0, input.trailingCost90d)
        : 0;
    const trailingNet90d = trailingRevenue90d - trailingCost90d;

    if (!renewalPrice || renewalPrice <= 0) {
        return {
            band: 'insufficient_data' as RenewalRoiBand,
            renewalPrice,
            trailingRevenue90d,
            trailingCost90d,
            trailingNet90d,
            coverageRatio: null,
            paybackDays: null,
            recommendation: 'Set an accurate renewal price to compute renewal ROI guidance.',
        };
    }

    const coverageRatio = trailingRevenue90d / renewalPrice;
    const paybackDays = trailingRevenue90d > 0
        ? Number((renewalPrice / (trailingRevenue90d / 90)).toFixed(1))
        : null;

    let band: RenewalRoiBand = 'drop_candidate';
    if (coverageRatio >= 2 || trailingNet90d >= renewalPrice) {
        band = 'renew';
    } else if (coverageRatio >= 1 || (paybackDays !== null && paybackDays <= 120)) {
        band = 'monitor';
    } else if (coverageRatio >= 0.4 || trailingNet90d > 0) {
        band = 'review';
    }

    if (input.risk === 'expired' || input.risk === 'critical') {
        if (band === 'monitor' || band === 'renew') {
            band = 'review';
        }
    }

    const daysText = input.daysUntilRenewal === null
        ? 'unknown renewal window'
        : `${Math.max(0, input.daysUntilRenewal)} day(s) until renewal`;
    const recommendation = (() => {
        if (band === 'renew') {
            return `Renew now; trailing 90d revenue covers ${coverageRatio.toFixed(2)}x renewal cost (${daysText}).`;
        }
        if (band === 'monitor') {
            return `Renewal is likely viable, but monitor conversion/revenue trend before payment (${daysText}).`;
        }
        if (band === 'review') {
            return `Manual review required before renewal; economics are borderline and timing is sensitive (${daysText}).`;
        }
        return `Consider hold/drop unless strategic value justifies renewal; trailing revenue covers only ${coverageRatio.toFixed(2)}x cost (${daysText}).`;
    })();

    return {
        band,
        renewalPrice,
        trailingRevenue90d: Number(trailingRevenue90d.toFixed(2)),
        trailingCost90d: Number(trailingCost90d.toFixed(2)),
        trailingNet90d: Number(trailingNet90d.toFixed(2)),
        coverageRatio: Number(coverageRatio.toFixed(4)),
        paybackDays,
        recommendation,
    };
}
