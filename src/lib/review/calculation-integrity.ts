import { createHash } from 'node:crypto';

type CalculatorConfigShape = {
    inputs?: unknown;
    outputs?: unknown;
    formula?: unknown;
    assumptions?: unknown;
};

function compareLex(left: string, right: string): number {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

function deepSort(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => deepSort(entry));

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort(compareLex);
    for (const key of keys) {
        sorted[key] = deepSort((value as Record<string, unknown>)[key]);
    }
    return sorted;
}

/**
 * Build a deterministic hash for calculator computation logic.
 * Only computation-relevant fields are included so editorial copy updates
 * do not invalidate a previously recorded deterministic test pass.
 */
export function hashCalculatorConfigForTestPass(config: unknown): string | null {
    if (!config || typeof config !== 'object') return null;

    const input = config as CalculatorConfigShape;
    const normalized = {
        inputs: Array.isArray(input.inputs) ? input.inputs : [],
        outputs: Array.isArray(input.outputs) ? input.outputs : [],
        formula: typeof input.formula === 'string' ? input.formula : null,
        assumptions: Array.isArray(input.assumptions) ? input.assumptions : [],
    };

    const canonical = JSON.stringify(deepSort(normalized));
    return createHash('sha256').update(canonical).digest('hex');
}
