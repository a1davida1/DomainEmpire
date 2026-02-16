/**
 * Page Definition Seeder — bootstraps v2 page definitions for a domain.
 *
 * Given a domain's siteTemplate (and optionally its content types),
 * creates initial page_definitions rows populated with the correct
 * block presets. This bridges the gap between v1 domain setup and
 * the v2 block-based deploy path.
 *
 * Usage:
 *   await seedPageDefinitions(domainId);              // uses domain's siteTemplate
 *   await seedPageDefinitions(domainId, { publish: true }); // auto-publish
 */

import { db, domains, pageDefinitions, articles } from '@/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import { getHomepagePreset, getArticlePagePreset } from './presets';
import { extractSiteTitle } from '../templates/shared';

// ============================================================
// Types
// ============================================================

export interface SeedOptions {
    /** Auto-publish seeded pages so they're immediately deployable. Default: false */
    publish?: boolean;
    /** Override the theme. Default: 'clean' */
    theme?: string;
    /** Override the skin. Default: domain.skin or 'slate' */
    skin?: string;
    /** Seed article pages for published articles. Default: true */
    seedArticlePages?: boolean;
    /** Skip if page definitions already exist for this domain. Default: true */
    skipIfExists?: boolean;
}

export interface SeedResult {
    domainId: string;
    domain: string;
    seeded: boolean;
    skipped: boolean;
    skipReason?: string;
    homepageCreated: boolean;
    articlePagesCreated: number;
    totalBlockCount: number;
}

// ============================================================
// Core seeder
// ============================================================

/**
 * Seed v2 page definitions for a domain based on its siteTemplate.
 * Creates a homepage and optionally article pages with block presets.
 */
export async function seedPageDefinitions(
    domainId: string,
    options: SeedOptions = {},
): Promise<SeedResult> {
    const {
        publish = false,
        theme = 'clean',
        seedArticlePages = true,
        skipIfExists = true,
    } = options;

    // Load domain
    const domainRows = await db.select().from(domains)
        .where(eq(domains.id, domainId)).limit(1);

    if (domainRows.length === 0) {
        throw new Error(`Domain not found: ${domainId}`);
    }

    const domain = domainRows[0];
    const skinName = options.skin || domain.skin || 'slate';
    const siteTemplate = domain.siteTemplate || 'authority';

    const result: SeedResult = {
        domainId,
        domain: domain.domain,
        seeded: false,
        skipped: false,
        homepageCreated: false,
        articlePagesCreated: 0,
        totalBlockCount: 0,
    };

    // Check if page definitions already exist
    if (skipIfExists) {
        const existing = await db.select({ id: pageDefinitions.id })
            .from(pageDefinitions)
            .where(eq(pageDefinitions.domainId, domainId))
            .limit(1);

        if (existing.length > 0) {
            result.skipped = true;
            result.skipReason = 'Page definitions already exist for this domain';
            return result;
        }
    }

    // --- Homepage ---
    const homepageBlocks = getHomepagePreset(siteTemplate);
    await db.insert(pageDefinitions).values({
        domainId,
        route: '/',
        title: extractSiteTitle(domain.domain),
        metaDescription: `Expert guides about ${domain.niche || 'various topics'}`,
        theme,
        skin: skinName,
        blocks: homepageBlocks,
        isPublished: publish,
        version: 1,
    });
    result.homepageCreated = true;
    result.totalBlockCount += homepageBlocks.length;

    // --- Article pages ---
    if (seedArticlePages) {
        const publishedArticles = await db.select({
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
            contentType: articles.contentType,
            metaDescription: articles.metaDescription,
        })
            .from(articles)
            .where(and(
                eq(articles.domainId, domainId),
                eq(articles.status, 'published'),
                isNull(articles.deletedAt),
            ));

        for (const article of publishedArticles) {
            const slug = article.slug || '';
            if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;

            const contentType = article.contentType || 'article';
            const articleBlocks = getArticlePagePreset(contentType);

            await db.insert(pageDefinitions).values({
                domainId,
                route: `/${slug}`,
                title: article.title,
                metaDescription: article.metaDescription || null,
                theme,
                skin: skinName,
                blocks: articleBlocks,
                isPublished: publish,
                version: 1,
            });

            result.articlePagesCreated++;
            result.totalBlockCount += articleBlocks.length;
        }
    }

    result.seeded = true;
    return result;
}

// ============================================================
// Batch seeder
// ============================================================

export interface BatchSeedOptions extends SeedOptions {
    /** Only seed domains with this siteTemplate. Default: all */
    filterTemplate?: string;
    /** Maximum domains to seed in one batch. Default: 50 */
    limit?: number;
}

export interface BatchSeedResult {
    total: number;
    seeded: number;
    skipped: number;
    failed: number;
    results: SeedResult[];
    errors: Array<{ domainId: string; error: string }>;
}

/**
 * Seed v2 page definitions for multiple domains.
 * Only processes domains that don't already have page definitions.
 */
export async function batchSeedPageDefinitions(
    options: BatchSeedOptions = {},
): Promise<BatchSeedResult> {
    const { filterTemplate, limit = 50, ...seedOpts } = options;

    // Find domains without page definitions
    const query = db.select({
        id: domains.id,
        domain: domains.domain,
        siteTemplate: domains.siteTemplate,
    })
        .from(domains)
        .where(isNull(domains.deletedAt))
        .limit(limit);

    const domainRows = await query;

    // Filter by template if specified
    const filtered = filterTemplate
        ? domainRows.filter(d => d.siteTemplate === filterTemplate)
        : domainRows;

    const result: BatchSeedResult = {
        total: filtered.length,
        seeded: 0,
        skipped: 0,
        failed: 0,
        results: [],
        errors: [],
    };

    for (const domain of filtered) {
        try {
            const seedResult = await seedPageDefinitions(domain.id, {
                ...seedOpts,
                skipIfExists: true,
            });

            result.results.push(seedResult);

            if (seedResult.seeded) {
                result.seeded++;
            } else if (seedResult.skipped) {
                result.skipped++;
            }
        } catch (err) {
            result.failed++;
            result.errors.push({
                domainId: domain.id,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return result;
}

// extractSiteTitle imported from '../templates/shared'
