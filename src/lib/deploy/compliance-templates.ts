/**
 * Compliance Page Templates — generates ready-to-insert pageDefinition records
 * for legal/compliance pages (privacy, terms, disclosures, disclaimers).
 *
 * Each page uses valid block envelopes conforming to BlockEnvelopeSchema.
 * All pages are marked as published and deploy immediately.
 */

import { randomUUID } from 'node:crypto';
import type { NewPageDefinition, Domain } from '@/lib/db/schema';

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function siteName(domain: string): string {
    return domain
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

interface ComplianceOpts {
    domainId: string;
    domainName: string;
    theme: string;
    skin: string;
}

function wrapPage(
    opts: ComplianceOpts,
    route: string,
    title: string,
    metaDescription: string,
    bodyMarkdown: string,
): NewPageDefinition {
    const name = siteName(opts.domainName);
    return {
        domainId: opts.domainId,
        route,
        title,
        metaDescription,
        theme: opts.theme,
        skin: opts.skin,
        isPublished: true,
        status: 'published' as const,
        blocks: [
            {
                id: blkId(),
                type: 'Header' as const,
                variant: 'minimal',
                content: { siteName: name, navLinks: [{ label: 'Home', href: '/' }] },
                config: { variant: 'minimal', sticky: false, showSearch: false },
            },
            {
                id: blkId(),
                type: 'ArticleBody' as const,
                content: { markdown: bodyMarkdown, title },
                config: { showTableOfContents: false, showPrintButton: false },
            },
            {
                id: blkId(),
                type: 'Footer' as const,
                variant: 'legal',
                content: { siteName: name },
                config: { variant: 'legal', showDisclaimer: true },
            },
        ],
    };
}

// ============================================================
// Individual page generators
// ============================================================

export function generatePrivacyPolicyPage(opts: ComplianceOpts): NewPageDefinition {
    const name = siteName(opts.domainName);
    const year = new Date().getFullYear();
    const md = `# Privacy Policy

**Last updated:** ${new Date().toISOString().split('T')[0]}

${name} ("we," "us," or "our") operates the website ${opts.domainName}. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.

## Information We Collect

### Information You Provide
We may collect information you voluntarily provide when you:
- Fill out a contact or inquiry form
- Subscribe to our newsletter
- Use our calculators or interactive tools
- Submit feedback or communicate with us

This may include your name, email address, phone number, and any other information you choose to provide.

### Automatically Collected Information
When you visit our website, we may automatically collect:
- Browser type and version
- Operating system
- Referring URLs and pages visited
- Time and date of your visit
- Approximate geographic location (based on IP address)

### Cookies and Tracking Technologies
We use cookies and similar technologies to enhance your experience. You can control cookie preferences through your browser settings.

## How We Use Your Information

We use collected information to:
- Provide and maintain our website
- Respond to your inquiries and requests
- Send newsletters and updates (with your consent)
- Analyze usage patterns to improve our content
- Comply with legal obligations

## Third-Party Services

We may share information with:
- **Analytics providers** (e.g., Cloudflare Analytics) to understand website traffic
- **Advertising partners** who help serve relevant content
- **Service providers** who assist in operating our website

We do not sell your personal information to third parties.

## Data Retention

We retain personal information only as long as necessary to fulfill the purposes described in this policy, unless a longer retention period is required by law.

## Your Rights

Depending on your location, you may have the right to:
- Access the personal information we hold about you
- Request correction of inaccurate information
- Request deletion of your information
- Opt out of marketing communications

## Children's Privacy

Our website is not intended for children under 13. We do not knowingly collect information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date.

## Contact Us

If you have questions about this Privacy Policy, please contact us through the contact form on our website.

*${name} | ${opts.domainName} | © ${year}*`;

    return wrapPage(opts, '/privacy-policy', `Privacy Policy | ${name}`, `Privacy policy for ${opts.domainName}. Learn how we collect, use, and protect your information.`, md);
}

export function generateTermsPage(opts: ComplianceOpts): NewPageDefinition {
    const name = siteName(opts.domainName);
    const year = new Date().getFullYear();
    const md = `# Terms of Service

**Last updated:** ${new Date().toISOString().split('T')[0]}

Please read these Terms of Service ("Terms") carefully before using ${opts.domainName} (the "Website") operated by ${name} ("we," "us," or "our").

## Acceptance of Terms

By accessing or using the Website, you agree to be bound by these Terms. If you do not agree with any part of these Terms, you may not access the Website.

## Use of the Website

### Permitted Use
You may use the Website for lawful, personal, non-commercial purposes. You agree not to:
- Use the Website in any way that violates applicable laws
- Attempt to gain unauthorized access to any portion of the Website
- Interfere with or disrupt the Website's functionality
- Use automated systems to access the Website without our permission

### Content Accuracy
We strive to provide accurate and up-to-date information. However, the content on this Website is provided for general informational purposes only. We make no warranties about the completeness, reliability, or accuracy of this information.

## Intellectual Property

All content on the Website, including text, graphics, logos, and software, is the property of ${name} or its content suppliers and is protected by intellectual property laws.

## Disclaimer of Warranties

THE WEBSITE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE WEBSITE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.

## Limitation of Liability

IN NO EVENT SHALL ${name.toUpperCase()} BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE WEBSITE.

## Third-Party Links

The Website may contain links to third-party websites. We are not responsible for the content or practices of any linked websites.

## Changes to Terms

We reserve the right to modify these Terms at any time. Changes become effective when posted on this page.

## Governing Law

These Terms shall be governed by the laws of the United States, without regard to conflict of law provisions.

## Contact

If you have questions about these Terms, please contact us through the contact form on our website.

*${name} | ${opts.domainName} | © ${year}*`;

    return wrapPage(opts, '/terms', `Terms of Service | ${name}`, `Terms of service for ${opts.domainName}. Read our terms and conditions for using this website.`, md);
}

export function generateAffiliateDisclosurePage(opts: ComplianceOpts): NewPageDefinition {
    const name = siteName(opts.domainName);
    const md = `# Affiliate Disclosure

**FTC Disclosure Compliance**

${name} (${opts.domainName}) is a participant in various affiliate advertising programs designed to provide a means for sites to earn advertising fees by advertising and linking to affiliated products and services.

## How We Make Money

Some of the links on this website are affiliate links. This means that if you click on a link and make a purchase or take a qualifying action, we may earn a commission at no additional cost to you.

## Our Commitment to You

Our editorial content is not influenced by our affiliate partnerships. We only recommend products and services that we believe provide value to our readers. Our opinions are our own.

Specifically:
- **We test and research** products before recommending them
- **Affiliate relationships do not affect** our editorial ratings or recommendations
- **We clearly disclose** when content contains affiliate links
- **Your cost is the same** whether you use our affiliate link or go directly to the provider

## Types of Compensation

We may receive compensation through:
- **Affiliate commissions** when you click a link and complete a purchase or action
- **Display advertising** through third-party ad networks
- **Sponsored content** (always clearly labeled)
- **Lead generation fees** when you submit an inquiry through our forms

## Questions?

If you have questions about our affiliate relationships or how we make money, please contact us through our website.

*This disclosure is provided in accordance with the Federal Trade Commission's 16 CFR Part 255: Guides Concerning the Use of Endorsements and Testimonials in Advertising.*`;

    return wrapPage(opts, '/disclosure', `Affiliate Disclosure | ${name}`, `FTC-compliant affiliate disclosure for ${opts.domainName}. Learn how we earn revenue and our commitment to editorial independence.`, md);
}

export function generateMedicalDisclaimerPage(opts: ComplianceOpts): NewPageDefinition {
    const name = siteName(opts.domainName);
    const blocks: NewPageDefinition['blocks'] = [
        {
            id: blkId(),
            type: 'Header' as const,
            variant: 'minimal',
            content: { siteName: name, navLinks: [{ label: 'Home', href: '/' }] },
            config: { variant: 'minimal', sticky: false, showSearch: false },
        },
        {
            id: blkId(),
            type: 'MedicalDisclaimer' as const,
            content: {
                disclaimerText: 'The information on this website is for general informational and educational purposes only. It is not intended as, and should not be understood or construed as, medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.',
                ctaText: 'Find a Healthcare Provider',
            },
            config: { showDoctorCta: true, position: 'top' },
        },
        {
            id: blkId(),
            type: 'ArticleBody' as const,
            content: {
                markdown: `# Medical Disclaimer

**Important Notice About Health Information on ${opts.domainName}**

## Not Medical Advice

The content provided on ${opts.domainName} is for informational purposes only. Nothing on this website should be construed as medical advice, diagnosis, or treatment. The information is not intended to be a substitute for professional medical advice.

## Always Consult a Professional

Before making any health-related decisions, you should:
- Consult with a qualified healthcare provider
- Discuss any medications or supplements with your doctor
- Seek emergency medical attention for urgent health concerns
- Not disregard professional medical advice based on anything you read here

## No Doctor-Patient Relationship

Use of this website does not create a doctor-patient or therapist-patient relationship. The information provided is general in nature and may not apply to your specific health situation.

## Accuracy and Currency

While we strive to provide accurate and up-to-date health information:
- Medical knowledge evolves rapidly
- Statistics and treatment guidelines may change
- Individual results may vary significantly
- We cannot guarantee the accuracy or completeness of all information

## FDA Disclaimer

Statements on this website have not been evaluated by the Food and Drug Administration. Products or supplements discussed are not intended to diagnose, treat, cure, or prevent any disease.

## Emergency Situations

If you are experiencing a medical emergency, call 911 (or your local emergency number) immediately. Do not rely on this website for emergency medical guidance.

*${name} | ${opts.domainName}*`,
                title: 'Medical Disclaimer',
            },
            config: { showTableOfContents: false, showPrintButton: false },
        },
        {
            id: blkId(),
            type: 'Footer' as const,
            variant: 'legal',
            content: { siteName: name },
            config: { variant: 'legal', showDisclaimer: true },
        },
    ];

    return {
        domainId: opts.domainId,
        route: '/medical-disclaimer',
        title: `Medical Disclaimer | ${name}`,
        metaDescription: `Medical disclaimer for ${opts.domainName}. This website provides health information for educational purposes only and is not a substitute for professional medical advice.`,
        theme: opts.theme,
        skin: opts.skin,
        isPublished: true,
        status: 'published' as const,
        blocks,
    };
}

export function generateLegalDisclaimerPage(opts: ComplianceOpts): NewPageDefinition {
    const name = siteName(opts.domainName);
    const md = `# Legal Disclaimer

**Important Notice About Legal Information on ${opts.domainName}**

## Not Legal Advice

The information provided on this website is for general informational purposes only. Nothing on ${opts.domainName} should be construed as legal advice for any individual case or situation.

## No Attorney-Client Relationship

Viewing this website or contacting us through this website does not create an attorney-client relationship. Only a signed engagement letter from a licensed attorney can establish such a relationship.

## Consult a Licensed Attorney

Legal situations are highly fact-specific. Before making any legal decisions, you should:
- Consult with a licensed attorney in your jurisdiction
- Provide complete details about your specific situation
- Understand the laws applicable in your state or locality
- Not rely solely on general information found online

## State-Specific Variations

Laws vary significantly from state to state and jurisdiction to jurisdiction. Information on this website may not apply to your location or circumstances. An attorney licensed in your state can provide guidance specific to your situation.

## Statute of Limitations

Legal claims are subject to time limitations that vary by claim type and jurisdiction. Delay in seeking legal advice may affect your rights. Consult an attorney promptly if you believe you have a legal claim.

## Results Not Guaranteed

Past results do not guarantee future outcomes. Every legal matter is different, and the outcome of any particular case depends on its specific facts and circumstances.

## Third-Party Information

This website may reference laws, regulations, court decisions, or other legal authorities. While we strive for accuracy, we cannot guarantee that all referenced information is current or complete.

*${name} | ${opts.domainName}*`;

    return wrapPage(opts, '/legal-disclaimer', `Legal Disclaimer | ${name}`, `Legal disclaimer for ${opts.domainName}. This website provides legal information for educational purposes only and does not constitute legal advice.`, md);
}

// ============================================================
// Compliance page resolver
// ============================================================

const HEALTH_KEYWORDS = ['health', 'medical', 'pharmaceutical', 'wellness', 'medication', 'clinical', 'therapy', 'vitamin', 'supplement', 'diagnosis'];
const LEGAL_KEYWORDS = ['legal', 'claims', 'disability', 'attorney', 'lawyer', 'lawsuit', 'litigation', 'injury', 'settlement', 'malpractice'];

function fieldContains(field: string | null | undefined, keywords: string[]): boolean {
    if (!field) return false;
    const lower = field.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
}

/**
 * Determine which compliance pages a domain needs and return insert-ready objects.
 * Every domain gets privacy + terms. Conditional pages based on niche, cluster, and monetization tier.
 */
export function getRequiredCompliancePages(domain: Domain): NewPageDefinition[] {
    const opts: ComplianceOpts = {
        domainId: domain.id,
        domainName: domain.domain,
        theme: 'minimal',
        skin: domain.skin || 'slate',
    };

    const pages: NewPageDefinition[] = [
        generatePrivacyPolicyPage(opts),
        generateTermsPage(opts),
    ];

    if (domain.monetizationTier != null && domain.monetizationTier <= 2) {
        pages.push(generateAffiliateDisclosurePage(opts));
    }

    if (
        fieldContains(domain.niche, HEALTH_KEYWORDS)
        || fieldContains(domain.subNiche, HEALTH_KEYWORDS)
        || fieldContains(domain.cluster, HEALTH_KEYWORDS)
    ) {
        pages.push(generateMedicalDisclaimerPage(opts));
    }

    if (
        fieldContains(domain.niche, LEGAL_KEYWORDS)
        || fieldContains(domain.subNiche, LEGAL_KEYWORDS)
        || fieldContains(domain.cluster, LEGAL_KEYWORDS)
    ) {
        pages.push(generateLegalDisclaimerPage(opts));
    }

    return pages;
}
