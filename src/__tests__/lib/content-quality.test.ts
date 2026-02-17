import { describe, expect, it } from 'vitest';

import { analyzeContentQuality, toPlainText } from '../../lib/review/content-quality';

describe('content-quality helpers', () => {
    it('extracts plain text from markdown', () => {
        const plain = toPlainText('# Heading\n\nThis is **bold** text with [link](https://example.com).', null);
        expect(plain).toContain('Heading');
        expect(plain).toContain('This is bold text');
    });

    it('keeps overall good status for very short content while word count score is low', () => {
        const quality = analyzeContentQuality('Too short.');
        expect(quality.metrics.wordCount).toBe(2);
        expect(quality.status).toBe('good');
        expect(quality.metrics.wordCountScore).toBe(30);
    });
});
