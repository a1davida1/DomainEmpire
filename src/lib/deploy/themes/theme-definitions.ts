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

    // Bucket themes used by seed-buckets.ts
    'minimal-blue': `body{font-family:Source Sans Pro,system-ui,sans-serif;background:#f8fbff;color:#1e3a5f;line-height:1.72}header{border-bottom:2px solid #bfdbfe}.logo{color:#1d4ed8;font-family:Source Sans Pro,system-ui,sans-serif}a{color:#1d4ed8}.hero{background:linear-gradient(135deg,#dbeafe,#eff6ff);color:#1e3a8a;border:1px solid #bfdbfe}.calc-results{background:#eff6ff;border-color:#bfdbfe}.comparison-badge{background:#1d4ed8}.wizard-next{background:#1d4ed8}`,

    'earth-inviting': `body{font-family:Lora,Georgia,serif;background:#fbf8f3;color:#3f3a34;line-height:1.78}header{border-bottom:2px solid #d6c2a8}.logo{color:#8b5e34}a{color:#9a6700}.hero{background:linear-gradient(135deg,#f5efe6,#f3e8d7);color:#5f3f22;border:1px solid #e6d5be}.articles li{background:#fffdf9;border:1px solid #e9d9c3;border-radius:0.75rem}.cta-button{background:#8b5e34}.cta-button:hover{background:#6e4828}.cost-low{background:#eaf5ea}.cost-avg{background:#eff6ff}.cost-high{background:#fdf0ea}`,

    'high-contrast-accessible': `body{font-family:Atkinson Hyperlegible,system-ui,sans-serif;background:#ffffff;color:#0f172a;line-height:1.85;font-size:18px}a{color:#0a58ca;text-decoration:underline;text-decoration-thickness:2px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}header{border-bottom:3px solid #0f172a}.logo{color:#0f172a}.hero{background:#0f172a;color:#f8fafc}.disclaimer{background:#fff7cc;border:2px solid #b45309;color:#111827}.wizard-progress-dot{border:2px solid #0f172a}.comparison-table th{background:#e2e8f0;color:#0f172a}`,

    'playful-modern': `body{font-family:DM Sans,system-ui,sans-serif;background:#fffaf2;color:#2d1f45;line-height:1.7}header{border-bottom:3px solid #fb923c}.logo{color:#7c2d12;font-weight:800}.hero{background:linear-gradient(135deg,#fde68a,#fca5a5,#c4b5fd);color:#3b0764;border-radius:1.25rem}.articles li{background:white;border:1px solid #fed7aa;border-radius:1rem;box-shadow:0 6px 16px rgba(124,58,237,0.08)}.comparison-badge{background:#fb7185}.cta-button{background:#7c3aed;border-radius:999px}.cta-button:hover{background:#6d28d9}.wizard-next{background:#7c3aed;border-radius:999px}`,

    'masculine-dark': `body{font-family:IBM Plex Sans,system-ui,sans-serif;background:#0b1220;color:#e5e7eb;line-height:1.68}header{border-bottom:1px solid #1f2937}.logo{color:#f59e0b}.hero{background:linear-gradient(135deg,#111827,#1f2937);color:#f9fafb;border:1px solid #374151}.articles li,article,.wizard-step,.lead-form,.calc-form{background:#111827;border-color:#374151}.calc-input,.lead-field input,.lead-field select,.wizard-field input,.wizard-field select{background:#0b1220;border-color:#4b5563;color:#e5e7eb}.cta-button,.wizard-next{background:#f59e0b;color:#111827}.cta-button:hover,.wizard-next:hover{background:#fbbf24}.comparison-table th{background:#1f2937;border-color:#374151;color:#f3f4f6}.comparison-table td{border-color:#1f2937;color:#d1d5db}`,

    'enthusiast-community': `body{font-family:Manrope,system-ui,sans-serif;background:#f5f7fb;color:#1f2937;line-height:1.74}header{border-bottom:2px solid #6366f1}.logo{color:#4338ca;font-weight:800}.hero{background:linear-gradient(135deg,#e0e7ff,#dbeafe);color:#1e1b4b;border:1px solid #c7d2fe}.articles li{background:#ffffff;border:1px solid #e0e7ff;border-radius:0.75rem}.comparison-badge{background:#4f46e5}.cta-button,.wizard-next{background:#4f46e5}.cta-button:hover,.wizard-next:hover{background:#4338ca}.faq-question{background:#eef2ff}`,

    'clean-general': `body{font-family:Public Sans,system-ui,sans-serif;background:#ffffff;color:#1f2937;line-height:1.72}header{border-bottom:1px solid #e5e7eb}.logo{color:#111827}.hero{background:#f9fafb;color:#111827;border:1px solid #e5e7eb}.articles li{background:#ffffff;border:1px solid #e5e7eb;border-radius:0.5rem}.comparison-badge{background:#111827}.cta-button,.wizard-next{background:#111827}.cta-button:hover,.wizard-next:hover{background:#374151}`,
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
