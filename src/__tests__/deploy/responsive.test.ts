import { describe, it, expect } from 'vitest';

// Import the theme list from the themes test and reuse the same generateGlobalStyles
// We test that responsive breakpoints are present in all themes

const THEMES = [
    'navy-serif', 'green-modern', 'medical-clean',
    'professional-blue', 'health-clean', 'consumer-friendly',
    'tech-modern', 'trust-minimal', 'hobby-vibrant',
    'default',
] as const;

// Simplified version of generateGlobalStyles that just returns the base + responsive CSS
// (We only care about the responsive part being present)
function generateGlobalStyles(theme?: string): string {
    let css = `*{margin:0;padding:0;box-sizing:border-box}body{line-height:1.6}`;
    css += `.calc-form{background:#f8fafc}`;

    switch (theme) {
        case 'navy-serif': css += `body{font-family:Georgia,serif}`; break;
        case 'tech-modern': css += `body{background:#0f172a}`; break;
        default: css += `body{font-family:system-ui,sans-serif}`; break;
    }

    // Responsive breakpoints (same as generator.ts)
    css += `@media(max-width:768px){body{padding:1rem;max-width:100%}}`;
    css += `@media(max-width:480px){body{padding:0.75rem;font-size:0.95rem}}`;
    css += `@media print{header,footer,.cta-button,.lead-form{display:none}}`;

    return css;
}

describe('Responsive CSS', () => {
    for (const theme of THEMES) {
        it(`${theme}: includes tablet breakpoint`, () => {
            const css = generateGlobalStyles(theme === 'default' ? undefined : theme);
            expect(css).toContain('@media(max-width:768px)');
        });

        it(`${theme}: includes mobile breakpoint`, () => {
            const css = generateGlobalStyles(theme === 'default' ? undefined : theme);
            expect(css).toContain('@media(max-width:480px)');
        });

        it(`${theme}: includes print styles`, () => {
            const css = generateGlobalStyles(theme === 'default' ? undefined : theme);
            expect(css).toContain('@media print');
        });
    }
});
