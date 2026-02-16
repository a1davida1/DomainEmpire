/**
 * Migration script: Convert v1 domains to v2 block-based page definitions.
 *
 * Maps each domain's siteTemplate → preset block sequence, themeStyle → v2 theme+skin.
 * Creates page_definitions rows for homepage + all published articles.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-blocks.ts                     # dry-run (default)
 *   npx tsx scripts/migrate-to-blocks.ts --execute           # actually migrate
 *   npx tsx scripts/migrate-to-blocks.ts --execute --publish  # migrate + auto-publish
 *   npx tsx scripts/migrate-to-blocks.ts --domain example.com # migrate single domain
 *   npx tsx scripts/migrate-to-blocks.ts --template comparison # filter by siteTemplate
 */

import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(__dirname, '../.env.local') });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const V1_THEME_TO_V2_THEME: Record<string, string> = {
    'navy-serif': 'editorial',
    'green-modern': 'clean',
    'medical-clean': 'minimal',
    'professional-blue': 'editorial',
    'health-clean': 'minimal',
    'consumer-friendly': 'bold',
    'tech-modern': 'bold',
    'trust-minimal': 'minimal',
    'hobby-vibrant': 'bold',
    'minimal-blue': 'clean',
    'earth-inviting': 'editorial',
    'high-contrast-accessible': 'bold',
    'playful-modern': 'bold',
    'masculine-dark': 'bold',
    'enthusiast-community': 'clean',
    'clean-general': 'clean',
};

const V1_THEME_TO_SKIN: Record<string, string> = {
    'navy-serif': 'slate',
    'green-modern': 'forest',
    'medical-clean': 'slate',
    'professional-blue': 'ocean',
    'health-clean': 'forest',
    'consumer-friendly': 'ember',
    'tech-modern': 'midnight',
    'trust-minimal': 'slate',
    'hobby-vibrant': 'ember',
    'minimal-blue': 'ocean',
    'earth-inviting': 'ember',
    'high-contrast-accessible': 'slate',
    'playful-modern': 'coral',
    'masculine-dark': 'midnight',
    'enthusiast-community': 'ocean',
    'clean-general': 'slate',
};

// Inline the preset logic to avoid import issues with path aliases
import { getHomepagePreset, getArticlePagePreset } from '../src/lib/deploy/blocks/presets';

interface MigrationResult {
    domain: string;
    domainId: string;
    siteTemplate: string;
    v1Theme: string;
    v2Theme: string;
    v2Skin: string;
    homepageCreated: boolean;
    articlePagesCreated: number;
    totalBlocks: number;
    skipped: boolean;
    skipReason?: string;
    error?: string;
}

