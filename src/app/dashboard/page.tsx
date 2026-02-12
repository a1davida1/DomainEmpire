import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Globe, DollarSign, FileText, Cpu, TrendingUp, AlertTriangle,
    Plus, Rocket, Activity, Clock, Mail
} from 'lucide-react';
import Link from 'next/link';
import { db, domains, articles, monetizationProfiles, contentQueue, subscribers } from '@/lib/db';
import { eq, count, sum, and, gte, lt, desc, sql, isNull } from 'drizzle-orm';

const TARGET_WEEKLY_ARTICLES = Number(process.env.TARGET_WEEKLY_ARTICLES) || 85;

// Force dynamic rendering for real-time data
export const dynamic = 'force-dynamic';

async function getDashboardMetrics() {
    try {
        // Get domain count (exclude soft-deleted)
        const domainCount = await db.select({ count: count() }).from(domains).where(isNull(domains.deletedAt));

        // Get published article count (exclude soft-deleted)
        const articleCount = await db
            .select({ count: count() })
            .from(articles)
            .where(and(eq(articles.status, 'published'), isNull(articles.deletedAt)));

        // Get total revenue from monetization profiles
        const revenue = await db
            .select({ total: sum(monetizationProfiles.revenueLast30d) })
            .from(monetizationProfiles);

        // Get pending queue jobs
        const pendingJobs = await db
            .select({ count: count() })
            .from(contentQueue)
            .where(eq(contentQueue.status, 'pending'));

        // Get API costs this month
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const apiCosts = await db
            .select({ total: sum(contentQueue.apiCost) })
            .from(contentQueue)
            .where(
                and(
                    eq(contentQueue.status, 'completed'),
                    gte(contentQueue.completedAt, thirtyDaysAgo)
                )
            );

        // Get weekly published articles
        const startOfWeek = new Date();
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);

        const weeklyArticles = await db
            .select({ count: count() })
            .from(articles)
            .where(
                and(
                    eq(articles.status, 'published'),
                    gte(articles.publishedAt, startOfWeek),
                    isNull(articles.deletedAt)
                )
            );

        // Get deployed domain count (exclude soft-deleted)
        const deployedCount = await db
            .select({ count: count() })
            .from(domains)
            .where(and(eq(domains.isDeployed, true), isNull(domains.deletedAt)));

        // Get subscriber count
        const subscriberCount = await db
            .select({ count: count() })
            .from(subscribers);

        return {
            domains: domainCount[0]?.count ?? 0,
            articles: articleCount[0]?.count ?? 0,
            weeklyArticles: weeklyArticles[0]?.count ?? 0,
            revenue: Number(revenue[0]?.total ?? 0),
            pendingJobs: pendingJobs[0]?.count ?? 0,
            apiCost: Number(apiCosts[0]?.total ?? 0),
            deployedDomains: deployedCount[0]?.count ?? 0,
            subscribers: subscriberCount[0]?.count ?? 0,
        };
    } catch (error) {
        // Return zeros if database isn't connected yet
        console.error('Failed to fetch dashboard metrics:', error);
        return {
            domains: 0,
            articles: 0,
            weeklyArticles: 0,
            revenue: 0,
            pendingJobs: 0,
            apiCost: 0,
            deployedDomains: 0,
            subscribers: 0,
        };
    }
}

async function getTopPerformers() {
    try {
        const topDomains = await db
            .select({
                id: domains.id,
                domain: domains.domain,
                niche: domains.niche,
                revenue: monetizationProfiles.revenueLast30d,
            })
            .from(domains)
            .leftJoin(monetizationProfiles, eq(domains.id, monetizationProfiles.domainId))
            .where(isNull(domains.deletedAt))
            .orderBy(desc(monetizationProfiles.revenueLast30d))
            .limit(5);

        return topDomains;
    } catch (error) {
        console.error('Failed to fetch top performers:', error);
        return [];
    }
}

async function getNeedsAttention() {
    const issues: Array<{ type: 'warning' | 'error'; message: string; link: string }> = [];

    try {
        // Check for domains with upcoming renewals (next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const upcomingRenewals = await db
            .select({ count: count() })
            .from(domains)
            .where(
                and(
                    gte(domains.renewalDate, new Date()),
                    lt(domains.renewalDate, thirtyDaysFromNow),
                    isNull(domains.deletedAt)
                )
            );

        if ((upcomingRenewals[0]?.count ?? 0) > 0) {
            issues.push({
                type: 'warning',
                message: `${upcomingRenewals[0].count} domains renewing in 30 days`,
                link: '/dashboard/domains?renewalSoon=true',
            });
        }

        // Check for articles stuck in review
        const stuckArticles = await db
            .select({ count: count() })
            .from(articles)
            .where(and(eq(articles.status, 'review'), isNull(articles.deletedAt)));

        if ((stuckArticles[0]?.count ?? 0) > 0) {
            issues.push({
                type: 'warning',
                message: `${stuckArticles[0].count} articles in review queue`,
                link: '/dashboard/content?status=review',
            });
        }

        // Check for failed jobs
        const failedJobs = await db
            .select({ count: count() })
            .from(contentQueue)
            .where(eq(contentQueue.status, 'failed'));

        if ((failedJobs[0]?.count ?? 0) > 0) {
            issues.push({
                type: 'error',
                message: `${failedJobs[0].count} failed queue jobs`,
                link: '/dashboard/analytics?tab=queue',
            });
        }

        // Check for undeployed active domains
        const undeployedActive = await db
            .select({ count: count() })
            .from(domains)
            .where(
                and(
                    eq(domains.status, 'active'),
                    eq(domains.isDeployed, false),
                    isNull(domains.deletedAt)
                )
            );

        if ((undeployedActive[0]?.count ?? 0) > 0) {
            issues.push({
                type: 'warning',
                message: `${undeployedActive[0].count} active domains not deployed`,
                link: '/dashboard/deploy',
            });
        }
    } catch (error) {
        console.error('Failed to fetch attention items:', error);
    }

    return issues;
}

