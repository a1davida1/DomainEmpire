/**
 * prepareDomain() — single function that takes a domain from raw DB record
 * to deploy-ready with all fixes applied.
 *
 * Flow:
 * 1. Set strategy data (wave, cluster, niche, etc.)
 * 2. Assign theme+skin
 * 3. Generate preset pages
 * 4. Programmatic fixes (names, endpoints, duplicates, citations)
 * 5. Targeted AI enrichment (hero headlines, calculator inputs, FAQ, meta)
 * 6. Site review (AI rubric) + auto-remediation (if needed)
 * 7. Validate
 * 8. Return ready-to-deploy status
 */

import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { assignThemeSkin } from './theme-assigner';
import { getHomepagePreset } from './blocks/presets';
import { generateSubPages } from './blocks/sub-page-presets';
import { getRequiredCompliancePages } from './compliance-templates';
import { enrichDomain, getCitations } from './enrich';
import { validateDomain, type ValidationReport } from './validate';
import { extractSiteTitle } from './templates/shared';
import type { BlockEnvelope } from './blocks/schemas';
import { reviewSite, remediateSite } from './site-review';

export interface DomainStrategy {
    wave: number;
    cluster: string;
    niche: string;
    subNiche?: string;
    vertical: string;
    siteTemplate: string;
    monetizationTier: number;
    homeTitle: string;
    homeMeta: string;
}

