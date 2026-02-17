/**
 * Block Content Freshness — identifies stale blocks that need regeneration.
 *
 * Each block's content object may include a `_generatedAt` ISO timestamp
 * set by the AI pipeline when content is generated. This module scans
 * page definitions and flags blocks whose content is older than a
 * configurable threshold.
 */

import { db } from '@/lib/db';
import { pageDefinitions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface StaleBlock {
    pageId: string;
    pageRoute: string;
    domainId: string;
    blockId: string;
    blockType: string;
    generatedAt: string | null;
    ageDays: number;
}

export interface FreshnessReport {
    domainId: string;
    totalBlocks: number;
    staleBlocks: StaleBlock[];
    freshBlocks: number;
    oldestBlockAge: number;
    checkedAt: string;
}

const DEFAULT_FRESHNESS_DAYS = 30;

/**
 * Check content freshness for all blocks in a domain's published pages.
 * Returns a report listing stale blocks.
 */
export async function checkBlockFreshness(
    domainId: string,
    maxAgeDays: number = DEFAULT_FRESHNESS_DAYS,
): Promise<FreshnessReport> {
    const pages = await db.select({
        id: pageDefinitions.id,
        route: pageDefinitions.route,
        domainId: pageDefinitions.domainId,
        blocks: pageDefinitions.blocks,
    }).from(pageDefinitions)
        .where(eq(pageDefinitions.domainId, domainId));

    const now = Date.now();
    const staleBlocks: StaleBlock[] = [];
    let totalBlocks = 0;
    let oldestAge = 0;

    for (const page of pages) {
        if (!Array.isArray(page.blocks)) continue;

        for (const block of page.blocks) {
            totalBlocks++;
            const generatedAt = (block.content as Record<string, unknown> | undefined)?._generatedAt as string | undefined;

            let ageDays = maxAgeDays + 1; // Default: treat missing timestamp as stale
            if (generatedAt) {
                const genTime = new Date(generatedAt).getTime();
                if (Number.isFinite(genTime)) {
                    ageDays = Math.max(0, Math.floor((now - genTime) / (24 * 60 * 60 * 1000)));
                }
            }

            if (ageDays > oldestAge) oldestAge = ageDays;

            if (ageDays > maxAgeDays) {
                staleBlocks.push({
                    pageId: page.id,
                    pageRoute: page.route,
                    domainId: page.domainId,
                    blockId: block.id,
                    blockType: block.type,
                    generatedAt: generatedAt || null,
                    ageDays,
                });
            }
        }
    }

    return {
        domainId,
        totalBlocks,
        staleBlocks,
        freshBlocks: totalBlocks - staleBlocks.length,
        oldestBlockAge: oldestAge,
        checkedAt: new Date().toISOString(),
    };
}

/**
 * Batch check freshness across all domains that have page definitions.
 * Returns an array of reports, one per domain with stale blocks.
 */
export async function checkAllDomainBlockFreshness(
    maxAgeDays: number = DEFAULT_FRESHNESS_DAYS,
): Promise<FreshnessReport[]> {
    const allPages = await db.selectDistinct({ domainId: pageDefinitions.domainId })
        .from(pageDefinitions);

    const reports: FreshnessReport[] = [];
    for (const { domainId } of allPages) {
        const report = await checkBlockFreshness(domainId, maxAgeDays);
        if (report.staleBlocks.length > 0) {
            reports.push(report);
        }
    }

    return reports;
}
