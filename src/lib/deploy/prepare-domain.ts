/**
 * prepareDomain() — single function that takes a domain from raw DB record
 * to deploy-ready with all fixes applied.
 *
 * Flow:
 * 1. Resolve strategy (explicit or inferred from DB)
 * 2. Assign theme+skin
 * 3. Seed/generate pages (smart: skip if pages already exist and no strategy override)
 * 4. Programmatic fixes (names, endpoints, duplicates, citations)
 * 5. Targeted AI enrichment (hero headlines, calculator inputs, FAQ, meta)
 * 6. Content scanning (banned words + burstiness on block text, AI rewrite if needed)
 * 7. Site review (AI rubric) + auto-remediation (if needed)
 * 8. Validate
 * 9. Return ready-to-deploy status
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
import { scanBlocksForBannedPatterns, rewriteBlockText } from './block-content-scanner';

export interface DomainStrategy {
    wave?: number;
    cluster?: string;
    niche?: string;
    subNiche?: string;
    vertical?: string;
    siteTemplate?: string;
    monetizationTier?: number;
    homeTitle?: string;
    homeMeta?: string;
}

export interface ContentScanStats {
    pagesScanned: number;
    blocksWithViolations: number;
    totalViolations: number;
    blocksRewritten: number;
    lowBurstinessBlocks: number;
    aiCalls: number;
    cost: number;
}

export interface PrepareResult {
    domain: string;
    humanName: string;
    theme: string;
    skin: string;
    pageCount: number;
    pagesSeeded: boolean;
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
    contentScan: ContentScanStats;
    validation: ValidationReport;
    ready: boolean;
}

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Run the full site preparation pipeline.
 *
 * @param domainIdOrName - domain UUID or domain name (e.g. "example.com")
 * @param strategy - optional overrides; when omitted, values are inferred from DB
 */
