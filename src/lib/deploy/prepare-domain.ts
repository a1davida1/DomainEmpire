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
import { generateSubPagesFromBlueprint } from './blocks/sub-page-presets';
import { mergeBlockDefaults } from './blocks/default-content';
import type { BlockType } from './blocks/schemas';
import { getRequiredCompliancePages } from './compliance-templates';
import { enrichDomain, getCitations } from './enrich';
import { validateDomain, type ValidationReport } from './validate';
import { extractSiteTitle } from './templates/shared';
import type { BlockEnvelope } from './blocks/schemas';
import { reviewSite, remediateSite } from './site-review';
import { scanBlocksForBannedPatterns, rewriteBlockText } from './block-content-scanner';
import {
    generateBlueprint,
    sectionSlotToBlockType,
    headerStyleToBlock,
    footerStructureToVariant,
    heroStructureToVariant,
    ctaStyleToConfig,
    buildBlueprintFooterColumns,
} from './structural-blueprint';

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
    placeholderBlocks: number;
    totalPlaceholders: number;
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
        ),
    ]);
}

/**
 * Infer a more specific content niche from the domain name when the DB niche
 * is too broad (e.g. "Home Services", "Finance", "Health").
 *
 * Examples:
 *   ac-unit-install.com + "Home Services" → "Ac Unit Install"
 *   myhomevalue.io      + "Real estate"   → "Home Value"  (keeps DB niche as-is since it's specific enough)
 *   best-roofing-cost.com + "Home Services" → "Roofing Cost"
 *   acunitinstall.com   + "Home Services" → "Home Services" (no separators → falls back to DB niche)
 */
const BROAD_NICHES = new Set([
    'general', 'home services', 'finance', 'health', 'business',
    'technology', 'education', 'lifestyle', 'travel', 'food',
]);

