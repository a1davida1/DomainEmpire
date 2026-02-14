/**
 * Backlink Monitoring
 *
 * Tracks backlink profiles using free/affordable APIs.
 * Primary: CommonCrawl index for basic backlink discovery.
 * Optional: Moz Link API for authority metrics (MOZ_ACCESS_ID + MOZ_SECRET_KEY).
 */

import { db } from '@/lib/db';
import { backlinkSnapshots, domains } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { safeFetch } from '@/lib/tpilot/core/ssrf';

export interface BacklinkData {
    source: string;
    target: string;
    anchor: string;
    authority: number;
    firstSeen: string;
    sourceUrl?: string;
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

        const results: BacklinkData[] = [];
        for (const line of lines.slice(0, limit)) {
            try {
                const data = JSON.parse(line) as { url: string; timestamp: string };
                const parsedUrl = new URL(data.url);
                results.push({
                    source: parsedUrl.hostname,
                    target: `https://${domain}`,
                    anchor: '',
                    authority: 0,
                    firstSeen: data.timestamp,
                    sourceUrl: data.url,
                });
            } catch {
                // Skip malformed lines
            }
        }
        return results;
    } catch (error) {
        console.error('CommonCrawl query failed:', error);
        return [];
    }
}

/**
 * Extract anchor text from a source page that links to our domain.
 * Fetches the page and parses HTML for links containing our domain.
 * Returns empty string if extraction fails (best-effort).
 */
async function extractAnchorText(sourceUrl: string, targetDomain: string): Promise<string> {
    try {
        const response = await safeFetch(sourceUrl, {
            timeoutMs: 5000,
            headers: { 'User-Agent': 'DomainEmpire-BacklinkChecker/1.0' },
        });
        if (!response.ok) return '';

        const html = await response.text();
        // Find anchor tags linking to our domain and extract text
        const linkRegex = new RegExp(
            `<a[^>]*href=["'][^"']*${targetDomain.replaceAll('.', '\\.')}[^"']*["'][^>]*>([^<]+)</a>`,
            'gi'
        );
        const match = linkRegex.exec(html);
        return match?.[1]?.trim() || '';
    } catch {
        return '';
    }
}

/**
 * Batch-enrich backlinks with anchor text (best-effort, limited concurrency).
 * Only fetches the first N links to avoid being rate-limited.
 */
async function enrichAnchorText(
    links: BacklinkData[],
    targetDomain: string,
    maxFetch = 10,
): Promise<void> {
    const toFetch = links.filter(l => !l.anchor && l.sourceUrl).slice(0, maxFetch);
    const results = await Promise.allSettled(
        toFetch.map(async (link) => {
            link.anchor = await extractAnchorText(link.sourceUrl!, targetDomain);
        })
    );
    // Log failures without blocking
    const failures = results.filter(r => r.status === 'rejected').length;
    if (failures > 0) {
        console.warn(`[Backlinks] ${failures}/${toFetch.length} anchor text extractions failed`);
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

    // Enrich with anchor text (best-effort, max 10 concurrent fetches)
    await enrichAnchorText(ccLinks, domain, 10);

    // Enrich CommonCrawl data with Moz authority when available
    let enrichedLinks: BacklinkData[] = ccLinks;
    if (mozData) {
        enrichedLinks = ccLinks.map(link => ({
            ...link,
            authority: mozData.domainAuthority,
        }));
    }

    // Detect lost backlinks before inserting new snapshot
    const lostBacklinks = await detectLostBacklinks(domainId);

    await db.insert(backlinkSnapshots).values({
        domainId,
        totalBacklinks: mozData?.totalBacklinks ?? ccLinks.length,
        referringDomains: mozData?.referringDomains ?? new Set(ccLinks.map(l => l.source)).size,
        domainAuthority: mozData?.domainAuthority ?? null,
        topBacklinks: enrichedLinks.slice(0, 20),
        lostBacklinks,
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
        .orderBy(desc(backlinkSnapshots.snapshotDate))
        .limit(2);

    if (snapshots.length < 2) return [];

    // snapshots[0] is newest, snapshots[1] is second-newest
    const current = new Set(
        (Array.isArray(snapshots[0].topBacklinks) ? snapshots[0].topBacklinks as BacklinkData[] : []).map(b => b.source)
    );
    const previous = new Set(
        (Array.isArray(snapshots[1].topBacklinks) ? snapshots[1].topBacklinks as BacklinkData[] : []).map(b => b.source)
    );

    const lost: Array<{ source: string; target: string; lostDate: string }> = [];
    for (const source of previous) {
        if (!current.has(source)) {
            lost.push({ source, target: `domain:${domainId}`, lostDate: new Date().toISOString() });
        }
    }

    return lost;
}
