/**
 * Fast re-seed of acunitinstall.com pages with AC-specific niche content.
 * Uses the updated pipeline code (sidebar filtering, minimal headers, etc.)
 * Skips the slow AI enrichment/review steps — just regenerates pages + deploys.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db, domains, pageDefinitions } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { mergeBlockDefaults } from '@/lib/deploy/blocks/default-content';
import type { BlockType } from '@/lib/deploy/blocks/schemas';
import { extractSiteTitle } from '@/lib/deploy/templates/shared';
import { getRequiredCompliancePages } from '@/lib/deploy/compliance-templates';
import {
    generateBlueprint,
    sectionSlotToBlockType,
    footerStructureToVariant,
    heroStructureToVariant,
    ctaStyleToConfig,
    buildBlueprintFooterColumns,
} from '@/lib/deploy/structural-blueprint';
import { generateSubPagesFromBlueprint } from '@/lib/deploy/blocks/sub-page-presets';

function blkId(): string {
    return `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function main() {
    const domainId = '05284b56-a2ef-450f-bfb2-e9139c1fea97';
    const niche = 'AC Unit Installation';
    const theme = 'clean';
    const skin = 'cobalt';

    // 1. Update domain
    const [domain] = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domain) throw new Error('Domain not found');
    
    await db.update(domains).set({
        niche,
        subNiche: 'HVAC Installation',
        vertical: 'Home Services',
        themeStyle: theme,
        skin,
        cloudflareAccount: null,
        cloudflareProject: 'acunitinstall-com',
        updatedAt: new Date(),
    }).where(eq(domains.id, domainId));
    console.log(`Domain updated: niche="${niche}", theme=${theme}, skin=${skin}`);

    const domainName = domain.domain;
    const humanName = (domain as Record<string, unknown>).siteNameOverride as string || extractSiteTitle(domainName);
    console.log(`Site title: "${humanName}"`);

    // 2. Delete existing pages
    await db.delete(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));
    console.log('Deleted existing page definitions');

    // 3. Generate blueprint and seed pages
    const blueprint = generateBlueprint(domainName, niche, 'cost_guide');
    const heroVar = heroStructureToVariant(blueprint.heroStructure);
    const footerVar = footerStructureToVariant(blueprint.footerStructure);
    const ctaCfg = ctaStyleToConfig(blueprint.ctaStyle);

    function mergedBlock(type: string, overrides?: { variant?: string; config?: Record<string, unknown>; content?: Record<string, unknown> }) {
        const defaults = mergeBlockDefaults({ type: type as BlockType }, domainName, niche);
        return {
            type,
            id: blkId(),
            variant: overrides?.variant || undefined,
            content: { ...(defaults.content || {}), ...(overrides?.content || {}) },
            config: { ...(defaults.config || {}), ...(overrides?.config || {}) },
        };
    }

    // All headers use minimal+sticky
    const homeBlocks = [
        mergedBlock('Header', {
            variant: 'minimal',
            config: { sticky: true },
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

    // Generate sub-pages (now includes sidebar category filtering pipeline fix)
    const subPages = generateSubPagesFromBlueprint(domainName, niche, blueprint);

    // Force all headers to minimal+sticky
    for (const page of subPages) {
        for (const block of page.blocks) {
            if (block.type === 'Header') {
                block.variant = 'minimal';
                const config = (block.config || {}) as Record<string, unknown>;
                config.sticky = true;
                block.config = config;
            }
        }
    }

    const allPages = [
        {
            domainId,
            route: '/',
            title: humanName,
            metaDescription: `Expert AC unit installation guides, cost calculators, and reviews. Get free estimates for HVAC installation.`,
            theme,
            skin,
            blocks: homeBlocks,
            isPublished: true,
            status: 'published' as const,
        },
        ...subPages.map(page => ({
            domainId,
            route: page.route,
            title: page.title,
            metaDescription: page.metaDescription,
            theme,
            skin,
            blocks: page.blocks,
            isPublished: true,
            status: 'published' as const,
        })),
    ];

    await db.insert(pageDefinitions).values(allPages);
    console.log(`Seeded ${allPages.length} pages`);

    // 4. Add compliance pages
    const updatedDomain = { ...domain, niche, skin, cluster: null, monetizationTier: 3, subNiche: 'HVAC Installation' };
    const compPages = getRequiredCompliancePages(updatedDomain);
    const currentRoutes = new Set(allPages.map(p => p.route));
    const missing = compPages.filter(p => p.route && !currentRoutes.has(p.route));
    if (missing.length > 0) {
        await db.insert(pageDefinitions).values(missing);
        console.log(`Added ${missing.length} compliance pages`);
    }

    // 5. Fix footer links to only point to valid routes
    const liveRoutes = new Set(
        (await db.select({ route: pageDefinitions.route }).from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId)))
            .map(p => p.route),
    );
    const footerColumns = buildBlueprintFooterColumns(blueprint, liveRoutes, humanName, niche);
    
    const finalPages = await db.select().from(pageDefinitions).where(eq(pageDefinitions.domainId, domainId));
    for (const page of finalPages) {
        const blocks = (page.blocks || []) as Array<Record<string, unknown>>;
        let changed = false;
        for (const b of blocks) {
            if (b.type === 'Footer') {
                const c = (b.content || {}) as Record<string, unknown>;
                c.columns = footerColumns;
                c.siteName = humanName;
                b.content = c;
                changed = true;
            }
            // Also filter sidebar categories by live routes
            if (b.type === 'Sidebar') {
                const c = (b.content || {}) as Record<string, unknown>;
                const cats = c.categories as Array<{ href: string }> | undefined;
                if (cats && Array.isArray(cats)) {
                    c.categories = cats.filter(cat => liveRoutes.has(cat.href));
                    b.content = c;
                    changed = true;
                }
            }
        }
        if (changed) {
            await db.update(pageDefinitions).set({ blocks: blocks as typeof page.blocks, updatedAt: new Date() }).where(eq(pageDefinitions.id, page.id));
        }
    }
    console.log('Fixed footer + sidebar links');

    // 6. List pages with sidebar info
    console.log('\n=== Pages ===');
    for (const p of finalPages) {
        const blocks = (p.blocks || []) as Array<Record<string, unknown>>;
        const types = blocks.map(b => b.type).join(', ');
        const sidebar = blocks.find(b => b.type === 'Sidebar');
        const sidebarInfo = sidebar ? ` [sidebar: ${((sidebar.content as Record<string, unknown>)?.categories as unknown[])?.length || 0} cats]` : '';
        console.log(`  ${p.route} — "${p.title}" [${types}]${sidebarInfo}`);
    }

    // 7. Queue deploy
    await db.update(domains).set({ status: 'active' }).where(eq(domains.id, domainId));
    const jobId = randomUUID();
    const { default: postgres } = await import('postgres');
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require' });
    await sql`UPDATE content_queue SET status = 'cancelled' WHERE domain_id = ${domainId} AND job_type = 'deploy' AND status IN ('pending', 'processing', 'failed')`;
    await sql`INSERT INTO content_queue (id, domain_id, job_type, status, priority, payload, scheduled_for, max_attempts, created_at)
              VALUES (${jobId}, ${domainId}, 'deploy', 'pending', 2, ${JSON.stringify({
                  domain: 'acunitinstall.com',
                  triggerBuild: true,
                  addCustomDomain: false,
              })}, NOW(), 3, NOW())`;
    console.log(`\nDeploy queued: ${jobId}`);
    await sql.end();
    
    setTimeout(() => process.exit(0), 2000);
}

main().catch((e) => { console.error(e); process.exit(1); });
