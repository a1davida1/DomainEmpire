import { describe, expect, it } from 'vitest';
import { wizardConfigSchema } from '@/lib/validation/articles';

const baseWizardConfig = {
    steps: [
        {
            id: 'step-1',
            title: 'Step One',
            fields: [
                {
                    id: 'goal',
                    type: 'radio' as const,
                    label: 'Goal',
                    options: [{ value: 'save', label: 'Save' }],
                    required: true,
                },
            ],
        },
    ],
    resultRules: [
        {
            condition: "goal == 'save'",
            title: 'Savings Path',
            body: 'Use the savings path.',
        },
    ],
    resultTemplate: 'recommendation' as const,
};

describe('wizardConfigSchema scoring', () => {
    it('accepts weighted scoring config with bands', () => {
        const parsed = wizardConfigSchema.safeParse({
            ...baseWizardConfig,
            scoring: {
                method: 'weighted',
                weights: {
                    goal: 60,
                    budget: 40,
                },
                valueMap: {
                    goal: {
                        save: 90,
                        speed: 60,
                    },
                },
                bands: [
                    { min: 0, max: 49, label: 'Starter' },
                    { min: 50, max: 79, label: 'Developing' },
                    { min: 80, max: 100, label: 'Ready' },
                ],
                outcomes: [
                    { min: 0, max: 49, title: 'Start Slow', body: 'Improve your baseline first.' },
                    { min: 50, max: 100, title: 'Proceed', body: 'You are in a strong range.' },
                ],
            },
        });
        expect(parsed.success).toBe(true);
    });

    it('rejects scoring band with max lower than min', () => {
        const parsed = wizardConfigSchema.safeParse({
            ...baseWizardConfig,
            scoring: {
                method: 'weighted',
                weights: { goal: 100 },
                bands: [
                    { min: 80, max: 20, label: 'BadBand' },
                ],
            },
        });
        expect(parsed.success).toBe(false);
    });

    it('rejects score outcome with invalid range', () => {
        const parsed = wizardConfigSchema.safeParse({
            ...baseWizardConfig,
            scoring: {
                method: 'weighted',
                weights: { goal: 100 },
                outcomes: [
                    { min: 60, max: 10, title: 'Invalid', body: 'Bad range' },
                ],
            },
        });
        expect(parsed.success).toBe(false);
    });
});
