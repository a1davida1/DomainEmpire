/**
 * Niche Market Data
 *
 * Static reference data for monetization potential, content effort,
 * risk assessment, and market sizing by niche vertical.
 *
 * RPM = Revenue Per Mille (per 1000 pageviews)
 * Values are realistic ranges based on typical display ad + affiliate performance.
 */

export interface NicheProfile {
    /** Display name */
    label: string;
    /** Revenue per 1000 pageviews [low, high] */
    rpmRange: [number, number];
    /** Average CPC for keywords in this niche */
    avgCpc: [number, number];
    /** Typical affiliate commission per conversion */
    affiliateCommission: [number, number];
    /** Lead gen value per qualified lead */
    leadGenValue: [number, number];
    /** Articles needed for basic topical authority */
    articlesForAuthority: [number, number];
    /** Typical time to first page rankings (months) */
    monthsToRank: [number, number];
    /** YMYL (Your Money Your Life) — extra scrutiny from Google */
    ymyl: boolean;
    /** Seasonal volatility (0 = evergreen, 1 = highly seasonal) */
    seasonality: number;
    /** Regulatory/legal risk score (0-1) */
    regulatoryRisk: number;
    /** Content expertise required (1 = anyone, 5 = specialist) */
    expertiseRequired: number;
    /** Best monetization models for this niche, ranked */
    bestModels: ('display' | 'affiliate' | 'leadgen' | 'saas' | 'ecommerce' | 'course')[];
    /** Approximate market growth trend */
    trend: 'growing' | 'stable' | 'declining';
}

