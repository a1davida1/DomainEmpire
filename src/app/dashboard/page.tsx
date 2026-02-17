import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Globe, DollarSign, FileText, Cpu, TrendingUp, AlertTriangle,
    Plus, Rocket, Activity, Clock, Mail, Megaphone, PlayCircle
} from 'lucide-react';
import Link from 'next/link';
import { DashboardRefresh } from '@/components/dashboard/DashboardRefresh';
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">
                        Portfolio overview and key metrics
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <DashboardRefresh />
                    <Link href="/dashboard/domains/new">
                        <Button size="sm" variant="outline">
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Add Domain
                        </Button>
                    </Link>
                    <Link href="/dashboard/workflow">
                        <Button size="sm">
                            <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                            Workflow
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5">
                <span className="text-xs font-medium text-muted-foreground mr-1">Quick actions</span>
                <Link href="/dashboard/queue" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                    <Activity className="h-3 w-3" /> Queue
                </Link>
                <Link href="/dashboard/deploy" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                    <Rocket className="h-3 w-3" /> Deploy
                </Link>
                <Link href="/dashboard/growth" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                    <Megaphone className="h-3 w-3" /> Growth
                </Link>
                <Link href="/dashboard/review" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                    <TrendingUp className="h-3 w-3" /> Review
                </Link>
                <Link href="/dashboard/integrations" className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                    <Globe className="h-3 w-3" /> Integrations
                </Link>
            </div>

            {/* Onboarding CTA when no domains */}
            {metrics.domains === 0 && (
                <Card className="border-dashed border-2">
                    <CardContent className="flex flex-col items-center gap-4 py-10">
                        <div className="rounded-full bg-primary/10 p-4">
                            <Globe className="h-10 w-10 text-primary" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-semibold">Welcome to Domain Empire</h2>
                            <p className="text-sm text-muted-foreground max-w-md mt-1">
                                Get started by adding your first domain. You can add them one by one or import a CSV file with your entire portfolio.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Link href="/dashboard/domains/new">
                                <Button><Plus className="mr-2 h-4 w-4" />Add Your First Domain</Button>
                            </Link>
                            <Link href="/dashboard/domains/import">
                                <Button variant="outline">Import CSV</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Metrics Grid */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    title="Total Domains"
                    value={metrics.domains}
                    icon={<Globe className="h-6 w-6 text-primary" />}
                    subtitle={`${metrics.deployedDomains} deployed`}
                />
                <MetricCard
                    title="Revenue (30d)"
                    value={`$${metrics.revenue.toLocaleString('en-US')}`}
                    icon={<DollarSign className="h-6 w-6 text-primary" />}
                />
                <MetricCard
                    title="Published Articles"
                    value={metrics.articles}
                    icon={<FileText className="h-6 w-6 text-primary" />}
                />
                <MetricCard
                    title="Subscribers"
                    value={metrics.subscribers}
                    icon={<Mail className="h-6 w-6 text-primary" />}
                    subtitle="email captures"
                />
                <MetricCard
                    title="API Cost (30d)"
                    value={`$${metrics.apiCost.toFixed(2)}`}
                    icon={<Cpu className="h-6 w-6 text-primary" />}
                />
            </div>

            {/* Weekly Target */}
            <Card>
                <CardContent className="py-4 px-6">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                <TrendingUp className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Weekly Target</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {metrics.weeklyArticles} / {TARGET_WEEKLY_ARTICLES} articles
                                </p>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${Math.min(100, (metrics.weeklyArticles / TARGET_WEEKLY_ARTICLES) * 100)}%` }}
                                />
                            </div>
                        </div>
                        <span className="text-sm font-bold tabular-nums">
                            {Math.round((metrics.weeklyArticles / TARGET_WEEKLY_ARTICLES) * 100)}%
                        </span>
                    </div>
                </CardContent>
            </Card>

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
                                            ${Number(domain.revenue ?? 0).toLocaleString('en-US')}/mo
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
                                {needsAttention.map((issue) => (
                                    <Link
                                        key={`${issue.type}-${issue.link}`}
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
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Content Pipeline</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-2xl font-bold tabular-nums">{metrics.pendingJobs}</p>
                            <p className="text-xs text-muted-foreground">Pending Jobs</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-2xl font-bold tabular-nums">{metrics.weeklyArticles}</p>
                            <p className="text-xs text-muted-foreground">Published This Week</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                            <p className="text-2xl font-bold tabular-nums">{metrics.deployedDomains}</p>
                            <p className="text-xs text-muted-foreground">Deployed Domains</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