export interface PrepareResult {
    domain: string;
    humanName: string;
    theme: string;
    skin: string;
    pageCount: number;
    programmaticFixes: {
        namesFixed: number;
        endpointsFixed: number;
        duplicatesRemoved: number;
        citationsInjected: number;
    };
    enrichment: {
        heroesFixed: number;
        calculatorsFixed: number;
        faqsFixed: number;
        metaFixed: number;
        aiCalls: number;
        cost: number;
    };
    validation: ValidationReport;
    ready: boolean;
}

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function prepareDomain(
    domainName: string,
    strategy: DomainStrategy,
): Promise<PrepareResult> {
    const [domain] = await db.select().from(domains).where(eq(domains.domain, domainName)).limit(1);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);

    const humanName = extractSiteTitle(domainName);
    const result: PrepareResult = {
        domain: domainName,
        humanName,
        theme: '',
        skin: '',
        pageCount: 0,
        programmaticFixes: { namesFixed: 0, endpointsFixed: 0, duplicatesRemoved: 0, citationsInjected: 0 },
        enrichment: { heroesFixed: 0, calculatorsFixed: 0, faqsFixed: 0, metaFixed: 0, aiCalls: 0, cost: 0 },
        validation: { domain: domainName, pageCount: 0, blockCount: 0, issues: [], errorCount: 0, warningCount: 0, ready: false },
        ready: false,
    };

    // ── Step 1: Strategy data ──
    await db.update(domains).set({
        wave: strategy.wave,
        cluster: strategy.cluster,
        niche: strategy.niche,
        subNiche: strategy.subNiche || null,
        vertical: strategy.vertical,
        siteTemplate: strategy.siteTemplate as typeof domain.siteTemplate,
        monetizationTier: strategy.monetizationTier,
        updatedAt: new Date(),
    }).where(eq(domains.id, domain.id));

    // ── Step 2: Theme + skin ──
    const combo = assignThemeSkin(domainName, strategy.cluster, [domainName]);
    await db.update(domains).set({ skin: combo.skin, updatedAt: new Date() }).where(eq(domains.id, domain.id));
    result.theme = combo.theme;
    result.skin = combo.skin;

    // ── Step 3: Generate preset pages (clean slate) ──
    await db.delete(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));

    const niche = strategy.subNiche || strategy.niche;
    const homeBlocks = getHomepagePreset(strategy.siteTemplate, domainName, niche);
    await db.insert(pageDefinitions).values({
        domainId: domain.id,
        route: '/',
        title: strategy.homeTitle,
        metaDescription: strategy.homeMeta,
        theme: combo.theme,
        skin: combo.skin,
        blocks: homeBlocks,
        isPublished: true,
        status: 'published' as const,
    });

    const subPages = generateSubPages(domainName, niche);
    for (const page of subPages) {
        await db.insert(pageDefinitions).values({
            domainId: domain.id,
            route: page.route,
            title: page.title,
            metaDescription: page.metaDescription,
            theme: combo.theme,
            skin: combo.skin,
            blocks: page.blocks.map(b => ({ ...b, id: blkId() })),
            isPublished: true,
            status: 'published' as const,
        });
    }

    // Compliance pages
    const updatedDomain = {
        ...domain,
        cluster: strategy.cluster,
        niche: strategy.niche,
        subNiche: strategy.subNiche || null,
        monetizationTier: strategy.monetizationTier,
        skin: combo.skin,
    };
    const compPages = getRequiredCompliancePages(updatedDomain);
    const existingRoutes = new Set(['/', ...subPages.map(p => p.route)]);
    for (const page of compPages) {
        if (page.route && !existingRoutes.has(page.route)) {
            await db.insert(pageDefinitions).values(page);
        }
    }

    // ── Step 4: Programmatic fixes ──
    const allPages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));

    for (const page of allPages) {
        const blocks = (page.blocks || []) as BlockEnvelope[];
        let changed = false;
        const fixed = blocks.map(b => {
            const c = b.content ? { ...b.content } as Record<string, unknown> : {};
            const cfg = b.config ? { ...b.config } as Record<string, unknown> : {};

            // Fix unhumanized site names
            if (typeof c.siteName === 'string' && c.siteName !== humanName) {
                c.siteName = humanName;
                result.programmaticFixes.namesFixed++;
                changed = true;
            }

            // Fix placeholder LeadForm endpoints
            if (b.type === 'LeadForm' && (cfg.endpoint === '#')) {
                cfg.endpoint = '';
                result.programmaticFixes.endpointsFixed++;
                changed = true;
            }

            // Convert contact page LeadForms to email capture
            if (b.type === 'LeadForm' && page.route === '/contact') {
                const fields = c.fields as Array<Record<string, unknown>> | undefined;
                const hasFullForm = fields && fields.length > 2;
                if (hasFullForm) {
                    c.fields = [
                        { name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'you@email.com' },
                        { name: 'question', label: 'What can we help with?', type: 'text', required: false, placeholder: 'Brief description (optional)' },
                    ];
                    c.consentText = 'I agree to receive email communications. You can unsubscribe at any time. Privacy Policy.';
                    c.privacyUrl = '/privacy-policy';
                    c.successMessage = 'Thanks! Check your inbox for our recommendations.';
                    cfg.submitLabel = 'SEND ME RECOMMENDATIONS';
                    cfg.endpoint = '';
                    result.programmaticFixes.endpointsFixed++;
                    changed = true;
                }
            }

            if (changed && (b.type === 'LeadForm')) {
                return { ...b, content: c, config: cfg };
            }

            // Inject niche-specific citations where empty
            if (b.type === 'CitationBlock') {
                const sources = c.sources as unknown[];
                const hasPlaceholder = Array.isArray(sources) && sources.length > 0
                    && JSON.stringify(sources).includes('"url":"#"');
                if (!sources || (Array.isArray(sources) && sources.length === 0) || hasPlaceholder) {
                    c.sources = getCitations(strategy.niche);
                    result.programmaticFixes.citationsInjected++;
                    changed = true;
                }
            }

            return changed ? { ...b, content: c, config: cfg } : b;
        });

        // Fix page title
        let title = page.title || '';
        const rawSlug = domainName.replace(/\.[a-z]+$/i, '');
        const rawTitle = rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);
        if (title.includes(rawTitle) && rawTitle !== humanName) {
            title = title.replaceAll(rawTitle, humanName);
            changed = true;
        }

        if (changed) {
            await db.update(pageDefinitions).set({
                blocks: fixed as typeof page.blocks,
                title,
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, page.id));
        }
    }

    // Remove duplicate /privacy (keep /privacy-policy)
    const refreshedPages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));
    const privacyPreset = refreshedPages.find(p => p.route === '/privacy');
    if (privacyPreset && refreshedPages.some(p => p.route === '/privacy-policy')) {
        await db.delete(pageDefinitions).where(eq(pageDefinitions.id, privacyPreset.id));
        result.programmaticFixes.duplicatesRemoved++;
    }

    // ── Step 5: Targeted AI enrichment ──
    const enrichResult = await enrichDomain(domain.id);
    result.enrichment = {
        heroesFixed: enrichResult.heroesFixed,
        calculatorsFixed: enrichResult.calculatorsFixed,
        faqsFixed: enrichResult.faqsFixed,
        metaFixed: enrichResult.metaFixed,
        aiCalls: enrichResult.totalAiCalls,
        cost: enrichResult.totalCost,
    };

    // ── Step 6: Site review + auto-remediation ──
    const firstReview = await reviewSite(domain.id);
    const needsRemediation = firstReview.verdict === 'reject' || firstReview.criticalIssues.length > 0;
    if (needsRemediation) {
        // Best-effort remediation based on the review scores/issues.
        await remediateSite(domain.id, firstReview);
    }
    const finalReview = needsRemediation ? await reviewSite(domain.id) : firstReview;

    // Persist final review results on the domain record
    await db.update(domains).set({
        lastReviewResult: finalReview as unknown as Record<string, unknown>,
        lastReviewScore: Math.round(finalReview.overallScore),
        lastReviewedAt: new Date(finalReview.reviewedAt),
        updatedAt: new Date(),
    }).where(eq(domains.id, domain.id));

    // ── Step 7: Validate ──
    result.validation = await validateDomain(domain.id);
    result.pageCount = result.validation.pageCount;
    // Ready iff programmatic validation passes AND the site isn't rejected by AI review.
    result.ready = result.validation.ready && finalReview.verdict !== 'reject';

    return result;
}
