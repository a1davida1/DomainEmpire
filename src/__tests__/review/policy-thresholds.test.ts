import { afterEach, describe, expect, it } from 'vitest';
import { getYmylCitationThreshold } from '@/lib/review/policy-thresholds';

const ORIGINAL_MEDIUM = process.env.YMYL_MEDIUM_MIN_CITATIONS;
const ORIGINAL_HIGH = process.env.YMYL_HIGH_MIN_CITATIONS;

afterEach(() => {
    if (ORIGINAL_MEDIUM === undefined) delete process.env.YMYL_MEDIUM_MIN_CITATIONS;
    else process.env.YMYL_MEDIUM_MIN_CITATIONS = ORIGINAL_MEDIUM;

    if (ORIGINAL_HIGH === undefined) delete process.env.YMYL_HIGH_MIN_CITATIONS;
    else process.env.YMYL_HIGH_MIN_CITATIONS = ORIGINAL_HIGH;
});

describe('getYmylCitationThreshold', () => {
    it('returns default thresholds when env vars are not set', () => {
        delete process.env.YMYL_MEDIUM_MIN_CITATIONS;
        delete process.env.YMYL_HIGH_MIN_CITATIONS;

        expect(getYmylCitationThreshold('none')).toBe(0);
        expect(getYmylCitationThreshold('low')).toBe(0);
        expect(getYmylCitationThreshold('medium')).toBe(2);
        expect(getYmylCitationThreshold('high')).toBe(3);
    });

    it('respects environment overrides', () => {
        process.env.YMYL_MEDIUM_MIN_CITATIONS = '4';
        process.env.YMYL_HIGH_MIN_CITATIONS = '6';

        expect(getYmylCitationThreshold('medium')).toBe(4);
        expect(getYmylCitationThreshold('high')).toBe(6);
    });
});