async function getPipelineVelocity() {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Completed jobs in last 24h
        const daily = await db
            .select({ count: count() })
            .from(contentQueue)
            .where(
                and(
                    eq(contentQueue.status, 'completed'),
                    gte(contentQueue.completedAt, oneDayAgo)
                )
            );

        // Completed jobs in last 7 days
        const weekly = await db
            .select({ count: count() })
            .from(contentQueue)
            .where(
                and(
                    eq(contentQueue.status, 'completed'),
                    gte(contentQueue.completedAt, oneWeekAgo)
                )
            );

        // Avg processing time (last 24h)
        const avgTime = await db
            .select({
                avgMs: sql<number>`avg(extract(epoch from (${contentQueue.completedAt} - ${contentQueue.startedAt})) * 1000)::int`,
            })
            .from(contentQueue)
            .where(
                and(
                    eq(contentQueue.status, 'completed'),
                    gte(contentQueue.completedAt, oneDayAgo)
                )
            );

        // Processing right now
        const processing = await db
            .select({ count: count() })
            .from(contentQueue)
            .where(eq(contentQueue.status, 'processing'));

        return {
            dailyCompleted: daily[0]?.count ?? 0,
            weeklyCompleted: weekly[0]?.count ?? 0,
            avgProcessingMs: avgTime[0]?.avgMs ?? 0,
            currentlyProcessing: processing[0]?.count ?? 0,
        };
    } catch (error) {
        console.error('Failed to fetch pipeline velocity:', error);
        return { dailyCompleted: 0, weeklyCompleted: 0, avgProcessingMs: 0, currentlyProcessing: 0 };
    }
}

function formatDuration(ms: number): string {
    if (ms === 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
}

export default async function DashboardPage() {
    const [metrics, topPerformers, needsAttention, velocity] = await Promise.all([
        getDashboardMetrics(),
        getTopPerformers(),
        getNeedsAttention(),
        getPipelineVelocity(),
    ]);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Portfolio overview and key metrics
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link href="/dashboard/deploy">
                        <Button variant="outline">
                            <Rocket className="mr-2 h-4 w-4" />
                            Deploy
                        </Button>
                    </Link>
                    <Link href="/dashboard/domains/new">
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Domain
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <MetricCard
                    title="Total Domains"
                    value={metrics.domains}
                    icon={Globe}
                    subtitle={`${metrics.deployedDomains} deployed`}
                />
                <MetricCard
                    title="Revenue (30d)"
                    value={`$${metrics.revenue.toLocaleString()}`}
                    icon={DollarSign}
                />
                <MetricCard
                    title="Published Articles"
                    value={metrics.articles}
                    icon={FileText}
                />
                <MetricCard
                    title="Subscribers"
                    value={metrics.subscribers}
                    icon={Mail}
                    subtitle="email captures"
                />
                <MetricCard
                    title="API Cost (30d)"
                    value={`$${metrics.apiCost.toFixed(2)}`}
                    icon={Cpu}
                />
            </div>

            {/* Pipeline Velocity */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Activity className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Processing Now</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{velocity.currentlyProcessing}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Jobs Today</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{velocity.dailyCompleted}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Jobs This Week</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{velocity.weeklyCompleted}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Avg Processing</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold">{formatDuration(velocity.avgProcessingMs)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Two Column Layout */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Top Performers */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Top Performers
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {topPerformers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No domains with revenue data yet. Add domains and deploy content to see performance.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {topPerformers.map((domain, index) => (
                                    <Link
                                        key={domain.id}
                                        href={`/dashboard/domains/${domain.id}`}
                                        className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                                                {index + 1}
                                            </span>
                                            <div>
                                                <p className="font-medium">{domain.domain}</p>
                                                <p className="text-xs text-muted-foreground">{domain.niche}</p>
                                            </div>
                                        </div>
                                        <span className="font-bold text-green-600">
                                            ${Number(domain.revenue ?? 0).toLocaleString()}/mo
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Needs Attention */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Needs Attention
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {needsAttention.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                All systems operational. No issues detected.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {needsAttention.map((issue, index) => (
                                    <Link
                                        key={index}
                                        href={issue.link}
                                        className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                                    >
                                        <Badge variant={issue.type === 'error' ? 'destructive' : 'secondary'}>
                                            {issue.type}
                                        </Badge>
                                        <span className="text-sm">{issue.message}</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Content Pipeline Status */}
            <Card>
                <CardHeader>
                    <CardTitle>Content Pipeline Status</CardTitle>
                    <CardDescription>Weekly target progress and pending work</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-8">
                        <div className="text-center">
                            <p className="text-2xl font-bold">{metrics.pendingJobs}</p>
                            <p className="text-sm text-muted-foreground">Pending Jobs</p>
                        </div>
                        <div className="h-12 w-px bg-border" />
                        <div className="flex-1">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Weekly Target Progress</span>
                                <span className="font-medium">
                                    {metrics.weeklyArticles} / {TARGET_WEEKLY_ARTICLES} articles
                                </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${Math.min(100, (metrics.weeklyArticles / TARGET_WEEKLY_ARTICLES) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
