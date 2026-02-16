'use client';

import { useState, useEffect } from 'react';
import { Loader2, TrendingUp, Shield, DollarSign, Search, BarChart3, AlertTriangle } from 'lucide-react';

type ComplianceMetrics = {
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

type RevenueData = {
    totalRevenue: number;
    adRevenue: number;
    affiliateRevenue: number;
    leadGenRevenue: number;
    domainCount: number;
    avgRevenuePerDomain: number;
};

type CostData = {
    totalCosts: number;
    aiApiCosts: number;
    domainCosts: number;
    hostingCosts: number;
};

function KpiCard({ label, value, icon: Icon, color }: {
    label: string;
    value: string;
    icon: React.ElementType;
    color: string;
}) {
    return (
        <div className="bg-card rounded-lg border p-4 flex items-start gap-3">
            <div className={`p-2 rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-xl font-bold">{value}</p>
            </div>
        </div>
    );
}

function ProgressBar({ label, value, max, color }: {
    label: string;
    value: number;
    max: number;
    color: string;
}) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{(pct).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export default function KpiDashboardPage() {
    const [compliance, setCompliance] = useState<ComplianceMetrics | null>(null);
    const [revenue, setRevenue] = useState<RevenueData | null>(null);
    const [costs, setCosts] = useState<CostData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [complianceRes, revenueRes, costsRes] = await Promise.all([
                    fetch('/api/compliance/metrics'),
                    fetch('/api/analytics/revenue'),
                    fetch('/api/analytics/costs'),
                ]);

                if (!complianceRes.ok) throw new Error(`Compliance metrics failed: ${complianceRes.statusText}`);
                if (!revenueRes.ok) throw new Error(`Revenue data failed: ${revenueRes.statusText}`);
                if (!costsRes.ok) throw new Error(`Cost data failed: ${costsRes.statusText}`);

                setCompliance(await complianceRes.json());
                setRevenue(await revenueRes.json());
                setCosts(await costsRes.json());
            } catch (err: unknown) {
                console.error('Failed to load KPI data:', err);
                setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    const totalRevenue = revenue?.totalRevenue || 0;
    const totalCosts = costs?.totalCosts || 0;
    const netProfit = totalRevenue - totalCosts;
    const roi = totalCosts > 0 ? ((netProfit / totalCosts) * 100) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <BarChart3 className="h-6 w-6" />
                <h1 className="text-2xl font-bold tracking-tight">KPI Dashboard</h1>
            </div>

            {error && (
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {/* Top-line KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Published"
                    value={compliance?.totalPublished?.toString() || '0'}
                    icon={TrendingUp}
                    color="bg-blue-100 text-blue-600"
                />
                <KpiCard
                    label="Revenue (30d)"
                    value={`$${totalRevenue.toFixed(2)}`}
                    icon={DollarSign}
                    color="bg-green-100 text-green-600"
                />
                <KpiCard
                    label="Net Profit"
                    value={`$${netProfit.toFixed(2)}`}
                    icon={DollarSign}
                    color={netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}
                />
                <KpiCard
                    label="ROI"
                    value={`${roi.toFixed(0)}%`}
                    icon={TrendingUp}
                    color={roi >= 0 ? 'bg-purple-100 text-purple-600' : 'bg-red-100 text-red-600'}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Trust & Governance */}
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-emerald-600" />
                        Trust & Governance
                    </h2>
                    <div className="space-y-4">
                        <ProgressBar
                            label="YMYL Approval Rate"
                            value={compliance?.ymylApprovalRate || 0}
                            max={1}
                            color="bg-emerald-500"
                        />
                        <ProgressBar
                            label="Citation Coverage"
                            value={compliance?.citationCoverageRatio || 0}
                            max={1}
                            color="bg-blue-500"
                        />
                        <ProgressBar
                            label="Human Edit Ratio"
                            value={compliance?.meaningfulEditRatio || 0}
                            max={1}
                            color="bg-purple-500"
                        />
                        <ProgressBar
                            label="Disclosure Compliance"
                            value={compliance?.disclosureComplianceRate || 0}
                            max={1}
                            color="bg-orange-500"
                        />

                        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                            <div className="text-center">
                                <p className="text-xl font-bold">{compliance?.articlesWithQaPassed || 0}</p>
                                <p className="text-xs text-muted-foreground">QA Passed</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xl font-bold">{compliance?.articlesWithExpertReview || 0}</p>
                                <p className="text-xs text-muted-foreground">Expert Reviewed</p>
                            </div>
                            <div className="text-center">
                                <p className="text-xl font-bold">
                                    {compliance?.avgTimeInReview ? `${compliance.avgTimeInReview.toFixed(1)}h` : '-'}
                                </p>
                                <p className="text-xs text-muted-foreground">Avg Review Time</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Revenue Breakdown */}
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        Revenue Breakdown
                    </h2>
                    {revenue ? (
                        <div className="space-y-4">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Ad Revenue</span>
                                    <span className="font-medium">${(revenue.adRevenue || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Affiliate Revenue</span>
                                    <span className="font-medium">${(revenue.affiliateRevenue || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Lead Gen Revenue</span>
                                    <span className="font-medium">${(revenue.leadGenRevenue || 0).toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="border-t pt-3">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>Total Revenue</span>
                                    <span>${totalRevenue.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                                <div className="text-center">
                                    <p className="text-xl font-bold">{revenue.domainCount || 0}</p>
                                    <p className="text-xs text-muted-foreground">Active Domains</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-xl font-bold">${(revenue.avgRevenuePerDomain || 0).toFixed(2)}</p>
                                    <p className="text-xs text-muted-foreground">Rev/Domain</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No revenue data available.</p>
                    )}
                </div>

                {/* Cost Breakdown */}
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-red-600" />
                        Cost Breakdown
                    </h2>
                    {costs ? (
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">AI API Costs</span>
                                <span className="font-medium">${(costs.aiApiCosts || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Domain Costs</span>
                                <span className="font-medium">${(costs.domainCosts || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Hosting</span>
                                <span className="font-medium">${(costs.hostingCosts || 0).toFixed(2)}</span>
                            </div>
                            <div className="border-t pt-3">
                                <div className="flex justify-between text-sm font-medium">
                                    <span>Total Costs</span>
                                    <span>${totalCosts.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No cost data available.</p>
                    )}
                </div>

                {/* Content Pipeline */}
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Search className="h-5 w-5 text-blue-600" />
                        Content Pipeline
                    </h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="text-center p-3 bg-muted/30 rounded-lg">
                                <p className="text-2xl font-bold">{compliance?.totalPublished || 0}</p>
                                <p className="text-xs text-muted-foreground">Published</p>
                            </div>
                            <div className="text-center p-3 bg-muted/30 rounded-lg">
                                <p className="text-2xl font-bold">{compliance?.totalInReview || 0}</p>
                                <p className="text-xs text-muted-foreground">In Review</p>
                            </div>
                        </div>

                        {compliance && compliance.totalPublished > 0 && (
                            <div className="text-sm text-muted-foreground">
                                <p>Revenue per article: ${totalRevenue > 0 && compliance.totalPublished > 0
                                    ? (totalRevenue / compliance.totalPublished).toFixed(2)
                                    : '0.00'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
