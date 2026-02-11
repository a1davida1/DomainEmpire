/**
 * Brand Quality Scorer
 *
 * Pure algorithmic scoring — zero API calls, instant results.
 * Evaluates domain name quality across multiple dimensions:
 * memorability, pronounceability, length, TLD, keyword match, etc.
 */

export interface BrandSignal {
    score: number;
    length: number;
    tld: string;
    name: string;
    isExactMatch: boolean;
    isPartialMatch: boolean;
    syllableCount: number;
    issues: string[];
    strengths: string[];
}

// TLD value — .com is king, everything else is discounted
const TLD_SCORES: Record<string, number> = {
    com: 100,
    org: 75,
    net: 65,
    co: 65,
    io: 60,
    ai: 65,
    app: 55,
    dev: 55,
    me: 50,
    info: 40,
    biz: 35,
    xyz: 30,
    online: 25,
    site: 25,
    store: 45,
    shop: 45,
    health: 55,
    law: 60,
    finance: 55,
};

// Common high-value keyword roots by niche
const NICHE_KEYWORDS: Record<string, string[]> = {
    legal: ['law', 'legal', 'attorney', 'lawyer', 'injury', 'claim', 'lawsuit', 'court', 'justice'],
    insurance: ['insure', 'insurance', 'policy', 'coverage', 'premium', 'quote', 'protect'],
    health: ['health', 'medical', 'doctor', 'clinic', 'wellness', 'care', 'therapy', 'treatment'],
    finance: ['finance', 'loan', 'credit', 'invest', 'mortgage', 'bank', 'money', 'wealth', 'tax'],
    tech: ['tech', 'software', 'app', 'digital', 'cyber', 'cloud', 'data', 'code'],
    home: ['home', 'house', 'roof', 'plumb', 'hvac', 'repair', 'remodel', 'kitchen', 'bath'],
    auto: ['auto', 'car', 'vehicle', 'truck', 'mechanic', 'tire', 'brake', 'engine'],
    travel: ['travel', 'hotel', 'flight', 'vacation', 'trip', 'tour', 'resort', 'cruise'],
    education: ['learn', 'study', 'course', 'tutor', 'school', 'college', 'degree', 'training'],
    food: ['food', 'recipe', 'cook', 'meal', 'diet', 'nutrition', 'restaurant', 'kitchen'],
};

// Consonant clusters that are hard to pronounce
const HARD_CLUSTERS = /[bcdfghjklmnpqrstvwxyz]{4,}/i;
const MODERATE_CLUSTERS = /[bcdfghjklmnpqrstvwxyz]{3}/i;

/**
 * Split domain into name and TLD
 */
function splitDomain(domain: string): { name: string; tld: string; fullTld: string } {
    const parts = domain.toLowerCase().split('.');
    if (parts.length < 2) return { name: domain.toLowerCase(), tld: '', fullTld: '' };

    // Handle compound TLDs like .co.uk, .com.au
    const compoundTlds = ['co.uk', 'com.au', 'co.nz', 'com.br', 'co.in', 'org.uk'];
    const lastTwo = parts.slice(-2).join('.');

    if (compoundTlds.includes(lastTwo) && parts.length >= 3) {
        const sld = lastTwo.split('.')[0];
        const tld = lastTwo.split('.')[1];

        // Re-importing TLD_SCORES if needed, but assuming accessible or checking keys
        // If the SLD (e.g., 'co') exists in TLD_SCORES, use it; else fallback to original logic
        return {
            name: parts.slice(0, -2).join('.'),
            tld: sld, // Default to second-level label like 'co'
            fullTld: lastTwo,
        };
    }

    return {
        name: parts.slice(0, -1).join('.'),
        tld: parts[parts.length - 1],
        fullTld: parts[parts.length - 1],
    };
}

/**
 * Estimate syllable count (rough heuristic)
 */
