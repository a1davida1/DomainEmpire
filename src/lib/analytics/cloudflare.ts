/**
 * Cloudflare Analytics Integration
 *
 * Fetches real analytics data from Cloudflare Pages using the GraphQL Analytics API.
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars.
 *
 * API Reference: https://developers.cloudflare.com/analytics/graphql-api/
 */

const CF_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';

export interface AnalyticsData {
    views: number;
    visitors: number;
    date: string;
}

export interface PageAnalytics {
    path: string;
    views: number;
    visitors: number;
}

interface CFGraphQLResponse {
    data?: {
        viewer?: {
            accounts?: Array<{
                pagesProjectsAnalyticsAdaptiveGroups?: Array<{
                    dimensions: { date: string; path?: string };
                    sum: { visits: number; pageviews: number };
                    count: number;
                }>;
            }>;
        };
    };
    errors?: Array<{ message: string }>;
}

function getConfig() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiToken || !accountId) return null;
    return { apiToken, accountId };
}

async function cfGraphQL(query: string, variables: Record<string, unknown>): Promise<CFGraphQLResponse> {
    const config = getConfig();
    if (!config) throw new Error('Cloudflare credentials not configured');

    const response = await fetch(CF_GRAPHQL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<CFGraphQLResponse>;
}

/**
 * Fetch daily analytics for a Cloudflare Pages project.
 */
export async function getDomainAnalytics(domain: string, days = 30): Promise<AnalyticsData[]> {
    const config = getConfig();
    if (!config) return [];

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const projectName = domain.replaceAll('.', '-');

    const query = `
        query PagesAnalytics($accountId: String!, $startDate: Date!, $endDate: Date!, $projectName: String!) {
            viewer {
                accounts(filter: { accountTag: $accountId }) {
                    pagesProjectsAnalyticsAdaptiveGroups(
                        filter: {
                            date_geq: $startDate
                            date_leq: $endDate
                            projectName: $projectName
                        }
                        orderBy: [date_ASC]
                        limit: 100
                    ) {
                        dimensions { date }
                        sum { visits pageviews }
                        count
                    }
                }
            }
        }
    `;

    try {
        const result = await cfGraphQL(query, {
            accountId: config.accountId,
            startDate,
            endDate,
            projectName,
        });

        if (result.errors?.length) {
            console.error('Cloudflare GraphQL errors:', result.errors);
            return [];
        }

        const groups = result.data?.viewer?.accounts?.[0]?.pagesProjectsAnalyticsAdaptiveGroups;
        if (!groups) return [];

        return groups.map(g => ({
            date: g.dimensions.date,
            views: g.sum.pageviews,
            visitors: g.sum.visits,
        }));
    } catch (error) {
        console.error('Failed to fetch Cloudflare analytics:', error);
        return [];
    }
}

/**
 * Fetch top pages analytics for a project.
 */
export async function getTopPages(domain: string, days = 30, limit = 20): Promise<PageAnalytics[]> {
    const config = getConfig();
    if (!config) return [];

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const projectName = domain.replaceAll('.', '-');

    const query = `
        query PagesTopPaths($accountId: String!, $startDate: Date!, $endDate: Date!, $projectName: String!, $limit: Int!) {
            viewer {
                accounts(filter: { accountTag: $accountId }) {
                    pagesProjectsAnalyticsAdaptiveGroups(
                        filter: {
                            date_geq: $startDate
                            date_leq: $endDate
                            projectName: $projectName
                        }
                        orderBy: [count_DESC]
                        limit: $limit
                    ) {
                        dimensions { path }
                        sum { visits pageviews }
                        count
                    }
                }
            }
        }
    `;

    try {
        const result = await cfGraphQL(query, {
            accountId: config.accountId, startDate, endDate, projectName, limit,
        });

        if (result.errors?.length) {
            console.error('Cloudflare GraphQL errors (top pages):', result.errors);
            return [];
        }

        const groups = result.data?.viewer?.accounts?.[0]?.pagesProjectsAnalyticsAdaptiveGroups;
        if (!groups) return [];

        return groups.map(g => ({
            path: g.dimensions.path || '/',
            views: g.sum.pageviews,
            visitors: g.sum.visits,
        }));
    } catch (error) {
        console.error('Failed to fetch top pages:', error);
        return [];
    }
}

/**
 * Get aggregate stats for a domain over a period.
 */
export async function getDomainSummary(domain: string, days = 30): Promise<{
    totalViews: number;
    totalVisitors: number;
    avgDailyViews: number;
} | null> {
    const analytics = await getDomainAnalytics(domain, days);
    if (analytics.length === 0) return null;

    const totalViews = analytics.reduce((sum, d) => sum + d.views, 0);
    const totalVisitors = analytics.reduce((sum, d) => sum + d.visitors, 0);

    return {
        totalViews,
        totalVisitors,
        avgDailyViews: Math.round(totalViews / analytics.length),
    };
}