function inferNicheFromDomain(domain: string, dbNiche: string): string {
    // If the DB niche is already specific, use it directly
    if (!BROAD_NICHES.has(dbNiche.toLowerCase())) return dbNiche;

    // Strip subdomain prefix (e.g. www.) and TLD
    const slug = domain
        .replace(/^(?:www\.)+/i, '')
        .replace(/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i, '');

    // Split camelCase, hyphens, and common compound words
    const words = slug
        .replace(/([a-z])([A-Z])/g, '$1 $2')       // camelCase
        .replace(/[-_]/g, ' ')                        // hyphens/underscores
        .replace(/(\d+)/g, ' $1 ')                    // separate numbers
        .replace(/\b(my|best|top|the|get|go|find|pro|ez|cheap)\b/gi, ' ')  // strip filler words
        .replace(/\s+/g, ' ')
        .trim();

    const parts = words.split(' ').filter(w => w.length > 0);

    // If we couldn't split into at least 2 tokens the slug is an unsplittable
    // compound word (e.g. "acunitinstall") — fall back to the DB niche rather
    // than producing a nonsense single-token niche.
    if (parts.length < 2) return dbNiche;

    // Title-case and return as the content niche
    const inferred = parts
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    return inferred || dbNiche;
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
    const humanName = (domain as Record<string, unknown>).siteNameOverride as string || extractSiteTitle(domainName);

    // Merge explicit strategy with existing DB values
    const effectiveNiche = strategy?.niche || domain.niche || 'general';
    const effectiveSubNiche = strategy?.subNiche ?? domain.subNiche ?? null;
    const effectiveCluster = strategy?.cluster ?? domain.cluster ?? null;
    const effectiveMonTier = strategy?.monetizationTier ?? domain.monetizationTier ?? 3;
    const effectiveHomeTitle = strategy?.homeTitle ?? extractSiteTitle(domainName);
    const effectiveHomeMeta = strategy?.homeMeta ?? null;

    // Infer a more specific niche from the domain name when the DB niche is too broad.
    // e.g. "acunitinstall.com" with niche "Home Services" → content niche "AC Unit Installation"
    const nicheForContent = effectiveSubNiche || inferNicheFromDomain(domainName, effectiveNiche);

    const result: PrepareResult = {
        domain: domainName,
        humanName,
        theme: '',
        skin: '',
        pageCount: 0,
        pagesSeeded: false,
        programmaticFixes: { namesFixed: 0, endpointsFixed: 0, duplicatesRemoved: 0, citationsInjected: 0 },
        enrichment: { heroesFixed: 0, calculatorsFixed: 0, faqsFixed: 0, metaFixed: 0, aiCalls: 0, cost: 0 },
        contentScan: { pagesScanned: 0, blocksWithViolations: 0, totalViolations: 0, blocksRewritten: 0, lowBurstinessBlocks: 0, placeholderBlocks: 0, totalPlaceholders: 0, aiCalls: 0, cost: 0 },
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
    const resolvedTemplate = strategy?.siteTemplate ?? domain.siteTemplate ?? 'authority';
    const blueprint = generateBlueprint(domainName, nicheForContent, resolvedTemplate);

    const existingPages = await db.select({ id: pageDefinitions.id })
        .from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, domain.id))
        .limit(1);
    const hasPages = existingPages.length > 0;
    const forceRegenerate = strategy !== undefined && (
        strategy.niche !== undefined
        || strategy.subNiche !== undefined
        || strategy.siteTemplate !== undefined
    );

    if (!hasPages || forceRegenerate) {
        await db.transaction(async (tx) => {
            if (hasPages && forceRegenerate) {
                await tx.delete(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id));
            }

            // Build homepage from blueprint layout (not a static preset)
            const headerDef = headerStyleToBlock(blueprint.headerStyle);
            const heroVar = heroStructureToVariant(blueprint.heroStructure);
            const footerVar = footerStructureToVariant(blueprint.footerStructure);
            const ctaCfg = ctaStyleToConfig(blueprint.ctaStyle);

            function mergedBlock(type: string, overrides?: { variant?: string; config?: Record<string, unknown>; content?: Record<string, unknown> }) {
                const defaults = mergeBlockDefaults({ type: type as BlockType }, domainName, nicheForContent);
                return {
                    type,
                    id: blkId(),
                    variant: overrides?.variant,
                    content: { ...(defaults.content || {}), ...(overrides?.content || {}) },
                    config: { ...(defaults.config || {}), ...(overrides?.config || {}) },
                };
            }

            const homeBlocks = [
                mergedBlock('Header', {
                    variant: headerDef.variant,
                    config: headerDef.config,
                    content: { navLinks: blueprint.nav.items, siteName: humanName },
                }),
            ];

            for (const slot of blueprint.homepageLayout) {
                const blockType = sectionSlotToBlockType(slot);
                if (blockType === 'Hero') {
                    const heroContent: Record<string, unknown> = {};
                    if (heroVar === 'stats-bar') {
                        heroContent.stats = [
                            { value: `${blueprint.guideCount}+`, label: 'Expert Guides' },
                            { value: 'Free', label: 'Calculator Included' },
                            { value: String(new Date().getFullYear()), label: 'Updated' },
                        ];
                    }
                    homeBlocks.push(mergedBlock('Hero', { variant: heroVar, content: heroContent }));
                } else if (blockType === 'CTABanner') {
                    if (ctaCfg) homeBlocks.push(mergedBlock('CTABanner', { config: ctaCfg }));
                } else {
                    homeBlocks.push(mergedBlock(blockType));
                }
            }

            homeBlocks.push(mergedBlock('CitationBlock'));
            homeBlocks.push(mergedBlock('Footer', { variant: footerVar, content: { siteName: humanName } }));

            // Generate sub-pages from blueprint (structurally differentiated)
            const subPages = generateSubPagesFromBlueprint(domainName, nicheForContent, blueprint);

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
                    blocks: page.blocks,
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
    // Build the set of routes that actually exist for footer link filtering
    const liveRoutes = new Set(
        (await db.select({ route: pageDefinitions.route }).from(pageDefinitions).where(eq(pageDefinitions.domainId, domain.id)))
            .map(p => p.route),
    );
    const blueprintFooterColumns = buildBlueprintFooterColumns(blueprint, liveRoutes, humanName, nicheForContent);
    const blueprintFooterVariant = footerStructureToVariant(blueprint.footerStructure);
    const allowedFooterVariants = new Set(['minimal', 'multi-column', 'newsletter', 'legal']);

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

            // Fix footer: inject blueprint-aware columns with only valid links
            if (b.type === 'Footer') {
                c.columns = blueprintFooterColumns;
                c.siteName = humanName;
                changed = true;
                const currentVariant = typeof b.variant === 'string' ? b.variant : null;
                if (currentVariant && !allowedFooterVariants.has(currentVariant)) {
                    return { ...b, variant: blueprintFooterVariant, content: c, config: cfg };
                }
                return { ...b, content: c, config: cfg };
            }

            // Fix dead links in markdown content — strip links to pages that don't exist
            if (b.type === 'ArticleBody' || b.type === 'FAQ') {
                const linkRe = /\[([^\]]+)\]\(\/([^)]+)\)/g;
                let fixCount = 0;
                function stripDeadLinks(text: string): string {
                    return text.replace(linkRe, (full, label, path) => {
                        const route = '/' + path;
                        if (!liveRoutes.has(route) && !liveRoutes.has(route.replace(/\/$/, ''))) {
                            fixCount++;
                            return label;
                        }
                        return full;
                    });
                }
                for (const key of Object.keys(c)) {
                    const val = c[key];
                    if (typeof val === 'string' && val.includes('](/')) {
                        c[key] = stripDeadLinks(val);
                    }
                    if (Array.isArray(val)) {
                        for (let j = 0; j < val.length; j++) {
                            const item = val[j];
                            if (item && typeof item === 'object') {
                                for (const ik of Object.keys(item as Record<string, unknown>)) {
                                    const iv = (item as Record<string, unknown>)[ik];
                                    if (typeof iv === 'string' && iv.includes('](/')) {
                                        (item as Record<string, unknown>)[ik] = stripDeadLinks(iv);
                                    }
                                }
                            }
                        }
                    }
                }
                if (fixCount > 0) {
                    result.programmaticFixes.namesFixed += fixCount;
                    changed = true;
                }
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

    // ── Step 5: Targeted AI enrichment (with timeout) ──
    const AI_STEP_TIMEOUT_MS = 90_000; // 90s per AI step — fail gracefully
    try {
        const enrichResult = await withTimeout(enrichDomain(domain.id), AI_STEP_TIMEOUT_MS, 'AI enrichment');
        result.enrichment = {
            heroesFixed: enrichResult.heroesFixed,
            calculatorsFixed: enrichResult.calculatorsFixed,
            faqsFixed: enrichResult.faqsFixed,
            metaFixed: enrichResult.metaFixed,
            aiCalls: enrichResult.totalAiCalls,
            cost: enrichResult.totalCost,
        };
    } catch (err) {
        console.warn('[prepareDomain] AI enrichment skipped:', err instanceof Error ? err.message : err);
    }

    // ── Step 6: Content scanning (banned words + burstiness + AI rewrite) ──
    try {
        result.contentScan = await withTimeout(scanAndFixBlockContent(domain.id, nicheForContent), AI_STEP_TIMEOUT_MS, 'content scan');
    } catch (err) {
        console.warn('[prepareDomain] Content scan skipped:', err instanceof Error ? err.message : err);
    }

    // ── Step 7: Site review + auto-remediation ──
    let finalReview;
    try {
        const firstReview = await withTimeout(reviewSite(domain.id), AI_STEP_TIMEOUT_MS, 'site review');
        const needsRemediation = firstReview.verdict === 'reject' || firstReview.criticalIssues.length > 0;
        if (needsRemediation) {
            await withTimeout(remediateSite(domain.id, firstReview), AI_STEP_TIMEOUT_MS, 'remediation');
        }
        finalReview = needsRemediation ? await withTimeout(reviewSite(domain.id), AI_STEP_TIMEOUT_MS, 'final review') : firstReview;
    } catch (err) {
        console.warn('[prepareDomain] Site review skipped:', err instanceof Error ? err.message : err);
        finalReview = null;
    }

    if (finalReview) {
        await db.update(domains).set({
            lastReviewResult: finalReview,
            lastReviewScore: Math.round(finalReview.overallScore),
            lastReviewedAt: finalReview.reviewedAt && !isNaN(new Date(finalReview.reviewedAt).getTime())
                ? new Date(finalReview.reviewedAt)
                : new Date(),
            updatedAt: new Date(),
        }).where(eq(domains.id, domain.id));
    }

    // ── Step 8: Validate ──
    result.validation = await validateDomain(domain.id);
    result.pageCount = result.validation.pageCount;
    result.ready = result.validation.ready && (!finalReview || finalReview.verdict !== 'reject');

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
        blocksRewritten: 0, lowBurstinessBlocks: 0, placeholderBlocks: 0,
        totalPlaceholders: 0, aiCalls: 0, cost: 0,
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

            if (scanResult.placeholders.length > 0) {
                stats.placeholderBlocks++;
                stats.totalPlaceholders += scanResult.placeholders.length;
                console.warn(
                    `[content-scanner] ${scanResult.placeholders.length} placeholder(s) in ${block.type} block ${block.id}:`,
                    scanResult.placeholders.map(p => `${p.field}: ${p.reason}`).join('; '),
                );
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
