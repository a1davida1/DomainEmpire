/**
 * Google Search Console Integration
 *
 * Pulls search performance data (impressions, clicks, CTR, position)
 * using a Google Service Account.
 *
 * Required env vars:
 * - GOOGLE_SERVICE_ACCOUNT_EMAIL
 * - GOOGLE_SERVICE_ACCOUNT_KEY (base64-encoded private key)
 */

import { google } from 'googleapis';

interface GSCRow {
    keys: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface SearchPerformance {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface PagePerformance {
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface GSCSummary {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
    topQueries: SearchPerformance[];
    topPages: PagePerformance[];
}

function getAuth() {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const keyBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!email || !keyBase64) return null;

    const key = Buffer.from(keyBase64, 'base64').toString('utf-8');
    return new google.auth.JWT({
        email,
        key,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
}

/**
 * Fetch search analytics for a domain.
 */
export async function getSearchPerformance(
    siteUrl: string,
    days = 28,
    dimensions: ('query' | 'page' | 'date')[] = ['query'],
    rowLimit = 100
): Promise<GSCRow[]> {
    const auth = getAuth();
    if (!auth) return [];

    const searchconsole = google.searchconsole({ version: 'v1', auth });

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC data has ~3 day lag
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    try {
        const response = await searchconsole.searchanalytics.query({
            siteUrl: `sc-domain:${siteUrl}`,
            requestBody: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                dimensions,
                rowLimit,
            },
        });

        return (response.data.rows || []).map(row => ({
            keys: row.keys || [],
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: row.ctr || 0,
            position: row.position || 0,
        }));
    } catch (error) {
        console.error(`GSC query failed for ${siteUrl}:`, error);
        return [];
    }
}

/**
 * Get a full performance summary for a domain.
 */
export async function getDomainGSCSummary(domain: string, days = 28): Promise<GSCSummary | null> {
    const auth = getAuth();
    if (!auth) return null;

    const [queryRows, pageRows] = await Promise.all([
        getSearchPerformance(domain, days, ['query'], 50),
        getSearchPerformance(domain, days, ['page'], 50),
    ]);

    if (queryRows.length === 0 && pageRows.length === 0) return null;

    const totalClicks = queryRows.reduce((sum, r) => sum + r.clicks, 0);
    const totalImpressions = queryRows.reduce((sum, r) => sum + r.impressions, 0);
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

    const positions = queryRows.filter(r => r.impressions > 0);
    const avgPosition = positions.length > 0
        ? positions.reduce((sum, r) => sum + r.position * r.impressions, 0) /
          positions.reduce((sum, r) => sum + r.impressions, 0)
        : 0;

    return {
        totalClicks,
        totalImpressions,
        avgCtr: Math.round(avgCtr * 10000) / 10000,
        avgPosition: Math.round(avgPosition * 10) / 10,
        topQueries: queryRows.map(r => ({
            query: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: Math.round(r.ctr * 10000) / 10000,
            position: Math.round(r.position * 10) / 10,
        })),
        topPages: pageRows.map(r => ({
            page: r.keys[0],
            clicks: r.clicks,
            impressions: r.impressions,
            ctr: Math.round(r.ctr * 10000) / 10000,
            position: Math.round(r.position * 10) / 10,
        })),
    };
}