function extractSiteTitle(domain: string): string {
    const ccTlds = ['.co.uk', '.com.au', '.co.nz', '.co.za', '.com.br', '.co.in', '.org.uk', '.net.au'];
    let sld = domain;
    for (const ccTld of ccTlds) {
        if (domain.endsWith(ccTld)) {
            sld = domain.slice(0, -ccTld.length);
            break;
        }
    }
    if (sld === domain) {
        const lastDot = domain.lastIndexOf('.');
        sld = lastDot > 0 ? domain.slice(0, lastDot) : domain;
    }
    return sld.replaceAll('-', ' ').replaceAll(/\b\w/g, c => c.toUpperCase());
}

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const publish = args.includes('--publish');
    const domainFlag = args.indexOf('--domain');
    const templateFlag = args.indexOf('--template');
    const filterDomain = domainFlag >= 0 ? args[domainFlag + 1] : null;
    const filterTemplate = templateFlag >= 0 ? args[templateFlag + 1] : null;

    console.log('=== v1 → v2 Block Migration ===');
    console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
    console.log(`Auto-publish: ${publish}`);
    if (filterDomain) console.log(`Filter domain: ${filterDomain}`);
    if (filterTemplate) console.log(`Filter template: ${filterTemplate}`);
    console.log('');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('ERROR: DATABASE_URL not set');
        process.exit(1);
    }

    const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    const client = postgres(dbUrl, { max: 1, ssl: isLocal ? false : 'require', connect_timeout: 10 });
    const db = drizzle(client, { schema });

    try {
        // Fetch domains
        const allDomains = await db.select({
            id: schema.domains.id,
            domain: schema.domains.domain,
            siteTemplate: schema.domains.siteTemplate,
            themeStyle: schema.domains.themeStyle,
            skin: schema.domains.skin,
            niche: schema.domains.niche,
            status: schema.domains.status,
        })
            .from(schema.domains)
            .where(isNull(schema.domains.deletedAt));

        let filtered = allDomains;
        if (filterDomain) {
            filtered = filtered.filter(d => d.domain === filterDomain);
        }
        if (filterTemplate) {
            filtered = filtered.filter(d => d.siteTemplate === filterTemplate);
        }

        console.log(`Found ${filtered.length} domain(s) to process\n`);

        const results: MigrationResult[] = [];
        let totalCreated = 0;
        let totalSkipped = 0;
        let totalFailed = 0;

        for (const domain of filtered) {
            const siteTemplate = domain.siteTemplate || 'authority';
            const v1Theme = domain.themeStyle || 'clean-general';
            const v2Theme = V1_THEME_TO_V2_THEME[v1Theme] || 'clean';
            const v2Skin = V1_THEME_TO_SKIN[v1Theme] || domain.skin || 'slate';

            const result: MigrationResult = {
                domain: domain.domain,
                domainId: domain.id,
                siteTemplate,
                v1Theme,
                v2Theme,
                v2Skin,
                homepageCreated: false,
                articlePagesCreated: 0,
                totalBlocks: 0,
                skipped: false,
            };

            try {
                // Check if already migrated
                const existing = await db.select({ id: schema.pageDefinitions.id })
                    .from(schema.pageDefinitions)
                    .where(eq(schema.pageDefinitions.domainId, domain.id))
                    .limit(1);

                if (existing.length > 0) {
                    result.skipped = true;
                    result.skipReason = 'already has page_definitions';
                    totalSkipped++;
                    results.push(result);
                    continue;
                }

                // Get homepage blocks from preset
                const homepageBlocks = getHomepagePreset(siteTemplate);
                result.totalBlocks += homepageBlocks.length;

                // Get published articles
                const articles = await db.select({
                    id: schema.articles.id,
                    slug: schema.articles.slug,
                    title: schema.articles.title,
                    contentType: schema.articles.contentType,
                    metaDescription: schema.articles.metaDescription,
                })
                    .from(schema.articles)
                    .where(and(
                        eq(schema.articles.domainId, domain.id),
                        eq(schema.articles.status, 'published'),
                        isNull(schema.articles.deletedAt),
                    ));

                // Build article page data
                const articlePages: Array<{
                    route: string;
                    title: string;
                    metaDescription: string | null;
                    blocks: ReturnType<typeof getArticlePagePreset>;
                }> = [];

                for (const article of articles) {
                    const slug = article.slug || '';
                    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
                    const contentType = article.contentType || 'article';
                    const blocks = getArticlePagePreset(contentType);
                    articlePages.push({
                        route: `/${slug}`,
                        title: article.title,
                        metaDescription: article.metaDescription || null,
                        blocks,
                    });
                    result.totalBlocks += blocks.length;
                }

                result.articlePagesCreated = articlePages.length;
                result.homepageCreated = true;

                if (execute) {
                    // Insert homepage
                    await db.insert(schema.pageDefinitions).values({
                        domainId: domain.id,
                        route: '/',
                        title: extractSiteTitle(domain.domain),
                        metaDescription: `Expert guides about ${domain.niche || 'various topics'}`,
                        theme: v2Theme,
                        skin: v2Skin,
                        blocks: homepageBlocks,
                        isPublished: publish,
                        version: 1,
                    });

                    // Insert article pages
                    for (const ap of articlePages) {
                        await db.insert(schema.pageDefinitions).values({
                            domainId: domain.id,
                            route: ap.route,
                            title: ap.title,
                            metaDescription: ap.metaDescription,
                            theme: v2Theme,
                            skin: v2Skin,
                            blocks: ap.blocks,
                            isPublished: publish,
                            version: 1,
                        });
                    }

                    // Update domain skin column
                    await db.update(schema.domains).set({
                        skin: v2Skin,
                    }).where(eq(schema.domains.id, domain.id));
                }

                totalCreated++;
                results.push(result);
            } catch (err) {
                result.error = err instanceof Error ? err.message : String(err);
                totalFailed++;
                results.push(result);
            }
        }

        // Print results
        console.log('--- Results ---\n');

        for (const r of results) {
            const status = r.error ? '✗ ERROR' : r.skipped ? '⊘ SKIP' : '✓ OK';
            const detail = r.error
                ? r.error
                : r.skipped
                    ? r.skipReason
                    : `homepage + ${r.articlePagesCreated} articles (${r.totalBlocks} blocks) | ${r.v1Theme} → ${r.v2Theme}/${r.v2Skin}`;
            console.log(`  ${status}  ${r.domain} [${r.siteTemplate}] — ${detail}`);
        }

        console.log('\n--- Summary ---');
        console.log(`  Migrated: ${totalCreated}`);
        console.log(`  Skipped:  ${totalSkipped}`);
        console.log(`  Failed:   ${totalFailed}`);
        console.log(`  Total:    ${filtered.length}`);

        if (!execute && totalCreated > 0) {
            console.log('\n⚠  DRY RUN — no changes were made. Use --execute to apply.');
        }
    } finally {
        await client.end();
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
