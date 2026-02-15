/**
 * Per-domain visual variance so sites sharing a bucket theme are still distinct.
 * This keeps structure stable while varying radii, shadows, rhythm, and UI polish.
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

/**
 * Generate deterministic CSS overrides using the domain as a seed.
 */
export function generateDomainVariantStyles(domain: string): string {
    const seed = hashString(domain || 'default-domain');

    const radii = ['0.25rem', '0.5rem', '0.75rem', '1rem', '1.25rem'];
    const buttonRadii = ['0.375rem', '0.5rem', '0.75rem', '999px'];
    const shadows = [
        'none',
        '0 2px 6px rgba(15,23,42,0.08)',
        '0 6px 18px rgba(15,23,42,0.10)',
        '0 10px 28px rgba(15,23,42,0.14)',
    ];
    const cardBorders = ['1px', '1px', '2px'];
    const spacing = ['1.45rem', '1.6rem', '1.75rem', '1.9rem'];
    const headingTracking = ['0', '0.01em', '0.015em'];
    const bodyTracking = ['0', '0.003em', '0.006em'];
    const imageStyles = ['0.5rem', '0.75rem', '1rem'];

    const cardRadius = pick(radii, seed, 1);
    const inputRadius = pick(radii, seed, 2);
    const buttonRadius = pick(buttonRadii, seed, 3);
    const shadow = pick(shadows, seed, 4);
    const borderWidth = pick(cardBorders, seed, 5);
    const sectionGap = pick(spacing, seed, 6);
    const headingLs = pick(headingTracking, seed, 7);
    const bodyLs = pick(bodyTracking, seed, 8);
    const imageRadius = pick(imageStyles, seed, 9);

    return `
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
}
body{letter-spacing:var(--de-body-tracking)}
article h1,article h2,article h3,.hero h1{letter-spacing:var(--de-heading-tracking)}
article p,article li{margin-bottom:var(--de-section-gap)}
article img,.hero,.articles li{border-radius:var(--de-image-radius)}
.calc-form,.lead-form,.wizard-step,.wizard-lead-form,.cost-range,.factor-card,.faq-item,.comparison-verdict,.geo-block,.data-sources{
  border-radius:var(--de-card-radius);
  border-width:var(--de-card-border-width);
  box-shadow:var(--de-card-shadow);
}
.calc-input,.lead-field input,.lead-field select,.wizard-field input,.wizard-field select,.wizard-field textarea,.wizard-field button{
  border-radius:var(--de-input-radius);
}
.lead-form button[type="submit"],.wizard-next,.wizard-back,.cta-button,.scroll-cta-btn,.print-btn,.wizard-restart{
  border-radius:var(--de-button-radius);
}
`;
}