export const NICHE_PROFILES: Record<string, NicheProfile> = {
    legal: {
        label: 'Legal / Law',
        rpmRange: [40, 90],
        avgCpc: [5, 50],
        affiliateCommission: [50, 500],
        leadGenValue: [50, 300],
        articlesForAuthority: [40, 80],
        monthsToRank: [8, 18],
        ymyl: true,
        seasonality: 0.1,
        regulatoryRisk: 0.7,
        expertiseRequired: 4,
        bestModels: ['leadgen', 'display', 'affiliate'],
        trend: 'stable',
    },
    insurance: {
        label: 'Insurance',
        rpmRange: [30, 70],
        avgCpc: [8, 60],
        affiliateCommission: [30, 200],
        leadGenValue: [20, 150],
        articlesForAuthority: [50, 100],
        monthsToRank: [10, 20],
        ymyl: true,
        seasonality: 0.2,
        regulatoryRisk: 0.8,
        expertiseRequired: 4,
        bestModels: ['leadgen', 'affiliate', 'display'],
        trend: 'stable',
    },
    health: {
        label: 'Health & Wellness',
        rpmRange: [15, 40],
        avgCpc: [2, 20],
        affiliateCommission: [10, 100],
        leadGenValue: [5, 50],
        articlesForAuthority: [60, 120],
        monthsToRank: [10, 24],
        ymyl: true,
        seasonality: 0.15,
        regulatoryRisk: 0.6,
        expertiseRequired: 4,
        bestModels: ['affiliate', 'display', 'course'],
        trend: 'growing',
    },
    finance: {
        label: 'Finance & Investing',
        rpmRange: [25, 65],
        avgCpc: [3, 40],
        affiliateCommission: [25, 300],
        leadGenValue: [15, 200],
        articlesForAuthority: [50, 100],
        monthsToRank: [8, 18],
        ymyl: true,
        seasonality: 0.2,
        regulatoryRisk: 0.7,
        expertiseRequired: 4,
        bestModels: ['affiliate', 'leadgen', 'display'],
        trend: 'growing',
    },
    tech: {
        label: 'Technology & Software',
        rpmRange: [10, 30],
        avgCpc: [1, 15],
        affiliateCommission: [20, 200],
        leadGenValue: [10, 100],
        articlesForAuthority: [30, 60],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.1,
        regulatoryRisk: 0.1,
        expertiseRequired: 3,
        bestModels: ['affiliate', 'saas', 'display'],
        trend: 'growing',
    },
    home: {
        label: 'Home Improvement',
        rpmRange: [12, 35],
        avgCpc: [2, 18],
        affiliateCommission: [15, 150],
        leadGenValue: [10, 80],
        articlesForAuthority: [40, 80],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.4,
        regulatoryRisk: 0.2,
        expertiseRequired: 2,
        bestModels: ['affiliate', 'leadgen', 'display'],
        trend: 'stable',
    },
    auto: {
        label: 'Automotive',
        rpmRange: [10, 30],
        avgCpc: [1, 12],
        affiliateCommission: [10, 100],
        leadGenValue: [5, 50],
        articlesForAuthority: [35, 70],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.2,
        regulatoryRisk: 0.1,
        expertiseRequired: 2,
        bestModels: ['affiliate', 'display', 'ecommerce'],
        trend: 'stable',
    },
    travel: {
        label: 'Travel & Tourism',
        rpmRange: [8, 25],
        avgCpc: [0.5, 8],
        affiliateCommission: [10, 80],
        leadGenValue: [5, 30],
        articlesForAuthority: [50, 100],
        monthsToRank: [8, 16],
        ymyl: false,
        seasonality: 0.7,
        regulatoryRisk: 0.1,
        expertiseRequired: 2,
        bestModels: ['affiliate', 'display'],
        trend: 'growing',
    },
    education: {
        label: 'Education & E-Learning',
        rpmRange: [8, 22],
        avgCpc: [1, 10],
        affiliateCommission: [20, 200],
        leadGenValue: [10, 60],
        articlesForAuthority: [40, 80],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.3,
        regulatoryRisk: 0.2,
        expertiseRequired: 3,
        bestModels: ['affiliate', 'course', 'display'],
        trend: 'growing',
    },
    food: {
        label: 'Food & Cooking',
        rpmRange: [10, 30],
        avgCpc: [0.5, 5],
        affiliateCommission: [5, 50],
        leadGenValue: [2, 15],
        articlesForAuthority: [60, 120],
        monthsToRank: [8, 18],
        ymyl: false,
        seasonality: 0.4,
        regulatoryRisk: 0.05,
        expertiseRequired: 1,
        bestModels: ['display', 'affiliate', 'ecommerce'],
        trend: 'stable',
    },
    pets: {
        label: 'Pets & Animals',
        rpmRange: [8, 22],
        avgCpc: [0.5, 6],
        affiliateCommission: [5, 60],
        leadGenValue: [3, 20],
        articlesForAuthority: [40, 80],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.1,
        regulatoryRisk: 0.05,
        expertiseRequired: 1,
        bestModels: ['affiliate', 'display', 'ecommerce'],
        trend: 'growing',
    },
    fitness: {
        label: 'Fitness & Exercise',
        rpmRange: [10, 28],
        avgCpc: [1, 8],
        affiliateCommission: [10, 100],
        leadGenValue: [5, 30],
        articlesForAuthority: [40, 80],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.5,
        regulatoryRisk: 0.1,
        expertiseRequired: 2,
        bestModels: ['affiliate', 'display', 'course'],
        trend: 'growing',
    },
    beauty: {
        label: 'Beauty & Skincare',
        rpmRange: [10, 28],
        avgCpc: [1, 8],
        affiliateCommission: [10, 80],
        leadGenValue: [5, 25],
        articlesForAuthority: [40, 80],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.2,
        regulatoryRisk: 0.2,
        expertiseRequired: 2,
        bestModels: ['affiliate', 'ecommerce', 'display'],
        trend: 'growing',
    },
    gaming: {
        label: 'Gaming',
        rpmRange: [5, 15],
        avgCpc: [0.3, 4],
        affiliateCommission: [5, 40],
        leadGenValue: [2, 10],
        articlesForAuthority: [60, 120],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.3,
        regulatoryRisk: 0.05,
        expertiseRequired: 2,
        bestModels: ['display', 'affiliate'],
        trend: 'stable',
    },
    general: {
        label: 'General / Unclassified',
        rpmRange: [5, 15],
        avgCpc: [0.5, 5],
        affiliateCommission: [5, 50],
        leadGenValue: [3, 20],
        articlesForAuthority: [40, 80],
        monthsToRank: [6, 14],
        ymyl: false,
        seasonality: 0.2,
        regulatoryRisk: 0.1,
        expertiseRequired: 1,
        bestModels: ['display', 'affiliate'],
        trend: 'stable',
    },
};

/**
 * Detect likely niche from domain name.
 * Uses match count (not keyword length) to avoid bias toward niches with longer keywords.
 * Short keywords (<=3 chars) require word-boundary position to prevent false positives.
 */
