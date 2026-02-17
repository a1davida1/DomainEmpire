import { db } from '@/lib/db';
import {
    domainFinanceLedgerEntries,
    domainFinanceMonthlyCloses,
    domains,
    expenses,
    revenueSnapshots,
} from '@/lib/db/schema';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { projectPortfolioROI } from '@/lib/analytics/forecasting';
import { FinanceMonthlyClosePanel } from '@/components/dashboard/FinanceMonthlyClosePanel';

function toMoney(value: number | string | null | undefined): number {
    const numeric = typeof value === 'number' ? value : Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

export default async function FinancesPage() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [recentExpenses, expensesByCategory, recentRevenue, allDomains, ledgerRollups30d, recentMonthlyCloses, ledgerCoverageRows] = await Promise.all([
        db.select().from(expenses).orderBy(desc(expenses.expenseDate)).limit(50),
        db.select({
            category: expenses.category,
            total: sql<number>`sum(${expenses.amount})::real`,
            count: sql<number>`count(*)::int`,
        })
            .from(expenses)
            .where(gte(expenses.expenseDate, thirtyDaysAgo))
            .groupBy(expenses.category),
        db.select({
            total: sql<number>`sum(${revenueSnapshots.totalRevenue})::real`,
        })
            .from(revenueSnapshots)
            .where(gte(revenueSnapshots.snapshotDate, thirtyDaysAgo)),
        db.select({
            id: domains.id,
            domain: domains.domain,
            purchasePrice: domains.purchasePrice,
            renewalPrice: domains.renewalPrice,
        }).from(domains),
        db.select({
            domainId: domainFinanceLedgerEntries.domainId,
            domain: domains.domain,
            revenueTotal: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            costTotal: sql<number>`sum(case when ${domainFinanceLedgerEntries.impact} = 'cost' then ${domainFinanceLedgerEntries.amount} else 0 end)::float`,
            entryCount: sql<number>`count(*)::int`,
        })
            .from(domainFinanceLedgerEntries)
            .innerJoin(domains, eq(domainFinanceLedgerEntries.domainId, domains.id))
            .where(gte(domainFinanceLedgerEntries.entryDate, thirtyDaysAgo))
            .groupBy(domainFinanceLedgerEntries.domainId, domains.domain)
            .orderBy(sql`sum(case when ${domainFinanceLedgerEntries.impact} = 'revenue' then ${domainFinanceLedgerEntries.amount} else 0 end) - sum(case when ${domainFinanceLedgerEntries.impact} = 'cost' then ${domainFinanceLedgerEntries.amount} else 0 end) desc`)
            .limit(60),
        db.select({
            id: domainFinanceMonthlyCloses.id,
            domainId: domainFinanceMonthlyCloses.domainId,
            domain: domains.domain,
            monthStart: domainFinanceMonthlyCloses.monthStart,
            monthEnd: domainFinanceMonthlyCloses.monthEnd,
            revenueTotal: domainFinanceMonthlyCloses.revenueTotal,
            costTotal: domainFinanceMonthlyCloses.costTotal,
            netTotal: domainFinanceMonthlyCloses.netTotal,
            marginPct: domainFinanceMonthlyCloses.marginPct,
            entryCount: domainFinanceMonthlyCloses.entryCount,
            closedAt: domainFinanceMonthlyCloses.closedAt,
        })
            .from(domainFinanceMonthlyCloses)
            .innerJoin(domains, eq(domainFinanceMonthlyCloses.domainId, domains.id))
            .where(gte(domainFinanceMonthlyCloses.monthStart, ninetyDaysAgo))
            .orderBy(desc(domainFinanceMonthlyCloses.monthStart), desc(domainFinanceMonthlyCloses.closedAt))
            .limit(80),
        db.select({
            domainCount: sql<number>`count(distinct ${domainFinanceLedgerEntries.domainId})::int`,
        })
            .from(domainFinanceLedgerEntries)
            .where(gte(domainFinanceLedgerEntries.entryDate, thirtyDaysAgo)),
    ]);

    const totalExpenses30d = expensesByCategory.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalRevenue30d = recentRevenue[0]?.total || 0;
    const profit30d = totalRevenue30d - totalExpenses30d;
    const totalInvestment = allDomains.reduce((sum, d) => sum + Number(d.purchasePrice || 0), 0);

    // Build per-domain ROI map: merge ledger P&L with purchase/renewal costs
    const domainRoiData = ledgerRollups30d.map((row) => {
        const domainInfo = allDomains.find((d) => d.id === row.domainId);
        const revenue = toMoney(row.revenueTotal);
        const cost = toMoney(row.costTotal);
        const net = revenue - cost;
        const purchasePrice = Number(domainInfo?.purchasePrice || 0);
        const renewalPrice = Number(domainInfo?.renewalPrice || 0);
        const totalCostBasis = purchasePrice;
        const annualizedNet = net * 12; // 30d → annual
        const roi = totalCostBasis > 0 ? (annualizedNet / totalCostBasis) * 100 : null;
        const paybackMonths = net > 0 ? totalCostBasis / net : null;
        return {
            domainId: row.domainId,
            domain: row.domain,
            revenue,
            cost,
            net,
            purchasePrice,
            renewalPrice,
            totalCostBasis,
            annualizedNet,
            roi,
            paybackMonths,
        };
    }).sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
    const ledgerRevenue30d = ledgerRollups30d.reduce((sum, row) => sum + toMoney(row.revenueTotal), 0);
    const ledgerCost30d = ledgerRollups30d.reduce((sum, row) => sum + toMoney(row.costTotal), 0);
    const ledgerNet30d = ledgerRevenue30d - ledgerCost30d;
    const ledgerDomainCoverage = ledgerCoverageRows[0]?.domainCount ?? 0;
    const ledgerCoveragePct = allDomains.length > 0
        ? Number(((ledgerDomainCoverage / allDomains.length) * 100).toFixed(1))
        : null;

    // Fetch portfolio projections
    let portfolio: Awaited<ReturnType<typeof projectPortfolioROI>> | null = null;
    try {
        portfolio = await projectPortfolioROI(6);
    } catch {
        // Projections may fail if no revenue data exists
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">Finances</h1>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Revenue (30d)</p>
                    <p className="text-2xl font-bold text-green-600">${totalRevenue30d.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Expenses (30d)</p>
                    <p className="text-2xl font-bold text-red-600">${totalExpenses30d.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Profit (30d)</p>
                    <p className={`text-2xl font-bold ${profit30d >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${profit30d.toFixed(2)}
                    </p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Total Investment</p>
                    <p className="text-2xl font-bold">${totalInvestment.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Portfolio ROI</p>
                    <p className="text-2xl font-bold">
                        {totalInvestment > 0
                            ? `${((profit30d * 12 / totalInvestment) * 100).toFixed(1)}%`
                            : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">annualized (profit-based)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Ledger Revenue (30d)</p>
                    <p className="text-xl font-semibold text-green-600">${ledgerRevenue30d.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Ledger Cost (30d)</p>
                    <p className="text-xl font-semibold text-red-600">${ledgerCost30d.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Ledger Net (30d)</p>
                    <p className={`text-xl font-semibold ${ledgerNet30d >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${ledgerNet30d.toFixed(2)}
                    </p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Ledger Domain Coverage (30d)</p>
                    <p className="text-xl font-semibold">{ledgerDomainCoverage}/{allDomains.length}</p>
                    <p className="text-xs text-muted-foreground">{ledgerCoveragePct !== null ? `${ledgerCoveragePct}% of portfolio` : 'N/A'}</p>
                </div>
            </div>

            <FinanceMonthlyClosePanel domains={allDomains.map((row) => ({ id: row.id, domain: row.domain }))} />

            {/* Projections */}
            {portfolio && portfolio.projections.length > 0 && (
                <div className="bg-card rounded-lg border p-4">
                    <h2 className="text-lg font-semibold mb-3">Revenue Projections (6-Month)</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-muted/30 rounded p-3">
                            <p className="text-xs text-muted-foreground">Projected Annual Return</p>
                            <p className="text-lg font-bold text-green-600">${portfolio.projectedAnnualReturn.toFixed(0)}</p>
                        </div>
                        <div className="bg-muted/30 rounded p-3">
                            <p className="text-xs text-muted-foreground">Projected ROI</p>
                            <p className="text-lg font-bold">{portfolio.projectedROI.toFixed(1)}%</p>
                        </div>
                        <div className="bg-muted/30 rounded p-3">
                            <p className="text-xs text-muted-foreground">Total Investment</p>
                            <p className="text-lg font-bold">${portfolio.totalInvestment.toFixed(0)}</p>
                        </div>
                        <div className="bg-muted/30 rounded p-3">
                            <p className="text-xs text-muted-foreground">Confidence Avg</p>
                            <p className="text-lg font-bold">
                                {Math.round(portfolio.projections.reduce((s, p) => s + p.confidence, 0) / portfolio.projections.length)}%
                            </p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left p-2">Month</th>
                                    <th className="text-right p-2">Revenue</th>
                                    <th className="text-right p-2">Expenses</th>
                                    <th className="text-right p-2">Profit</th>
                                    <th className="text-right p-2">Confidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {portfolio.projections.map(p => (
                                    <tr key={p.month} className="border-t">
                                        <td className="p-2">{p.month}</td>
                                        <td className="p-2 text-right text-green-600">${p.projectedRevenue.toFixed(2)}</td>
                                        <td className="p-2 text-right text-red-600">${p.projectedExpenses.toFixed(2)}</td>
                                        <td className={`p-2 text-right font-medium ${p.projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ${p.projectedProfit.toFixed(2)}
                                        </td>
                                        <td className="p-2 text-right">
                                            <span className={`px-1.5 py-0.5 rounded text-xs ${p.confidence >= 60 ? 'bg-green-100 text-green-800' :
                                                p.confidence >= 30 ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                {p.confidence}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="bg-card rounded-lg border overflow-hidden">
                <h2 className="text-lg font-semibold p-4 border-b">Per-Domain P&L (Last 30 Days, Ledger)</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Domain</th>
                                <th className="text-right p-3">Revenue</th>
                                <th className="text-right p-3">Cost</th>
                                <th className="text-right p-3">Net</th>
                                <th className="text-right p-3">Margin</th>
                                <th className="text-right p-3">Entries</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledgerRollups30d.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-3 text-muted-foreground">
                                        No ledger entries found in the last 30 days.
                                    </td>
                                </tr>
                            )}
                            {ledgerRollups30d.map((row) => {
                                const revenue = toMoney(row.revenueTotal);
                                const cost = toMoney(row.costTotal);
                                const net = revenue - cost;
                                const margin = revenue > 0 ? (net / revenue) * 100 : null;
                                return (
                                    <tr key={row.domainId} className="border-t">
                                        <td className="p-3 font-mono">{row.domain}</td>
                                        <td className="p-3 text-right text-green-600">${revenue.toFixed(2)}</td>
                                        <td className="p-3 text-right text-red-600">${cost.toFixed(2)}</td>
                                        <td className={`p-3 text-right font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ${net.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right">{margin !== null ? `${margin.toFixed(1)}%` : '—'}</td>
                                        <td className="p-3 text-right">{row.entryCount}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Per-Domain ROI Calculator */}
            {domainRoiData.length > 0 && (
                <div className="bg-card rounded-lg border overflow-hidden">
                    <h2 className="text-lg font-semibold p-4 border-b">Per-Domain ROI (Annualized from 30d Ledger)</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left p-3">Domain</th>
                                    <th className="text-right p-3">30d Revenue</th>
                                    <th className="text-right p-3">30d Cost</th>
                                    <th className="text-right p-3">30d Net</th>
                                    <th className="text-right p-3">Purchase</th>
                                    <th className="text-right p-3">Renewal</th>
                                    <th className="text-right p-3">Cost Basis</th>
                                    <th className="text-right p-3">Annual ROI</th>
                                    <th className="text-right p-3">Payback</th>
                                </tr>
                            </thead>
                            <tbody>
                                {domainRoiData.map((row) => (
                                    <tr key={row.domainId} className="border-t">
                                        <td className="p-3 font-mono">{row.domain}</td>
                                        <td className="p-3 text-right text-green-600">${row.revenue.toFixed(2)}</td>
                                        <td className="p-3 text-right text-red-600">${row.cost.toFixed(2)}</td>
                                        <td className={`p-3 text-right font-medium ${row.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ${row.net.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right">{row.purchasePrice > 0 ? `$${row.purchasePrice.toFixed(0)}` : '—'}</td>
                                        <td className="p-3 text-right">{row.renewalPrice > 0 ? `$${row.renewalPrice.toFixed(0)}` : '—'}</td>
                                        <td className="p-3 text-right">{row.totalCostBasis > 0 ? `$${row.totalCostBasis.toFixed(0)}` : '—'}</td>
                                        <td className="p-3 text-right">
                                            {row.roi !== null ? (
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                    row.roi >= 100 ? 'bg-green-100 text-green-800' :
                                                    row.roi >= 0 ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                    {row.roi.toFixed(0)}%
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            {row.paybackMonths !== null
                                                ? row.paybackMonths < 1
                                                    ? '<1 mo'
                                                    : `${row.paybackMonths.toFixed(1)} mo`
                                                : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="bg-card rounded-lg border overflow-hidden">
                <h2 className="text-lg font-semibold p-4 border-b">Monthly Close Snapshots (Last 90 Days)</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Month</th>
                                <th className="text-left p-3">Domain</th>
                                <th className="text-right p-3">Revenue</th>
                                <th className="text-right p-3">Cost</th>
                                <th className="text-right p-3">Net</th>
                                <th className="text-right p-3">Margin</th>
                                <th className="text-right p-3">Entries</th>
                                <th className="text-right p-3">Closed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentMonthlyCloses.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-3 text-muted-foreground">
                                        No monthly close snapshots found in the last 90 days.
                                    </td>
                                </tr>
                            )}
                            {recentMonthlyCloses.map((row) => {
                                const revenue = toMoney(row.revenueTotal);
                                const cost = toMoney(row.costTotal);
                                const net = toMoney(row.netTotal);
                                const margin = row.marginPct === null ? null : Number(row.marginPct) * 100;
                                const monthLabel = new Date(row.monthStart).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                });
                                return (
                                    <tr key={row.id} className="border-t">
                                        <td className="p-3">{monthLabel}</td>
                                        <td className="p-3 font-mono">{row.domain}</td>
                                        <td className="p-3 text-right text-green-600">${revenue.toFixed(2)}</td>
                                        <td className="p-3 text-right text-red-600">${cost.toFixed(2)}</td>
                                        <td className={`p-3 text-right font-medium ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            ${net.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right">{margin !== null ? `${margin.toFixed(1)}%` : '—'}</td>
                                        <td className="p-3 text-right">{row.entryCount}</td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            {row.closedAt ? new Date(row.closedAt).toLocaleDateString() : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Expenses by category */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Expenses by Category (30d)</h2>
                <div className="space-y-2">
                    {expensesByCategory.map(cat => (
                        <div key={cat.category ?? 'uncategorized'} className="flex items-center justify-between">
                            <span className="text-sm capitalize">{(cat.category ?? 'uncategorized').replaceAll('_', ' ')}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{cat.count} items</span>
                                <span className="font-medium">${(cat.total || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent expenses table */}
            <div className="bg-card rounded-lg border overflow-hidden">
                <h2 className="text-lg font-semibold p-4 border-b">Recent Expenses</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Date</th>
                                <th className="text-left p-3">Category</th>
                                <th className="text-left p-3">Description</th>
                                <th className="text-right p-3">Amount</th>
                                <th className="text-left p-3">Recurring</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentExpenses.map(exp => (
                                <tr key={exp.id} className="border-t">
                                    <td className="p-3 text-muted-foreground">
                                        {exp.expenseDate ? new Date(exp.expenseDate).toLocaleDateString() : '—'}
                                    </td>
                                    <td className="p-3 capitalize">{exp.category?.replaceAll('_', ' ') ?? 'uncategorized'}</td>
                                    <td className="p-3">{exp.description}</td>
                                    <td className="p-3 text-right font-medium">${Number(exp.amount).toFixed(2)}</td>
                                    <td className="p-3">
                                        {exp.recurring ? (
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                                                {exp.recurringInterval}
                                            </span>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
