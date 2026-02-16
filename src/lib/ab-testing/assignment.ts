import type { AbVariantMetrics } from './decision-gates';

export type AbAssignmentVariant = AbVariantMetrics & {
    allocationPct?: number | null;
};

export type AbVariantAssignment = {
    variantId: string;
    controlVariantId: string;
    holdoutSharePct: number;
    assignedSharePct: number;
    assignmentBucketPct: number;
    isHoldout: boolean;
    reason: 'allocation_weight';
};

const DEFAULT_HOLDOUT_SHARE_PCT = 10;

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function toFiniteNonNegative(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return null;
    }
    return value;
}

function stableHash(input: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function toBucketPct(hash: number): number {
    const ratio = hash / 0xffffffff;
    return clamp(ratio * 100, 0, 99.9999);
}

function round2(value: number): number {
    return Number(value.toFixed(2));
}

function ensureUniqueVariantIds(variants: AbAssignmentVariant[]): void {
    const seen = new Set<string>();
    for (const variant of variants) {
        if (seen.has(variant.id)) {
            throw new Error(`Duplicate variant id detected: ${variant.id}`);
        }
        seen.add(variant.id);
    }
}

function normalizeExplicitAllocations(variants: AbAssignmentVariant[]): Map<string, number> | null {
    const withExplicit = variants
        .map((variant) => ({
            id: variant.id,
            allocationPct: toFiniteNonNegative(variant.allocationPct),
        }))
        .filter((variant): variant is { id: string; allocationPct: number } => variant.allocationPct !== null);

    if (withExplicit.length === 0) {
        return null;
    }

    const sum = withExplicit.reduce((total, variant) => total + variant.allocationPct, 0);
    if (sum <= 0) {
        return null;
    }

    const normalized = new Map<string, number>();
    for (const variant of withExplicit) {
        normalized.set(variant.id, (variant.allocationPct / sum) * 100);
    }
    return normalized;
}

function normalizeDefaultAllocations(
    variants: AbAssignmentVariant[],
    controlVariantId: string,
    minHoldoutSharePct: number,
): Map<string, number> {
    const normalized = new Map<string, number>();
    const treatmentIds = variants
        .map((variant) => variant.id)
        .filter((id) => id !== controlVariantId);
    const holdoutShare = clamp(minHoldoutSharePct, 0, 50);

    if (treatmentIds.length === 0) {
        normalized.set(controlVariantId, 100);
        return normalized;
    }

    const treatmentShare = 100 - holdoutShare;
    const eachTreatmentShare = treatmentShare / treatmentIds.length;

    normalized.set(controlVariantId, holdoutShare);
    for (const treatmentId of treatmentIds) {
        normalized.set(treatmentId, eachTreatmentShare);
    }
    return normalized;
}

function resolveAllocationShares(input: {
    variants: AbAssignmentVariant[];
    controlVariantId: string;
    minHoldoutSharePct: number;
}): Map<string, number> {
    const explicit = normalizeExplicitAllocations(input.variants);
    if (!explicit) {
        return normalizeDefaultAllocations(input.variants, input.controlVariantId, input.minHoldoutSharePct);
    }

    const controlShare = explicit.get(input.controlVariantId) ?? 0;
    const requiredHoldoutShare = clamp(input.minHoldoutSharePct, 0, 50);
    if (requiredHoldoutShare <= 0 || controlShare >= requiredHoldoutShare) {
        return explicit;
    }

    // If explicit allocations under-allocate holdout, enforce a floor and re-normalize treatments.
    const adjusted = new Map<string, number>();
    const remainder = 100 - requiredHoldoutShare;
    const treatmentEntries = [...explicit.entries()].filter(([id]) => id !== input.controlVariantId);
    const treatmentSum = treatmentEntries.reduce((sum, [, share]) => sum + share, 0);

    adjusted.set(input.controlVariantId, requiredHoldoutShare);
    if (treatmentEntries.length === 0 || treatmentSum <= 0) {
        return adjusted;
    }

    for (const [id, share] of treatmentEntries) {
        adjusted.set(id, (share / treatmentSum) * remainder);
    }
    return adjusted;
}

export function assignVariantBySubject(input: {
    testId: string;
    subjectKey: string;
    variants: AbAssignmentVariant[];
    holdoutVariantId?: string | null;
    minHoldoutSharePct?: number;
}): AbVariantAssignment {
    const variants = input.variants;
    if (variants.length < 2) {
        throw new Error('At least two variants are required for assignment');
    }

    ensureUniqueVariantIds(variants);

    const controlVariantId = variants.some((variant) => variant.id === input.holdoutVariantId)
        ? input.holdoutVariantId!
        : variants[0]!.id;
    const holdoutSharePct = clamp(
        input.minHoldoutSharePct ?? DEFAULT_HOLDOUT_SHARE_PCT,
        0,
        50,
    );

    const allocationShares = resolveAllocationShares({
        variants,
        controlVariantId,
        minHoldoutSharePct: holdoutSharePct,
    });

    const bucketHash = stableHash(`${input.testId}:${input.subjectKey}`);
    const assignmentBucketPct = toBucketPct(bucketHash);

    let cumulative = 0;
    let assignedVariantId = controlVariantId;
    let assignedSharePct = allocationShares.get(controlVariantId) ?? 0;
    const orderedVariants = variants.map((variant) => variant.id);

    for (let index = 0; index < orderedVariants.length; index += 1) {
        const variantId = orderedVariants[index]!;
        const share = allocationShares.get(variantId) ?? 0;
        if (share <= 0) continue;
        cumulative += share;
        if (assignmentBucketPct <= cumulative || index === orderedVariants.length - 1) {
            assignedVariantId = variantId;
            assignedSharePct = share;
            break;
        }
    }

    return {
        variantId: assignedVariantId,
        controlVariantId,
        holdoutSharePct: round2(holdoutSharePct),
        assignedSharePct: round2(assignedSharePct),
        assignmentBucketPct: round2(assignmentBucketPct),
        isHoldout: assignedVariantId === controlVariantId,
        reason: 'allocation_weight',
    };
}

