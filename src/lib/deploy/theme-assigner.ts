/**
 * Deterministic Theme + Skin Assignment
 *
 * Assigns a unique theme/skin combination to each domain, ensuring maximum
 * visual diversity within each cluster. Assignment is stable: same inputs
 * always produce the same output.
 *
 * Strategy:
 * 1. Generate a stable permutation of all 24 combos seeded by cluster name.
 * 2. Sort domains in the cluster lexicographically.
 * 3. Assign round-robin through the permutation.
 * 4. Duplicates (>24 domains) naturally space by 24.
 */

import { createHash } from 'node:crypto';
import { db, domains, pageDefinitions } from '@/lib/db';
import { eq, isNull } from 'drizzle-orm';
import { availableV2Themes } from './themes/theme-tokens';
import { availableSkins } from './themes/skin-definitions';

export interface ThemeSkinCombo {
    theme: string;
    skin: string;
}

const ALL_COMBOS: ThemeSkinCombo[] = [];
for (const theme of availableV2Themes) {
    for (const skin of availableSkins) {
        ALL_COMBOS.push({ theme, skin });
    }
}

function md5Uint32(input: string): number {
    return createHash('md5').update(input).digest().readUInt32BE(0);
}

/**
 * Fisher-Yates shuffle seeded by a deterministic hash of the cluster name.
 * Produces the same permutation for the same cluster every time.
 */
function seededPermutation(clusterName: string): ThemeSkinCombo[] {
    const combos = [...ALL_COMBOS];
    let seed = md5Uint32(`cluster:${clusterName}`);

    for (let i = combos.length - 1; i > 0; i--) {
        seed = (seed * 1664525 + 1013904223) >>> 0; // LCG
        const j = seed % (i + 1);
        [combos[i], combos[j]] = [combos[j], combos[i]];
    }

    return combos;
}

/**
 * Canonicalize a domain name for hashing: lowercase, trim, strip protocol.
 */
function canonicalize(domainName: string): string {
    return domainName
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
}

/**
 * Deterministically assign a theme+skin combo for a domain within its cluster.
 *
 * @param domainName - The domain's FQDN
 * @param cluster - The cluster this domain belongs to (null/empty treated as 'misc')
 * @param allDomainsInCluster - All domain names in the same cluster (order doesn't matter; sorted internally)
 */
export function assignThemeSkin(
    domainName: string,
    cluster: string | null | undefined,
    allDomainsInCluster: string[],
): ThemeSkinCombo {
    const effectiveCluster = cluster?.trim().toLowerCase() || 'misc';
    const canonicalDomain = canonicalize(domainName);
    const sorted = allDomainsInCluster.map(canonicalize).sort();
    const index = sorted.indexOf(canonicalDomain);

    if (index === -1) {
        const fallbackIdx = md5Uint32(canonicalDomain) % ALL_COMBOS.length;
        return ALL_COMBOS[fallbackIdx];
    }

    const permutation = seededPermutation(effectiveCluster);
    return permutation[index % permutation.length];
}

/**
 * Reassign theme+skin for all domains in the database, grouped by cluster.
 * Updates domains.skin and all associated pageDefinitions.theme + pageDefinitions.skin.
 * Runs in a single transaction.
 */
export async function assignAllThemes(): Promise<{ updated: number; skipped: number }> {
    const allDomains = await db
        .select({
            id: domains.id,
            domain: domains.domain,
            cluster: domains.cluster,
        })
        .from(domains)
        .where(isNull(domains.deletedAt));

    const byCluster = new Map<string, typeof allDomains>();
    for (const d of allDomains) {
        const key = d.cluster?.trim().toLowerCase() || 'misc';
        const list = byCluster.get(key) || [];
        list.push(d);
        byCluster.set(key, list);
    }

    let updated = 0;
    let skipped = 0;

    await db.transaction(async (tx) => {
        for (const [cluster, clusterDomains] of byCluster) {
            const allNames = clusterDomains.map(d => d.domain);

            for (const d of clusterDomains) {
                const combo = assignThemeSkin(d.domain, cluster, allNames);

                await tx.update(domains).set({
                    skin: combo.skin,
                    updatedAt: new Date(),
                }).where(eq(domains.id, d.id));

                const affectedPages = await tx
                    .update(pageDefinitions)
                    .set({
                        theme: combo.theme,
                        skin: combo.skin,
                        updatedAt: new Date(),
                    })
                    .where(eq(pageDefinitions.domainId, d.id))
                    .returning({ id: pageDefinitions.id });

                if (affectedPages.length > 0) {
                    updated++;
                } else {
                    skipped++;
                }
            }
        }
    });

    return { updated, skipped };
}
