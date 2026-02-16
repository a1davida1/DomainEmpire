'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
}

interface ProcessResult {
    processed: number;
    failed: number;
    stats: QueueStats;
}

export default function QueuePage() {
    const [stats, setStats] = useState<QueueStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [lastResult, setLastResult] = useState<{ type: string; message: string } | null>(null);
    const [domainArticles, setDomainArticles] = useState<Array<{ domain: string; articles: number; status: string }>>([]);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch('/api/queue/process');
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        fetch('/api/domains?status=active')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                if (Array.isArray(data)) {
                    setDomainArticles(data.map((d: { domain: string; articleCount?: number; status: string }) => ({
                        domain: d.domain,
                        articles: d.articleCount ?? 0,
                        status: d.status,
                    })).sort((a: { articles: number }, b: { articles: number }) => a.articles - b.articles).slice(0, 10));
                }
            })
            .catch((err) => console.error('[Content] Stats fetch failed:', err));
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    async function processQueue() {
        setProcessing(true);
        setLastResult(null);
        try {
            const res = await fetch('/api/queue/process', { method: 'POST' });
            const data: ProcessResult = await res.json();
            setStats(data.stats);
            if (data.processed > 0 || data.failed > 0) {
                setLastResult({
                    type: data.failed > 0 ? 'warning' : 'success',
                    message: `Processed ${data.processed} jobs, ${data.failed} failed`,
                });
            } else {
                setLastResult({ type: 'info', message: 'No pending jobs to process' });
            }
        } catch (_error) {
            setLastResult({ type: 'error', message: 'Failed to process queue' });
        } finally {
            setProcessing(false);
        }
    }

    async function retryFailed() {
        setRetrying(true);
        setLastResult(null);
        try {
            const res = await fetch('/api/queue/retry', { method: 'POST' });
            const data = await res.json();
            setLastResult({
                type: 'success',
                message: `Queued ${data.retried} failed jobs for retry`,
            });
            await fetchStats();
        } catch (_error) {
            setLastResult({ type: 'error', message: 'Failed to retry jobs' });
        } finally {
            setRetrying(false);
        }
    }

    const statCards = [
        { label: 'Pending', value: stats?.pending ?? 0, color: 'text-yellow-400' },
        { label: 'Processing', value: stats?.processing ?? 0, color: 'text-blue-400' },
        { label: 'Completed', value: stats?.completed ?? 0, color: 'text-emerald-400' },
        { label: 'Failed', value: stats?.failed ?? 0, color: 'text-red-400' },
    ];

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Content Queue</h1>
                    <p className="text-muted-foreground">Monitor and manage background jobs</p>
                </div>
                <div className="flex gap-2">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={processQueue}
                                disabled={processing}
                                className="bg-emerald-600 hover:bg-emerald-500"
                            >
                                {processing ? 'Processing...' : 'Process Queue'}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">Run the background worker to process up to 25 pending jobs (keyword research, article generation, deploys).</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                onClick={retryFailed}
                                disabled={retrying || (stats?.failed ?? 0) === 0}
                                variant="outline"
                            >
                                {retrying ? 'Retrying...' : `Retry Failed (${stats?.failed ?? 0})`}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">Reset all failed jobs back to pending so they get picked up on the next processing run.</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {lastResult && (
                <div
                    className={`p-4 rounded-lg border ${lastResult.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300'
                        : lastResult.type === 'warning'
                            ? 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/50 dark:border-yellow-800 dark:text-yellow-300'
                            : lastResult.type === 'error'
                                ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300'
                                : 'bg-muted border-border text-foreground'
                        }`}
                >
                    {lastResult.message}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statCards.map(card => (
                    <Card key={card.label}>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-3xl font-bold ${card.color}`}>
                                {loading ? '-' : card.value}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {domainArticles.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Content by Domain</CardTitle>
                        <CardDescription>Domains with fewest articles (active only)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                            {domainArticles.map(d => (
                                <div key={d.domain} className="rounded-lg border px-3 py-2 text-center">
                                    <p className="truncate text-xs font-medium" title={d.domain}>{d.domain}</p>
                                    <p className={`text-lg font-bold ${d.articles === 0 ? 'text-red-400' : d.articles < 5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {d.articles}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">articles</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Batch Operations</CardTitle>
                    <CardDescription>Bulk content generation controls</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Seed All Tier 1</CardTitle>
                                <CardDescription>Generate 5 articles per Tier 1 domain</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
                                        try {
                                            const res = await fetch('/api/domains/bulk-seed', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ tier: 1, articleCount: 5 }),
                                            });
                                            const data = await res.json();
                                            if (data.success) {
                                                setLastResult({
                                                    type: 'success',
                                                    message: `Queued ${data.domainsQueued} domains (${data.totalArticlesEstimate} articles)`,
                                                });
                                                await fetchStats();
                                            } else {
                                                setLastResult({ type: 'error', message: data.error || 'Seed Tier 1 failed' });
                                            }
                                        } catch (err) {
                                            setLastResult({ type: 'error', message: err instanceof Error ? err.message : 'Seed Tier 1 request failed' });
                                        }
                                    }}
                                >
                                    Seed Tier 1 Domains
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Seed All Active</CardTitle>
                                <CardDescription>Generate 5 articles per active domain</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
                                        try {
                                            const res = await fetch('/api/domains/bulk-seed', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ status: 'active', articleCount: 5 }),
                                            });
                                            const data = await res.json();
                                            if (data.success) {
                                                setLastResult({
                                                    type: 'success',
                                                    message: `Queued ${data.domainsQueued} domains`,
                                                });
                                                await fetchStats();
                                            } else {
                                                setLastResult({ type: 'error', message: data.error || 'Seed Active failed' });
                                            }
                                        } catch (err) {
                                            setLastResult({ type: 'error', message: err instanceof Error ? err.message : 'Seed Active request failed' });
                                        }
                                    }}
                                >
                                    Seed Active Domains
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Quick 10 Articles</CardTitle>
                                <CardDescription>Generate 10 articles for Tier 1</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
                                        try {
                                            const res = await fetch('/api/domains/bulk-seed', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ tier: 1, articleCount: 10, priority: 3 }),
                                            });
                                            const data = await res.json();
                                            if (data.success) {
                                                setLastResult({
                                                    type: 'success',
                                                    message: `Queued ${data.totalArticlesEstimate} high-priority articles`,
                                                });
                                                await fetchStats();
                                            } else {
                                                setLastResult({ type: 'error', message: data.error || 'Quick Seed failed' });
                                            }
                                        } catch (err) {
                                            setLastResult({ type: 'error', message: err instanceof Error ? err.message : 'Quick Seed request failed' });
                                        }
                                    }}
                                >
                                    Quick Seed Priority
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Quality Assurance</CardTitle>
                    <CardDescription>Tools to ensure content quality and SEO health</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Duplicate Content</CardTitle>
                                <CardDescription>Find and resolve duplicate articles</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => window.location.href = '/dashboard/content/duplicates'}
                                >
                                    Check Duplicates
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
