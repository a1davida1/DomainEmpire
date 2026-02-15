import { db } from '@/lib/db';
import { disclosureConfigs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type DisclosureConfig = {
    affiliateDisclosure: string | null;
    adDisclosure: string | null;
    notAdviceDisclaimer: string | null;
    howWeMoneyPage: string | null;
    editorialPolicyPage: string | null;
    aboutPage: string | null;
    showReviewedBy: boolean;
    showLastUpdated: boolean;
    showChangeLog: boolean;
    showMethodology: boolean;
};

const DEFAULT_AFFILIATE_DISCLOSURE = 'This site may contain affiliate links. We may earn a commission at no extra cost to you if you purchase through these links. Our editorial content is not influenced by affiliate partnerships.';

const DEFAULT_NOT_ADVICE = 'The information provided on this page is for educational and informational purposes only. It should not be considered professional advice. Always consult with a qualified professional before making any decisions based on this content.';

const DEFAULT_ABOUT_PAGE = 'We build practical, evidence-based guides to help readers make better decisions. Our content is written with a user-first standard: clarity, transparency, and actionability.';
const DEFAULT_EDITORIAL_POLICY_PAGE = 'Our editorial process prioritizes factual accuracy, clear sourcing, and practical usefulness. We separate editorial judgment from monetization relationships and regularly review content for freshness and quality.';
const DEFAULT_HOW_WE_MAKE_MONEY_PAGE = 'We may earn revenue through advertising and affiliate partnerships. These partnerships do not control our recommendations. We disclose monetization clearly and prioritize user outcomes over commission potential.';

export async function getDisclosureConfig(domainId: string): Promise<DisclosureConfig & { id?: string }> {
    const [config] = await db.select()
        .from(disclosureConfigs)
        .where(eq(disclosureConfigs.domainId, domainId))
        .limit(1);

    if (!config) {
        return {
            affiliateDisclosure: DEFAULT_AFFILIATE_DISCLOSURE,
            adDisclosure: null,
            notAdviceDisclaimer: DEFAULT_NOT_ADVICE,
            howWeMoneyPage: DEFAULT_HOW_WE_MAKE_MONEY_PAGE,
            editorialPolicyPage: DEFAULT_EDITORIAL_POLICY_PAGE,
            aboutPage: DEFAULT_ABOUT_PAGE,
            showReviewedBy: true,
            showLastUpdated: true,
            showChangeLog: false,
            showMethodology: true,
        };
    }

    return {
        id: config.id,
        affiliateDisclosure: config.affiliateDisclosure || DEFAULT_AFFILIATE_DISCLOSURE,
        adDisclosure: config.adDisclosure,
        notAdviceDisclaimer: config.notAdviceDisclaimer || DEFAULT_NOT_ADVICE,
        howWeMoneyPage: config.howWeMoneyPage || DEFAULT_HOW_WE_MAKE_MONEY_PAGE,
        editorialPolicyPage: config.editorialPolicyPage || DEFAULT_EDITORIAL_POLICY_PAGE,
        aboutPage: config.aboutPage || DEFAULT_ABOUT_PAGE,
        showReviewedBy: config.showReviewedBy ?? true,
        showLastUpdated: config.showLastUpdated ?? true,
        showChangeLog: config.showChangeLog ?? false,
        showMethodology: config.showMethodology ?? true,
    };
}

export async function updateDisclosureConfig(domainId: string, updates: Partial<DisclosureConfig>) {
    const [existing] = await db.select({ id: disclosureConfigs.id })
        .from(disclosureConfigs)
        .where(eq(disclosureConfigs.domainId, domainId))
        .limit(1);

    if (existing) {
        await db.update(disclosureConfigs)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(disclosureConfigs.id, existing.id));
    } else {
        await db.insert(disclosureConfigs).values({
            domainId,
            ...updates,
        });
    }
}

export function getRequiredDisclosures(opts: {
    ymylLevel: string;
    hasAffiliateLinks?: boolean;
    hasAds?: boolean;
}): string[] {
    const required: string[] = [];

    if (opts.hasAffiliateLinks) required.push('affiliate');
    if (opts.hasAds) required.push('ad');
    if (opts.ymylLevel === 'high' || opts.ymylLevel === 'medium') required.push('not_advice');

    return required;
}
