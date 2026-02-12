/**
 * Theme-specific CSS overrides.
 * Each theme provides color, font, and component style overrides on top of the base + component styles.
 */

const themes: Record<string, string> = {
    // Legacy themes
    'navy-serif': `body{font-family:Georgia,serif;background-color:#f4f4f9;color:#0a1929}header{border-bottom:2px solid #0a1929}.logo{color:#0a1929}.hero{background-color:#0a1929;color:white;padding:5rem 0}footer{background-color:#0a1929;color:white;margin-top:0}`,

    'green-modern': `body{font-family:Inter,system-ui,sans-serif;background-color:#f0fdf4;color:#14532d}.logo{color:#15803d}a{color:#16a34a}`,

    'medical-clean': `body{font-family:message-box,sans-serif;background-color:#ffffff;color:#334155}.hero{color:#0ea5e9}`,

    // Niche-bucket themes
    'professional-blue': `body{font-family:Merriweather,Georgia,serif;background:#f8fafc;color:#1e293b;line-height:1.75}header{border-bottom:3px solid #1e3a5f}.logo{color:#1e3a5f;font-family:Merriweather,Georgia,serif}.hero{background:#1e3a5f;color:white;padding:5rem 2rem}a{color:#2563eb}.articles a{color:#1e3a5f}footer{background:#1e3a5f;color:#94a3b8;padding:2rem 1rem}footer a{color:#93c5fd}.disclaimer{background:#fef9c3;border-color:#ca8a04}.cta-button{background:#1e3a5f}.cta-button:hover{background:#0f2541}`,

    'health-clean': `body{font-family:system-ui,-apple-system,sans-serif;background:#ffffff;color:#334155;line-height:1.8;max-width:640px}header{border-bottom:2px solid #10b981}.logo{color:#047857}a{color:#059669}.hero{background:#f0fdf4;color:#065f46}.disclaimer{background:#fef3c7;border:2px solid #f59e0b;font-size:0.95rem}.sources{font-size:0.85rem}.reviewed-by{background:#f0fdf4;padding:0.5rem 0.75rem;border-radius:0.25rem;border-left:3px solid #10b981}`,

    'consumer-friendly': `body{font-family:Inter,system-ui,sans-serif;background:#fffbf5;color:#292524;line-height:1.7}header{border-bottom:2px solid #f59e0b}.logo{color:#b45309}a{color:#d97706}.hero{background:linear-gradient(135deg,#fef3c7,#fed7aa);color:#78350f;padding:4rem 2rem;border-radius:1rem;margin-bottom:2rem}.articles li{background:white;padding:1rem;border-radius:0.5rem;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:0.75rem}.comparison-badge{background:#f59e0b;color:#78350f}.cta-button{background:#d97706;border-radius:0.5rem}.cta-button:hover{background:#b45309}`,

    'tech-modern': `body{font-family:JetBrains Mono,SF Mono,monospace;background:#0f172a;color:#e2e8f0;line-height:1.65}header{border-bottom:1px solid #334155}.logo{color:#38bdf8;font-family:JetBrains Mono,monospace}a{color:#38bdf8}.hero{background:#1e293b;color:#f1f5f9;border:1px solid #334155;border-radius:0.5rem;padding:3rem 2rem}article{background:#1e293b;padding:2rem;border-radius:0.5rem;border:1px solid #334155}.articles a{color:#7dd3fc}footer{color:#64748b;border-top:1px solid #334155}.calc-form,.lead-form{background:#1e293b;border-color:#334155;color:#e2e8f0}.calc-input,.lead-field input,.lead-field select{background:#0f172a;border-color:#475569;color:#e2e8f0}.calc-results{background:#172554;border-color:#1e40af}.comparison-table th{background:#1e293b;border-color:#334155;color:#94a3b8}.comparison-table td{border-color:#1e293b;color:#cbd5e1}.comparison-table tr:hover{background:#1e293b}.faq-question{background:#1e293b;color:#e2e8f0}.faq-item{border-color:#334155}.faq-answer{border-color:#334155;color:#cbd5e1}`,

    'trust-minimal': `body{font-family:system-ui,-apple-system,sans-serif;background:#ffffff;color:#1f2937;max-width:640px;line-height:1.7}header{border:none;margin-bottom:3rem}.logo{color:#374151;font-size:1.125rem}a{color:#4b5563;text-decoration:underline}article{font-size:1.05rem}article h1{font-size:1.75rem}article h2{font-size:1.35rem;color:#374151}.hero{padding:2rem 0;text-align:left}.hero h1{font-size:2rem}.sources{font-size:0.8rem;color:#6b7280}footer{font-size:0.75rem;color:#9ca3af}.calc-form{border:none;background:#fafafa;padding:1rem}.calc-results{background:#fafafa;border:1px solid #e5e7eb}`,

    'hobby-vibrant': `body{font-family:Nunito,system-ui,sans-serif;background:#fefce8;color:#422006;line-height:1.7}header{border-bottom:3px solid #eab308}.logo{color:#a16207;font-weight:800}a{color:#ca8a04}.hero{background:linear-gradient(135deg,#fef08a,#fde68a);color:#713f12;padding:4rem 2rem;border-radius:1.5rem}.articles li{background:white;border:2px solid #fde68a;padding:1rem;border-radius:0.75rem;margin-bottom:0.75rem}.articles a{color:#92400e;font-weight:600}.comparison-badge{background:#eab308;color:white}.cta-button{background:#ca8a04;border-radius:0.75rem}.cta-button:hover{background:#a16207}.faq-question{background:#fef9c3}.cost-range{border:2px solid #fde68a}.factor-card{border:2px solid #fde68a}`,
};

/** Default fallback styles when no theme is matched */
const defaultTheme = `body{font-family:system-ui,sans-serif}`;

/**
 * Get theme-specific CSS overrides for a given theme name.
 * Returns default styles if the theme is not recognized.
 */
export function getThemeStyles(theme?: string): string {
    if (!theme) return defaultTheme;
    return themes[theme] ?? defaultTheme;
}

/** List all available theme names */
export const availableThemes = Object.keys(themes);
