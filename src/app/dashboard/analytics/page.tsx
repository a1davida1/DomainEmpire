'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Activity, AlertTriangle, Trash2 } from 'lucide-react';

interface CostData {
    period: { days: number; startDate: string; endDate: string };
    summary: {
        totalCost: number;
        totalTokens: number;
        totalCalls: number;
        avgCostPerCall: number;
    };
    costsByStage: Array<{
        stage: string;
        totalCost: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        callCount: number;
        avgDuration: number;
    }>;
    costsByModel: Array<{
        model: string;
        totalCost: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        callCount: number;
    }>;
    dailyCosts: Array<{
        date: string;
        totalCost: number;
        callCount: number;
    }>;
    articleCosts: {
        totalCost: number;
        articleCount: number;
        avgCostPerArticle: number;
        totalWords: number;
    };
}

interface QueueHealth {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
    total: number;
    oldestPendingAge: number | null;
    avgProcessingTimeMs: number | null;
    throughputPerHour: number;
    errorRate24h: number;
}

export default function AnalyticsPage() {
    const [data, setData] = useState<CostData | null>(null);
    const [health, setHealth] = useState<QueueHealth | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState(30);
    const [purging, setPurging] = useState(false);

    const fetchData = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const [costsRes, healthRes] = await Promise.all([
                fetch(`/api/analytics/costs?days=${days}`, { signal }),
                fetch('/api/queue/health', { signal }),
            ]);

            if (!costsRes.ok) throw new Error('Failed to fetch costs');

            const costsJson = await costsRes.json();
            if (signal?.aborted) return;
            setData(costsJson);

            if (healthRes.ok) {
                const healthJson = await healthRes.json();
                if (!signal?.aborted) setHealth(healthJson);
            }

            setError(null);
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [days]);

    useEffect(() => {
        const controller = new AbortController();
        fetchData(controller.signal);
        return () => controller.abort();
    }, [fetchData]);

    const handleExport = () => {
        if (!data) return;

        const csvContent = [
            ['Date', 'Cost', 'Calls'].join(','),
            ...data.dailyCosts.map(d => [d.date, d.totalCost, d.callCount].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = globalThis.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-costs-${days}d.csv`;
        a.click();
        globalThis.URL.revokeObjectURL(url);
    };

    const handlePurge = async () => {
        if (!confirm('Purge completed/cancelled jobs older than 30 days?')) return;
        setPurging(true);
        try {
            const res = await fetch('/api/queue/health', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ olderThanDays: 30 }),
            });
            const data = await res.json();
            alert(data.message || `Purged ${data.purged} jobs`);
            fetchData();
        } catch {
            alert('Failed to purge jobs');
        } finally {
            setPurging(false);
        }
    };

    const stageLabels: Record<string, string> = {
        keyword_research: 'Keyword Research',
        outline: 'Outline',
        draft: 'Draft',
        humanize: 'Humanize',
        seo: 'SEO Optimize',
        meta: 'Meta Gen',
        classify: 'Classify',
    };

    function formatAge(ms: number | null): string {
        if (ms === null || ms === 0) return '—';
        if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
        if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
        return `${(ms / 3_600_000).toFixed(1)}h`;
    }

    function formatDuration(ms: number | null): string {
        if (ms === null || ms === 0) return '—';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60_000).toFixed(1)}m`;
    }

    if (loading) {
        return (
            <div className="p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-muted rounded w-1/4" />
                    <div className="grid grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-24 bg-muted rounded" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <Card className="border-red-800 bg-red-950/20">
                    <CardContent className="pt-6">
                        <p className="text-red-400">Error: {error}</p>
                        <Button onClick={() => fetchData()} className="mt-4">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!data) return null;

    const maxDailyCost = Math.max(...data.dailyCosts.map(d => d.totalCost), 0.01);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">AI Cost Tracking</h1>
                    <p className="text-muted-foreground">Monitor API usage, spending, and queue health</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={!data}>
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                    </Button>
                    {[7, 30, 90].map(d => (
                        <Button
                            key={d}
                            variant={days === d ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDays(d)}
                        >
                            {d}d
                        </Button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-emerald-900/30 to-emerald-950/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-400">
                            ${data.summary.totalCost.toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground">Last {days} days</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {(data.summary.totalTokens / 1000).toFixed(1)}K
                        </div>
                        <p className="text-xs text-muted-foreground">Input + Output</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">API Calls</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary.totalCalls}</div>
                        <p className="text-xs text-muted-foreground">
                            ${data.summary.avgCostPerCall.toFixed(4)} avg
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Cost per Article</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${data.articleCosts.avgCostPerArticle?.toFixed(2) || '0.00'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {data.articleCosts.articleCount || 0} articles
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Queue Health Panel */}
            {health && (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="h-5 w-5" />
                                    Queue Health
                                </CardTitle>
                                <CardDescription>Real-time processing pipeline metrics</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                {health.errorRate24h > 10 && (
                                    <Badge variant="destructive" className="flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        High Error Rate
                                    </Badge>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handlePurge}
                                    disabled={purging}
                                >
                                    <Trash2 className="mr-2 h-3 w-3" />
                                    {purging ? 'Purging...' : 'Purge Old'}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                            <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                                <p className="text-2xl font-bold text-yellow-400">{health.pending}</p>
                                <p className="text-xs text-muted-foreground">Pending</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-blue-500/10">
                                <p className="text-2xl font-bold text-blue-400">{health.processing}</p>
                                <p className="text-xs text-muted-foreground">Processing</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-emerald-500/10">
                                <p className="text-2xl font-bold text-emerald-400">{health.completed}</p>
                                <p className="text-xs text-muted-foreground">Completed</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-red-500/10">
                                <p className="text-2xl font-bold text-red-400">{health.failed}</p>
                                <p className="text-xs text-muted-foreground">Failed</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-muted">
                                <p className="text-2xl font-bold">{health.throughputPerHour}</p>
                                <p className="text-xs text-muted-foreground">Jobs/Hour</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-muted">
                                <p className="text-2xl font-bold">{health.errorRate24h}%</p>
                                <p className="text-xs text-muted-foreground">Error Rate (24h)</p>
                            </div>
                        </div>
                        <div className="mt-4 flex gap-6 text-sm text-muted-foreground">
                            <span>Avg Processing: <strong className="text-foreground">{formatDuration(health.avgProcessingTimeMs)}</strong></span>
                            <span>Oldest Pending: <strong className="text-foreground">{formatAge(health.oldestPendingAge)}</strong></span>
                            <span>Total Jobs: <strong className="text-foreground">{health.total.toLocaleString()}</strong></span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Daily Cost Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Daily Costs</CardTitle>
                </CardHeader>
                <CardContent>
                    {data.dailyCosts.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No data for this period</p>
                    ) : (
                        <div className="flex items-end gap-1 h-32">
                            {data.dailyCosts.map((day, i) => (
                                <div
                                    key={i}
                                    className="flex-1 bg-emerald-500/80 rounded-t hover:bg-emerald-400 transition-colors"
                                    style={{ height: `${(day.totalCost / maxDailyCost) * 100}%`, minHeight: '4px' }}
                                    title={`${day.date}: $${day.totalCost.toFixed(2)} (${day.callCount} calls)`}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Costs by Stage & Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>By Pipeline Stage</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.costsByStage.length === 0 ? (
                                <p className="text-muted-foreground">No data</p>
                            ) : (
                                data.costsByStage.map(stage => (
                                    <div key={stage.stage} className="flex justify-between items-center">
                                        <div>
                                            <span className="font-medium">{stageLabels[stage.stage] || stage.stage}</span>
                                            <span className="text-xs text-muted-foreground ml-2">({stage.callCount} calls)</span>
                                        </div>
                                        <span className="text-emerald-400 font-mono">
                                            ${stage.totalCost.toFixed(2)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>By Model</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.costsByModel.length === 0 ? (
                                <p className="text-muted-foreground">No data</p>
                            ) : (
                                data.costsByModel.map(model => (
                                    <div key={model.model} className="flex justify-between items-center">
                                        <div>
                                            <span className="font-medium text-sm">{model.model}</span>
                                            <span className="text-xs text-muted-foreground ml-2">({model.callCount})</span>
                                        </div>
                                        <span className="text-emerald-400 font-mono">
                                            ${model.totalCost.toFixed(2)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
