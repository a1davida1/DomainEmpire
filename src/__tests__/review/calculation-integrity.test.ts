import { describe, expect, it } from 'vitest';
import { hashCalculatorConfigForTestPass } from '@/lib/review/calculation-integrity';

describe('hashCalculatorConfigForTestPass', () => {
    it('is deterministic regardless of object key order', () => {
        const left = {
            inputs: [{ id: 'loan_amount', type: 'number', label: 'Loan Amount', min: 0 }],
            outputs: [{ id: 'monthly_payment', label: 'Monthly Payment', format: 'currency' }],
            formula: 'mortgage_payment',
            assumptions: ['Fixed rate'],
            methodology: 'Not included in hash',
        };

        const right = {
            assumptions: ['Fixed rate'],
            formula: 'mortgage_payment',
            outputs: [{ format: 'currency', label: 'Monthly Payment', id: 'monthly_payment' }],
            inputs: [{ min: 0, label: 'Loan Amount', type: 'number', id: 'loan_amount' }],
        };

        expect(hashCalculatorConfigForTestPass(left)).toBe(hashCalculatorConfigForTestPass(right));
    });

    it('changes hash when formula logic changes', () => {
        const base = {
            inputs: [{ id: 'principal', type: 'number', label: 'Principal' }],
            outputs: [{ id: 'future_value', label: 'Future Value', format: 'currency' }],
            formula: 'compound_interest',
            assumptions: [],
        };

        const changed = {
            ...base,
            formula: 'roi',
        };

        const baseHash = hashCalculatorConfigForTestPass(base);
        const changedHash = hashCalculatorConfigForTestPass(changed);

        expect(baseHash).not.toBeNull();
        expect(changedHash).not.toBeNull();
        expect(baseHash).not.toBe(changedHash);
    });

    it('returns null for non-object configs', () => {
        expect(hashCalculatorConfigForTestPass(null)).toBeNull();
        expect(hashCalculatorConfigForTestPass('invalid')).toBeNull();
        expect(hashCalculatorConfigForTestPass(123)).toBeNull();
    });
});
