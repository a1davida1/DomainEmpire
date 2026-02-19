/**
 * Sub-Page Presets — block compositions for ~20 sub-pages per domain.
 *
 * Each domain gets a full site structure with unique pages:
 *   - Guide hub + 3 guide articles
 *   - Calculator page
 *   - Comparison page
 *   - Reviews page
 *   - FAQ page
 *   - About page
 *   - Contact page
 *   - Privacy & Terms (legal)
 *   - Blog listing
 *   - Resources hub
 *   - Pricing page
 *   - 2-3 niche-specific pages
 *
 * All content is niche-aware and domain-personalized.
 */

import { randomUUID } from 'crypto';
import type { BlockType } from './schemas';
import { mergeBlockDefaults } from './default-content';

interface PresetBlock {
    type: BlockType;
    variant?: string;
    config?: Record<string, unknown>;
    content?: Record<string, unknown>;
}

interface SubPageDefinition {
    route: string;
    title: string;
    metaDescription: string;
    blocks: PresetBlock[];
}

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function capitalize(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
}

function domainToSiteName(domain: string): string {
    return domain
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================
// Sub-page generators
// ============================================================

function guidesHub(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/guides',
        title: `${n} Guides & How-Tos`,
        metaDescription: `Expert ${niche} guides covering everything from basics to advanced strategies. Written by industry professionals.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `${n} Guides & Resources`,
                subheading: `In-depth guides written by ${niche} experts. From beginner basics to advanced strategies, find the information you need to make smart decisions.`,
                badge: `${new Date().getFullYear()} Edition`,
                ctaText: 'Browse All Guides',
                ctaUrl: '#guides',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'LatestArticles', content: {
                heading: 'Featured Guides',
                articles: [
                    { title: `The Complete ${n} Guide`, excerpt: `Everything you need to know about ${niche} — from choosing the right options to getting the best value. Our most comprehensive resource.`, href: '/guides/complete-guide' },
                    { title: `How to Save Money on ${n}`, excerpt: `Proven strategies to reduce your ${niche} costs without compromising on quality. Tips from industry insiders.`, href: '/guides/save-money' },
                    { title: `${n} Mistakes to Avoid`, excerpt: `The most common and costly ${niche} mistakes — and how to avoid them. Learn from others' experiences.`, href: '/guides/common-mistakes' },
                ],
            }},
            { type: 'ResourceGrid', content: {
                heading: 'Explore by Topic',
                items: [
                    { icon: '📖', title: 'Beginner Guide', description: `New to ${niche}? Start here for the essentials.`, href: '/guides/complete-guide' },
                    { icon: '💰', title: 'Cost Saving Tips', description: 'Smart ways to save without sacrificing quality.', href: '/guides/save-money' },
                    { icon: '⚠️', title: 'Common Mistakes', description: 'Pitfalls to watch out for and how to avoid them.', href: '/guides/common-mistakes' },
                    { icon: '🧮', title: 'Cost Calculator', description: 'Get an instant estimate for your project.', href: '/calculator' },
                    { icon: '📊', title: 'Comparisons', description: 'Side-by-side analysis of top options.', href: '/compare' },
                ],
            }},
            { type: 'CTABanner', content: {
                text: `Need personalized ${niche} recommendations? Our experts can help.`,
                buttonLabel: 'Get Free Advice',
                buttonUrl: '/contact',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function guideComplete(niche: string, siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    const year = new Date().getFullYear();
    return {
        route: '/guides/complete-guide',
        title: `The Complete ${n} Guide (${year})`,
        metaDescription: `A comprehensive ${niche} guide covering costs, options, and expert recommendations. Updated for ${year}.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `The Complete ${n} Guide`,
                subheading: `Everything you need to know about ${niche} — from choosing the right options to understanding costs and timelines. Updated ${year}.`,
                badge: `Comprehensive Guide`,
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'LastUpdated' },
            { type: 'ArticleBody', content: {
                title: `Understanding ${n}: The Complete Guide`,
                markdown: `## Introduction\n\nWhether you're new to ${niche} or looking to upgrade your current situation, this comprehensive guide will walk you through everything you need to know. At ${siteName}, we've spent years researching and reviewing the best ${niche} options on the market.\n\n` +
                    `## What Is ${n}?\n\n${n} encompasses a range of products, services, and solutions designed to meet your specific needs. Understanding the fundamentals will help you make better decisions and avoid common pitfalls.\n\n` +
                    `## Key Factors to Consider\n\n### 1. Quality & Reliability\nNot all ${niche} options are created equal. Look for established providers with verified track records, industry certifications, and transparent pricing.\n\n` +
                    `### 2. Cost vs. Value\nThe cheapest option isn't always the best value. Consider the total cost of ownership, including maintenance, support, and long-term performance. Our [cost calculator](/calculator) can help you estimate total costs.\n\n` +
                    `### 3. Reviews & Reputation\nCheck our [verified reviews](/reviews) and independent ratings. Look for consistent patterns in customer feedback rather than individual outliers.\n\n` +
                    `### 4. Warranty & Support\nA strong warranty and responsive customer support can save you thousands in the long run. We recommend providers that offer at least a standard industry warranty.\n\n` +
                    `## How to Choose the Right ${n}\n\nThe best ${niche} option depends on your specific needs, budget, and timeline. Here's our recommended approach:\n\n` +
                    `1. **Define your requirements** — What exactly do you need?\n2. **Set a realistic budget** — Use our [calculator](/calculator) for estimates\n3. **Compare options** — Check our [comparison page](/compare)\n4. **Read reviews** — Visit our [reviews section](/reviews)\n5. **Get quotes** — Contact multiple providers for competitive pricing\n\n` +
                    `## Conclusion\n\nMaking the right ${niche} decision doesn't have to be overwhelming. Use the resources throughout ${siteName} — our guides, calculators, and comparison tools — to research your options thoroughly before committing.\n\n` +
                    `Ready to get started? [Compare top options](/compare) or [calculate your costs](/calculator).`,
            }},
            { type: 'TrustBadges' },
            { type: 'AuthorBio' },
            { type: 'CitationBlock' },
            { type: 'CTABanner', config: { style: 'bar', trigger: 'scroll' }, content: {
                text: `Found this guide helpful? Compare top-rated ${niche} options now.`,
                buttonLabel: 'Compare Options',
                buttonUrl: '/compare',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function guideSaveMoney(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/guides/save-money',
        title: `How to Save Money on ${n}`,
        metaDescription: `Proven strategies to reduce ${niche} costs without sacrificing quality. Expert tips and insider advice.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `How to Save Money on ${n}`,
                subheading: `Smart strategies from industry experts to help you get the best ${niche} value without overpaying.`,
                badge: 'Money-Saving Guide',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'LastUpdated' },
            { type: 'ArticleBody', content: {
                title: `Save Money on ${n}`,
                markdown: `## Why Most People Overpay for ${n}\n\nStudies show that consumers typically overpay by 15-30% for ${niche} because they don't compare options or negotiate effectively. Here's how to avoid that.\n\n` +
                    `## Top Money-Saving Strategies\n\n### 1. Compare Multiple Providers\nGetting quotes from at least 3-5 providers can save you 20% or more. Use our [comparison tool](/compare) to see options side by side.\n\n` +
                    `### 2. Time Your Purchase\nMany ${niche} providers offer seasonal discounts. Off-peak periods typically see lower prices and better availability.\n\n` +
                    `### 3. Bundle Services\nIf you need multiple services, bundling them with one provider often results in significant discounts.\n\n` +
                    `### 4. Negotiate\nDon't accept the first price you're quoted. Most providers have room to negotiate, especially if you've done your research.\n\n` +
                    `### 5. Check for Hidden Fees\nAlways ask for an itemized quote. Hidden fees can add 10-15% to your total cost.\n\n` +
                    `## Use Our Free Tools\n\n- **[Cost Calculator](/calculator)** — Get an instant estimate for your specific needs\n- **[Comparison Guide](/compare)** — See how top providers stack up\n- **[Reviews](/reviews)** — Read what real customers are paying\n\n` +
                    `## Bottom Line\n\nWith the right approach, you can save significantly on ${niche} without compromising quality. Start by using our [calculator](/calculator) to understand fair pricing for your area.`,
            }},
            { type: 'FAQ', content: {
                items: [
                    { question: `What's the average cost of ${niche}?`, answer: `Costs vary widely based on scope, location, and quality. Use our [cost calculator](/calculator) for a personalized estimate. Most customers pay between the middle and high ranges.` },
                    { question: `Is it worth paying more for premium ${niche}?`, answer: `Often yes — premium options typically offer better warranties, higher quality, and lower long-term costs. However, mid-range options can offer excellent value.` },
                    { question: `When is the best time to buy ${niche}?`, answer: `Off-season periods typically offer the best deals. For most categories, late fall and winter see lower demand and better pricing.` },
                ],
            }},
            { type: 'CTABanner', config: { style: 'card', trigger: 'scroll' }, content: {
                text: `Ready to find the best deal? Calculate your costs and compare options.`,
                buttonLabel: 'Calculate Costs',
                buttonUrl: '/calculator',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function guideMistakes(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/guides/common-mistakes',
        title: `${n} Mistakes to Avoid`,
        metaDescription: `The most common ${niche} mistakes and how to avoid them. Learn from expert advice and real customer experiences.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `Common ${n} Mistakes to Avoid`,
                subheading: `Don't learn these lessons the hard way. Our experts break down the most costly ${niche} pitfalls and how to steer clear of them.`,
                badge: 'Expert Advice',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'LastUpdated' },
            { type: 'Checklist', content: {
                title: `${n} Mistake Avoidance Checklist`,
                steps: [
                    { label: 'Get at least 3 competitive quotes before deciding', done: false },
                    { label: 'Verify provider licenses and insurance', done: false },
                    { label: 'Check reviews from multiple independent sources', done: false },
                    { label: 'Read the fine print — especially warranty terms', done: false },
                    { label: 'Ask about hidden fees and total cost of ownership', done: false },
                    { label: 'Don\'t automatically choose the cheapest option', done: false },
                    { label: 'Document everything in writing', done: false },
                ],
            }},
            { type: 'ArticleBody', content: {
                title: `Mistakes to Avoid`,
                markdown: `## Mistake #1: Not Comparing Options\n\nThe single biggest mistake is choosing the first option you find. Research shows that comparing at least 3 providers saves an average of 20%. Start with our [comparison tool](/compare).\n\n` +
                    `## Mistake #2: Focusing Only on Price\n\nThe cheapest option often ends up costing more long-term through poor quality, lack of support, and hidden fees. Look at total value, not just upfront cost.\n\n` +
                    `## Mistake #3: Ignoring Reviews\n\nReal customer experiences are invaluable. Check our [reviews page](/reviews) for verified feedback from people who've been in your situation.\n\n` +
                    `## Mistake #4: Skipping the Research Phase\n\nRushing into a decision without understanding your options leads to regret. Spend time reading our [complete guide](/guides/complete-guide) before committing.\n\n` +
                    `## Mistake #5: Not Using Available Tools\n\nFree resources like our [cost calculator](/calculator) and [comparison guides](/compare) exist specifically to help you avoid costly mistakes. Use them.\n\n` +
                    `## How to Protect Yourself\n\n1. Do your homework using our guides and tools\n2. Get everything in writing\n3. Verify credentials and references\n4. Don't rush — good decisions take time\n5. Trust verified reviews over marketing claims`,
            }},
            { type: 'CTABanner', config: { style: 'bar', trigger: 'scroll' }, content: {
                text: 'Make an informed decision — compare verified options today.',
                buttonLabel: 'Compare Options',
                buttonUrl: '/compare',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function calculatorPage(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/calculator',
        title: `${n} Cost Calculator`,
        metaDescription: `Free ${niche} cost calculator. Get instant estimates based on your specific needs, location, and preferences.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `${n} Cost Calculator`,
                subheading: `Get an instant, personalized cost estimate for your ${niche} needs. Adjust the inputs below to see real-time results.`,
                badge: 'Free Tool',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'QuoteCalculator' },
            { type: 'CostBreakdown' },
            { type: 'ArticleBody', content: {
                title: 'How to Use This Calculator',
                markdown: `## About Our Calculator\n\nOur ${niche} cost calculator uses current market data and industry benchmarks to provide accurate estimates. While actual costs may vary, this tool gives you a solid starting point for budgeting.\n\n` +
                    `## What Affects ${n} Costs?\n\nSeveral factors influence your total cost:\n\n` +
                    `- **Scope** — Larger projects naturally cost more\n` +
                    `- **Quality** — Premium options come at a premium price\n` +
                    `- **Location** — Costs vary significantly by region\n` +
                    `- **Timing** — Seasonal demand affects pricing\n` +
                    `- **Provider** — Prices vary 20-40% between providers\n\n` +
                    `## Next Steps\n\nAfter getting your estimate:\n1. [Compare top providers](/compare) in our directory\n2. [Read reviews](/reviews) from verified customers\n3. [Contact us](/contact) for personalized recommendations`,
            }},
            { type: 'FAQ', content: {
                items: [
                    { question: 'How accurate is this calculator?', answer: 'Our calculator uses current market data and is typically accurate within 10-15% of actual costs. For a precise quote, we recommend contacting providers directly.' },
                    { question: 'What if my estimate seems too high?', answer: `Check our [money-saving guide](/guides/save-money) for strategies to reduce costs. Getting multiple quotes is the best way to ensure competitive pricing.` },
                    { question: 'Can I save my calculation?', answer: 'You can download your amortization schedule as Excel or CSV using the buttons below the table. You can also bookmark this page with your current inputs.' },
                ],
            }},
            { type: 'LeadForm', content: {
                heading: 'Get a Free Personalized Quote',
                subheading: `Want an exact price? Fill out the form and we'll connect you with top-rated ${niche} providers in your area.`,
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function comparePage(niche: string, siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    const year = new Date().getFullYear();
    return {
        route: '/compare',
        title: `Compare ${n} Options (${year})`,
        metaDescription: `Side-by-side ${niche} comparisons. Compare quality, pricing, and features to find the best option for your needs.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `Compare ${n} Options`,
                subheading: `Side-by-side comparisons of the top ${niche} providers, updated for ${year}. Find the best fit for your needs and budget.`,
                badge: `${year} Comparison`,
                ctaText: 'Jump to Comparison',
                ctaUrl: '#comparison',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'ComparisonTable', config: { variant: 'table', sortable: true } },
            { type: 'VsCard' },
            { type: 'ArticleBody', content: {
                title: 'How We Compare',
                markdown: `## Our Comparison Methodology\n\nEvery comparison on ${siteName} follows a rigorous methodology:\n\n` +
                    `1. **Independent Testing** — We test and evaluate each option independently\n2. **Verified Data** — All pricing and feature data is verified directly with providers\n3. **Regular Updates** — Comparisons are updated quarterly to reflect current offerings\n4. **No Pay-for-Play** — Our rankings are never influenced by advertising\n\n` +
                    `## Which Option Is Right for You?\n\nThe best choice depends on your specific needs:\n- **On a tight budget?** Focus on our Best Value picks\n- **Want the best quality?** Check our Premium tier recommendations\n- **Need it fast?** Look at availability and turnaround times\n\n` +
                    `Use our [calculator](/calculator) to estimate costs for your specific situation, or read our [complete guide](/guides/complete-guide) for a deeper understanding.`,
            }},
            { type: 'FAQ', content: {
                items: [
                    { question: 'How often are comparisons updated?', answer: `We update our comparisons quarterly and whenever significant changes occur. The "Last Updated" date at the top shows when the data was last verified.` },
                    { question: 'Do you accept payment for rankings?', answer: `No. Our comparisons are 100% independent. While we may earn commissions from some providers, this never influences our rankings or ratings.` },
                    { question: 'How do you test and evaluate options?', answer: `Our team uses a standardized evaluation framework covering quality, value, customer service, features, and reputation. Each factor is weighted and scored objectively.` },
                ],
            }},
            { type: 'CTABanner', config: { style: 'card', trigger: 'scroll' }, content: {
                text: `Found the right option? Get a personalized quote today.`,
                buttonLabel: 'Get Free Quotes',
                buttonUrl: '/contact',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function reviewsPage(niche: string, siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    const year = new Date().getFullYear();
    return {
        route: '/reviews',
        title: `${n} Reviews & Ratings (${year})`,
        metaDescription: `Honest ${niche} reviews from verified customers and industry experts. Unbiased ratings and recommendations.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `${n} Reviews & Ratings`,
                subheading: `Honest, unbiased reviews from verified customers and our expert editorial team. Updated regularly for ${year}.`,
                badge: 'Independent Reviews',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'RankingList' },
            { type: 'ProsConsCard' },
            { type: 'TestimonialGrid' },
            { type: 'TrustBadges' },
            { type: 'ArticleBody', content: {
                title: 'How We Review',
                markdown: `## Our Review Process\n\n${siteName} reviews are based on extensive research, real customer feedback, and when possible, hands-on testing.\n\n` +
                    `### What We Evaluate\n- **Quality & Performance** — Does it deliver on its promises?\n- **Value for Money** — Is the pricing fair for what you get?\n- **Customer Service** — How responsive and helpful is support?\n- **Reputation** — What do verified customers say?\n\n` +
                    `All reviews are independently conducted. We do not accept payment for positive reviews.`,
            }},
            { type: 'CTABanner', config: { style: 'banner', trigger: 'scroll' }, content: {
                text: `Ready to choose? Compare the top-rated options side by side.`,
                buttonLabel: 'Compare Top Options',
                buttonUrl: '/compare',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function faqPage(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/faq',
        title: `${n} FAQ — Frequently Asked Questions`,
        metaDescription: `Answers to the most common ${niche} questions. Expert answers to help you make informed decisions.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `${n} FAQ`,
                subheading: `Get answers to the most frequently asked ${niche} questions. Can't find what you're looking for? [Contact us](/contact).`,
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'FAQ', config: { openFirst: true, emitJsonLd: true }, content: {
                items: [
                    { question: `What is the best ${niche} option?`, answer: `The best option depends on your specific needs and budget. Check our [comparison page](/compare) for a detailed side-by-side analysis, or use our [calculator](/calculator) to see what fits your budget.` },
                    { question: `How much does ${niche} cost?`, answer: `Costs vary widely based on scope, quality, and location. Use our [cost calculator](/calculator) for a personalized estimate. On average, most people spend between the mid and high range.` },
                    { question: `Is ${niche} worth the investment?`, answer: `In most cases, yes. Quality ${niche} pays for itself through better performance, longevity, and peace of mind. Read our [complete guide](/guides/complete-guide) for a detailed analysis.` },
                    { question: `How do I choose between ${niche} providers?`, answer: `Start by reading our [reviews](/reviews) and [comparisons](/compare). Key factors include quality, pricing, customer service, and warranty. Getting multiple quotes is always recommended.` },
                    { question: `What mistakes should I avoid?`, answer: `The most common mistakes include not comparing options, focusing only on price, and not reading the fine print. Read our [mistakes to avoid guide](/guides/common-mistakes) for the full list.` },
                    { question: `How often should I reassess my ${niche} choices?`, answer: `We recommend reviewing your options at least annually. Market conditions, pricing, and available providers change frequently. Bookmark our [comparison page](/compare) for easy reference.` },
                    { question: `Can I get a personalized recommendation?`, answer: `Yes! [Contact us](/contact) with your specific needs and budget, and our team will provide personalized recommendations based on our research.` },
                    { question: `How do you keep your information up to date?`, answer: `Our editorial team reviews and updates all content quarterly. We also monitor industry changes and update immediately when significant changes occur. Check the "Last Updated" date on any page.` },
                ],
            }},
            { type: 'CTABanner', content: {
                text: `Still have questions? Our experts are here to help.`,
                buttonLabel: 'Contact Us',
                buttonUrl: '/contact',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function aboutPage(niche: string, siteName: string): SubPageDefinition {
    const _n = capitalize(niche);
    const _year = new Date().getFullYear();
    return {
        route: '/about',
        title: `About ${siteName}`,
        metaDescription: `Learn about ${siteName} — your trusted ${niche} resource. Our mission, team, and commitment to independent research.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `About ${siteName}`,
                subheading: `We're on a mission to help you make smarter ${niche} decisions through independent research, expert analysis, and free tools.`,
            }},
            { type: 'StatGrid', content: {
                items: [
                    { id: 'readers', title: 'Readers Helped', metricLabel: 'Total Reach', metricValue: 95, summary: 'Over 10,000 readers have used our guides and tools to make informed decisions.', group: 'Impact' },
                    { id: 'guides', title: 'Expert Guides', metricLabel: 'Published', metricValue: 90, summary: 'Comprehensive guides covering every aspect of the industry.', group: 'Content' },
                    { id: 'reviews', title: 'Independent Reviews', metricLabel: 'Verified', metricValue: 85, summary: 'Every review is independently conducted with no pay-for-play.', group: 'Quality' },
                    { id: 'accuracy', title: 'Data Accuracy', metricLabel: 'Verified', metricValue: 99, summary: 'All data points verified and updated quarterly.', group: 'Quality' },
                ],
            }},
            { type: 'ArticleBody', content: {
                title: 'Our Story',
                markdown: `## Who We Are\n\n${siteName} was founded with a simple mission: make ${niche} decisions easier. We believe everyone deserves access to unbiased, expert information — not sales pitches.\n\n` +
                    `## What We Do\n\nOur team of ${niche} researchers and writers creates:\n\n` +
                    `- **In-Depth Guides** — Comprehensive resources covering every aspect of ${niche}\n` +
                    `- **Independent Reviews** — Honest assessments with no pay-for-play\n` +
                    `- **Free Tools** — Cost calculators, comparison charts, and decision wizards\n` +
                    `- **Expert Analysis** — Data-driven insights from industry professionals\n\n` +
                    `## Our Standards\n\n### Independence\nWe never accept payment for positive reviews or rankings. Our recommendations are based solely on merit.\n\n` +
                    `### Accuracy\nEvery fact, price, and claim is verified against primary sources. We update content quarterly and mark all changes.\n\n` +
                    `### Transparency\nWe clearly disclose our [methodology](/guides/complete-guide), [sources](/guides), and any potential conflicts of interest.\n\n` +
                    `## Get in Touch\n\nHave a question, suggestion, or correction? We'd love to hear from you. [Contact our team](/contact).`,
            }},
            { type: 'TestimonialGrid' },
            { type: 'TrustBadges' },
            { type: 'AuthorBio' },
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function contactPage(niche: string, siteName: string, domain: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/contact',
        title: `Contact ${siteName}`,
        metaDescription: `Get in touch with the ${siteName} team. Questions, feedback, or personalized ${niche} recommendations.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `Get ${n} Help`,
                subheading: `Have a question? Drop your email and we'll send you personalized recommendations.`,
            }},
            { type: 'LeadForm', content: {
                heading: `Get Personalized ${n} Advice`,
                subheading: `Enter your email and we'll send you tailored recommendations based on your needs.`,
                fields: [
                    { name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'you@email.com' },
                    { name: 'question', label: 'What can we help with?', type: 'text', required: false, placeholder: 'Brief description of your question (optional)' },
                ],
                consentText: `I agree to receive email communications. You can unsubscribe at any time. Privacy Policy.`,
                privacyUrl: '/privacy-policy',
                successMessage: 'Thanks! Check your inbox for our recommendations.',
            }, config: { endpoint: '', submitLabel: 'SEND ME RECOMMENDATIONS' }},
            { type: 'ArticleBody', content: {
                title: 'Other Ways to Reach Us',
                markdown: `## Quick Resources\n\nYou might find your answer faster here:\n\n` +
                    `- [FAQ](/faq) — Answers to common ${niche} questions\n` +
                    `- [Guides](/guides) — In-depth articles and how-tos\n` +
                    `- [Calculator](/calculator) — Get instant estimates\n` +
                    `- [Compare Options](/compare) — Side-by-side analysis\n\n` +
                    `## Email\n\nFor press, partnerships, or corrections: **info@${domain}**\n\n` +
                    `We typically respond within 24 business hours.`,
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function privacyPage(_niche: string, siteName: string): SubPageDefinition {
    return {
        route: '/privacy-policy',
        title: `Privacy Policy — ${siteName}`,
        metaDescription: `${siteName} privacy policy. Learn how we collect, use, and protect your personal information.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'ArticleBody', content: {
                title: 'Privacy Policy',
                markdown: `# Privacy Policy\n\n**Last Updated:** ${new Date().toISOString().split('T')[0]}\n\n` +
                    `${siteName} ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website.\n\n` +
                    `## Information We Collect\n\n### Information You Provide\nWe collect information you voluntarily provide, including:\n- Name and email address (when submitting contact forms)\n- Survey or quiz responses\n- Feedback and correspondence\n\n` +
                    `### Automatically Collected Information\nWhen you visit our site, we automatically collect:\n- Browser type and version\n- Operating system\n- Pages visited and time spent\n- Referring website address\n- IP address (anonymized)\n\n` +
                    `## How We Use Your Information\n\nWe use the information we collect to:\n- Provide and maintain our website\n- Respond to your inquiries\n- Improve our content and user experience\n- Send periodic updates (with your consent)\n- Analyze website traffic and trends\n\n` +
                    `## Cookies\n\nWe use cookies and similar tracking technologies to improve your experience. You can control cookie preferences through your browser settings.\n\n` +
                    `## Third-Party Services\n\nWe may use third-party analytics services (such as Google Analytics) that collect and process data about your website usage. These services have their own privacy policies.\n\n` +
                    `## Data Security\n\nWe implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, or destruction.\n\n` +
                    `## Your Rights\n\nYou have the right to:\n- Access your personal data\n- Request correction of inaccurate data\n- Request deletion of your data\n- Opt out of marketing communications\n- Lodge a complaint with a supervisory authority\n\n` +
                    `## Contact Us\n\nIf you have questions about this Privacy Policy, please [contact us](/contact).\n\n` +
                    `## Changes to This Policy\n\nWe may update this Privacy Policy periodically. We will notify you of any changes by updating the "Last Updated" date above.`,
            }},
            { type: 'Footer', variant: 'legal' },
        ],
    };
}

function termsPage(_niche: string, siteName: string): SubPageDefinition {
    return {
        route: '/terms',
        title: `Terms of Service — ${siteName}`,
        metaDescription: `${siteName} terms of service. Please read these terms carefully before using our website.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'ArticleBody', content: {
                title: 'Terms of Service',
                markdown: `# Terms of Service\n\n**Last Updated:** ${new Date().toISOString().split('T')[0]}\n\n` +
                    `Welcome to ${siteName}. By accessing and using this website, you accept and agree to be bound by these Terms of Service.\n\n` +
                    `## Use of Website\n\nYou may use this website for lawful, personal, and non-commercial purposes. You agree not to:\n- Copy, reproduce, or distribute our content without permission\n- Use automated tools to scrape or harvest data\n- Attempt to gain unauthorized access to our systems\n- Use the site in any way that could damage or impair its functionality\n\n` +
                    `## Content & Disclaimers\n\nAll content on ${siteName} is provided for informational purposes only. While we strive for accuracy:\n- We make no warranties about the completeness or accuracy of information\n- Content does not constitute professional advice\n- You should always consult qualified professionals before making decisions\n- Prices, availability, and product details may change without notice\n\n` +
                    `## Intellectual Property\n\nAll content, design, graphics, and other materials on this website are owned by ${siteName} and are protected by copyright and other intellectual property laws.\n\n` +
                    `## Third-Party Links\n\nOur website may contain links to third-party websites. We are not responsible for the content, privacy practices, or terms of use of these external sites.\n\n` +
                    `## Affiliate Disclosure\n\n${siteName} may earn commissions from qualifying purchases made through affiliate links. This does not affect our editorial independence or the price you pay.\n\n` +
                    `## Limitation of Liability\n\n${siteName} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the website.\n\n` +
                    `## Modifications\n\nWe reserve the right to modify these Terms at any time. Continued use of the website after changes constitutes acceptance of the revised Terms.\n\n` +
                    `## Contact\n\nQuestions about these Terms? [Contact us](/contact).`,
            }},
            { type: 'Footer', variant: 'legal' },
        ],
    };
}

function blogPage(niche: string, siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/blog',
        title: `${n} Blog — Latest News & Insights`,
        metaDescription: `The latest ${niche} news, trends, and expert insights from the ${siteName} editorial team.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `${n} Blog`,
                subheading: `Stay up to date with the latest ${niche} news, trends, and expert insights from our editorial team.`,
                badge: 'Updated Weekly',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'LatestArticles', content: {
                heading: 'Recent Posts',
                articles: [
                    { title: `${n} Trends to Watch in ${new Date().getFullYear()}`, excerpt: `The biggest ${niche} trends shaping the industry this year. What's changing, what's emerging, and what it means for you.`, href: '/guides/complete-guide' },
                    { title: `Money-Saving Tips for ${n}`, excerpt: `Our updated list of the best ways to save money on ${niche} without sacrificing quality. New tips added regularly.`, href: '/guides/save-money' },
                    { title: `${n} Buyer's Checklist`, excerpt: `Don't make a purchase before going through this essential checklist. Avoid the most common and costly mistakes.`, href: '/guides/common-mistakes' },
                    { title: `How We Rate & Review ${n}`, excerpt: `A behind-the-scenes look at our review methodology. How we test, evaluate, and rank ${niche} options.`, href: '/reviews' },
                    { title: `${n} Cost Guide Updated`, excerpt: `We've updated our cost calculator and pricing data with the latest market information. Check your estimate.`, href: '/calculator' },
                    { title: `Top ${n} Picks for This Month`, excerpt: `Our editorial team's current top picks. Updated monthly based on the latest reviews, pricing, and availability.`, href: '/compare' },
                ],
            }},
            { type: 'LeadForm', content: {
                heading: 'Subscribe to Updates',
                subheading: `Get the latest ${niche} insights delivered to your inbox. No spam, unsubscribe anytime.`,
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function resourcesPage(niche: string, _sn: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/resources',
        title: `${n} Resources & Tools`,
        metaDescription: `Free ${niche} resources including calculators, guides, checklists, and comparison tools. Everything you need in one place.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'gradient', content: {
                heading: `${n} Resources & Tools`,
                subheading: `Free tools, guides, and resources to help you make confident ${niche} decisions. Bookmark this page for easy access.`,
                badge: 'Free Resources',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'ResourceGrid', content: {
                heading: 'Tools & Resources',
                items: [
                    { icon: '🧮', title: 'Cost Calculator', description: `Get instant, personalized ${niche} cost estimates based on your specific requirements.`, href: '/calculator' },
                    { icon: '📊', title: 'Comparison Tool', description: `Compare top ${niche} options side by side on quality, price, and features.`, href: '/compare' },
                    { icon: '⭐', title: 'Reviews & Ratings', description: `Read verified reviews from real customers and our expert editorial team.`, href: '/reviews' },
                    { icon: '📚', title: 'Complete Guide', description: `Our most comprehensive ${niche} resource — everything you need to know.`, href: '/guides/complete-guide' },
                    { icon: '💰', title: 'Savings Guide', description: `Proven strategies to save money on ${niche} without compromising quality.`, href: '/guides/save-money' },
                    { icon: '✅', title: 'Mistake Checklist', description: `Common ${niche} mistakes to avoid — don't learn these the hard way.`, href: '/guides/common-mistakes' },
                    { icon: '❓', title: 'FAQ', description: 'Answers to the most frequently asked questions.', href: '/faq' },
                ],
            }},
            { type: 'LatestArticles', content: {
                heading: 'Featured Resources',
                articles: [
                    { title: `${n} Buyer's Guide`, excerpt: `The definitive buyer's guide with expert recommendations and insider tips.`, href: '/guides/complete-guide' },
                    { title: `${n} Pricing Data`, excerpt: `Up-to-date pricing information and cost breakdowns by category and region.`, href: '/calculator' },
                    { title: `Provider Comparison Chart`, excerpt: `Detailed comparison of the top providers with ratings, pricing, and user feedback.`, href: '/compare' },
                ],
            }},
            { type: 'CTABanner', content: {
                text: `Need help choosing? We're here to help.`,
                buttonLabel: 'Contact Our Experts',
                buttonUrl: '/contact',
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function pricingPage(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    const year = new Date().getFullYear();
    return {
        route: '/pricing',
        title: `${n} Pricing & Cost Guide (${year})`,
        metaDescription: `${niche} pricing and cost information for ${year}. Understand what you should expect to pay and how to get the best deal.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `${n} Pricing Guide`,
                subheading: `Understand ${niche} costs and pricing for ${year}. From budget options to premium tiers — know what to expect before you buy.`,
                badge: `${year} Pricing`,
                ctaText: 'Calculate Your Cost',
                ctaUrl: '/calculator',
            }},
            { type: 'Sidebar', config: { showSearch: true } },
            { type: 'PricingTable' },
            { type: 'CostBreakdown' },
            { type: 'ArticleBody', content: {
                title: 'Understanding Pricing',
                markdown: `## What Affects ${n} Pricing?\n\nPricing varies based on several key factors:\n\n` +
                    `### Scope & Complexity\nLarger or more complex projects cost more. Define your exact needs before requesting quotes.\n\n` +
                    `### Quality Tier\nBudget, mid-range, and premium options serve different needs. The right tier depends on your priorities and budget.\n\n` +
                    `### Location\nPrices vary 20-40% by region due to differences in cost of living, competition, and local regulations.\n\n` +
                    `### Timing\nDemand fluctuates seasonally. Off-peak timing can save you 10-20%.\n\n` +
                    `## How to Get the Best Price\n\n1. **Get multiple quotes** — Compare at least 3 providers\n2. **Use our [calculator](/calculator)** — Know fair pricing before negotiating\n3. **Check [reviews](/reviews)** — Value matters more than just price\n4. **Ask about discounts** — Many providers offer seasonal or bundle pricing\n5. **Negotiate** — Most prices have room for adjustment`,
            }},
            { type: 'FAQ', content: {
                items: [
                    { question: `What's the average cost of ${niche}?`, answer: `Costs vary by scope and quality tier. Use our [calculator](/calculator) for a personalized estimate. Generally, expect to pay within the ranges shown in our pricing table above.` },
                    { question: 'Are the prices listed guaranteed?', answer: 'Prices shown are representative market rates and may vary by provider and location. Always get a direct quote for exact pricing.' },
                ],
            }},
            { type: 'LeadForm', content: {
                heading: 'Get Free Quotes',
                subheading: `Compare pricing from top-rated ${niche} providers in your area.`,
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

// ============================================================
// Master function: generate all sub-pages for a domain
// ============================================================

export interface SubPageResult {
    route: string;
    title: string;
    metaDescription: string;
    blocks: Array<PresetBlock & { id: string }>;
}

/**
 * Generate all sub-page definitions for a domain.
 * Returns ~19 pages (homepage is not included — it already exists).
 *
 * @deprecated Use generateSubPagesFromBlueprint for structurally differentiated sites.
 */
export function generateSubPages(domain: string, niche?: string): SubPageResult[] {
    const nicheLabel = niche || domain.replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '').replace(/[-_]/g, ' ');
    const siteName = domainToSiteName(domain);

    const generators: Array<(n: string, s: string, d: string) => SubPageDefinition> = [
        guidesHub,
        guideComplete,
        guideSaveMoney,
        guideMistakes,
        calculatorPage,
        comparePage,
        reviewsPage,
        faqPage,
        aboutPage,
        contactPage,
        privacyPage,
        termsPage,
        blogPage,
        resourcesPage,
        pricingPage,
    ];

    return generators.map(gen => {
        const def = gen(nicheLabel, siteName, domain);
        const blocks = def.blocks.map(b => {
            const merged = mergeBlockDefaults(b, domain, niche);
            return {
                ...b,
                id: blkId(),
                content: { ...(merged.content || {}), ...(b.content || {}) },
                config: { ...(merged.config || {}), ...(b.config || {}) },
            };
        });
        // Inject LastUpdated after Hero and AuthorBio before Footer on content pages
        const skipRoutes = new Set(['/privacy', '/terms', '/contact']);
        if (!skipRoutes.has(def.route)) {
            const hasLastUpdated = blocks.some(b => b.type === 'LastUpdated');
            const hasAuthorBio = blocks.some(b => b.type === 'AuthorBio');

            if (!hasLastUpdated) {
                const heroIdx = blocks.findIndex(b => b.type === 'Hero');
                const insertIdx = heroIdx >= 0 ? heroIdx + 1 : 1;
                const luDefaults = mergeBlockDefaults({ type: 'LastUpdated' as BlockType }, domain, niche);
                blocks.splice(insertIdx, 0, {
                    type: 'LastUpdated' as BlockType, id: blkId(),
                    content: luDefaults.content || {}, config: luDefaults.config || {},
                });
            }

            if (!hasAuthorBio) {
                const footerIdx = blocks.findIndex(b => b.type === 'Footer');
                const insertIdx = footerIdx >= 0 ? footerIdx : blocks.length;
                const abDefaults = mergeBlockDefaults({ type: 'AuthorBio' as BlockType }, domain, niche);
                blocks.splice(insertIdx, 0, {
                    type: 'AuthorBio' as BlockType, id: blkId(),
                    content: abDefaults.content || {}, config: abDefaults.config || {},
                });
            }
        }

        return {
            route: def.route,
            title: def.title,
            metaDescription: def.metaDescription,
            blocks,
        };
    });
}

// ============================================================
// Blueprint-aware generation: structurally differentiated sites
// ============================================================

import {
    type StructuralBlueprint,
    type SubPageSlot,
    shouldHaveSidebar,
    headerStyleToBlock,
    footerStructureToVariant,
    heroStructureToVariant,
    ctaStyleToConfig,
} from '../structural-blueprint';

const SLOT_GENERATORS: Record<SubPageSlot, (n: string, s: string, d: string) => SubPageDefinition> = {
    'guides-hub': guidesHub,
    'guide-complete': guideComplete,
    'guide-save-money': guideSaveMoney,
    'guide-mistakes': guideMistakes,
    'calculator': calculatorPage,
    'compare': comparePage,
    'reviews': reviewsPage,
    'faq': faqPage,
    'pricing': pricingPage,
    'blog': blogPage,
    'resources': resourcesPage,
    'about': aboutPage,
    'contact': (n, s, d) => contactPage(n, s, d),
    'how-it-works': howItWorksPage,
    'checklist': checklistPage,
    'glossary': glossaryPage,
    'case-studies': caseStudiesPage,
};

function howItWorksPage(niche: string, _siteName: string, _domain: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/how-it-works',
        title: `How ${n} Works — Step by Step`,
        metaDescription: `Understand how ${niche} works from start to finish. A clear step-by-step breakdown for first-timers and returners alike.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `How ${n} Works`,
                subheading: `A clear, step-by-step breakdown so you know exactly what to expect.`,
                badge: 'Step-by-Step',
            }},
            { type: 'Checklist', content: {
                title: `${n} Process Overview`,
                steps: [
                    { label: 'Research your options and define your requirements', done: false },
                    { label: 'Get quotes from 3-5 qualified providers', done: false },
                    { label: 'Compare on quality, price, and reputation', done: false },
                    { label: 'Choose your provider and agree on terms in writing', done: false },
                    { label: 'Monitor progress and communicate regularly', done: false },
                    { label: 'Review the final result against original requirements', done: false },
                ],
            }},
            { type: 'ArticleBody', content: {
                title: `The ${n} Process Explained`,
                markdown: `## Step 1: Research\n\nBefore anything else, understand what you need. Read our [complete guide](/guides/complete-guide) and use the [calculator](/calculator) to set a realistic budget.\n\n` +
                    `## Step 2: Get Quotes\n\nNever go with the first option. Getting multiple quotes helps you understand fair pricing and find the best fit.\n\n` +
                    `## Step 3: Compare\n\nUse our [comparison tool](/compare) to evaluate options on the metrics that matter most to you.\n\n` +
                    `## Step 4: Decide\n\nOnce you've done your research, make a decision with confidence. Get everything in writing.\n\n` +
                    `## Step 5: Follow Through\n\nStay involved throughout the process. Good communication prevents most problems.`,
            }},
            { type: 'FAQ' },
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function checklistPage(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/checklist',
        title: `${n} Checklist — Don't Miss a Step`,
        metaDescription: `A printable ${niche} checklist to make sure you don't miss any important steps. Free to use.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `Your ${n} Checklist`,
                subheading: `Print this out or bookmark it — a step-by-step checklist so nothing falls through the cracks.`,
                badge: 'Free Checklist',
            }},
            { type: 'Checklist', content: {
                title: `Essential ${n} Checklist`,
                steps: [
                    { label: 'Define your specific requirements and goals', done: false },
                    { label: 'Set a realistic budget (use our calculator)', done: false },
                    { label: 'Research at least 5 potential options', done: false },
                    { label: 'Check reviews and ratings for each', done: false },
                    { label: 'Request and compare at least 3 quotes', done: false },
                    { label: 'Verify licenses, insurance, and credentials', done: false },
                    { label: 'Read all contracts and terms carefully', done: false },
                    { label: 'Check warranty and support policies', done: false },
                    { label: 'Ask about hidden fees or additional costs', done: false },
                    { label: 'Get everything agreed upon in writing', done: false },
                    { label: 'Set clear timelines and milestones', done: false },
                    { label: 'Plan for contingencies and unexpected costs (10-20% buffer)', done: false },
                ],
            }},
            { type: 'ArticleBody', content: {
                title: 'Why Use a Checklist?',
                markdown: `Research shows that using a checklist reduces errors by up to 30% and improves outcomes significantly. Don't rely on memory — especially for high-stakes ${niche} decisions.\n\n` +
                    `**Helpful tools:**\n- [Cost Calculator](/calculator) — Get your budget estimate\n- [Comparison Guide](/compare) — See options side by side\n- [Complete Guide](/guides/complete-guide) — Deep-dive into everything`,
            }},
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function glossaryPage(niche: string, _siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/glossary',
        title: `${n} Glossary — Key Terms Explained`,
        metaDescription: `A plain-language glossary of ${niche} terms. Understand the jargon before you commit.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'minimal', content: {
                heading: `${n} Glossary`,
                subheading: `Industry jargon shouldn't be a barrier. Here's every term you need to know, explained simply.`,
                badge: 'Reference',
            }},
            { type: 'ArticleBody', content: {
                title: `${n} Terms & Definitions`,
                markdown: `## Key ${n} Terms\n\nUnderstanding industry terminology is the first step to making smart decisions. This reference covers the essential ${niche} terms you'll encounter when researching options, comparing providers, and reading contracts.\n\nUse Ctrl+F (or Cmd+F on Mac) to search for a specific term.`,
            }},
            { type: 'FAQ' },
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

function caseStudiesPage(niche: string, siteName: string): SubPageDefinition {
    const n = capitalize(niche);
    return {
        route: '/case-studies',
        title: `${n} Case Studies & Success Stories`,
        metaDescription: `Real ${niche} case studies showing costs, timelines, and outcomes. Learn from others' experiences.`,
        blocks: [
            { type: 'Header', variant: 'topbar', config: { sticky: true } },
            { type: 'Hero', variant: 'centered', content: {
                heading: `${n} Case Studies`,
                subheading: `Real stories, real numbers, real outcomes. See how others approached their ${niche} decisions.`,
                badge: 'Real Stories',
            }},
            { type: 'TestimonialGrid' },
            { type: 'ArticleBody', content: {
                title: `What We Can Learn`,
                markdown: `## Why Case Studies Matter\n\nNothing beats learning from real experiences. At ${siteName}, we collect and verify real-world ${niche} stories so you can make better decisions.\n\n` +
                    `Each case study includes actual costs, timelines, and honest assessments of what went well and what could have been better.\n\n` +
                    `**Ready to start your own journey?**\n- [Calculate your costs](/calculator)\n- [Compare options](/compare)\n- [Read our guides](/guides)`,
            }},
            { type: 'StatGrid' },
            { type: 'Footer', variant: 'multi-column' },
        ],
    };
}

/**
 * Generate sub-pages driven by a structural blueprint.
 * Only generates pages for slots included in the blueprint, and applies
 * the blueprint's header/footer/hero/sidebar/CTA choices to each page.
 */
export function generateSubPagesFromBlueprint(
    domain: string,
    niche: string | undefined,
    blueprint: StructuralBlueprint,
): SubPageResult[] {
    const nicheLabel = niche || domain.replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '').replace(/[-_]/g, ' ');
    const siteName = domainToSiteName(domain);

    const allSlots: SubPageSlot[] = [...blueprint.pages];

    const headerBlock = headerStyleToBlock(blueprint.headerStyle);
    const footerVariant = footerStructureToVariant(blueprint.footerStructure);
    const heroVariant = heroStructureToVariant(blueprint.heroStructure);
    const ctaConfig = ctaStyleToConfig(blueprint.ctaStyle);

    const results: SubPageResult[] = [];

    for (const slot of allSlots) {
        const gen = SLOT_GENERATORS[slot];
        if (!gen) continue;

        const def = gen(nicheLabel, siteName, domain);
        const blocks = def.blocks.map(b => {
            const merged = mergeBlockDefaults(b, domain, niche);
            const result = {
                ...b,
                id: blkId(),
                content: { ...(merged.content || {}), ...(b.content || {}) },
                config: { ...(merged.config || {}), ...(b.config || {}) },
            };

            // Apply blueprint structural choices
            if (b.type === 'Header') {
                result.variant = headerBlock.variant;
                result.config = { ...result.config, ...headerBlock.config };
                // Inject blueprint nav
                if (result.content) {
                    (result.content as Record<string, unknown>).navLinks = blueprint.nav.items;
                }
            }
            if (b.type === 'Footer') {
                result.variant = footerVariant;
            }
            if (b.type === 'Hero' && !b.content?.heading) {
                result.variant = heroVariant;
            }
            if (b.type === 'CTABanner' && ctaConfig) {
                result.config = { ...result.config, ...ctaConfig };
            }

            return result;
        });

        // Remove Sidebar blocks if blueprint says no sidebar for this route
        const hasSidebar = shouldHaveSidebar(blueprint, def.route);
        const filteredBlocks = hasSidebar ? blocks : blocks.filter(b => b.type !== 'Sidebar');

        // Remove CTA blocks if blueprint says no CTA
        const finalBlocks = ctaConfig === null
            ? filteredBlocks.filter(b => b.type !== 'CTABanner')
            : filteredBlocks;

        // Inject LastUpdated + AuthorBio on content pages
        const skipRoutes = new Set(['/privacy-policy', '/privacy', '/terms', '/contact']);
        if (!skipRoutes.has(def.route)) {
            if (!finalBlocks.some(b => b.type === 'LastUpdated')) {
                const heroIdx = finalBlocks.findIndex(b => b.type === 'Hero');
                const insertIdx = heroIdx >= 0 ? heroIdx + 1 : 1;
                const luDefaults = mergeBlockDefaults({ type: 'LastUpdated' as BlockType }, domain, niche);
                finalBlocks.splice(insertIdx, 0, {
                    type: 'LastUpdated' as BlockType, id: blkId(),
                    content: luDefaults.content || {}, config: luDefaults.config || {},
                });
            }
            if (!finalBlocks.some(b => b.type === 'AuthorBio')) {
                const footerIdx = finalBlocks.findIndex(b => b.type === 'Footer');
                const insertIdx = footerIdx >= 0 ? footerIdx : finalBlocks.length;
                const abDefaults = mergeBlockDefaults({ type: 'AuthorBio' as BlockType }, domain, niche);
                finalBlocks.splice(insertIdx, 0, {
                    type: 'AuthorBio' as BlockType, id: blkId(),
                    content: abDefaults.content || {}, config: abDefaults.config || {},
                });
            }
        }

        results.push({
            route: def.route,
            title: def.title,
            metaDescription: def.metaDescription,
            blocks: finalBlocks,
        });
    }

    // Always add legal pages (not in blueprint.pages but always required)
    for (const legalGen of [privacyPage, termsPage]) {
        const def = legalGen(nicheLabel, siteName);
        const blocks = def.blocks.map(b => {
            const merged = mergeBlockDefaults(b, domain, niche);
            const result = {
                ...b,
                id: blkId(),
                content: { ...(merged.content || {}), ...(b.content || {}) },
                config: { ...(merged.config || {}), ...(b.config || {}) },
            };
            if (b.type === 'Header') {
                result.variant = headerBlock.variant;
                result.config = { ...result.config, ...headerBlock.config };
                if (result.content) {
                    (result.content as Record<string, unknown>).navLinks = blueprint.nav.items;
                }
            }
            if (b.type === 'Footer') {
                result.variant = footerVariant;
            }
            return result;
        });
        results.push({ route: def.route, title: def.title, metaDescription: def.metaDescription, blocks });
    }

    return results;
}
