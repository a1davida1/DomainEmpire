/**
 * YMYL (Your Money Your Life) risk classification.
 *
 * Classifies content based on niche, keywords, and content signals
 * to determine the required level of editorial oversight.
 */

const HIGH_YMYL_NICHES = ['finance', 'legal', 'health', 'insurance', 'medical', 'tax', 'pharmaceutical'];
const MEDIUM_YMYL_NICHES = ['real_estate', 'real estate', 'education', 'government', 'safety', 'banking'];
const LOW_YMYL_NICHES = ['technology', 'business', 'marketing', 'software'];

const HIGH_YMYL_KEYWORDS = [
    'calculator', 'rates', 'law', 'diagnosis', 'treatment', 'dosage',
    'settlement', 'liability', 'malpractice', 'tax', 'irs', 'loan',
    'mortgage', 'prescription', 'symptoms', 'side effects',
];

const MEDIUM_YMYL_KEYWORDS = [
    'cost', 'price', 'invest', 'savings', 'retirement', 'credit',
    'debt', 'safety', 'risk', 'regulation', 'compliance',
];

export type YmylLevel = 'none' | 'low' | 'medium' | 'high';

export function classifyYmylLevel(opts: {
    niche?: string | null;
    keyword?: string | null;
    contentMarkdown?: string | null;
}): YmylLevel {
    const niche = (opts.niche || '').toLowerCase();
    const keyword = (opts.keyword || '').toLowerCase();
    const content = (opts.contentMarkdown || '').toLowerCase().slice(0, 3000);

    // Check niche first (strongest signal)
    if (HIGH_YMYL_NICHES.some(n => niche.includes(n))) return 'high';
    if (MEDIUM_YMYL_NICHES.some(n => niche.includes(n))) return 'medium';

    // Check keyword signals
    if (HIGH_YMYL_KEYWORDS.some(kw => keyword.includes(kw) || content.includes(kw))) return 'high';
    if (MEDIUM_YMYL_KEYWORDS.some(kw => keyword.includes(kw) || content.includes(kw))) return 'medium';

    // Low YMYL niches
    if (LOW_YMYL_NICHES.some(n => niche.includes(n))) return 'low';

    return 'none';
}
