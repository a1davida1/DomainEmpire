import { db } from '@/lib/db';
import { expenses, revenueSnapshots, domains } from '@/lib/db/schema';
import { desc, sql, eq, gte } from 'drizzle-orm';

export default async function FinancesPage() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [recentExpenses, expensesByCategory, recentRevenue, allDomains] = await Promise.all([
        db.select().from(expenses).orderBy(desc(expenses.expenseDate)).limit(50),
        db.select({
            category: expenses.category,
            total: sql<number>`sum(${expenses.amount})::real`,
            count: sql<number>`count(*)::int`,
        })
            .from(expenses)
            .where(gte(expenses.expenseDate, ninetyDaysAgo))
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

    const totalExpenses90d = expensesByCategory.reduce((sum, e) => sum + (e.total || 0), 0);
    const totalRevenue30d = recentRevenue[0]?.total || 0;
    const totalInvestment = allDomains.reduce((sum, d) => sum + (d.purchasePrice || 0), 0);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Finances</h1>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Revenue (30d)</p>
                    <p className="text-2xl font-bold text-green-600">${totalRevenue30d.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Expenses (90d)</p>
                    <p className="text-2xl font-bold text-red-600">${totalExpenses90d.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Total Investment</p>
                    <p className="text-2xl font-bold">${totalInvestment.toFixed(2)}</p>
                </div>
                <div className="bg-card rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">Portfolio ROI</p>
                    <p className="text-2xl font-bold">
                        {totalInvestment > 0
                            ? `${((totalRevenue30d * 12 / totalInvestment) * 100).toFixed(1)}%`
                            : 'N/A'}
                    </p>
                    <p className="text-xs text-muted-foreground">annualized</p>
                </div>
            </div>

            {/* Expenses by category */}
            <div className="bg-card rounded-lg border p-4">
                <h2 className="text-lg font-semibold mb-3">Expenses by Category (90d)</h2>
                <div className="space-y-2">
                    {expensesByCategory.map(cat => (
                        <div key={cat.category} className="flex items-center justify-between">
                            <span className="text-sm capitalize">{cat.category.replace(/_/g, ' ')}</span>
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
                                    <td className="p-3 capitalize">{exp.category.replace(/_/g, ' ')}</td>
                                    <td className="p-3">{exp.description}</td>
                                    <td className="p-3 text-right font-medium">${exp.amount.toFixed(2)}</td>
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
