/**
 * AI Domain Classifier
 *
 * Analyzes a domain name and returns niche, site template, tier,
 * vertical, monetization model, and sub-niche recommendations.
 */

import { getAIClient } from './openrouter';
import { db, domains } from '@/lib/db';
import { eq, isNull, or } from 'drizzle-orm';

const DOMAIN_NAME_REGEX = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i;

function sanitizeDomainName(value: string): string {
    const cleaned = value.replace(/[\r\n`]/g, '').trim().toLowerCase();
    if (!DOMAIN_NAME_REGEX.test(cleaned)) {
        throw new Error(`Invalid domain name for classification: ${cleaned.slice(0, 80)}`);
    }
    return cleaned;
}

const SITE_TEMPLATES = [
    'authority', 'comparison', 'calculator', 'review', 'tool', 'hub',
    'decision', 'cost_guide', 'niche', 'info', 'consumer', 'brand',
    'magazine', 'landing', 'docs', 'storefront', 'minimal', 'dashboard',
    'newsletter', 'community',
] as const;

type SiteTemplate = typeof SITE_TEMPLATES[number];

export interface DomainClassification {
    niche: string;
    subNiche: string | null;
    vertical: string;
    siteTemplate: SiteTemplate;
    tier: 1 | 2 | 3;
    monetizationModel: string;
    themeStyle: string;
    reasoning: string;
}

const CLASSIFY_PROMPT = (domainName: string) => `You are an expert domain portfolio strategist. Analyze this domain name and classify it for a content website portfolio.

DOMAIN: ${domainName}

Based ONLY on the domain name, infer what niche/topic it would serve, and recommend the optimal site configuration.

SITE TEMPLATE OPTIONS (pick the single best fit):
- authority: Broad topic authority site (e.g., healthline.com)
- comparison: Product/service comparison site (e.g., versus.com)
- calculator: Calculator/tool-focused site (e.g., calculator.net)
- review: Review-focused site (e.g., wirecutter.com)
- tool: Interactive tool/utility site (e.g., canva.com)
- hub: Resource hub/directory (e.g., crunchbase.com)
- decision: Decision-making guide site (e.g., choosingtherapy.com)
- cost_guide: Cost/pricing guide site (e.g., costhelper.com)
- niche: Narrow niche authority (e.g., sleepfoundation.org)
- info: General information/educational (e.g., investopedia.com)
- consumer: Consumer advice/protection (e.g., consumerreports.org)
- brand: Brand-focused content site
- magazine: Magazine-style content site
- newsletter: Newsletter-first site
- community: Community/forum-style site

TIER (based on commercial potential of the niche):
- 1 = High-value (legal, finance, insurance, health, B2B SaaS) — strong lead gen or affiliate potential
- 2 = Medium-value (education, real estate, travel, home services) — moderate monetization
- 3 = Lower-value (general info, hobby, entertainment) — primarily display ads

MONETIZATION MODEL (pick one):
- "Lead gen" — forms that sell leads to service providers
- "Affiliate" — product/service affiliate links
- "Display + affiliate" — display ads plus affiliate
- "Display + lead gen" — display ads plus lead gen
- "Display" — primarily ad revenue
- "SaaS" — tool/calculator freemium model
- "Sponsored content" — sponsored posts/reviews

THEME STYLE (suggest a visual style as "color-style", e.g.):
- "navy-serif" (professional/legal)
- "green-modern" (finance/health)
- "medical-clean" (healthcare)
- "warm-editorial" (magazine/lifestyle)
- "tech-minimal" (technology)
- "earth-organic" (environmental/wellness)

Respond with JSON ONLY:
{
  "niche": "Primary niche (2-4 words, e.g. 'Personal Finance', 'Family Law', 'Home Insurance')",
  "subNiche": "More specific sub-niche or null",
  "vertical": "Industry vertical (e.g. 'Legal', 'Finance', 'Health', 'Insurance', 'Technology', 'Education', 'Home Services')",
  "siteTemplate": "one of the template options above",
  "tier": 1 or 2 or 3,
  "monetizationModel": "one of the monetization options above",
  "themeStyle": "color-style string",
  "reasoning": "1-2 sentence explanation of your classification"
}`;

function isValidTemplate(value: string): value is SiteTemplate {
    return SITE_TEMPLATES.includes(value as SiteTemplate);
}

export async function classifyDomain(domainName: string): Promise<DomainClassification> {
    const safeName = sanitizeDomainName(domainName);
    const ai = getAIClient();
    const response = await ai.generateJSON<DomainClassification>(
        'domainClassify',
        CLASSIFY_PROMPT(safeName),
        { temperature: 0.2, maxTokens: 500 },
    );

    const data = response.data;

    // Validate and sanitize
    return {
        niche: typeof data.niche === 'string' ? data.niche.trim().slice(0, 100) : 'General',
        subNiche: typeof data.subNiche === 'string' ? data.subNiche.trim().slice(0, 100) : null,
        vertical: typeof data.vertical === 'string' ? data.vertical.trim().slice(0, 50) : 'General',
        siteTemplate: isValidTemplate(data.siteTemplate) ? data.siteTemplate : 'authority',
        tier: [1, 2, 3].includes(data.tier) ? data.tier : 2,
        monetizationModel: typeof data.monetizationModel === 'string' ? data.monetizationModel.trim().slice(0, 50) : 'Display + affiliate',
        themeStyle: typeof data.themeStyle === 'string' ? data.themeStyle.trim().slice(0, 30) : 'navy-serif',
        reasoning: typeof data.reasoning === 'string' ? data.reasoning.trim().slice(0, 300) : '',
    };
}

export async function classifyAndUpdateDomain(domainId: string): Promise<{ domain: string; classification: DomainClassification } | null> {
    const [row] = await db.select({ id: domains.id, domain: domains.domain })
        .from(domains)
        .where(eq(domains.id, domainId))
        .limit(1);

    if (!row) return null;

    const classification = await classifyDomain(row.domain);

    await db.update(domains).set({
        niche: classification.niche,
        subNiche: classification.subNiche,
        vertical: classification.vertical,
        siteTemplate: classification.siteTemplate,
        tier: classification.tier,
        monetizationModel: classification.monetizationModel,
        themeStyle: classification.themeStyle,
        updatedAt: new Date(),
    }).where(eq(domains.id, domainId));

    return { domain: row.domain, classification };
}

export async function classifyUncategorizedDomains(limit = 20): Promise<{
    classified: Array<{ domain: string; classification: DomainClassification }>;
    errors: Array<{ domain: string; error: string }>;
}> {
    // Find domains with no niche set (empty string or null)
    const toClassify = await db.select({ id: domains.id, domain: domains.domain })
        .from(domains)
        .where(or(eq(domains.niche, ''), isNull(domains.niche)))
        .limit(limit);

    const classified: Array<{ domain: string; classification: DomainClassification }> = [];
    const errors: Array<{ domain: string; error: string }> = [];

    // Process sequentially to avoid rate limits
    for (const row of toClassify.slice(0, limit)) {
        try {
            const result = await classifyAndUpdateDomain(row.id);
            if (result) {
                classified.push(result);
            }
        } catch (err) {
            errors.push({
                domain: row.domain,
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    }

    return { classified, errors };
}
