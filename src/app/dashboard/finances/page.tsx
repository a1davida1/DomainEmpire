import { db } from '@/lib/db';
import { expenses, revenueSnapshots, domains } from '@/lib/db/schema';
import { desc, sql, gte } from 'drizzle-orm';
import { projectPortfolioROI } from '@/lib/analytics/forecasting';

export default async function FinancesPage() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentExpenses, expensesByCategory, recentRevenue, allDomains] = await Promise.all([
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
        }).from(domains),
    ]);

    const totalExpenses30d = expensesByCategory.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalRevenue30d = recentRevenue[0]?.total || 0;
    const profit30d = totalRevenue30d - totalExpenses30d;
    const totalInvestment = allDomains.reduce((sum, d) => sum + Number(d.purchasePrice || 0), 0);

    // Fetch portfolio projections
    let portfolio: Awaited<ReturnType<typeof projectPortfolioROI>> | null = null;
    try {
        portfolio = await projectPortfolioROI(6);
    } catch {
        // Projections may fail if no revenue data exists
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Finances</h1>

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

            {/* Expenses by category */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Expenses by Category (30d)</h2>
                <div className="space-y-2">
                    {expensesByCategory.map(cat => (
                        <div key={cat.category} className="flex items-center justify-between">
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