function countSyllables(word: string): number {
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length <= 3) return 1;

    let count = 0;
    const vowels = /[aeiouy]/;
    let prevVowel = false;

    for (const char of cleaned) {
        const isVowel = vowels.test(char);
        if (isVowel && !prevVowel) count++;
        prevVowel = isVowel;
    }

    // Adjust for silent e
    if (cleaned.endsWith('e') && count > 1) count--;
    // Adjust for -le endings
    if (cleaned.endsWith('le') && cleaned.length > 3 && !vowels.test(cleaned[cleaned.length - 3])) count++;

    return Math.max(1, count);
}

/**
 * Check if the domain name contains a dictionary-like word pattern
 */
function isPronounceable(name: string): boolean {
    const cleaned = name.replace(/-/g, '');
    if (!cleaned || cleaned.length === 0) return false;

    if (HARD_CLUSTERS.test(cleaned)) return false;

    // Check vowel distribution — names with no vowels are unpronounceable
    const vowelCount = (cleaned.match(/[aeiouy]/gi) || []).length;
    const ratio = vowelCount / Math.max(1, cleaned.length);

    return ratio >= 0.2 && ratio <= 0.8;
}

/**
 * Check if domain contains a keyword match for a niche
 */
function checkKeywordMatch(name: string, niche?: string): { exact: boolean; partial: boolean; matchedKeywords: string[] } {
    const cleanName = name.toLowerCase().replaceAll('-', '');
    const matched: string[] = [];

    // Check all niches for matches
    const nichesToCheck = niche
        ? [niche, ...Object.keys(NICHE_KEYWORDS)]
        : Object.keys(NICHE_KEYWORDS);

    const seen = new Set<string>();
    for (const n of nichesToCheck) {
        const keywords = NICHE_KEYWORDS[n] || [];
        for (const kw of keywords) {
            if (seen.has(kw)) continue;
            seen.add(kw);

            // Short keywords (<=3 chars) require boundary position to avoid false positives
            // e.g., "car" shouldn't match "scar", "tax" shouldn't match "taxidermy" (well, it would at start)
            const isMatch = kw.length <= 3
                ? (cleanName === kw || cleanName.startsWith(kw) || cleanName.endsWith(kw)
                    || name.includes(`-${kw}-`) || name.startsWith(`${kw}-`) || name.endsWith(`-${kw}`))
                : cleanName.includes(kw);

            if (isMatch) matched.push(kw);
        }
    }

    // Exact match = the domain name IS a keyword (e.g., "bestlawnmowers")
    const isExact = matched.some(kw => cleanName === kw || cleanName === kw + 's');

    return { exact: isExact, partial: matched.length > 0, matchedKeywords: matched };
}

/**
 * Score a domain's brand quality (0-100)
 */
