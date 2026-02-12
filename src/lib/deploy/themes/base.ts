/**
 * Base CSS styles shared by all themes.
 * Covers resets, typography, and structural elements.
 * Layout-specific styles (width, grid, header/hero/footer variants) are in layouts/.
 */
export const baseStyles = `/* Base reset & typography */
*{margin:0;padding:0;box-sizing:border-box}
body{line-height:1.6;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;background:#fff}
a{color:#2563eb}a:hover{color:#1d4ed8}
article h1{font-size:2rem;margin-bottom:2rem}
article h2,article h3{margin-top:2rem;margin-bottom:1rem}
article p{margin-bottom:1rem}
main{padding:1rem 0;min-height:60vh}
img{max-width:100%;height:auto}
`;
