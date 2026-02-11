import { describe, it, expect } from 'vitest';

// Test the staleness calculation logic without DB dependencies
// We extract the pure function logic for testing

describe('staleness calculation', () => {
    function calculateStaleness(article: {
        publishedAt: Date | null;
        lastRefreshedAt: Date | null;
        pageviews30d: number | null;
        researchData: unknown;
    }): { score: number; reasons: string[] } {
        const now = Date.now();
        const reasons: string[] = [];
        let score = 0;
        const weights = { age: 0.35, trafficDecline: 0.30, researchAge: 0.20, noRecentRefresh: 0.15 };

        if (article.publishedAt) {
            const ageDays = (now - article.publishedAt.getTime()) / (24 * 60 * 60 * 1000);
            score += Math.min(ageDays / 365, 1) * weights.age;
            if (ageDays > 180) reasons.push(`Published ${Math.round(ageDays)} days ago`);
        }

        const views = article.pageviews30d ?? 0;
        if (views < 10) {
            score += weights.trafficDecline;
            reasons.push(`Only ${views} pageviews in last 30d`);
        } else if (views < 50) {
            score += weights.trafficDecline * 0.5;
        }

        if (!article.researchData) {
            score += weights.researchAge;
            reasons.push('No research data');
        }

        if (!article.lastRefreshedAt) {
            if (article.publishedAt && (now - article.publishedAt.getTime()) > 90 * 24 * 60 * 60 * 1000) {
                score += weights.noRecentRefresh;
                reasons.push('Never refreshed');
            }
        } else {
            const daysSinceRefresh = (now - article.lastRefreshedAt.getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceRefresh > 90) {
                score += weights.noRecentRefresh;
                reasons.push(`Last refreshed ${Math.round(daysSinceRefresh)} days ago`);
            }
        }

        return { score: Math.round(score * 100) / 100, reasons };
    }

    it('new article with good traffic is not stale', () => {
        const result = calculateStaleness({
            publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            lastRefreshedAt: null,
            pageviews30d: 500,
            researchData: { statistics: [] },
        });
        expect(result.score).toBeLessThan(0.6);
    });

    it('old article with no traffic is stale', () => {
        const result = calculateStaleness({
            publishedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
            lastRefreshedAt: null,
            pageviews30d: 0,
            researchData: null,
        });
        expect(result.score).toBeGreaterThan(0.6);
        expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('recently refreshed article scores lower', () => {
        const base = {
            publishedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
            pageviews30d: 5,
            researchData: { statistics: [] },
        };

        const neverRefreshed = calculateStaleness({ ...base, lastRefreshedAt: null });
        const recentlyRefreshed = calculateStaleness({
            ...base,
            lastRefreshedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        });

        expect(neverRefreshed.score).toBeGreaterThan(recentlyRefreshed.score);
    });

    it('article with no research data gets penalty', () => {
        const withResearch = calculateStaleness({
            publishedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            lastRefreshedAt: null,
            pageviews30d: 100,
            researchData: { statistics: ['some stat'] },
        });

        const withoutResearch = calculateStaleness({
            publishedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
            lastRefreshedAt: null,
            pageviews30d: 100,
            researchData: null,
        });

        expect(withoutResearch.score).toBeGreaterThan(withResearch.score);
    });
});
