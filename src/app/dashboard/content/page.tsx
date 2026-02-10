'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
        } catch (error) {
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
        } catch (error) {
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
                    <p className="text-zinc-400">Monitor and manage background jobs</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={processQueue}
                        disabled={processing}
                        className="bg-emerald-600 hover:bg-emerald-500"
                    >
                        {processing ? 'Processing...' : 'Process Queue'}
                    </Button>
                    <Button
                        onClick={retryFailed}
                        disabled={retrying || (stats?.failed ?? 0) === 0}
                        variant="outline"
                    >
                        {retrying ? 'Retrying...' : `Retry Failed (${stats?.failed ?? 0})`}
                    </Button>
                </div>
            </div>

            {lastResult && (
                <div
                    className={`p-4 rounded-lg ${lastResult.type === 'success'
                        ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300'
                        : lastResult.type === 'warning'
                            ? 'bg-yellow-950/50 border border-yellow-800 text-yellow-300'
                            : lastResult.type === 'error'
                                ? 'bg-red-950/50 border border-red-800 text-red-300'
                                : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
                        }`}
                >
                    {lastResult.message}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statCards.map(card => (
                    <Card key={card.label} className="bg-zinc-900/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-zinc-400">{card.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-3xl font-bold ${card.color}`}>
                                {loading ? '-' : card.value}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="bg-zinc-900/50">
                <CardHeader>
                    <CardTitle>Batch Operations</CardTitle>
                    <CardDescription>Bulk content generation controls</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-zinc-800/50 border-zinc-700">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Seed All Tier 1</CardTitle>
                                <CardDescription>Generate 5 articles per Tier 1 domain</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
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
                                        }
                                    }}
                                >
                                    Seed Tier 1 Domains
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-800/50 border-zinc-700">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Seed All Active</CardTitle>
                                <CardDescription>Generate 5 articles per active domain</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
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
                                        }
                                    }}
                                >
                                    Seed Active Domains
                                </Button>
                            </CardContent>
                        </Card>

                        <Card className="bg-zinc-800/50 border-zinc-700">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Quick 10 Articles</CardTitle>
                                <CardDescription>Generate 10 articles for Tier 1</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
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

            <Card className="bg-zinc-900/50">
                <CardHeader>
                    <CardTitle>Quality Assurance</CardTitle>
                    <CardDescription>Tools to ensure content quality and SEO health</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-zinc-800/50 border-zinc-700">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base">Duplicate Content</CardTitle>
                                <CardDescription>Find and resolve duplicate articles</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => window.location.href = '/content/duplicates'}
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
