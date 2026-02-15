import { assessRevenueVariance, type ReconciliationStatus } from '@/lib/finance/reconciliation';

export type RevenueContractRowInput = {
    adRevenue: number;
    affiliateRevenue: number;
    leadGenRevenue: number;
    totalRevenue: number;
    clicks: number;
    impressions: number;
};

export type RevenueContractRowResult = {
    valid: boolean;
    violations: string[];
};

export type RevenueRollupContractResult = {
    status: ReconciliationStatus;
    variance: number;
    variancePct: number | null;
    toleranceAmount: number;
};

function finite(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return value;
}

function round(value: number, digits = 2): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export function evaluateRevenueSnapshotRowContract(
    input: RevenueContractRowInput,
    rowTolerance = 0.02,
): RevenueContractRowResult {
    const adRevenue = finite(input.adRevenue);
    const affiliateRevenue = finite(input.affiliateRevenue);
    const leadGenRevenue = finite(input.leadGenRevenue);
    const totalRevenue = finite(input.totalRevenue);
    const clicks = Math.trunc(finite(input.clicks));
    const impressions = Math.trunc(finite(input.impressions));

    const violations: string[] = [];
    if (adRevenue < 0 || affiliateRevenue < 0 || leadGenRevenue < 0 || totalRevenue < 0) {
        violations.push('negative_revenue_component');
    }
    if (clicks < 0 || impressions < 0) {
        violations.push('negative_traffic_metric');
    }
    if (clicks > impressions && impressions >= 0) {
        violations.push('clicks_exceed_impressions');
    }

    const componentSum = adRevenue + affiliateRevenue + leadGenRevenue;
    if (Math.abs(componentSum - totalRevenue) > rowTolerance) {
        violations.push('revenue_components_mismatch');
    }

    return {
        valid: violations.length === 0,
        violations,
    };
}

export function evaluateRevenueRollupContract(input: {
    ledgerTotal: number;
    snapshotTotal: number;
    toleranceFloor?: number;
    tolerancePct?: number;
}): RevenueRollupContractResult {
    const assessment = assessRevenueVariance({
        ledgerTotal: finite(input.ledgerTotal),
        snapshotTotal: finite(input.snapshotTotal),
        toleranceFloor: input.toleranceFloor,
        tolerancePct: input.tolerancePct,
    });

    return {
        status: assessment.status,
        variance: round(assessment.variance),
        variancePct: assessment.variancePct === null ? null : round(assessment.variancePct),
        toleranceAmount: round(assessment.toleranceAmount),
    };
}