export function scoreBrandQuality(domain: string, niche?: string): BrandSignal {
    const { name, tld } = splitDomain(domain);
    const issues: string[] = [];
    const strengths: string[] = [];
    let score = 0;

    // === 1. TLD Score (0-20 points) ===
    const tldBase = TLD_SCORES[tld] ?? 20;
    const tldScore = Math.round(tldBase / 5); // Scale to 0-20
    score += tldScore;

    if (tld === 'com') strengths.push('.com TLD — maximum trust and resale value');
    else if (tldBase >= 60) strengths.push(`.${tld} is a respectable TLD`);
    else issues.push(`.${tld} TLD limits perceived trust and resale value`);

    // === 2. Length Score (0-20 points) ===
    const nameLen = name.replace(/-/g, '').length;
    let lengthScore: number;

    if (nameLen <= 5) { lengthScore = 20; strengths.push(`Very short name (${nameLen} chars) — premium`); }
    else if (nameLen <= 8) { lengthScore = 18; strengths.push(`Short name (${nameLen} chars) — easy to remember`); }
    else if (nameLen <= 12) { lengthScore = 15; }
    else if (nameLen <= 16) { lengthScore = 10; issues.push(`Name is ${nameLen} chars — getting long`); }
    else if (nameLen <= 20) { lengthScore = 5; issues.push(`Name is ${nameLen} chars — hard to remember`); }
    else { lengthScore = 2; issues.push(`Name is ${nameLen} chars — too long for a brandable domain`); }

    score += lengthScore;

    // === 3. Memorability Score (0-20 points) ===
    let memScore = 20;

    // Hyphens
    const hyphenCount = (name.match(/-/g) || []).length;
    if (hyphenCount >= 3) { memScore -= 15; issues.push(`${hyphenCount} hyphens — very hard to communicate verbally`); }
    else if (hyphenCount === 2) { memScore -= 10; issues.push('Two hyphens hurt memorability'); }
    else if (hyphenCount === 1) { memScore -= 5; issues.push('Hyphen reduces memorability slightly'); }

    // Numbers
    if (/\d/.test(name)) {
        memScore -= 8;
        issues.push('Numbers in domain name cause confusion (spelled out vs digit)');
    }

    // Double characters that cause spelling confusion
    if (/(.)\1{2,}/.test(name)) { memScore -= 5; issues.push('Triple+ repeated letters hurt spellability'); }

    // Pronounceability
    const pronounceable = isPronounceable(name);
    if (!pronounceable) { memScore -= 10; issues.push('Consonant clusters make it hard to pronounce'); }
    else strengths.push('Name is pronounceable');

    if (MODERATE_CLUSTERS.test(name.replace(/-/g, '')) && pronounceable) {
        memScore -= 3;
    }

    score += Math.max(0, memScore);

    // === 4. Keyword Signal (0-20 points) ===
    const kwMatch = checkKeywordMatch(name, niche);
    let kwScore = 0;

    if (kwMatch.exact) { kwScore = 20; strengths.push(`Exact match keyword domain: "${kwMatch.matchedKeywords[0]}"`); }
    else if (kwMatch.matchedKeywords.length >= 2) { kwScore = 15; strengths.push(`Multiple keyword matches: ${kwMatch.matchedKeywords.join(', ')}`); }
    else if (kwMatch.partial) { kwScore = 10; strengths.push(`Contains keyword: "${kwMatch.matchedKeywords[0]}"`); }
    else { kwScore = 3; } // Generic/brandable names get a small base

    score += kwScore;

    // === 5. Brandability Score (0-20 points) ===
    let brandScore = 10; // Start at midpoint

    const syllables = countSyllables(name.replace(/-/g, ''));

    // Syllable count
    if (syllables <= 2) { brandScore += 5; strengths.push(`${syllables}-syllable name — easy to say`); }
    else if (syllables === 3) { brandScore += 2; }
    else if (syllables >= 5) { brandScore -= 5; issues.push(`${syllables} syllables — hard to say in conversation`); }

    // Ends in a common brandable suffix
    const brandSuffixes = ['ly', 'ify', 'hub', 'stack', 'base', 'lab', 'box', 'spot', 'zone', 'wise'];
    if (brandSuffixes.some(s => name.endsWith(s))) {
        brandScore += 3;
        strengths.push('Brandable suffix pattern');
    }

    // Real English word bonus
    const commonWords = ['best', 'top', 'pro', 'smart', 'fast', 'easy', 'simple', 'prime', 'first', 'super'];
    if (commonWords.some(w => name.startsWith(w) || name.endsWith(w))) {
        brandScore += 2;
        strengths.push('Contains a strong modifier word');
    }

    score += Math.max(0, Math.min(20, brandScore));

    return {
        score: Math.max(0, Math.min(100, score)),
        length: nameLen,
        tld,
        name,
        isExactMatch: kwMatch.exact,
        isPartialMatch: kwMatch.partial,
        syllableCount: syllables,
        issues,
        strengths,
    };
}