export async function prepareDomain(
    domainIdOrName: string,
    strategy?: DomainStrategy,
): Promise<PrepareResult> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(domainIdOrName);
    const [domain] = isUuid
        ? await db.select().from(domains).where(eq(domains.id, domainIdOrName)).limit(1)
        : await db.select().from(domains).where(eq(domains.domain, domainIdOrName)).limit(1);
    if (!domain) throw new Error(`Domain not found: ${domainIdOrName}`);

    const domainName = domain.domain;
    const humanName = extractSiteTitle(domainName);

    // Merge explicit strategy with existing DB values
    const effectiveNiche = strategy?.niche || domain.niche || 'general';
    const effectiveSubNiche = strategy?.subNiche ?? domain.subNiche ?? null;
    const effectiveCluster = strategy?.cluster ?? domain.cluster ?? null;
    const effectiveTemplate = strategy?.siteTemplate ?? domain.siteTemplate ?? 'authority';
    const effectiveMonTier = strategy?.monetizationTier ?? domain.monetizationTier ?? 3;
    const effectiveHomeTitle = strategy?.homeTitle ?? extractSiteTitle(domainName);
    const effectiveHomeMeta = strategy?.homeMeta ?? null;
    const nicheForContent = effectiveSubNiche || effectiveNiche;

    const result: PrepareResult = {
        domain: domainName,
        humanName,
        theme: '',
        skin: '',
        pageCount: 0,
        pagesSeeded: false,
        programmaticFixes: { namesFixed: 0, endpointsFixed: 0, duplicatesRemoved: 0, citationsInjected: 0 },
        enrichment: { heroesFixed: 0, calculatorsFixed: 0, faqsFixed: 0, metaFixed: 0, aiCalls: 0, cost: 0 },
        contentScan: { pagesScanned: 0, blocksWithViolations: 0, totalViolations: 0, blocksRewritten: 0, lowBurstinessBlocks: 0, aiCalls: 0, cost: 0 },
        validation: { domain: domainName, pageCount: 0, blockCount: 0, issues: [], errorCount: 0, warningCount: 0, ready: false },
        ready: false,
    };

    // ── Step 1: Update strategy fields on the domain record ──
    const strategyUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (strategy?.niche) strategyUpdate.niche = strategy.niche;
    if (strategy?.subNiche !== undefined) strategyUpdate.subNiche = strategy.subNiche || null;
    if (strategy?.cluster !== undefined) strategyUpdate.cluster = strategy.cluster;
    if (strategy?.vertical !== undefined) strategyUpdate.vertical = strategy.vertical;
    if (strategy?.siteTemplate) strategyUpdate.siteTemplate = strategy.siteTemplate as typeof domain.siteTemplate;
    if (strategy?.monetizationTier !== undefined) strategyUpdate.monetizationTier = strategy.monetizationTier;
    if (strategy?.wave !== undefined) strategyUpdate.wave = strategy.wave;
    if (Object.keys(strategyUpdate).length > 1) {
        await db.update(domains).set(strategyUpdate).where(eq(domains.id, domain.id));
    }

    // ── Step 2: Theme + skin ──
    const combo = assignThemeSkin(domainName, effectiveCluster, [domainName]);
    await db.update(domains).set({ skin: combo.skin, updatedAt: new Date() }).where(eq(domains.id, domain.id));
    result.theme = combo.theme;
    result.skin = combo.skin;

    // Propagate theme+skin to all existing page definitions
    await db.update(pageDefinitions).set({
        theme: combo.theme,
        skin: combo.skin,
        updatedAt: new Date(),
    }).where(eq(pageDefinitions.domainId, domain.id));

    // ── Step 3: Pages — seed if empty, regenerate if strategy was explicitly provided ──
    const existingPages = await db.select({ id: pageDefinitions.id })
        .from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, domain.id))
        .limit(1);
    const hasPages = existingPages.length > 0;
    const forceRegenerate = strategy !== undefined && !!strategy.niche;

    if (!hasPages || forceRegenerate) {
        // Transaction: delete + re-insert is atomic — no partial-seed state on failure
        await db.transaction(async (tx) => {
            if (hasPages && forceRegenerate) {
                await tx.delete(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));
            }

            const homeBlocks = getHomepagePreset(effectiveTemplate, domainName, nicheForContent);
            const subPages = generateSubPages(domainName, nicheForContent);

            // Single bulk INSERT — 1 round-trip instead of N+1
            const allPages = [
                {
                    domainId: domain.id,
                    route: '/',
                    title: effectiveHomeTitle,
                    metaDescription: effectiveHomeMeta || `Expert guides about ${nicheForContent}`,
                    theme: combo.theme,
                    skin: combo.skin,
                    blocks: homeBlocks,
                    isPublished: true,
                    status: 'published' as const,
                },
                ...subPages.map(page => ({
                    domainId: domain.id,
                    route: page.route,
                    title: page.title,
                    metaDescription: page.metaDescription,
                    theme: combo.theme,
                    skin: combo.skin,
                    blocks: page.blocks.map(b => ({ ...b, id: blkId() })),
                    isPublished: true,
                    status: 'published' as const,
                })),
            ];

            await tx.insert(pageDefinitions).values(allPages);
        });

        result.pagesSeeded = true;
    }

    // Compliance pages (always ensure they exist)
    const updatedDomain = {
        ...domain,
        cluster: effectiveCluster,
        niche: effectiveNiche,
        subNiche: effectiveSubNiche,
        monetizationTier: effectiveMonTier,
        skin: combo.skin,
    };
    const compPages = getRequiredCompliancePages(updatedDomain);
    const allCurrentRoutes = new Set(
        (await db.select({ route: pageDefinitions.route }).from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id)))
            .map(p => p.route),
    );
    const missingCompPages = compPages.filter(p => p.route && !allCurrentRoutes.has(p.route));
    if (missingCompPages.length > 0) {
        await db.insert(pageDefinitions).values(missingCompPages);
    }

    // ── Step 4: Programmatic fixes ──
    const allPages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));

    for (const page of allPages) {
        const blocks = (page.blocks || []) as BlockEnvelope[];
        let changed = false;
        const fixed = blocks.map(b => {
            const c = b.content ? { ...b.content } as Record<string, unknown> : {};
            const cfg = b.config ? { ...b.config } as Record<string, unknown> : {};

            if (typeof c.siteName === 'string' && c.siteName !== humanName) {
                c.siteName = humanName;
                result.programmaticFixes.namesFixed++;
                changed = true;
            }

            if (b.type === 'LeadForm' && (cfg.endpoint === '#')) {
                cfg.endpoint = '';
                result.programmaticFixes.endpointsFixed++;
                changed = true;
            }

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

            if (b.type === 'CitationBlock') {
                const sources = c.sources as unknown[];
                const hasPlaceholder = Array.isArray(sources) && sources.length > 0
                    && JSON.stringify(sources).includes('"url":"#"');
                if (!sources || (Array.isArray(sources) && sources.length === 0) || hasPlaceholder) {
                    c.sources = getCitations(effectiveNiche);
                    result.programmaticFixes.citationsInjected++;
                    changed = true;
                }
            }

            return changed ? { ...b, content: c, config: cfg } : b;
        });

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

    // ── Step 6: Content scanning (banned words + burstiness + AI rewrite) ──
    result.contentScan = await scanAndFixBlockContent(domain.id, nicheForContent);

    // ── Step 7: Site review + auto-remediation ──
    const firstReview = await reviewSite(domain.id);
    const needsRemediation = firstReview.verdict === 'reject' || firstReview.criticalIssues.length > 0;
    if (needsRemediation) {
        await remediateSite(domain.id, firstReview);
    }
    const finalReview = needsRemediation ? await reviewSite(domain.id) : firstReview;

    await db.update(domains).set({
        lastReviewResult: finalReview,
        lastReviewScore: Math.round(finalReview.overallScore),
        lastReviewedAt: finalReview.reviewedAt && !isNaN(new Date(finalReview.reviewedAt).getTime())
            ? new Date(finalReview.reviewedAt)
            : new Date(),
        updatedAt: new Date(),
    }).where(eq(domains.id, domain.id));

    // ── Step 8: Validate ──
    result.validation = await validateDomain(domain.id);
    result.pageCount = result.validation.pageCount;
    result.ready = result.validation.ready && finalReview.verdict !== 'reject';

    return result;
}

