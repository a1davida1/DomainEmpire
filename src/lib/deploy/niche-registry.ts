/**
 * Canonical niche registry — single source of truth for all niche-specific
 * pattern matching across the deploy pipeline.
 *
 * Used by:
 *   - structural-blueprint.ts (nav labels)
 *   - assembler.ts (schema.org types)
 *   - enrich.ts (site purpose for AI prompts)
 */

// ── Niche Keys ───────────────────────────────────────────────────────────────

export type NicheKey =
    | 'homeValue'
    | 'prenup'
    | 'refinance'
    | 'mortgage'
    | 'creditCardPayoff'
    | 'braces'
    | 'renovation'
    | 'solar'
    | 'pool'
    | 'therapy'
    | 'dental'
    | 'insurance'
    | 'legal'
    | 'ivf'
    | 'wedding'
    | 'moving'
    | 'roofing'
    | 'contentCreator';

// ── Pattern Registry (ordered — first match wins) ────────────────────────────

const NICHE_ENTRIES: Array<{ key: NicheKey; pattern: RegExp }> = [
    { key: 'homeValue', pattern: /home\s?value|property\s?value|house\s?worth/ },
    { key: 'prenup', pattern: /prenup|pre-?nup/ },
    { key: 'refinance', pattern: /refinanc/ },
    { key: 'mortgage', pattern: /mortgage|home\s?loan/ },
    { key: 'creditCardPayoff', pattern: /credit\s?card\s?payoff/ },
    { key: 'braces', pattern: /braces|orthodont/ },
    { key: 'renovation', pattern: /bathroom|kitchen|remodel|renovat/ },
    { key: 'solar', pattern: /solar|panel/ },
    { key: 'pool', pattern: /pool/ },
    { key: 'therapy', pattern: /therapy|counsel/ },
    { key: 'dental', pattern: /dental|tooth|teeth/ },
    { key: 'insurance', pattern: /insur/ },
    { key: 'legal', pattern: /lawyer|attorney|legal/ },
    { key: 'ivf', pattern: /ivf|fertil/ },
    { key: 'wedding', pattern: /wedding/ },
    { key: 'moving', pattern: /moving|reloc/ },
    { key: 'roofing', pattern: /roofing|roof/ },
    { key: 'contentCreator', pattern: /only\s?fans|creator/ },
];

/**
 * Match a domain name and/or niche string against the canonical patterns.
 * Returns the first matching NicheKey or null.
 */
export function matchNiche(domain: string, niche?: string): NicheKey | null {
    const d = domain.toLowerCase();
    const n = (niche || '').toLowerCase();
    for (const entry of NICHE_ENTRIES) {
        if (entry.pattern.test(d) || entry.pattern.test(n)) return entry.key;
    }
    return null;
}

// ── Nav Label Overrides ──────────────────────────────────────────────────────

export interface NavLabelOverrides {
    calculator?: string;
    compare?: string;
    guides?: string;
}

export const NAV_LABEL_MAP: Partial<Record<NicheKey, NavLabelOverrides>> = {
    homeValue: { calculator: 'Home Value Estimator', compare: 'Compare Areas', guides: 'Home Value Guides' },
    prenup: { calculator: 'Cost Estimator', compare: 'Compare Options', guides: 'Prenup Guides' },
    refinance: { calculator: 'Refinance Calculator', compare: 'Compare Rates', guides: 'Refinancing Guides' },
    mortgage: { calculator: 'Mortgage Calculator', compare: 'Compare Lenders', guides: 'Mortgage Guides' },
    creditCardPayoff: { calculator: 'Payoff Calculator', compare: 'Compare Cards', guides: 'Debt Guides' },
    braces: { calculator: 'Cost Estimator', compare: 'Compare Treatments', guides: 'Treatment Guides' },
    renovation: { calculator: 'Renovation Calculator', compare: 'Compare Contractors', guides: 'Renovation Guides' },
    solar: { calculator: 'Solar Savings Calculator', compare: 'Compare Installers', guides: 'Solar Guides' },
    pool: { calculator: 'Pool Cost Estimator', compare: 'Compare Pool Types', guides: 'Pool Guides' },
    therapy: { calculator: 'Session Cost Estimator', compare: 'Compare Therapists', guides: 'Therapy Guides' },
    dental: { calculator: 'Dental Cost Estimator', compare: 'Compare Procedures', guides: 'Dental Guides' },
    insurance: { calculator: 'Premium Estimator', compare: 'Compare Plans', guides: 'Insurance Guides' },
    legal: { calculator: 'Fee Estimator', compare: 'Compare Attorneys', guides: 'Legal Guides' },
    ivf: { calculator: 'IVF Cost Calculator', compare: 'Compare Clinics', guides: 'Fertility Guides' },
    wedding: { calculator: 'Wedding Budget Calculator', compare: 'Compare Vendors', guides: 'Wedding Planning' },
    moving: { calculator: 'Moving Cost Calculator', compare: 'Compare Movers', guides: 'Moving Guides' },
    roofing: { calculator: 'Roofing Cost Estimator', compare: 'Compare Roofers', guides: 'Roofing Guides' },
};

/**
 * Resolve niche-specific nav label overrides. Returns empty object for unrecognized niches.
 */
export function resolveNavLabels(domain: string, niche?: string): NavLabelOverrides {
    const key = matchNiche(domain, niche);
    return (key && NAV_LABEL_MAP[key]) || {};
}

// ── Schema.org Types ─────────────────────────────────────────────────────────

