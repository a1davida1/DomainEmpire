/**
 * Backlink Monitoring
 *
 * Tracks backlink profiles using free/affordable APIs.
 * Primary: CommonCrawl index for basic backlink discovery.
 * Optional: Moz Link API for authority metrics (MOZ_ACCESS_ID + MOZ_SECRET_KEY).
 */

import { db } from '@/lib/db';
import { backlinkSnapshots, domains } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface BacklinkData {
    source: string;
    target: string;
    anchor: string;
    authority: number;
    firstSeen: string;
}

/**
 * Query CommonCrawl index for pages referencing a domain.
 */
async function queryCommonCrawl(domain: string, limit = 50): Promise<BacklinkData[]> {
    try {
        const indexResp = await fetch('https://index.commoncrawl.org/collinfo.json', {
            signal: AbortSignal.timeout(10000),
        });
        if (!indexResp.ok) return [];

        const indexes = await indexResp.json() as Array<{ 'cdx-api': string }>;
        if (!indexes.length) return [];

        const latestIndex = indexes[0]['cdx-api'];
        const searchUrl = `${latestIndex}?url=*.${domain}&output=json&limit=${limit}&fl=url,timestamp,status`;
        const response = await fetch(searchUrl, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) return [];

        const text = await response.text();
        const lines = text.trim().split('\n').filter(Boolean);

        return lines.slice(0, limit).map(line => {
            try {
                const data = JSON.parse(line) as { url: string; timestamp: string };
                const sourceDomain = new URL(data.url).hostname;
                return {
                    source: sourceDomain,
                    target: `https://${domain}`,
                    anchor: '',
                    authority: 0,
                    firstSeen: data.timestamp,
                };
            } catch {
                return null;
            }
        }).filter((b): b is BacklinkData => b !== null);
    } catch (error) {
        console.error('CommonCrawl query failed:', error);
        return [];
    }
}

/**
 * Query Moz Link API for authority metrics.
 */
async function queryMozMetrics(domain: string): Promise<{
    domainAuthority: number;
    totalBacklinks: number;
    referringDomains: number;
} | null> {
    const accessId = process.env.MOZ_ACCESS_ID;
    const secretKey = process.env.MOZ_SECRET_KEY;
    if (!accessId || !secretKey) return null;

    try {
        const response = await fetch('https://lsapi.seomoz.com/v2/url_metrics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${accessId}:${secretKey}`).toString('base64')}`,
            },
            body: JSON.stringify({ targets: [domain] }),
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) return null;

        const data = await response.json() as {
            results: Array<{
                domain_authority: number;
                external_links_to_root_domain: number;
                root_domains_to_root_domain: number;
            }>;
        };

        const result = data.results?.[0];
        if (!result) return null;

        return {
            domainAuthority: Math.round(result.domain_authority),
            totalBacklinks: result.external_links_to_root_domain,
            referringDomains: result.root_domains_to_root_domain,
        };
    } catch (error) {
        console.error('Moz API query failed:', error);
        return null;
    }
}

/**
 * Run a backlink check for a domain and save a snapshot.
 */
export async function checkBacklinks(domainId: string): Promise<void> {
    const domainRecord = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
    if (!domainRecord.length) return;

    const domain = domainRecord[0].domain;

    const [ccLinks, mozData] = await Promise.all([
        queryCommonCrawl(domain),
        queryMozMetrics(domain),
    ]);

    await db.insert(backlinkSnapshots).values({
        domainId,
        totalBacklinks: mozData?.totalBacklinks ?? ccLinks.length,
        referringDomains: mozData?.referringDomains ?? new Set(ccLinks.map(l => l.source)).size,
        domainAuthority: mozData?.domainAuthority ?? null,
        topBacklinks: ccLinks.slice(0, 20),
        lostBacklinks: [],
        snapshotDate: new Date(),
    });
}

/**
 * Detect lost backlinks by comparing latest two snapshots.
 */
export async function detectLostBacklinks(domainId: string): Promise<Array<{
    source: string;
    target: string;
    lostDate: string;
}>> {
    const snapshots = await db
        .select()
        .from(backlinkSnapshots)
        .where(eq(backlinkSnapshots.domainId, domainId))
        .orderBy(backlinkSnapshots.snapshotDate)
        .limit(2);

    if (snapshots.length < 2) return [];

    const previous = new Set(
        (snapshots[0].topBacklinks as BacklinkData[]).map(b => b.source)
    );
    const current = new Set(
        (snapshots[1].topBacklinks as BacklinkData[]).map(b => b.source)
    );

    const lost: Array<{ source: string; target: string; lostDate: string }> = [];
    for (const source of previous) {
        if (!current.has(source)) {
            lost.push({ source, target: `domain:${domainId}`, lostDate: new Date().toISOString() });
        }
    }

    return lost;
}