export function detectNiche(domainName: string): string {
    const rawName = domainName.toLowerCase().replaceAll(/\.[^.]+$/g, '');
    const cleanName = rawName.replaceAll('-', '');

    const nicheKeywords: Record<string, string[]> = {
        legal: ['law', 'legal', 'attorney', 'lawyer', 'injury', 'claim', 'lawsuit', 'court', 'justice', 'litigation'],
        insurance: ['insure', 'insurance', 'policy', 'coverage', 'premium', 'underwrite'],
        health: ['health', 'medical', 'doctor', 'clinic', 'wellness', 'therapy', 'treatment', 'symptom', 'diagnosis', 'pharma', 'dental'],
        finance: ['finance', 'loan', 'credit', 'invest', 'mortgage', 'bank', 'money', 'wealth', 'tax', 'crypto', 'stock', 'trading'],
        tech: ['tech', 'software', 'app', 'digital', 'cyber', 'cloud', 'data', 'code', 'saas', 'startup', 'ai'],
        home: ['home', 'house', 'roof', 'plumb', 'hvac', 'repair', 'remodel', 'kitchen', 'bath', 'garden', 'lawn', 'decor'],
        auto: ['auto', 'car', 'vehicle', 'truck', 'mechanic', 'tire', 'brake', 'engine', 'motor', 'drive'],
        travel: ['travel', 'hotel', 'flight', 'vacation', 'trip', 'tour', 'resort', 'cruise', 'adventure', 'destination'],
        education: ['learn', 'study', 'course', 'tutor', 'school', 'college', 'degree', 'training', 'teach', 'educate'],
        food: ['food', 'recipe', 'cook', 'meal', 'diet', 'nutrition', 'restaurant', 'bake', 'grill', 'vegan'],
        pets: ['pet', 'dog', 'cat', 'puppy', 'kitten', 'breed', 'vet', 'animal', 'fish', 'bird'],
        fitness: ['fitness', 'gym', 'workout', 'exercise', 'muscle', 'yoga', 'crossfit', 'run', 'weight'],
        beauty: ['beauty', 'skin', 'makeup', 'hair', 'cosmetic', 'nail', 'skincare', 'glow'],
        gaming: ['game', 'gaming', 'esport', 'console', 'pc', 'playstation', 'xbox', 'twitch'],
    };

    let bestMatch = 'general';
    let bestScore = 0;

    for (const [niche, keywords] of Object.entries(nicheKeywords)) {
        let score = 0;
        for (const kw of keywords) {
            const isMatch = kw.length <= 3
                // Short keywords: only match at word boundaries to avoid false positives
                // e.g., "cat" shouldn't match in "education", "ai" shouldn't match in "claim"
                ? (cleanName === kw || cleanName.startsWith(kw) || cleanName.endsWith(kw)
                    || rawName.includes(`-${kw}`) || rawName.startsWith(`${kw}-`))
                : cleanName.includes(kw);

            if (isMatch) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = niche;
        }
    }

    return bestMatch;
}

/**
 * Sub-niche keywords for more granular classification
 */
const SUB_NICHE_KEYWORDS: Record<string, Record<string, string[]>> = {
    legal: {
        'personal-injury': ['injury', 'accident', 'claim', 'slip', 'fall', 'malpractice', 'wrongful'],
        'estate-planning': ['estate', 'will', 'trust', 'probate', 'inheritance', 'executor'],
        'criminal-defense': ['criminal', 'defense', 'dui', 'dwi', 'bail', 'felony', 'misdemeanor'],
        'family-law': ['divorce', 'custody', 'family', 'child', 'alimony', 'adoption'],
        'immigration': ['immigration', 'visa', 'citizenship', 'deportation', 'asylum'],
    },
    insurance: {
        'auto-insurance': ['auto', 'car', 'vehicle', 'driver', 'collision'],
        'health-insurance': ['health', 'medical', 'dental', 'vision'],
        'home-insurance': ['home', 'house', 'property', 'flood', 'fire'],
        'life-insurance': ['life', 'term', 'whole', 'death', 'beneficiary'],
    },
    health: {
        'mental-health': ['mental', 'anxiety', 'depression', 'therapy', 'counseling', 'stress'],
        'dental': ['dental', 'dentist', 'teeth', 'orthodont', 'braces'],
        'nutrition': ['nutrition', 'vitamin', 'supplement', 'diet', 'protein'],
        'medical-conditions': ['diabetes', 'cancer', 'heart', 'arthritis', 'asthma'],
    },
    finance: {
        'personal-finance': ['budget', 'saving', 'debt', 'credit', 'frugal'],
        'investing': ['invest', 'stock', 'portfolio', 'dividend', 'etf', 'crypto'],
        'real-estate': ['mortgage', 'realty', 'property', 'rent', 'landlord'],
        'tax': ['tax', 'irs', 'deduction', 'refund', 'filing'],
    },
    tech: {
        'cybersecurity': ['cyber', 'security', 'hack', 'malware', 'vpn', 'privacy'],
        'ai-ml': ['ai', 'machine', 'learning', 'neural', 'gpt', 'llm'],
        'saas': ['saas', 'software', 'platform', 'tool', 'productivity'],
        'web-dev': ['web', 'frontend', 'react', 'javascript', 'design'],
    },
    home: {
        'roofing': ['roof', 'shingle', 'gutter', 'leak'],
        'plumbing': ['plumb', 'pipe', 'drain', 'faucet', 'water'],
        'hvac': ['hvac', 'heating', 'cooling', 'furnace', 'air'],
        'gardening': ['garden', 'lawn', 'plant', 'landscap', 'flower'],
    },
    travel: {
        'luxury-travel': ['luxury', 'resort', 'villa', 'premium', 'boutique'],
        'budget-travel': ['budget', 'cheap', 'backpack', 'hostel', 'deal'],
        'adventure-travel': ['adventure', 'hiking', 'safari', 'trek', 'expedition'],
    },
    food: {
        'baking': ['bake', 'cake', 'bread', 'pastry', 'cookie'],
        'grilling': ['grill', 'bbq', 'barbecue', 'smoke', 'charcoal'],
        'vegan': ['vegan', 'plant', 'meatless', 'dairy-free'],
    },
    fitness: {
        'yoga': ['yoga', 'meditation', 'mindful', 'stretch', 'pilates'],
        'strength': ['strength', 'muscle', 'weight', 'powerlifting', 'bodybuilding'],
        'running': ['run', 'marathon', 'jogging', 'sprint', 'trail'],
    },
};

