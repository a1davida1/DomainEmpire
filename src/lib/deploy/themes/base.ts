/**
 * Base CSS styles shared by all themes.
 * Wires up the CSS custom-property tokens emitted by theme-tokens.ts and skin-definitions.ts.
 * Layout-specific styles (width, grid, header/hero/footer variants) are in layouts/.
 */
export const baseStyles = `/* === Base reset & token-driven typography === */
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{
  font-family:var(--font-body,system-ui,-apple-system,sans-serif);
  font-size:var(--font-size-base,1rem);
  line-height:var(--line-height,1.7);
  color:var(--color-text,#1e293b);
  background:var(--color-bg,#fff);
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
  transition:background var(--transition-speed,.2s),color var(--transition-speed,.2s);
}

/* Links */
a{color:var(--color-link,#2563eb);text-decoration:none;transition:color var(--transition-speed,.2s)}
a:hover{color:var(--color-link-hover,#1d4ed8)}

/* Headings */
h1,h2,h3,h4,h5,h6{font-family:var(--font-heading,var(--font-body,system-ui,sans-serif));color:var(--color-text,#1e293b);line-height:1.25;font-weight:700}
h1{font-size:clamp(1.75rem,4vw,2.5rem);letter-spacing:-0.025em}
h2{font-size:clamp(1.35rem,3vw,1.75rem);letter-spacing:-0.02em;margin-top:2.5rem;margin-bottom:1rem}
h3{font-size:clamp(1.1rem,2.5vw,1.35rem);margin-top:2rem;margin-bottom:0.75rem}

/* Article body */
article h1{font-size:clamp(1.75rem,4vw,2.25rem);margin-bottom:1.5rem}
article h2{margin-top:2.5rem;margin-bottom:1rem;padding-bottom:0.5rem;border-bottom:var(--border-width,1px) solid var(--color-border,#e2e8f0)}
article h3{margin-top:2rem;margin-bottom:0.75rem}
article p{margin-bottom:1.25rem;max-width:72ch}
article ul,article ol{margin-bottom:1.25rem;padding-left:1.75rem}
article li{margin-bottom:0.5rem}
article blockquote{margin:1.5rem 0;padding:1rem 1.5rem;border-left:4px solid var(--color-accent,#2563eb);background:var(--color-bg-surface,#f8fafc);border-radius:0 var(--radius-sm,.375rem) var(--radius-sm,.375rem) 0;font-style:italic;color:var(--color-text-muted,#64748b)}
article code{font-family:var(--font-mono,ui-monospace,monospace);background:var(--color-bg-surface,#f8fafc);padding:0.15em 0.4em;border-radius:var(--radius-sm,.375rem);font-size:0.88em;border:1px solid var(--color-border,#e2e8f0)}
article pre{margin:1.5rem 0;padding:1.25rem;background:var(--color-bg-surface,#f8fafc);border:1px solid var(--color-border,#e2e8f0);border-radius:var(--radius-md,.5rem);overflow-x:auto}
article pre code{background:none;border:none;padding:0}
article img{border-radius:var(--radius-md,.5rem);margin:1.5rem 0}
article table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:0.925rem}
article table th{text-align:left;padding:0.75rem;border-bottom:2px solid var(--color-border-strong,#cbd5e1);font-weight:700;color:var(--color-text-muted,#64748b);text-transform:uppercase;font-size:0.8rem;letter-spacing:0.04em}
article table td{padding:0.75rem;border-bottom:1px solid var(--color-border,#e2e8f0)}
article table tr:hover{background:var(--color-bg-surface,#f8fafc)}
article hr{border:none;height:1px;background:var(--color-border,#e2e8f0);margin:2.5rem 0}

/* Container */
.site-container{max-width:var(--container-max,1100px);margin:0 auto;padding:0 1.5rem}

/* Main content area */
main{padding:2.5rem 0;min-height:60vh}

/* Images */
img{max-width:100%;height:auto;display:block}

/* Selection */
::selection{background:var(--color-accent,#2563eb);color:#fff}

/* Focus visible */
:focus-visible{outline:2px solid var(--color-accent,#2563eb);outline-offset:2px;border-radius:var(--radius-sm,.375rem)}

/* Utility: section spacing */
section + section{margin-top:var(--spacing-unit,1.6rem)}

/* Badge utility */
.badge{display:inline-flex;align-items:center;gap:0.375rem;font-size:0.78rem;font-weight:600;padding:0.25rem 0.75rem;border-radius:var(--radius-full,999px);background:var(--color-badge-bg,#1e293b);color:var(--color-badge-text,#fff)}
`;
