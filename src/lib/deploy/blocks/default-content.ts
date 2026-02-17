/**
 * Default Block Content — rich placeholder content for every block type.
 *
 * Used by:
 *   1. presets.ts → seed.ts — when seeding page definitions for a domain
 *   2. site-randomizer.ts → makeBlock() — when Quick Deploy creates blocks
 *   3. VisualConfigurator.tsx — when manually adding blocks in the UI
 *
 * Content is domain-aware: pass a domain name and niche to get personalized
 * placeholder text that looks professional immediately (before AI generation).
 */

export interface BlockContentDefaults {
    content?: Record<string, unknown>;
    config?: Record<string, unknown>;
}

/**
 * Generate rich default content for a block type, personalized to a domain.
 *
 * @param type      - Block type (e.g. 'Hero', 'Header', 'FAQ')
 * @param domain    - Domain name (e.g. 'bestroofing.com')
 * @param niche     - Domain niche (e.g. 'roofing services')
 * @param variant   - Optional variant override
 */
export function getDefaultBlockContent(
    type: string,
    domain?: string,
    niche?: string,
    _variant?: string,
): BlockContentDefaults {
    const siteName = domainToSiteName(domain || 'example.com');
    const nicheLabel = niche || inferNiche(domain || 'example.com');
    const year = new Date().getFullYear();

    const defaults: Record<string, BlockContentDefaults> = {
        Header: {
            config: { sticky: true },
            content: {
                siteName,
                navLinks: [
                    { label: 'Home', href: '/' },
                    { label: 'Guides', href: '/guides' },
                    { label: 'Compare', href: '/compare' },
                    { label: 'Contact', href: '/contact' },
                ],
            },
        },
        Footer: {
            config: { showDisclaimer: true },
            content: {
                siteName,
                copyrightYear: year,
                disclaimerText: `All content on ${siteName} is for informational purposes only. Always consult a qualified professional before making decisions.`,
                columns: [
                    { title: 'Resources', links: [{ label: 'Guides', href: '/guides' }, { label: 'Calculator', href: '/calculator' }, { label: 'FAQ', href: '/#faq' }] },
                    { title: 'Company', links: [{ label: 'About Us', href: '/about' }, { label: 'Contact', href: '/contact' }] },
                    { title: 'Legal', links: [{ label: 'Privacy Policy', href: '/privacy' }, { label: 'Terms of Service', href: '/terms' }, { label: 'Disclaimer', href: '/disclaimer' }] },
                ],
            },
        },
        Hero: {
            content: {
                heading: `Your Trusted ${capitalize(nicheLabel)} Resource`,
                subheading: `Expert guides, comparisons, and tools to help you make informed ${nicheLabel} decisions. Trusted by thousands of readers.`,
                badge: `Updated ${year}`,
                ctaText: 'Explore Guides',
                ctaUrl: '/guides',
            },
        },
        ArticleBody: {
            content: {
                title: `Understanding ${capitalize(nicheLabel)}`,
                markdown: `Welcome to ${siteName} — your comprehensive resource for everything related to ${nicheLabel}. Our team of experts has put together this guide to help you navigate the most important decisions.\n\n` +
                    `## What You Need to Know\n\n` +
                    `Whether you're a first-time buyer or an experienced professional, understanding the fundamentals of ${nicheLabel} is essential. In this guide, we cover the key factors that affect quality, cost, and long-term satisfaction.\n\n` +
                    `## How We Research\n\n` +
                    `Every recommendation on ${siteName} is backed by thorough research, expert interviews, and real-world testing. We update our content regularly to ensure accuracy and relevance.`,
            },
        },
        FAQ: {
            config: { openFirst: true, emitJsonLd: true },
            content: {
                items: [
                    { question: `What should I look for when choosing ${nicheLabel}?`, answer: `Key factors include quality, pricing, reviews from verified customers, and whether the provider meets industry standards. We recommend comparing at least 3 options before deciding.` },
                    { question: `How much does ${nicheLabel} typically cost?`, answer: `Costs vary widely depending on your specific needs, location, and quality level. Use our cost calculator above for a personalized estimate based on your requirements.` },
                    { question: `Is it worth paying more for premium ${nicheLabel}?`, answer: `In many cases, yes. Premium options often come with better warranties, higher quality materials, and superior customer support. However, the best value depends on your specific situation and budget.` },
                    { question: `How often should I review my ${nicheLabel} choices?`, answer: `We recommend reviewing your options at least annually, as pricing, technology, and available providers change frequently. Our guides are updated regularly to reflect the latest market conditions.` },
                ],
            },
        },
        CTABanner: {
            content: {
                text: `Ready to find the best ${nicheLabel} for your needs? Compare top-rated options and get personalized recommendations.`,
                buttonLabel: 'Compare Options Now',
                buttonUrl: '/compare',
            },
        },
        LeadForm: {
            config: { requireConsent: true, endpoint: '#', submitLabel: 'Get My Free Quote' },
            content: {
                headline: `Get Your Free ${capitalize(nicheLabel)} Quote`,
                description: `Fill out the form below and receive personalized recommendations within 24 hours. No obligation, completely free.`,
                fields: [
                    { name: 'fullName', label: 'Full Name', type: 'text', required: true },
                    { name: 'email', label: 'Email Address', type: 'email', required: true },
                    { name: 'phone', label: 'Phone Number', type: 'tel', required: false },
                    { name: 'zipCode', label: 'ZIP Code', type: 'text', required: true },
                ],
                consentText: 'I agree to the privacy policy and consent to being contacted about my inquiry.',
                successMessage: 'Thank you! We\'ll be in touch within 24 hours.',
            },
        },
        StatGrid: {
            config: { filterable: false },
            content: {
                items: [
                    { id: 'readers', title: 'Readers Helped', metricLabel: 'Total Reach', metricValue: 95, summary: 'Over 10,000 readers have used our guides to make informed decisions.', group: 'Impact' },
                    { id: 'satisfaction', title: 'Satisfaction Rate', metricLabel: 'Satisfaction', metricValue: 98, summary: '98% of readers rate our content as helpful or very helpful.', group: 'Quality' },
                    { id: 'reviews', title: 'Expert Reviews', metricLabel: 'Coverage', metricValue: 85, summary: 'Over 150 products and services independently reviewed by our team.', group: 'Impact' },
                    { id: 'accuracy', title: 'Data Accuracy', metricLabel: 'Verified', metricValue: 99, summary: 'All data points verified against primary sources and updated regularly.', group: 'Quality' },
                ],
            },
        },
        TestimonialGrid: {
            content: {
                testimonials: [
                    { quote: `${siteName} helped me save over $2,000 by comparing options I didn't even know existed. The guides are incredibly thorough.`, author: 'Jennifer M.', title: 'Verified Reader', rating: 5 },
                    { quote: `I was overwhelmed by choices until I found this site. The comparison tools and expert recommendations made my decision easy.`, author: 'Robert K.', title: 'First-time Buyer', rating: 5 },
                    { quote: `The cost calculator was spot-on. I went in with realistic expectations and got exactly what I needed within my budget.`, author: 'Sarah L.', title: 'Small Business Owner', rating: 5 },
                ],
            },
        },
        TrustBadges: {
            content: {
                badges: [
                    { label: 'Expert Reviewed', description: `All content verified by ${nicheLabel} professionals` },
                    { label: 'Data-Driven', description: 'Recommendations backed by real market data' },
                    { label: 'Updated Regularly', description: `Content refreshed quarterly for accuracy` },
                    { label: 'Independent', description: 'Unbiased reviews with no pay-for-play' },
                ],
            },
        },
        ComparisonTable: {
            config: { sortable: true },
            content: {
                columns: [
                    { key: 'quality', label: 'Quality', type: 'rating', sortable: true },
                    { key: 'value', label: 'Value', type: 'rating', sortable: true },
                    { key: 'price', label: 'Price Range', type: 'text', sortable: true },
                ],
                options: [
                    { name: 'Premium Choice', badge: 'Editor\'s Pick', scores: { quality: 5, value: 4, price: '$$$' } },
                    { name: 'Best Value', badge: 'Best Value', scores: { quality: 4, value: 5, price: '$$' } },
                    { name: 'Budget Option', scores: { quality: 3, value: 4, price: '$' } },
                ],
                verdict: `For most people, we recommend the Best Value option — it offers the ideal balance of quality and affordability for ${nicheLabel}.`,
            },
        },
        PricingTable: {
            content: {
                plans: [
                    { name: 'Basic', price: 'Free', features: ['Core features', 'Community support', 'Basic analytics'], ctaText: 'Get Started', ctaUrl: '#' },
                    { name: 'Professional', price: '$29/mo', features: ['Everything in Basic', 'Priority support', 'Advanced analytics', 'API access', 'Custom reports'], ctaText: 'Start Free Trial', ctaUrl: '#', highlighted: true, badge: 'Most Popular' },
                    { name: 'Enterprise', price: '$99/mo', features: ['Everything in Pro', '24/7 phone support', 'Dedicated manager', 'Custom integrations', 'SLA guarantee'], ctaText: 'Contact Sales', ctaUrl: '#' },
                ],
            },
        },
        RankingList: {
            content: {
                title: `Top ${capitalize(nicheLabel)} Picks for ${year}`,
                items: [
                    { rank: 1, name: 'Best Overall', description: `Our top recommendation for most people. Excellent quality, competitive pricing, and outstanding customer service.`, rating: 4.9, badge: 'Editor\'s Choice' },
                    { rank: 2, name: 'Runner Up', description: `A close second that excels in specific areas. Great for those who prioritize value without sacrificing quality.`, rating: 4.7 },
                    { rank: 3, name: 'Best Budget', description: `The best option if you're cost-conscious. Delivers solid performance at the lowest price point.`, rating: 4.5, badge: 'Best Value' },
                ],
            },
        },
        ProsConsCard: {
            content: {
                name: `Top-Rated ${capitalize(nicheLabel)} Option`,
                rating: 4.8,
                badge: 'Editor\'s Choice',
                pros: ['Excellent quality and durability', 'Outstanding customer support', 'Competitive pricing for the tier', 'Comprehensive warranty included'],
                cons: ['Limited availability in some regions', 'Premium features require upgrade'],
                summary: `This is our top pick for most consumers. It offers an exceptional balance of quality, value, and reliability that\'s hard to beat in the ${nicheLabel} category.`,
            },
        },
        VsCard: {
            content: {
                itemA: { name: 'Option A', description: 'The premium choice for those who want the best.', pros: ['Superior quality', 'Longer warranty', 'More features'], cons: ['Higher price point', 'Longer delivery'], rating: 4.8 },
                itemB: { name: 'Option B', description: 'The value choice for budget-conscious buyers.', pros: ['Lower price', 'Faster delivery', 'Easy setup'], cons: ['Fewer features', 'Basic support only'], rating: 4.3 },
                verdict: `Option A is the better choice if budget isn't a concern. For most people, Option B offers the best value for money.`,
            },
        },
        QuoteCalculator: {
            content: {
                title: `${capitalize(nicheLabel)} Cost Calculator`,
                inputs: [
                    { id: 'quantity', label: 'Size / Quantity', type: 'number', min: 1, max: 10000, default: 100 },
                    { id: 'quality', label: 'Quality Level', type: 'select', options: [{ label: 'Basic', value: 1 }, { label: 'Standard', value: 2 }, { label: 'Premium', value: 3 }, { label: 'Luxury', value: 4 }] },
                    { id: 'location', label: 'Location Type', type: 'select', options: [{ label: 'Urban', value: 1.2 }, { label: 'Suburban', value: 1.0 }, { label: 'Rural', value: 0.85 }] },
                ],
                outputs: [
                    { id: 'estimate', label: 'Estimated Cost', format: 'currency', decimals: 0 },
                ],
                formula: 'quantity * quality * location * 15',
                methodology: `Estimates are based on current ${year} market rates, verified by industry experts. Actual costs may vary based on your specific requirements and local market conditions.`,
            },
        },
        CostBreakdown: {
            content: {
                title: `${capitalize(nicheLabel)} Cost Breakdown`,
                ranges: [
                    { label: 'Basic Package', low: 500, average: 1200, high: 2000 },
                    { label: 'Standard Package', low: 1500, average: 3000, high: 5000 },
                    { label: 'Premium Package', low: 3000, average: 6000, high: 12000 },
                ],
            },
        },
        AuthorBio: {
            content: {
                name: 'Editorial Team',
                title: `${siteName} Research Division`,
                bio: `Our editorial team consists of experienced ${nicheLabel} professionals who research, test, and review every recommendation. We prioritize accuracy, independence, and reader value in everything we publish.`,
            },
        },
        CitationBlock: {
            content: {
                sources: [
                    { title: `${capitalize(nicheLabel)} Industry Report ${year}`, url: '#', publisher: 'Market Research Institute', retrievedAt: `${year}-01-15` },
                    { title: 'Consumer Satisfaction Survey', url: '#', publisher: 'Independent Research Group', retrievedAt: `${year}-02-01` },
                ],
            },
        },
        LastUpdated: {
            content: {
                date: new Date().toISOString().split('T')[0],
                reviewedBy: 'Editorial Team',
                status: 'fresh',
            },
        },
        MedicalDisclaimer: {
            config: { showDoctorCta: true },
            content: {
                disclaimerText: 'This content is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider.',
            },
        },
        DataTable: {
            content: {
                headers: ['Provider', 'Rating', 'Starting Price', 'Coverage'],
                rows: [
                    ['Provider A', '4.9/5', '$29/mo', 'Nationwide'],
                    ['Provider B', '4.7/5', '$19/mo', '45 States'],
                    ['Provider C', '4.5/5', '$15/mo', '30 States'],
                ],
                caption: `Top ${capitalize(nicheLabel)} Providers Comparison`,
            },
        },
        Checklist: {
            config: { showProgress: true, interactive: true },
            content: {
                steps: [
                    { heading: 'Research your options', body: `Compare at least 3 ${nicheLabel} providers using our comparison tool above.` },
                    { heading: 'Check credentials', body: 'Verify licensing, insurance, and certifications for any provider you\'re considering.' },
                    { heading: 'Read reviews', body: 'Look for verified customer reviews and check complaint records with consumer protection agencies.' },
                    { heading: 'Get multiple quotes', body: 'Request detailed quotes from your top choices and compare them side by side.' },
                    { heading: 'Review the contract', body: 'Before signing, carefully review all terms, warranties, and cancellation policies.' },
                ],
            },
        },
        StepByStep: {
            config: { showProgress: true, interactive: true },
            content: {
                steps: [
                    { heading: 'Assess your needs', body: `Determine exactly what you need from a ${nicheLabel} provider based on your specific situation.` },
                    { heading: 'Set your budget', body: 'Use our cost calculator to establish a realistic budget range for your requirements.' },
                    { heading: 'Compare options', body: 'Review our comparison tables and ranking lists to narrow down your choices.' },
                    { heading: 'Make your decision', body: 'Choose the option that best balances quality, cost, and your specific priorities.' },
                ],
            },
        },
        Wizard: {
            config: { mode: 'wizard' },
            content: {
                title: `Find Your Perfect ${capitalize(nicheLabel)} Match`,
                steps: [
                    { title: 'Your Needs', description: 'Help us understand what you\'re looking for', fields: [{ label: 'Budget Range', type: 'select', options: ['Under $1,000', '$1,000-$5,000', '$5,000-$10,000', '$10,000+'] }] },
                    { title: 'Preferences', description: 'Tell us what matters most', fields: [{ label: 'Top Priority', type: 'select', options: ['Lowest Price', 'Best Quality', 'Fastest Service', 'Best Warranty'] }] },
                ],
            },
        },
        Sidebar: {
            config: { position: 'right', sticky: true },
            content: {
                sections: [
                    { title: 'Quick Links', html: '<ul><li><a href="/">Home</a></li><li><a href="/guides">Guides</a></li><li><a href="/compare">Compare</a></li></ul>' },
                    { title: 'Need Help?', html: `<p>Our team is here to help you find the best ${nicheLabel} solution. <a href="/contact">Contact us</a></p>` },
                ],
            },
        },
        InteractiveMap: {
            config: { showTileGrid: false, showDropdown: true },
            content: {
                title: `${capitalize(nicheLabel)} Service Areas`,
                regions: {
                    northeast: { label: 'Northeast', content: `${capitalize(nicheLabel)} services available throughout the Northeast region with competitive pricing and fast turnaround.` },
                    southeast: { label: 'Southeast', content: `${capitalize(nicheLabel)} coverage across the Southeast with local expertise and regional pricing.` },
                    midwest: { label: 'Midwest', content: `${capitalize(nicheLabel)} providers serving the Midwest with reliable service and value pricing.` },
                    west: { label: 'West', content: `${capitalize(nicheLabel)} options on the West Coast with premium and budget tiers available.` },
                },
                defaultRegion: 'northeast',
            },
        },
        GeoContent: {
            content: {
                regions: [
                    { id: 'us', label: 'United States', content: `${capitalize(nicheLabel)} options and pricing for US customers.` },
                    { id: 'intl', label: 'International', content: `${capitalize(nicheLabel)} options for international customers.` },
                ],
                fallback: `Browse our ${nicheLabel} guides for your region.`,
            },
        },
        PdfDownload: {
            content: {
                articleId: '',
                buttonText: `Download Free ${capitalize(nicheLabel)} Guide`,
            },
        },
        ScrollCTA: {
            config: { style: 'bar', trigger: 'scroll' },
            content: {
                text: `Looking for the best ${nicheLabel} deal?`,
                buttonLabel: 'Compare Top Picks',
                buttonUrl: '/compare',
            },
        },
        EmbedWidget: {
            content: { title: 'External Resource', embedUrl: '', embedType: 'iframe', height: '400px' },
        },
    };

    return defaults[type] || {};
}

/**
 * Merge default content into a block that may already have partial content.
 * Existing content takes precedence over defaults.
 */
export function mergeBlockDefaults(
    block: { type: string; content?: Record<string, unknown>; config?: Record<string, unknown> },
    domain?: string,
    niche?: string,
): { content: Record<string, unknown>; config: Record<string, unknown> } {
    const defaults = getDefaultBlockContent(block.type, domain, niche);
    return {
        content: { ...(defaults.content || {}), ...(block.content || {}) },
        config: { ...(defaults.config || {}), ...(block.config || {}) },
    };
}

// ============================================================
// Helpers
// ============================================================

function domainToSiteName(domain: string): string {
    return domain
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function inferNiche(domain: string): string {
    const name = domain
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '')
        .replace(/[-_]/g, ' ');
    return name || 'services';
}

function capitalize(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
}