/**
 * Detect sub-niche within a primary niche
 */
export function detectSubNiche(domainName: string, niche: string): string | undefined {
    const subNiches = SUB_NICHE_KEYWORDS[niche];
    if (!subNiches) return undefined;

    const name = domainName.toLowerCase().replaceAll(/\.[^.]+$/g, '').replaceAll('-', '');

    let bestMatch: string | undefined;
    let bestScore = 0;

    for (const [subNiche, keywords] of Object.entries(subNiches)) {
        let score = 0;
        for (const kw of keywords) {
            if (name.includes(kw)) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = subNiche;
        }
    }

    return bestMatch;
}

/**
 * Get niche profile, with fallback to 'general'
 */
export function getNicheProfile(niche: string): NicheProfile {
    return NICHE_PROFILES[niche.toLowerCase()] || NICHE_PROFILES.general;
}

/**
 * Estimate monthly revenue at different maturity stages
 */
export function estimateRevenue(
    niche: string,
    monthlyPageviews: number
): { display: number; affiliate: number; leadgen: number; total: number } {
    const profile = getNicheProfile(niche);

    // Raw potential for each channel
    const rpmMid = (profile.rpmRange[0] + profile.rpmRange[1]) / 2;
    const rawDisplay = (monthlyPageviews / 1000) * rpmMid;

    const affiliateMid = (profile.affiliateCommission[0] + profile.affiliateCommission[1]) / 2;
    const rawAffiliate = monthlyPageviews * 0.02 * 0.03 * affiliateMid; // 2% click * 3% convert

    const leadMid = (profile.leadGenValue[0] + profile.leadGenValue[1]) / 2;
    const rawLeadgen = monthlyPageviews * 0.01 * leadMid;

    // Weight by niche's best monetization models to avoid double-counting.
    // A site realistically focuses on 1-2 models: primary at full rate,
    // secondary at 40%, others at 10%.
    const MODEL_WEIGHT_BY_RANK = [1, 0.4, 0.1] as const;
    const channelWeights: Record<string, number> = { display: 0.1, affiliate: 0.1, leadgen: 0.1 };
    for (let i = 0; i < profile.bestModels.length; i++) {
        const model = profile.bestModels[i];
        if (model in channelWeights) {
            channelWeights[model] = MODEL_WEIGHT_BY_RANK[i] ?? 0.1;
        }
    }

    const display = rawDisplay * channelWeights.display;
    const affiliate = rawAffiliate * channelWeights.affiliate;
    const leadgen = rawLeadgen * channelWeights.leadgen;

    return {
        display: Math.round(display * 100) / 100,
        affiliate: Math.round(affiliate * 100) / 100,
        leadgen: Math.round(leadgen * 100) / 100,
        total: Math.round((display + affiliate + leadgen) * 100) / 100,
    };
}
