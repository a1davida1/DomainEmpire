import { describe, expect, it } from 'vitest';
import { assignVariantBySubject } from '@/lib/ab-testing/assignment';

const variants = [
    { id: 'control', value: 'A', impressions: 0, clicks: 0, conversions: 0 },
    { id: 'treatment', value: 'B', impressions: 0, clicks: 0, conversions: 0 },
];

describe('ab assignment', () => {
    it('returns deterministic assignment for the same subject key', () => {
        const first = assignVariantBySubject({
            testId: 'test-1',
            subjectKey: 'user-123',
            variants,
        });
        const second = assignVariantBySubject({
            testId: 'test-1',
            subjectKey: 'user-123',
            variants,
        });

        expect(first.variantId).toBe(second.variantId);
        expect(first.assignmentBucketPct).toBe(second.assignmentBucketPct);
    });

    it('keeps holdout allocation close to the target share', () => {
        const total = 5000;
        let holdoutCount = 0;
        for (let index = 0; index < total; index += 1) {
            const assignment = assignVariantBySubject({
                testId: 'test-2',
                subjectKey: `subject-${index}`,
                variants,
                minHoldoutSharePct: 10,
            });
            if (assignment.isHoldout) {
                holdoutCount += 1;
            }
        }

        const holdoutPct = (holdoutCount / total) * 100;
        expect(holdoutPct).toBeGreaterThan(8);
        expect(holdoutPct).toBeLessThan(12);
    });

    it('uses explicit variant allocation weights when provided', () => {
        const weightedVariants = [
            { id: 'control', value: 'A', impressions: 0, clicks: 0, conversions: 0, allocationPct: 20 },
            { id: 'variant-1', value: 'B', impressions: 0, clicks: 0, conversions: 0, allocationPct: 30 },
            { id: 'variant-2', value: 'C', impressions: 0, clicks: 0, conversions: 0, allocationPct: 50 },
        ];

        const total = 6000;
        const counts = new Map<string, number>();
        for (let index = 0; index < total; index += 1) {
            const assignment = assignVariantBySubject({
                testId: 'test-3',
                subjectKey: `subject-${index}`,
                variants: weightedVariants,
                holdoutVariantId: 'control',
                minHoldoutSharePct: 10,
            });
            counts.set(assignment.variantId, (counts.get(assignment.variantId) ?? 0) + 1);
        }

        const controlPct = ((counts.get('control') ?? 0) / total) * 100;
        const variant1Pct = ((counts.get('variant-1') ?? 0) / total) * 100;
        const variant2Pct = ((counts.get('variant-2') ?? 0) / total) * 100;

        expect(controlPct).toBeGreaterThan(17);
        expect(controlPct).toBeLessThan(23);
        expect(variant1Pct).toBeGreaterThan(27);
        expect(variant1Pct).toBeLessThan(33);
        expect(variant2Pct).toBeGreaterThan(47);
        expect(variant2Pct).toBeLessThan(53);
    });
});