export interface NicheSchemaConfig {
    organizationType: string;
}

export const SCHEMA_TYPE_MAP: Partial<Record<NicheKey, NicheSchemaConfig>> = {
    legal: { organizationType: 'LegalService' },
    dental: { organizationType: 'Dentist' },
    braces: { organizationType: 'Dentist' },
    homeValue: { organizationType: 'RealEstateAgent' },
    refinance: { organizationType: 'FinancialService' },
    mortgage: { organizationType: 'FinancialService' },
    creditCardPayoff: { organizationType: 'FinancialService' },
    insurance: { organizationType: 'InsuranceAgency' },
    therapy: { organizationType: 'MedicalBusiness' },
    ivf: { organizationType: 'MedicalBusiness' },
    solar: { organizationType: 'HomeAndConstructionBusiness' },
    pool: { organizationType: 'HomeAndConstructionBusiness' },
    roofing: { organizationType: 'HomeAndConstructionBusiness' },
    renovation: { organizationType: 'HomeAndConstructionBusiness' },
    moving: { organizationType: 'MovingCompany' },
    wedding: { organizationType: 'LocalBusiness' },
};

/**
 * Resolve the schema.org Organization subtype for a niche.
 * Falls back to generic 'Organization'.
 */
export function resolveSchemaType(domain: string, niche?: string): NicheSchemaConfig {
    const key = matchNiche(domain, niche);
    return (key && SCHEMA_TYPE_MAP[key]) || { organizationType: 'Organization' };
}

// ── Site Purpose (for AI prompts) ────────────────────────────────────────────

const SITE_PURPOSE_MAP: Partial<Record<NicheKey, (siteName: string) => string>> = {
    homeValue: (s) => `${s} helps homeowners estimate their property's current market value. The calculator should take property details (sq ft, bedrooms, bathrooms, zip code, year built, condition) and output an estimated market value range.`,
    prenup: (s) => `${s} helps couples decide whether they need a prenuptial agreement and understand the costs. The calculator should estimate prenup costs based on complexity (simple vs contested), assets, state, and attorney involvement.`,
    refinance: (s) => `${s} helps homeowners evaluate mortgage refinancing options. The calculator should compare current rate vs new rate, remaining term, closing costs, and show break-even timeline and total savings.`,
    mortgage: (s) => `${s} helps home buyers calculate mortgage payments and affordability. Inputs should be home price, down payment, interest rate, loan term. Show monthly payment, total interest, and amortization.`,
    creditCardPayoff: (s) => `${s} helps people create a plan to pay off credit card debt. Calculator inputs: balance, interest rate (APR), monthly payment. Show payoff timeline, total interest, and debt-free date.`,
    braces: (s) => `${s} helps people understand braces and orthodontic treatment costs. Calculator should estimate costs based on treatment type (metal/ceramic/lingual/Invisalign), insurance coverage level, region, and treatment complexity.`,
    renovation: (s) => `${s} helps homeowners estimate renovation costs. Calculator inputs should be room size, renovation scope (cosmetic/partial/full gut), material quality, and region. Output total project cost range.`,
    solar: (s) => `${s} helps homeowners evaluate solar panel installation costs and savings. Inputs: roof size, electricity bill, sun exposure, region. Output: installation cost, monthly savings, payback period.`,
    pool: (s) => `${s} helps homeowners estimate swimming pool installation costs. Inputs: pool type (above-ground/in-ground), size, material, features. Output: total cost range and annual maintenance estimate.`,
    therapy: (s) => `${s} helps people understand therapy and counseling costs. Calculator estimates session costs based on therapy type, insurance, provider credentials, and session frequency.`,
    dental: (s) => `${s} helps people understand dental procedure costs. Calculator estimates costs based on procedure type, insurance coverage, provider type, and geographic region.`,
    insurance: (s) => `${s} helps consumers compare insurance options and estimate premiums. Calculator inputs depend on insurance type (auto/home/health/life) with appropriate risk factors.`,
    legal: (s) => `${s} helps people understand legal service costs and find appropriate representation. Calculator estimates legal fees based on case type, complexity, and billing method.`,
    ivf: (s) => `${s} helps people understand fertility treatment costs. Calculator estimates costs based on treatment type (IVF/IUI/medication), insurance coverage, number of cycles, and clinic tier.`,
    wedding: (s) => `${s} helps couples plan and budget their wedding. Calculator estimates total wedding cost based on guest count, venue type, region, and service tier.`,
    moving: (s) => `${s} helps people estimate moving costs. Calculator inputs: distance, home size, service level (DIY/partial/full-service), timing.`,
    contentCreator: (s) => `${s} helps content creators estimate potential earnings. Calculator inputs: subscriber count, subscription price, posting frequency, tip ratio.`,
};

/**
 * Infer the site's actual purpose from its domain name and niche.
 * This gives AI prompts the context needed to generate relevant content
 * instead of generic "compare {niche} options" copy.
 */
export function inferSitePurpose(domain: string, niche: string, siteName: string): string {
    const key = matchNiche(domain, niche);
    if (key) {
        const generator = SITE_PURPOSE_MAP[key];
        if (generator) return generator(siteName);
    }

    // Generic fallback using domain name analysis
    const slug = domain.replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '').replace(/[-_]/g, ' ');
    return `${siteName} is a consumer information site about ${niche}. The domain "${domain}" suggests it focuses on ${slug}. Generate content that's specifically useful for someone researching ${slug} — not generic "${niche}" content.`;
}
