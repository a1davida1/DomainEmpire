'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface RevenueData {
    period: { days: number };
    summary: {
        totalRevenue: number;
        totalClicks: number;
        totalImpressions: number;
        avgRpm: number;
        ctr: number;
    };
    bySource: Array<{ source: string; totalRevenue: number; totalClicks: number }>;
    topDomains: Array<{ domain: string; totalRevenue: number; totalClicks: number }>;
    dailyTrend: Array<{ date: string; totalRevenue: number; adRevenue: number; affiliateRevenue: number }>;
}

export default function RevenuePage() {
    const [data, setData] = useState<RevenueData | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        const controller = new AbortController();

        async function fetchRevenue() {
            setLoading(true);
            try {
                const res = await fetch(`/api/analytics/revenue?days=${days}`, {
                    signal: controller.signal
                });

                if (!res.ok) {
                    const errorText = await res.text();
                    throw new Error(errorText || `Failed to fetch revenue (${res.status})`);
                }

                const data = await res.json();
                if (!controller.signal.aborted) {
                    setData(data);
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') return;
                console.error('Failed to fetch revenue:', error);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        fetchRevenue();

        return () => controller.abort();
    }, [days]);

    if (loading) {
        return <div className="p-6">Loading revenue data...</div>;
    }

    if (!data) {
        return <div className="p-6">No revenue data available</div>;
    }

    const maxDailyRevenue = Math.max(...data.dailyTrend.map(d => d.totalRevenue), 0.01);

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">Revenue Dashboard</h1>
                    <p className="text-zinc-400">Track earnings across all domains</p>
                </div>
                <div className="flex gap-2">
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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-gradient-to-br from-green-900/30 to-green-950/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-400">${data.summary.totalRevenue}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Impressions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{(data.summary.totalImpressions / 1000).toFixed(1)}K</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">Clicks</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary.totalClicks.toLocaleString()}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">RPM</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${data.summary.avgRpm}</div>
                    </CardContent>
                </Card>
                <Card className="bg-zinc-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-zinc-400">CTR</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.summary.ctr}%</div>
                    </CardContent>
                </Card>
            </div>

            {/* Daily Trend Chart */}
            <Card className="bg-zinc-900/50">
                <CardHeader>
                    <CardTitle>Daily Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                    {data.dailyTrend.length === 0 ? (
                        <p className="text-zinc-500 text-center py-8">No data</p>
                    ) : (
                        <div className="flex items-end gap-1 h-32">
                            {data.dailyTrend.map((day, _i) => (
                                <div key={day.date} className="flex-1 flex flex-col gap-0.5">
                                    <div
                                        className="bg-blue-500/60 rounded-t"
                                        style={{ height: `${(day.affiliateRevenue / maxDailyRevenue) * 100}%`, minHeight: '2px' }}
                                        title={`Affiliate: $${day.affiliateRevenue}`}
                                    />
                                    <div
                                        className="bg-green-500/80 rounded-t"
                                        style={{ height: `${(day.adRevenue / maxDailyRevenue) * 100}%`, minHeight: '2px' }}
                                        title={`Ads: $${day.adRevenue}`}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* By Source & Top Domains */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-zinc-900/50">
                    <CardHeader>
                        <CardTitle>By Source</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.bySource.length === 0 ? (
                                <p className="text-zinc-500">No data</p>
                            ) : (
                                data.bySource.map(source => (
                                    <div key={source.source} className="flex justify-between items-center">
                                        <span className="font-medium capitalize">{source.source}</span>
                                        <span className="text-green-400 font-mono">${source.totalRevenue}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-zinc-900/50">
                    <CardHeader>
                        <CardTitle>Top Domains</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {data.topDomains.length === 0 ? (
                                <p className="text-zinc-500">No data</p>
                            ) : (
                                data.topDomains.slice(0, 5).map(d => (
                                    <div key={d.domain} className="flex justify-between items-center">
                                        <span className="font-medium text-sm truncate max-w-[200px]">{d.domain}</span>
                                        <span className="text-green-400 font-mono">${d.totalRevenue}</span>
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
