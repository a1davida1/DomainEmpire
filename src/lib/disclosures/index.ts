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
            howWeMoneyPage: null,
            editorialPolicyPage: null,
            aboutPage: null,
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
        howWeMoneyPage: config.howWeMoneyPage,
        editorialPolicyPage: config.editorialPolicyPage,
        aboutPage: config.aboutPage,
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
