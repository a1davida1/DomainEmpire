import { describe, expect, it } from 'vitest';

import { parseWorkerBatchSize } from '../../lib/ai/worker-config';

describe('parseWorkerBatchSize', () => {
    it('returns default batch size when env is missing or invalid', () => {
        expect(parseWorkerBatchSize(undefined)).toBe(10);
        expect(parseWorkerBatchSize('')).toBe(10);
        expect(parseWorkerBatchSize('abc')).toBe(10);
    });

    it('clamps values into safe bounds', () => {
        expect(parseWorkerBatchSize('-5')).toBe(1);
        expect(parseWorkerBatchSize('0')).toBe(1);
        expect(parseWorkerBatchSize('1')).toBe(1);
        expect(parseWorkerBatchSize('25')).toBe(25);
        expect(parseWorkerBatchSize('200')).toBe(200);
        expect(parseWorkerBatchSize('999')).toBe(200);
    });
});
