import { describe, expect, it } from 'vitest';
import { generateGlobalStyles } from '@/lib/deploy/themes';

describe('domain variant styles', () => {
    it('is deterministic for the same domain', () => {
        const cssA = generateGlobalStyles('minimal-blue', 'authority', 'alpha-example.com');
        const cssB = generateGlobalStyles('minimal-blue', 'authority', 'alpha-example.com');
        expect(cssA).toBe(cssB);
    });

    it('varies across different domains', () => {
        const cssA = generateGlobalStyles('minimal-blue', 'authority', 'alpha-example.com');
        const cssB = generateGlobalStyles('minimal-blue', 'authority', 'beta-example.com');
        expect(cssA).not.toBe(cssB);
    });
});

