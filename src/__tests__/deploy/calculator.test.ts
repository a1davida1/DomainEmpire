import { describe, it, expect } from 'vitest';

// Test the formula dispatch logic used in calculator.ts
// These are the same formulas from the inline script

function pmt(rate: number, nper: number, pv: number): number {
    if (rate === 0) return pv / nper;
    const x = Math.pow(1 + rate, nper);
    return (pv * rate * x) / (x - 1);
}

function fv(rate: number, nper: number, pmtVal: number, pvVal: number): number {
    if (rate === 0) return -(pvVal + pmtVal * nper);
    const x = Math.pow(1 + rate, nper);
    return -(pvVal * x + pmtVal * ((x - 1) / rate));
}

// Formula dispatch table (mirrors calculator.ts FORMULAS)
const FORMULAS: Record<string, (v: Record<string, number>) => Record<string, number>> = {
    mortgage_payment: (v) => {
        const monthlyRate = (v.interest_rate / 100) / 12;
        const months = (v.loan_term || 30) * 12;
        const mp = pmt(monthlyRate, months, v.loan_amount || 0);
        return { monthly_payment: mp, total_paid: mp * months, total_interest: mp * months - (v.loan_amount || 0) };
    },
    compound_interest: (v) => {
        const principal = v.principal || v.initial_investment || 0;
        const rate = (v.interest_rate || v.annual_rate || 0) / 100;
        const years = v.years || v.time_period || 10;
        const n = v.compounds_per_year || 12;
        const contribution = v.monthly_contribution || 0;
        const total = fv(rate / n, n * years, -contribution, -principal);
        return { future_value: total, total_contributions: principal + contribution * n * years, total_interest: total - principal - contribution * n * years };
    },
    savings_goal: (v) => {
        const goal = v.savings_goal || v.target || 0;
        const rate = (v.interest_rate || v.annual_rate || 0) / 100;
        const years = v.years || v.time_period || 10;
        const n = 12;
        const r = rate / n;
        const periods = n * years;
        const monthly = r === 0 ? goal / periods : (goal * r) / (Math.pow(1 + r, periods) - 1);
        return { monthly_savings: monthly, total_contributed: monthly * periods, interest_earned: goal - monthly * periods };
    },
    roi: (v) => {
        const gain = (v.final_value || 0) - (v.initial_investment || 0);
        const roiVal = (v.initial_investment || 0) !== 0 ? gain / (v.initial_investment || 1) : 0;
        return { net_gain: gain, roi_percent: roiVal, annualized_roi: v.years ? Math.pow(1 + roiVal, 1 / v.years) - 1 : roiVal };
    },
};

describe('Calculator formula dispatch', () => {
    describe('mortgage_payment', () => {
        it('calculates standard 30-year mortgage', () => {
            const result = FORMULAS.mortgage_payment({
                loan_amount: 250000,
                interest_rate: 6.5,
                loan_term: 30,
            });
            expect(result.monthly_payment).toBeCloseTo(1580.17, 0);
            expect(result.total_paid).toBeGreaterThan(250000);
            expect(result.total_interest).toBeGreaterThan(0);
        });

        it('handles zero interest rate', () => {
            const result = FORMULAS.mortgage_payment({
                loan_amount: 120000,
                interest_rate: 0,
                loan_term: 10,
            });
            expect(result.monthly_payment).toBeCloseTo(1000, 0);
        });
    });

    describe('compound_interest', () => {
        it('grows principal with compound interest', () => {
            const result = FORMULAS.compound_interest({
                principal: 10000,
                interest_rate: 7,
                years: 10,
                monthly_contribution: 100,
            });
            expect(result.future_value).toBeGreaterThan(10000 + 100 * 120);
            expect(result.total_interest).toBeGreaterThan(0);
        });
    });

    describe('savings_goal', () => {
        it('calculates monthly savings needed for a goal', () => {
            const result = FORMULAS.savings_goal({
                savings_goal: 50000,
                interest_rate: 5,
                years: 5,
            });
            expect(result.monthly_savings).toBeGreaterThan(0);
            expect(result.monthly_savings).toBeLessThan(50000 / 60); // Less than no-interest scenario
        });

        it('handles zero interest for savings goal', () => {
            const result = FORMULAS.savings_goal({
                savings_goal: 12000,
                interest_rate: 0,
                years: 1,
            });
            expect(result.monthly_savings).toBeCloseTo(1000, 0);
        });
    });

    describe('roi', () => {
        it('calculates simple ROI', () => {
            const result = FORMULAS.roi({
                initial_investment: 1000,
                final_value: 1500,
            });
            expect(result.net_gain).toBe(500);
            expect(result.roi_percent).toBeCloseTo(0.5, 5);
        });

        it('calculates annualized ROI', () => {
            const result = FORMULAS.roi({
                initial_investment: 1000,
                final_value: 2000,
                years: 5,
            });
            expect(result.annualized_roi).toBeGreaterThan(0);
            expect(result.annualized_roi).toBeLessThan(1);
        });
    });

    it('returns empty object for unknown formula', () => {
        const unknownFormula = FORMULAS['nonexistent'];
        expect(unknownFormula).toBeUndefined();
    });
});