// ── Block-level content scanning ─────────────────────────────────────────────

const COMPLIANCE_ROUTES = new Set([
    '/privacy-policy', '/privacy', '/terms', '/disclosure',
    '/medical-disclaimer', '/legal-disclaimer', '/contact',
]);

async function scanAndFixBlockContent(domainId: string, niche: string): Promise<ContentScanStats> {
    const stats: ContentScanStats = {
        pagesScanned: 0, blocksWithViolations: 0, totalViolations: 0,
        blocksRewritten: 0, lowBurstinessBlocks: 0, aiCalls: 0, cost: 0,
    };

    const pages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));

    for (const page of pages) {
        if (COMPLIANCE_ROUTES.has(page.route)) continue;
        stats.pagesScanned++;

        const blocks = (page.blocks || []) as BlockEnvelope[];
        let changed = false;
        const updated = [...blocks];

        for (let i = 0; i < updated.length; i++) {
            const block = updated[i];
            const scanResult = scanBlocksForBannedPatterns(block);

            if (scanResult.violations.length > 0) {
                stats.blocksWithViolations++;
                stats.totalViolations += scanResult.violations.length;

                const rewriteResult = await rewriteBlockText(block, scanResult.violations, niche);
                if (rewriteResult.rewritten) {
                    updated[i] = rewriteResult.block;
                    stats.blocksRewritten++;
                    changed = true;
                }
                stats.aiCalls += rewriteResult.aiCalls;
                stats.cost += rewriteResult.cost;
            }

            if (scanResult.lowBurstiness) {
                stats.lowBurstinessBlocks++;
            }
        }

        if (changed) {
            await db.update(pageDefinitions).set({
                blocks: updated as typeof page.blocks,
                updatedAt: new Date(),
            }).where(eq(pageDefinitions.id, page.id));
        }
    }

    return stats;
}
