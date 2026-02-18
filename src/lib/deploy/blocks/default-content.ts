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
                phone: '',
                navLinks: [
                    { label: 'Home', href: '/' },
                    {
                        label: 'Resources',
                        href: '/guides',
                        children: [
                            { label: 'Guides', href: '/guides' },
                            { label: 'Calculator', href: '/calculator' },
                            { label: 'Compare', href: '/compare' },
                            { label: 'FAQ', href: '/faq' },
                        ],
                    },
                    { label: 'Reviews', href: '/reviews' },
                    { label: 'Blog', href: '/blog' },
                    { label: 'About', href: '/about' },
                ],
            },
        },
        Footer: {
            config: { showDisclaimer: true, showCookieConsent: true },
            content: {
                siteName,
                copyrightYear: year,
                disclaimerText: `All content on ${siteName} is for informational purposes only. Always consult a qualified professional before making decisions.`,
                columns: getFooterColumns(nicheLabel),
                socialLinks: [
                    { platform: 'facebook', url: '#' },
                    { platform: 'instagram', url: '#' },
                    { platform: 'twitter', url: '#' },
                    { platform: 'pinterest', url: '#' },
                    { platform: 'youtube', url: '#' },
                    { platform: 'rss', url: '#' },
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
                secondaryCtaText: 'Cost Calculator',
                secondaryCtaUrl: '/calculator',
                trustIndicators: [
                    'Free to Use',
                    'No Sign-up Required',
                    'Expert Reviewed',
                    `Updated ${year}`,
                ],
                rating: 4.8,
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
            config: { requireConsent: true, endpoint: '#', submitLabel: 'GET YOUR FREE QUOTE' },
            content: {
                heading: `Get Your Free ${capitalize(nicheLabel)} Quote`,
                subheading: `Fill out the form below and receive personalized recommendations within 24 hours. No obligation.`,
                fields: getLeadFormFields(nicheLabel),
                consentText: `I agree to receiving communications and to the Privacy Policy. Msg and data rates may apply. Opt out by replying STOP. Not a condition of purchase.`,
                privacyUrl: '/privacy',
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
        Sidebar: {
            config: { showSearch: true },
            content: {
                heading: 'Categories',
                categories: getSidebarCategories(nicheLabel),
            },
        },
        QuoteCalculator: getCalculatorDefaults(nicheLabel, year),
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
        ResourceGrid: {
            content: {
                heading: 'More Resources',
                items: [
                    { icon: '📚', title: 'Guides', description: `Browse our guides; there is something for everyone with how-tos, templates, safety tips, and more.`, href: '/guides' },
                    { icon: '🧮', title: 'Calculators', description: `Explore ${nicheLabel} calculators that build success, one calculation at a time.`, href: '/calculator' },
                    { icon: '❓', title: 'FAQ', description: `Get answers to the most frequently asked questions, clarifying any questions you might have.`, href: '/#faq' },
                    { icon: '📊', title: 'Comparisons', description: `Side-by-side comparisons designed to help you make informed decisions.`, href: '/compare' },
                    { icon: '⭐', title: 'Reviews', description: `Read verified reviews and ratings from real customers and industry experts.`, href: '/reviews' },
                ],
            },
        },
        LatestArticles: {
            content: {
                heading: 'Latest Articles',
                articles: [
                    { title: `Understanding ${capitalize(nicheLabel)}: A Complete Guide`, excerpt: `Everything you need to know about ${nicheLabel}, from basics to advanced strategies. Our comprehensive guide covers key factors, costs, and expert recommendations.`, href: '/guides/complete-guide' },
                    { title: `How to Save Money on ${capitalize(nicheLabel)}`, excerpt: `Smart strategies and insider tips to reduce your ${nicheLabel} costs without sacrificing quality. Learn what the experts recommend.`, href: '/guides/save-money' },
                    { title: `${capitalize(nicheLabel)} Mistakes to Avoid`, excerpt: `The most common and costly ${nicheLabel} mistakes people make — and how to avoid them. Don't learn these lessons the hard way.`, href: '/guides/common-mistakes' },
                ],
            },
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
// Niche-aware sidebar categories (OmniCalculator-style)
// ============================================================

interface SidebarCategory {
    icon: string;
    label: string;
    href: string;
    active?: boolean;
}

function getSidebarCategories(niche: string): SidebarCategory[] {
    const n = niche.toLowerCase();

    // Home services / construction
    if (n.match(/home|house|roof|plumb|hvac|ac unit|bath|kitchen|floor|paint|landscap|fence|garage|pool|solar|window|door|siding|insulation|renovation|remodel|construct|contract/)) {
        return [
            { icon: '🏗️', label: 'Construction', href: '/construction', active: true },
            { icon: '🔧', label: 'Repairs', href: '/repairs' },
            { icon: '💰', label: 'Cost Guides', href: '/guides' },
            { icon: '🧮', label: 'Calculators', href: '/calculator' },
            { icon: '⚡', label: 'Electrical', href: '/electrical' },
            { icon: '🚿', label: 'Plumbing', href: '/plumbing' },
            { icon: '❄️', label: 'HVAC', href: '/hvac' },
            { icon: '🏠', label: 'Remodeling', href: '/remodeling' },
            { icon: '🌿', label: 'Landscaping', href: '/landscaping' },
            { icon: '🔒', label: 'Security', href: '/security' },
            { icon: '☀️', label: 'Solar', href: '/solar' },
            { icon: '📋', label: 'Permits', href: '/permits' },
        ];
    }

    // Finance / insurance / loans
    if (n.match(/loan|mortgage|financ|insur|credit|bank|invest|tax|account|debt|budget|lending|refinanc|401k|ira/)) {
        return [
            { icon: '💵', label: 'Finance', href: '/finance', active: true },
            { icon: '🏦', label: 'Banking', href: '/banking' },
            { icon: '🏠', label: 'Mortgage', href: '/mortgage' },
            { icon: '📊', label: 'Investing', href: '/investing' },
            { icon: '🧮', label: 'Calculators', href: '/calculator' },
            { icon: '💳', label: 'Credit', href: '/credit' },
            { icon: '🛡️', label: 'Insurance', href: '/insurance' },
            { icon: '📈', label: 'Savings', href: '/savings' },
            { icon: '💼', label: 'Business', href: '/business' },
            { icon: '📑', label: 'Tax', href: '/tax' },
            { icon: '🎓', label: 'Education', href: '/education' },
            { icon: '🏥', label: 'Health', href: '/health' },
        ];
    }

    // Auto / vehicle
    if (n.match(/car|auto|vehicle|truck|suv|sedan|motor|tire|mechanic|dealer|lease/)) {
        return [
            { icon: '🚗', label: 'Cars', href: '/cars', active: true },
            { icon: '🏎️', label: 'Sports Cars', href: '/sports-cars' },
            { icon: '🚙', label: 'SUVs', href: '/suvs' },
            { icon: '🚐', label: 'Trucks', href: '/trucks' },
            { icon: '⚡', label: 'Electric', href: '/electric' },
            { icon: '🧮', label: 'Calculators', href: '/calculator' },
            { icon: '🔧', label: 'Maintenance', href: '/maintenance' },
            { icon: '🛡️', label: 'Insurance', href: '/insurance' },
            { icon: '💰', label: 'Financing', href: '/financing' },
            { icon: '📋', label: 'Reviews', href: '/reviews' },
        ];
    }

    // Health / medical
    if (n.match(/health|medic|doctor|dent|chiropract|therap|wellness|fitness|diet|nutrition|mental|rehab|pharma|hospital|clinic/)) {
        return [
            { icon: '🏥', label: 'Health', href: '/health', active: true },
            { icon: '💊', label: 'Medicine', href: '/medicine' },
            { icon: '🦷', label: 'Dental', href: '/dental' },
            { icon: '🧠', label: 'Mental Health', href: '/mental-health' },
            { icon: '💪', label: 'Fitness', href: '/fitness' },
            { icon: '🥗', label: 'Nutrition', href: '/nutrition' },
            { icon: '🧮', label: 'Calculators', href: '/calculator' },
            { icon: '🛡️', label: 'Insurance', href: '/insurance' },
            { icon: '👨‍⚕️', label: 'Find a Doctor', href: '/providers' },
            { icon: '📋', label: 'Guides', href: '/guides' },
        ];
    }

    // Business / tech
    if (n.match(/business|tech|software|saas|startup|enterprise|employ|payroll|hr|manage|office/)) {
        return [
            { icon: '💼', label: 'Business', href: '/business', active: true },
            { icon: '💻', label: 'Technology', href: '/technology' },
            { icon: '📊', label: 'Analytics', href: '/analytics' },
            { icon: '👥', label: 'HR & Payroll', href: '/hr' },
            { icon: '🧮', label: 'Calculators', href: '/calculator' },
            { icon: '📈', label: 'Marketing', href: '/marketing' },
            { icon: '🔐', label: 'Security', href: '/security' },
            { icon: '☁️', label: 'Cloud', href: '/cloud' },
            { icon: '📱', label: 'Mobile', href: '/mobile' },
            { icon: '📋', label: 'Guides', href: '/guides' },
        ];
    }

    // Default
    return [
        { icon: '📚', label: 'Guides', href: '/guides', active: true },
        { icon: '🧮', label: 'Calculators', href: '/calculator' },
        { icon: '📊', label: 'Comparisons', href: '/compare' },
        { icon: '⭐', label: 'Reviews', href: '/reviews' },
        { icon: '❓', label: 'FAQ', href: '/#faq' },
        { icon: '💰', label: 'Pricing', href: '/pricing' },
        { icon: '📰', label: 'Blog', href: '/blog' },
        { icon: '🔧', label: 'Tools', href: '/tools' },
        { icon: '📋', label: 'Resources', href: '/resources' },
        { icon: '📞', label: 'Contact', href: '/contact' },
    ];
}

// ============================================================
// Niche-aware footer columns
// ============================================================

interface FooterColumn {
    title: string;
    links: Array<{ label: string; href: string }>;
}

function getFooterColumns(niche: string): FooterColumn[] {
    const n = niche.toLowerCase();

    const companyCol: FooterColumn = {
        title: 'Company',
        links: [
            { label: 'About Us', href: '/about' },
            { label: 'Contact', href: '/contact' },
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
        ],
    };

    // Home services / construction
    if (n.match(/home|house|roof|plumb|hvac|ac unit|bath|kitchen|floor|paint|landscap|fence|garage|pool|solar|window|door|siding|insulation|renovation|remodel|construct|contract/)) {
        return [
            {
                title: 'Resources',
                links: [
                    { label: 'Cost Calculator', href: '/calculator' },
                    { label: 'Comparison Guide', href: '/compare' },
                    { label: 'How-To Guides', href: '/guides' },
                    { label: 'Reviews', href: '/reviews' },
                    { label: 'FAQ', href: '/faq' },
                ],
            },
            {
                title: 'Explore',
                links: [
                    { label: 'Blog', href: '/blog' },
                    { label: 'Resources & Tools', href: '/resources' },
                    { label: 'Pricing Guide', href: '/pricing' },
                    { label: 'Complete Guide', href: '/guides/complete-guide' },
                    { label: 'Save Money', href: '/guides/save-money' },
                ],
            },
            companyCol,
        ];
    }

    // Finance / insurance / loans
    if (n.match(/loan|mortgage|financ|insur|credit|bank|invest|tax|account|debt|budget|lending|refinanc|401k|ira/)) {
        return [
            {
                title: 'Resources',
                links: [
                    { label: 'Loan Calculator', href: '/calculator' },
                    { label: 'Rate Comparison', href: '/compare' },
                    { label: 'Financial Guides', href: '/guides' },
                    { label: 'Reviews', href: '/reviews' },
                    { label: 'FAQ', href: '/faq' },
                ],
            },
            {
                title: 'Explore',
                links: [
                    { label: 'Blog', href: '/blog' },
                    { label: 'Resources & Tools', href: '/resources' },
                    { label: 'Pricing Guide', href: '/pricing' },
                    { label: 'Complete Guide', href: '/guides/complete-guide' },
                    { label: 'Save Money Tips', href: '/guides/save-money' },
                ],
            },
            companyCol,
        ];
    }

    // Auto / vehicle
    if (n.match(/car|auto|vehicle|truck|suv|sedan|motor|tire|mechanic|dealer|lease/)) {
        return [
            {
                title: 'Resources',
                links: [
                    { label: 'Vehicle Comparison', href: '/compare' },
                    { label: 'Buyer\'s Guide', href: '/guides' },
                    { label: 'Cost Calculator', href: '/calculator' },
                    { label: 'Reviews', href: '/reviews' },
                    { label: 'FAQ', href: '/faq' },
                ],
            },
            {
                title: 'Explore',
                links: [
                    { label: 'Blog', href: '/blog' },
                    { label: 'Resources & Tools', href: '/resources' },
                    { label: 'Pricing Guide', href: '/pricing' },
                    { label: 'Complete Guide', href: '/guides/complete-guide' },
                    { label: 'Common Mistakes', href: '/guides/common-mistakes' },
                ],
            },
            companyCol,
        ];
    }

    // Health / medical
    if (n.match(/health|medic|doctor|dent|chiropract|therap|wellness|fitness|diet|nutrition|mental|rehab|pharma|hospital|clinic/)) {
        return [
            {
                title: 'Resources',
                links: [
                    { label: 'Treatment Guides', href: '/guides' },
                    { label: 'Cost Comparison', href: '/compare' },
                    { label: 'Reviews & Ratings', href: '/reviews' },
                    { label: 'Cost Estimator', href: '/calculator' },
                    { label: 'FAQ', href: '/faq' },
                ],
            },
            {
                title: 'Explore',
                links: [
                    { label: 'Blog', href: '/blog' },
                    { label: 'Resources & Tools', href: '/resources' },
                    { label: 'Pricing Guide', href: '/pricing' },
                    { label: 'Complete Guide', href: '/guides/complete-guide' },
                    { label: 'Common Mistakes', href: '/guides/common-mistakes' },
                ],
            },
            companyCol,
        ];
    }

    // Default
    return [
        {
            title: 'Resources',
            links: [
                { label: 'Guides', href: '/guides' },
                { label: 'Comparisons', href: '/compare' },
                { label: 'Cost Calculator', href: '/calculator' },
                { label: 'Reviews', href: '/reviews' },
                { label: 'FAQ', href: '/faq' },
            ],
        },
        {
            title: 'Explore',
            links: [
                { label: 'Blog', href: '/blog' },
                { label: 'Resources & Tools', href: '/resources' },
                { label: 'Pricing Guide', href: '/pricing' },
                { label: 'Complete Guide', href: '/guides/complete-guide' },
                { label: 'Save Money', href: '/guides/save-money' },
            ],
        },
        companyCol,
    ];
}

// ============================================================
// Niche-aware calculator defaults
// ============================================================

function getCalculatorDefaults(niche: string, year: number): BlockContentDefaults {
    const n = niche.toLowerCase();
    const nicheLabel = niche;

    // Finance / loan / mortgage — proper amortization calculator
    if (n.match(/loan|mortgage|financ|insur|credit|bank|invest|tax|account|debt|budget|lending|refinanc|401k|ira/)) {
        return {
            config: { scheduleType: 'amortization' },
            content: {
                heading: `${capitalize(nicheLabel)} Loan Calculator`,
                inputs: [
                    { id: 'loanAmount', label: 'Loan Amount', type: 'number', min: 1000, max: 10000000, step: 1000, default: 50000 },
                    { id: 'interestRate', label: 'Interest Rate', type: 'number', min: 0.1, max: 30, step: 0.1, default: 7 },
                    { id: 'loanTerm', label: 'Loan Term', type: 'number', min: 1, max: 30, step: 1, default: 5 },
                ],
                outputs: [
                    { id: 'monthlyPayment', label: 'Monthly Payment', format: 'currency', decimals: 2 },
                    { id: 'totalInterest', label: 'Total Interest Paid', format: 'currency', decimals: 2 },
                    { id: 'totalCost', label: 'Total Cost of Loan', format: 'currency', decimals: 2 },
                ],
                formula: '({monthlyPayment: loanAmount*(interestRate/100/12*Math.pow(1+interestRate/100/12,loanTerm*12))/(Math.pow(1+interestRate/100/12,loanTerm*12)-1), totalInterest: loanAmount*(interestRate/100/12*Math.pow(1+interestRate/100/12,loanTerm*12))/(Math.pow(1+interestRate/100/12,loanTerm*12)-1)*loanTerm*12-loanAmount, totalCost: loanAmount*(interestRate/100/12*Math.pow(1+interestRate/100/12,loanTerm*12))/(Math.pow(1+interestRate/100/12,loanTerm*12)-1)*loanTerm*12})',
                methodology: `Calculator uses standard amortization formula with ${year} market rates. Actual payments may vary based on credit score, fees, and lender terms. Consult a financial professional for personalized advice.`,
                assumptions: [
                    'Fixed interest rate for the full loan term',
                    'No additional fees or closing costs included',
                    'Monthly compounding frequency',
                    'Payments begin one month after loan origination',
                ],
            },
        };
    }

    // Home services / construction / renovation — project cost estimator
    if (n.match(/home|house|roof|plumb|hvac|ac unit|bath|kitchen|floor|paint|landscap|fence|garage|pool|solar|window|door|siding|insulation|renovation|remodel|construct|contract/)) {
        return {
            content: {
                heading: `${capitalize(nicheLabel)} Cost Estimator`,
                inputs: [
                    { id: 'area', label: 'Project Area (sq ft)', type: 'number', min: 50, max: 50000, step: 50, default: 500 },
                    { id: 'quality', label: 'Quality Level', type: 'select', options: [{ label: 'Economy', value: 8 }, { label: 'Standard', value: 15 }, { label: 'Premium', value: 28 }, { label: 'Luxury', value: 45 }] },
                    { id: 'location', label: 'Location Factor', type: 'select', options: [{ label: 'Low Cost Area', value: 0.8 }, { label: 'Average', value: 1.0 }, { label: 'High Cost Area', value: 1.3 }, { label: 'Major Metro', value: 1.6 }] },
                ],
                outputs: [
                    { id: 'estimate', label: 'Estimated Project Cost', format: 'currency', decimals: 0 },
                ],
                formula: 'area * quality * location',
                methodology: `Estimates are based on ${year} national average costs per square foot, adjusted for quality and location. Actual costs vary based on scope, materials, and contractor pricing.`,
            },
        };
    }

    // Real estate
    if (n.match(/real estate|realtor|house|property|condo|apartment|rent/)) {
        return {
            config: { scheduleType: 'amortization' },
            content: {
                heading: 'Mortgage Payment Calculator',
                inputs: [
                    { id: 'loanAmount', label: 'Home Price', type: 'number', min: 10000, max: 10000000, step: 5000, default: 350000 },
                    { id: 'interestRate', label: 'Interest Rate', type: 'number', min: 0.1, max: 15, step: 0.125, default: 6.5 },
                    { id: 'loanTerm', label: 'Loan Term (Years)', type: 'number', min: 5, max: 30, step: 5, default: 30 },
                ],
                outputs: [
                    { id: 'monthlyPayment', label: 'Monthly Payment', format: 'currency', decimals: 2 },
                    { id: 'totalInterest', label: 'Total Interest', format: 'currency', decimals: 2 },
                    { id: 'totalCost', label: 'Total Cost', format: 'currency', decimals: 2 },
                ],
                formula: '({monthlyPayment: loanAmount*(interestRate/100/12*Math.pow(1+interestRate/100/12,loanTerm*12))/(Math.pow(1+interestRate/100/12,loanTerm*12)-1), totalInterest: loanAmount*(interestRate/100/12*Math.pow(1+interestRate/100/12,loanTerm*12))/(Math.pow(1+interestRate/100/12,loanTerm*12)-1)*loanTerm*12-loanAmount, totalCost: loanAmount*(interestRate/100/12*Math.pow(1+interestRate/100/12,loanTerm*12))/(Math.pow(1+interestRate/100/12,loanTerm*12)-1)*loanTerm*12})',
                methodology: `Uses standard ${year} mortgage amortization formula. Does not include property taxes, insurance, PMI, or HOA fees. Consult a mortgage professional for a complete estimate.`,
            },
        };
    }

    // Default generic calculator
    return {
        content: {
            heading: `${capitalize(nicheLabel)} Cost Calculator`,
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
    };
}

// ============================================================
// Niche-aware lead form fields
// ============================================================

interface LeadField {
    name: string;
    label: string;
    type: string;
    required?: boolean;
    half?: boolean;
    placeholder?: string;
    options?: string[];
}

function getLeadFormFields(niche: string): LeadField[] {
    const n = niche.toLowerCase();

    const nameFields: LeadField[] = [
        { name: 'firstName', label: 'First Name', type: 'text', required: true, half: true, placeholder: 'First Name' },
        { name: 'lastName', label: 'Last Name', type: 'text', required: true, half: true, placeholder: 'Last Name' },
    ];
    const emailField: LeadField = { name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'Email Address' };
    const phoneField: LeadField = { name: 'phone', label: 'Phone Number', type: 'tel', required: false, placeholder: 'Phone Number' };
    const zipField: LeadField = { name: 'zipCode', label: 'ZIP Code', type: 'text', required: true, placeholder: 'ZIP Code' };

    // Home services / construction / renovation
    if (n.match(/home|house|roof|plumb|hvac|ac unit|bath|kitchen|floor|paint|landscap|fence|garage|pool|solar|window|door|siding|insulation|renovation|remodel|construct|contract/)) {
        return [
            ...nameFields,
            emailField,
            { name: 'projectType', label: 'Project Type', type: 'select', required: true, options: ['New Installation', 'Repair / Maintenance', 'Renovation / Remodel', 'Inspection / Consultation', 'Emergency Service'] },
            phoneField,
            zipField,
        ];
    }

    // Finance / insurance / loans
    if (n.match(/loan|mortgage|financ|insur|credit|bank|invest|tax|account|debt|budget|lending|refinanc|401k|ira/)) {
        return [
            ...nameFields,
            emailField,
            { name: 'budget', label: 'Estimated Amount', type: 'select', required: true, options: ['Under $10,000', '$10,000 - $50,000', '$50,000 - $100,000', '$100,000 - $500,000', 'Over $500,000'] },
            phoneField,
            zipField,
        ];
    }

    // Business / software / technology
    if (n.match(/software|saas|tech|app|business|enterprise|crm|erp|cloud|cyber|data|ai|automat|manag|market|seo|agency/)) {
        return [
            ...nameFields,
            emailField,
            { name: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Company' },
            { name: 'employeeSize', label: 'Employee Size', type: 'select', required: false, options: ['1-10', '11-50', '51-200', '201-1,000', '1,000+'] },
            phoneField,
        ];
    }

    // Health / medical / wellness
    if (n.match(/health|medic|doctor|dent|chiropract|therap|wellness|fitness|diet|nutrition|mental|rehab|pharma|hospital|clinic/)) {
        return [
            ...nameFields,
            emailField,
            { name: 'concern', label: 'Primary Concern', type: 'select', required: true, options: ['General Consultation', 'Second Opinion', 'Treatment Options', 'Cost Estimate', 'Insurance Question'] },
            phoneField,
            zipField,
        ];
    }

    // Auto / vehicle
    if (n.match(/car|auto|vehicle|truck|suv|sedan|motor|tire|mechanic|dealer|lease/)) {
        return [
            ...nameFields,
            emailField,
            { name: 'vehicleType', label: 'Vehicle Type', type: 'select', required: false, options: ['Car / Sedan', 'SUV / Crossover', 'Truck / Pickup', 'Van / Minivan', 'Luxury / Sports', 'Electric / Hybrid'] },
            phoneField,
            zipField,
        ];
    }

    // Legal
    if (n.match(/lawyer|legal|attorney|law firm|court|divorce|injury|estate plan|immigrat/)) {
        return [
            ...nameFields,
            emailField,
            { name: 'caseType', label: 'Case Type', type: 'select', required: true, options: ['Personal Injury', 'Family / Divorce', 'Criminal Defense', 'Estate Planning', 'Business / Corporate', 'Immigration', 'Other'] },
            phoneField,
            zipField,
        ];
    }

    // Default
    return [
        ...nameFields,
        emailField,
        phoneField,
        zipField,
    ];
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
