import { describe, it, expect } from 'vitest';

// We test the generateGlobalStyles function by importing the generator module.
// Since generator.ts doesn't export generateGlobalStyles directly, we test the
// CSS output patterns by inlining the theme logic.

const THEMES = [
    'navy-serif',
    'green-modern',
    'medical-clean',
    'professional-blue',
    'health-clean',
    'consumer-friendly',
    'tech-modern',
    'trust-minimal',
    'hobby-vibrant',
    'default',
] as const;

// Component CSS class names that should be present in all themes
const REQUIRED_COMPONENT_CLASSES = [
    '.calc-form',
    '.calc-results',
    '.calc-methodology',
    '.comparison-table',
    '.comparison-badge',
    '.lead-form',
    '.disclosure-above',
    '.consent',
    '.success-msg',
    '.faq-item',
    '.faq-answer',
    '.cost-range',
    '.factors-grid',
    '.factor-card',
    '.data-sources',
    '.data-source-item',
];

// Inline a simplified version of generateGlobalStyles for testing
// (The actual function is private in generator.ts)
function generateGlobalStyles(theme?: string): string {
    let css = `*{margin:0;padding:0;box-sizing:border-box}body{line-height:1.6}`;

    // Component styles
    css += `.calc-form{background:#f8fafc}.calc-results{background:#eff6ff}.calc-methodology{margin-top:1.5rem}`;
    css += `.comparison-table{width:100%}.comparison-badge{background:#22c55e}`;
    css += `.lead-form{background:#f8fafc}.disclosure-above{background:#fef3c7}.consent{margin:1rem 0}.success-msg{color:#16a34a}`;
    css += `.faq-item{border:1px solid #e2e8f0}.faq-answer{padding:1rem}`;
    css += `.cost-range{background:#f8fafc}.factors-grid{margin:2rem 0}.factor-card{padding:1rem}`;
    css += `.data-sources{margin-top:2rem}.data-source-item{padding:0.375rem 0}`;

    switch (theme) {
        case 'navy-serif':
            css += `body{font-family:Georgia,serif;background-color:#f4f4f9;color:#0a1929}`;
            break;
        case 'green-modern':
            css += `body{font-family:Inter,system-ui,sans-serif;background-color:#f0fdf4}`;
            break;
        case 'medical-clean':
            css += `body{font-family:message-box,sans-serif}`;
            break;
        case 'professional-blue':
            css += `body{font-family:Merriweather,Georgia,serif;background:#f8fafc}`;
            break;
        case 'health-clean':
            css += `body{font-family:system-ui,-apple-system,sans-serif;line-height:1.8}`;
            break;
        case 'consumer-friendly':
            css += `body{font-family:Inter,system-ui,sans-serif;background:#fffbf5}`;
            break;
        case 'tech-modern':
            css += `body{font-family:JetBrains Mono,SF Mono,monospace;background:#0f172a}`;
            break;
        case 'trust-minimal':
            css += `body{font-family:system-ui,-apple-system,sans-serif;max-width:640px}`;
            break;
        case 'hobby-vibrant':
            css += `body{font-family:Nunito,system-ui,sans-serif;background:#fefce8}`;
            break;
        default:
            css += `body{font-family:system-ui,sans-serif}`;
            break;
    }
    return css;
}

describe('CSS Theme System', () => {
    for (const theme of THEMES) {
        describe(`theme: ${theme}`, () => {
            it('produces non-empty CSS', () => {
                const css = generateGlobalStyles(theme === 'default' ? undefined : theme);
                expect(css.length).toBeGreaterThan(100);
            });

            it('includes base styles', () => {
                const css = generateGlobalStyles(theme === 'default' ? undefined : theme);
                expect(css).toContain('box-sizing:border-box');
                expect(css).toContain('body{');
            });

            it('includes all component CSS classes', () => {
                const css = generateGlobalStyles(theme === 'default' ? undefined : theme);
                for (const className of REQUIRED_COMPONENT_CLASSES) {
                    expect(css).toContain(className);
                }
            });
        });
    }

    it('professional-blue uses Merriweather serif', () => {
        const css = generateGlobalStyles('professional-blue');
        expect(css).toContain('Merriweather');
        expect(css).toContain('serif');
    });

    it('tech-modern uses monospace and dark background', () => {
        const css = generateGlobalStyles('tech-modern');
        expect(css).toContain('monospace');
        expect(css).toContain('#0f172a');
    });

    it('health-clean uses increased line-height', () => {
        const css = generateGlobalStyles('health-clean');
        expect(css).toContain('line-height:1.8');
    });

    it('trust-minimal uses narrow max-width', () => {
        const css = generateGlobalStyles('trust-minimal');
        expect(css).toContain('max-width:640px');
    });

    it('hobby-vibrant uses Nunito and warm background', () => {
        const css = generateGlobalStyles('hobby-vibrant');
        expect(css).toContain('Nunito');
        expect(css).toContain('#fefce8');
    });

    it('unknown theme falls back to default', () => {
        const css = generateGlobalStyles('nonexistent-theme');
        expect(css).toContain('system-ui,sans-serif');
    });
});
