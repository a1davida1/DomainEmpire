import { describe, expect, it } from 'vitest';
import { FailureCategorizer } from '@/lib/tpilot/core/failure-categorizer';

describe('FailureCategorizer', () => {
    it('classifies rate limit failures as retryable', () => {
        const result = FailureCategorizer.categorize('HTTP 429: Too many requests, retry after 60');
        expect(result.category).toBe('rate_limit');
        expect(result.retryable).toBe(true);
        expect(result.extractedDetails?.retryAfterSeconds).toBe(60);
    });

    it('classifies auth failures as non-retryable', () => {
        const result = FailureCategorizer.categorize(new Error('OAuth token expired'));
        expect(result.category).toBe('auth_expired');
        expect(result.retryable).toBe(false);
    });

    it('classifies underwriting failures as economics_failed', () => {
        const result = FailureCategorizer.categorize('negative expectancy: max bid exceeds underwriting ROI threshold');
        expect(result.category).toBe('economics_failed');
        expect(result.retryable).toBe(false);
    });
});

