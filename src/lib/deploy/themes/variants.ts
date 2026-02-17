/**
 * Per-domain visual variance so sites sharing a bucket theme are still distinct.
 * Uses a deterministic hash of the domain to pick structural CSS overrides.
 * This makes every domain visually unique even when sharing the same theme + skin.
 */

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
}

function pick<T>(items: T[], seed: number, offset = 0): T {
    return items[(seed + offset) % items.length];
}

function escapeCssComment(value: string): string {
    return value.replace(/\*\//g, '*\\/').replace(/\/\*/g, '/\\*');
}

/**
 * Generate deterministic CSS overrides using the domain as a seed.
 */
export function generateDomainVariantStyles(domain: string): string {
    const seed = hashString(domain || 'default-domain');

    // Shape tokens
    const radii = ['0.25rem', '0.5rem', '0.75rem', '1rem', '1.25rem'];
    const buttonRadii = ['0.375rem', '0.5rem', '0.75rem', '999px'];
    const shadows = [
        '0 1px 3px rgba(15,23,42,0.06)',
        '0 2px 8px rgba(15,23,42,0.08)',
        '0 4px 16px rgba(15,23,42,0.10)',
        '0 8px 24px rgba(15,23,42,0.12)',
    ];
    const cardBorders = ['1px', '1px', '2px'];
    const spacing = ['1.45rem', '1.6rem', '1.75rem', '1.9rem'];
    const headingTracking = ['-0.01em', '0', '0.01em', '0.015em'];
    const bodyTracking = ['0', '0.003em', '0.006em'];
    const imageStyles = ['0.5rem', '0.75rem', '1rem'];

    // Hero personality
    const heroPaddings = ['4rem 2rem', '5rem 2rem', '5.5rem 2.5rem', '6rem 2rem'];
    const heroTextSizes = ['clamp(2rem,5vw,2.75rem)', 'clamp(2.25rem,5.5vw,3rem)', 'clamp(2rem,4.5vw,2.5rem)', 'clamp(2.5rem,6vw,3.25rem)'];

    // Section styling
    const sectionSpacings = ['2.5rem', '3rem', '3.5rem', '4rem'];
    const dividerStyles = ['none', '1px solid var(--color-border)', '2px solid var(--color-border)', '1px dashed var(--color-border)'];
    const sectionBgPatterns = [
        'transparent',
        'var(--color-bg-surface)',
        'linear-gradient(180deg, var(--color-bg) 0%, var(--color-bg-surface) 100%)',
        'transparent',
    ];

    // Heading personality
    const headingWeights = ['700', '800', '700', '800', '900'];
    const headingTransforms = ['none', 'none', 'none', 'uppercase'];

    // Card personality
    const cardHovers = [
        'translateY(-2px)',
        'translateY(-3px)',
        'translateY(-1px) scale(1.005)',
        'translateY(-2px)',
    ];

    const cardRadius = pick(radii, seed, 1);
    const inputRadius = pick(radii, seed, 2);
    const buttonRadius = pick(buttonRadii, seed, 3);
    const shadow = pick(shadows, seed, 4);
    const borderWidth = pick(cardBorders, seed, 5);
    const sectionGap = pick(spacing, seed, 6);
    const headingLs = pick(headingTracking, seed, 7);
    const bodyLs = pick(bodyTracking, seed, 8);
    const imageRadius = pick(imageStyles, seed, 9);
    const heroPad = pick(heroPaddings, seed, 10);
    const heroSize = pick(heroTextSizes, seed, 11);
    const secSpacing = pick(sectionSpacings, seed, 12);
    const divider = pick(dividerStyles, seed, 13);
    const secBg = pick(sectionBgPatterns, seed, 14);
    const hWeight = pick(headingWeights, seed, 15);
    const hTransform = pick(headingTransforms, seed, 16);
    const cardHover = pick(cardHovers, seed, 17);

    return `
/* Domain variant: ${escapeCssComment(domain)} */
:root{
  --de-card-radius:${cardRadius};
  --de-input-radius:${inputRadius};
  --de-button-radius:${buttonRadius};
  --de-card-shadow:${shadow};
  --de-card-border-width:${borderWidth};
  --de-section-gap:${sectionGap};
  --de-heading-tracking:${headingLs};
  --de-body-tracking:${bodyLs};
  --de-image-radius:${imageRadius};
  --de-hero-padding:${heroPad};
  --de-hero-size:${heroSize};
  --de-sec-spacing:${secSpacing};
  --de-sec-divider:${divider};
  --de-sec-bg-alt:${secBg};
  --de-heading-weight:${hWeight};
  --de-heading-transform:${hTransform};
  --de-card-hover:${cardHover};
}

/* Body */
body{letter-spacing:var(--de-body-tracking)}

/* Headings */
h1,h2,h3{letter-spacing:var(--de-heading-tracking);font-weight:var(--de-heading-weight)}
h2{text-transform:var(--de-heading-transform)}

/* Hero — only override padding when no variant class is present */
.hero:not([class*="hero--"]){padding:var(--de-hero-padding)}
.hero h1{font-size:var(--de-hero-size);letter-spacing:var(--de-heading-tracking)}

/* Section spacing & dividers */
section + section{margin-top:var(--de-sec-spacing)}
section + section{border-top:var(--de-sec-divider)}

/* Alternating section backgrounds */
section:nth-child(even){background:var(--de-sec-bg-alt)}

/* Images */
article img{border-radius:var(--de-image-radius)}

/* Article */
article p,article li{margin-bottom:var(--de-section-gap)}

/* Cards & interactive elements */
.calc-form,.lead-form,.wizard-step,.wizard-lead-form,.cost-range,.factor-card,.faq-item,.comparison-verdict,.geo-block,.data-sources,.review-card,.vs-card,.pricing-card,.testimonial-card,.ranking-item,.pdf-download{
  border-radius:var(--de-card-radius);
  border-width:var(--de-card-border-width);
  box-shadow:var(--de-card-shadow);
}
.review-card,.pricing-card,.testimonial-card,.ranking-item,.articles li{
  transition:transform 150ms ease-in-out;
}
.review-card:hover,.pricing-card:hover,.testimonial-card:hover,.ranking-item:hover,.articles li:hover{
  transform:var(--de-card-hover);
}

/* Inputs */
.calc-input,.lead-field input,.lead-field select,.wizard-field input,.wizard-field select,.wizard-field textarea,.wizard-field button{
  border-radius:var(--de-input-radius);
}

/* Buttons */
.lead-form button[type="submit"],.wizard-next,.wizard-back,.cta-button,.scroll-cta-btn,.print-btn,.wizard-restart,.hero-cta,.pdf-download-btn{
  border-radius:var(--de-button-radius);
}

/* Stat grid polish */
.stat-grid .stat-item{
  border-radius:var(--de-card-radius);
  box-shadow:var(--de-card-shadow);
}
`;
}

