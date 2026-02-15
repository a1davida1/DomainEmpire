export type ReconciliationStatus = 'matched' | 'warning' | 'critical';
export type PartnerMarginStatus = 'profitable' | 'breakeven' | 'loss';

export type RevenueVarianceAssessment = {
    ledgerTotal: number;
    snapshotTotal: number;
    variance: number;
    variancePct: number | null;
    toleranceAmount: number;
    status: ReconciliationStatus;
};

export function assessRevenueVariance(input: {
    ledgerTotal: number;
    snapshotTotal: number;
    toleranceFloor?: number;
    tolerancePct?: number;
}): RevenueVarianceAssessment {
    const ledgerTotal = Number.isFinite(input.ledgerTotal) ? input.ledgerTotal : 0;
    const snapshotTotal = Number.isFinite(input.snapshotTotal) ? input.snapshotTotal : 0;
    const toleranceFloor = input.toleranceFloor ?? 5;
    const tolerancePct = input.tolerancePct ?? 0.05;

    const variance = Number((snapshotTotal - ledgerTotal).toFixed(2));
    const toleranceAmount = Math.max(
        toleranceFloor,
        Math.abs(ledgerTotal) * tolerancePct,
    );
    const absVariance = Math.abs(variance);

    let status: ReconciliationStatus = 'matched';
    if (absVariance > toleranceAmount * 2) {
        status = 'critical';
    } else if (absVariance > toleranceAmount) {
        status = 'warning';
    }

    const variancePct = ledgerTotal === 0
        ? (snapshotTotal === 0 ? 0 : null)
        : Number(((variance / ledgerTotal) * 100).toFixed(2));

    return {
        ledgerTotal: Number(ledgerTotal.toFixed(2)),
        snapshotTotal: Number(snapshotTotal.toFixed(2)),
        variance,
        variancePct,
        toleranceAmount: Number(toleranceAmount.toFixed(2)),
        status,
    };
}

export type PartnerMarginEntry = {
    partner?: string | null;
    channel?: string | null;
    impact: 'revenue' | 'cost';
    amount: number;
};

export type PartnerMarginSummary = {
    partner: string;
    channel: string | null;
    revenue: number;
    cost: number;
    margin: number;
    marginPct: number | null;
    status: PartnerMarginStatus;
};

function normalizePartner(partner?: string | null): string {
    if (!partner) return 'unknown';
    const normalized = partner.trim().toLowerCase();
    return normalized.length > 0 ? normalized : 'unknown';
}

function normalizeChannel(channel?: string | null): string | null {
    if (!channel) return null;
    const normalized = channel.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

function partnerMarginStatus(margin: number): PartnerMarginStatus {
    if (margin > 0.01) return 'profitable';
    if (margin < -0.01) return 'loss';
    return 'breakeven';
}

export function summarizePartnerMargins(
    entries: PartnerMarginEntry[],
): PartnerMarginSummary[] {
    const aggregates = new Map<string, PartnerMarginSummary>();

    for (const entry of entries) {
        const amount = Number.isFinite(entry.amount) ? entry.amount : 0;
        const partner = normalizePartner(entry.partner);
        const channel = normalizeChannel(entry.channel);
        const key = `${partner}|${channel ?? ''}`;

        if (!aggregates.has(key)) {
            aggregates.set(key, {
                partner,
                channel,
                revenue: 0,
                cost: 0,
                margin: 0,
                marginPct: null,
                status: 'breakeven',
            });
        }

        const current = aggregates.get(key)!;
        if (entry.impact === 'revenue') {
            current.revenue += amount;
        } else {
            current.cost += amount;
        }
    }

    return [...aggregates.values()]
        .map((row) => {
            const revenue = Number(row.revenue.toFixed(2));
            const cost = Number(row.cost.toFixed(2));
            const margin = Number((revenue - cost).toFixed(2));
            const marginPct = revenue > 0
                ? Number(((margin / revenue) * 100).toFixed(2))
                : null;
            return {
                partner: row.partner,
                channel: row.channel,
                revenue,
                cost,
                margin,
                marginPct,
                status: partnerMarginStatus(margin),
            };
        })
        .sort((left, right) => {
            if (right.revenue !== left.revenue) {
                return right.revenue - left.revenue;
            }
            if (right.margin !== left.margin) {
                return right.margin - left.margin;
            }
            if (left.partner < right.partner) return -1;
            if (left.partner > right.partner) return 1;
            if ((left.channel ?? '') < (right.channel ?? '')) return -1;
            if ((left.channel ?? '') > (right.channel ?? '')) return 1;
            return 0;
        });
}
