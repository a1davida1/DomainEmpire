/**
 * Cloudflare Analytics Integration
 *
 * Fetches real analytics data from Cloudflare Pages using the GraphQL Analytics API.
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars.
 *
 * API Reference: https://developers.cloudflare.com/analytics/graphql-api/
 */

const CF_GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;
const MIN_RATE_LIMIT_COOLDOWN_MS = 2_000;

let rateLimitCooldownUntilMs = 0;
let rateLimitCooldownReason: string | null = null;

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

export class CloudflareApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'CloudflareApiError';
        this.status = status;
    }
}

function getConfig() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!apiToken || !accountId) return null;
    return { apiToken, accountId };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function parseRetryAfterMs(header: string | null): number | null {
    if (!header) return null;

    const seconds = Number.parseInt(header, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(60_000, Math.max(250, seconds * 1000));
    }

    const dateMs = Date.parse(header);
    if (!Number.isNaN(dateMs)) {
        const delta = dateMs - Date.now();
        if (delta > 0) {
            return Math.min(60_000, Math.max(250, delta));
        }
    }

    return null;
}

function getRateLimitCooldownRemainingMs(nowMs = Date.now()): number {
    if (rateLimitCooldownUntilMs <= nowMs) {
        rateLimitCooldownUntilMs = 0;
        rateLimitCooldownReason = null;
        return 0;
    }
    return rateLimitCooldownUntilMs - nowMs;
}

function setRateLimitCooldown(waitMs: number, reason: string): void {
    const boundedWaitMs = Math.max(MIN_RATE_LIMIT_COOLDOWN_MS, waitMs);
    const candidateUntil = Date.now() + boundedWaitMs;
    if (candidateUntil > rateLimitCooldownUntilMs) {
        rateLimitCooldownUntilMs = candidateUntil;
        rateLimitCooldownReason = reason;
    }
}

export function getCloudflareApiRateLimitCooldown(): {
    active: boolean;
    remainingMs: number;
    reason: string | null;
} {
    const remainingMs = getRateLimitCooldownRemainingMs();
    return {
        active: remainingMs > 0,
        remainingMs,
        reason: rateLimitCooldownReason,
    };
}

async function cfGraphQL(query: string, variables: Record<string, unknown>): Promise<CFGraphQLResponse> {
    const config = getConfig();
    if (!config) throw new Error('Cloudflare credentials not configured');

    const cooldownMs = getRateLimitCooldownRemainingMs();
    if (cooldownMs > 0) {
        const seconds = Math.ceil(cooldownMs / 1000);
        const suffix = rateLimitCooldownReason ? ` (${rateLimitCooldownReason})` : '';
        throw new CloudflareApiError(429, `Cloudflare API cooldown active for ${seconds}s${suffix}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        const response = await fetch(CF_GRAPHQL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (response.ok) {
            return response.json() as Promise<CFGraphQLResponse>;
        }

        const bodyText = await response.text().catch(() => '');
        const baseMessage = `Cloudflare API error: ${response.status} ${response.statusText}`;
        const message = bodyText ? `${baseMessage} - ${bodyText}` : baseMessage;
        const error = new CloudflareApiError(response.status, message);
        lastError = error;

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= MAX_RETRIES) {
            throw error;
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
        const jitterMs = Math.floor(Math.random() * 250);
        const fallbackBackoff = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
        const waitMs = (retryAfterMs ?? fallbackBackoff) + jitterMs;
        if (response.status === 429) {
            setRateLimitCooldown(waitMs, `status_${response.status}`);
        }
        await sleep(waitMs);
    }

    throw lastError ?? new Error('Unknown Cloudflare API error');
}

/**
 * Fetch daily analytics for a Cloudflare Pages project.
 */
export type AnalyticsResult =
    | { status: 'not_configured' }
    | { status: 'ok'; data: AnalyticsData[] }
    | { status: 'error'; message: string };

async function fetchDomainAnalyticsRaw(domain: string, days = 30): Promise<AnalyticsData[]> {
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

    const result = await cfGraphQL(query, {
        accountId: config.accountId,
        startDate,
        endDate,
        projectName,
    });

    if (result.errors?.length) {
        throw new Error(`Cloudflare GraphQL error: ${result.errors.map((entry) => entry.message).join('; ')}`);
    }

    const groups = result.data?.viewer?.accounts?.[0]?.pagesProjectsAnalyticsAdaptiveGroups;
    if (!groups) return [];

    return groups.map((g) => ({
        date: g.dimensions.date,
        views: g.sum.pageviews,
        visitors: g.sum.visits,
    }));
}

export async function getDomainAnalytics(domain: string, days = 30): Promise<AnalyticsData[]> {
    try {
        return await fetchDomainAnalyticsRaw(domain, days);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Cloudflare analytics error';
        if (error instanceof CloudflareApiError && error.status === 429) {
            console.warn(`Cloudflare analytics rate-limited for ${domain}: ${message}`);
        } else {
            console.warn(`Failed to fetch Cloudflare analytics for ${domain}: ${message}`);
        }
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
        const message = error instanceof Error ? error.message : 'Unknown Cloudflare top-pages error';
        if (error instanceof CloudflareApiError && error.status === 429) {
            console.warn(`Cloudflare top-pages rate-limited for ${domain}: ${message}`);
        } else {
            console.warn(`Failed to fetch Cloudflare top pages for ${domain}: ${message}`);
        }
        return [];
    }
}

/** Check if Cloudflare analytics is configured (env vars present). */
export function isCloudflareConfigured(): boolean {
    return getConfig() !== null;
}

/** Typed version of getDomainAnalytics that distinguishes "not configured" from "no data". */
export async function getDomainAnalyticsTyped(domain: string, days = 30): Promise<AnalyticsResult> {
    const config = getConfig();
    if (!config) return { status: 'not_configured' };

    try {
        const data = await fetchDomainAnalyticsRaw(domain, days);
        return { status: 'ok', data };
    } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
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
