'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer,
} from 'recharts';

type Metrics = {
    ymylApprovalRate: number;
    citationCoverageRatio: number;
    avgTimeInReview: number;
    articlesWithExpertReview: number;
    articlesWithQaPassed: number;
    disclosureComplianceRate: number;
    meaningfulEditRatio: number;
    totalPublished: number;
    totalInReview: number;
};

type TrendPoint = {
    date: string;
    ymylApprovalRate?: number;
    citationCoverageRatio?: number;
    disclosureComplianceRate?: number;
    meaningfulEditRatio?: number;
};

function MetricCard({ label, value, format, threshold }: {
    label: string;
    value: number;
    format: 'percent' | 'number';
    threshold?: { good: number; warn: number };
}) {
    const displayValue = format === 'percent'
        ? `${(value * 100).toFixed(0)}%`
        : value.toString();

    let colorClass = '';
    if (threshold) {
        if (value >= threshold.good) colorClass = 'text-green-600';
        else if (value >= threshold.warn) colorClass = 'text-yellow-600';
        else colorClass = 'text-red-600';
    }

    return (
        <div className="bg-card rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${colorClass}`}>{displayValue}</p>
        </div>
    );
}

const TREND_LINES = [
    { key: 'ymylApprovalRate', name: 'YMYL Approval', color: '#10b981' },
    { key: 'citationCoverageRatio', name: 'Citation Coverage', color: '#3b82f6' },
    { key: 'disclosureComplianceRate', name: 'Disclosure Compliance', color: '#f59e0b' },
    { key: 'meaningfulEditRatio', name: 'Human Edit Ratio', color: '#8b5cf6' },
];

export default function CompliancePage() {
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [trend, setTrend] = useState<TrendPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [snapping, setSnapping] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        const loadData = async () => {
            try {
                const [metricsRes, trendRes] = await Promise.all([
                    fetch('/api/compliance/metrics', { signal: controller.signal }),
                    fetch('/api/compliance/trend?days=90', { signal: controller.signal }),
                ]);

                if (!metricsRes.ok) throw new Error(`Failed to load metrics: ${metricsRes.statusText}`);
                if (!trendRes.ok) throw new Error(`Failed to load trend: ${trendRes.statusText}`);

                const metricsData = await metricsRes.json();
                const trendData = await trendRes.json();

                if (controller.signal.aborted) return;

                setMetrics(metricsData);
                setTrend(trendData);
            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error('Failed to load compliance data:', err);
                setError(err instanceof Error ? err.message : 'Failed to load compliance metrics');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        loadData();
        return () => controller.abort();
    }, []);

    async function takeSnapshot() {
        setSnapping(true);
        setError(null);
        try {
            const res = await fetch('/api/compliance/snapshot', { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to take snapshot');
            }

            // Refresh trend data after snapshot
            const trendRes = await fetch('/api/compliance/trend?days=90');
            if (trendRes.ok) {
                setTrend(await trendRes.json());
            }
        } catch (err: unknown) {
            console.error('Snapshot failed:', err);
            setError(err instanceof Error ? err.message : 'Snapshot operation failed');
        } finally {
            setSnapping(false);
        }
    }

    if (loading || !metrics) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const issues: string[] = [];
    if (metrics.ymylApprovalRate < 1) issues.push('Some YMYL articles published without approval');
    if (metrics.citationCoverageRatio < 0.5) issues.push('Less than 50% of articles have citations');
    if (metrics.meaningfulEditRatio < 0.1) issues.push('Low human edit ratio — may signal insufficient editorial oversight');
    if (metrics.articlesWithQaPassed === 0 && metrics.totalPublished > 0) issues.push('No articles have passed QA checklist');

    const chartData = trend.map(t => ({
        ...t,
        date: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-6 w-6" />
                    <h1 className="text-2xl font-bold tracking-tight">Compliance Dashboard</h1>
                </div>
                <Button onClick={takeSnapshot} disabled={snapping} variant="outline" size="sm">
                    {snapping ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Take Snapshot
                </Button>
            </div>

            {error && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5" />
                    <p className="text-sm font-medium">{error}</p>
                    <Button variant="ghost" size="sm" onClick={() => setError(null)} className="ml-auto">Dismiss</Button>
                </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Published Articles" value={metrics.totalPublished} format="number" />
                <MetricCard label="Awaiting Review" value={metrics.totalInReview} format="number" />
                <MetricCard label="QA Passed" value={metrics.articlesWithQaPassed} format="number" />
                <MetricCard label="Expert Reviewed" value={metrics.articlesWithExpertReview} format="number" />
            </div>

            {/* Trust & Governance Metrics */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-4">Trust & Governance</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <MetricCard
                        label="YMYL Approval Rate"
                        value={metrics.ymylApprovalRate}
                        format="percent"
                        threshold={{ good: 0.95, warn: 0.8 }}
                    />
                    <MetricCard
                        label="Citation Coverage"
                        value={metrics.citationCoverageRatio}
                        format="percent"
                        threshold={{ good: 0.7, warn: 0.4 }}
                    />
                    <MetricCard
                        label="Human Edit Ratio"
                        value={metrics.meaningfulEditRatio}
                        format="percent"
                        threshold={{ good: 0.2, warn: 0.1 }}
                    />
                    <MetricCard
                        label="Disclosure Compliance"
                        value={metrics.disclosureComplianceRate}
                        format="percent"
                        threshold={{ good: 0.95, warn: 0.8 }}
                    />
                </div>
            </div>

            {/* Compliance Trend Chart */}
            {chartData.length > 1 && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-4">Compliance Trend (90 days)</h2>
                    <ResponsiveContainer width="100%" height={320}>
                        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                            <YAxis
                                domain={[0, 1]}
                                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                                tick={{ fontSize: 12 }}
                            />
                            <Tooltip
                                formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`}
                                labelStyle={{ fontWeight: 'bold' }}
                            />
                            <Legend />
                            {TREND_LINES.map(line => (
                                <Line
                                    key={line.key}
                                    type="monotone"
                                    dataKey={line.key}
                                    name={line.name}
                                    stroke={line.color}
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {chartData.length <= 1 && (
                <div className="bg-card rounded-lg border p-4 text-center text-muted-foreground text-sm">
                    <p>Trend charts need at least 2 snapshots. Click &ldquo;Take Snapshot&rdquo; periodically to build history.</p>
                </div>
            )}

            {/* Issues */}
            {issues.length > 0 && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                        Compliance Issues
                    </h2>
                    <ul className="space-y-2">
                        {issues.map((issue) => (
                            <li key={issue} className="flex items-start gap-2 text-sm">
                                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                                {issue}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {issues.length === 0 && (
                <div className="bg-green-50 rounded-lg border border-green-200 p-4 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm text-green-800">No compliance issues detected. All governance metrics look healthy.</p>
                </div>
            )}
        </div>
    );
}
