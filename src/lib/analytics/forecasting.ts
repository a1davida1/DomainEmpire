/**
 * Financial Forecasting
 *
 * Linear regression on revenue snapshots to project future revenue.
 * Portfolio ROI projections and breakeven date estimation.
 */

import { db } from '@/lib/db';
import { revenueSnapshots, domains, expenses } from '@/lib/db/schema';
import { eq, desc, gte, sql } from 'drizzle-orm';

interface RevenueProjection {
    month: string;
    projectedRevenue: number;
    projectedExpenses: number;
    projectedProfit: number;
    confidence: number;
}

interface ForecastResult {
    domainId?: string;
    domain?: string;
    projections: RevenueProjection[];
    currentMonthlyRevenue: number;
    currentMonthlyExpenses: number;
    trendDirection: 'up' | 'down' | 'flat';
    monthlyGrowthRate: number;
}

/**
 * Simple linear regression: y = mx + b
 */
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: points[0]?.y || 0, r2: 0 };

    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R-squared
    const meanY = sumY / n;
    const ssTotal = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
    const ssResidual = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
    const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return { slope, intercept, r2 };
}

/**
 * Project revenue for a specific domain over N months.
 */
export async function projectRevenue(domainId: string, months: number = 6): Promise<ForecastResult> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const snapshots = await db.select({
        date: revenueSnapshots.snapshotDate,
        revenue: revenueSnapshots.totalRevenue,
    })
        .from(revenueSnapshots)
        .where(eq(revenueSnapshots.domainId, domainId))
        .orderBy(desc(revenueSnapshots.snapshotDate))
        .limit(90);

    const domainRecord = await db.select({ domain: domains.domain })
        .from(domains).where(eq(domains.id, domainId)).limit(1);

    // Aggregate to monthly
    const monthlyRevenue = new Map<string, number>();
    for (const s of snapshots) {
        const date = new Date(s.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyRevenue.set(key, (monthlyRevenue.get(key) || 0) + Number(s.revenue || 0));
    }

    const sortedMonths = Array.from(monthlyRevenue.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const points = sortedMonths.map((entry, i) => ({ x: i, y: entry[1] }));

    const { slope, intercept, r2 } = linearRegression(points);

    const currentMonthly = points.length > 0 ? points[points.length - 1].y : 0;
    const monthlyGrowthRate = currentMonthly > 0 ? slope / currentMonthly : 0;

    // Get monthly expenses
    const expenseData = await db.select({
        total: sql<number>`sum(${expenses.amount})::real`,
    })
        .from(expenses)
        .where(gte(expenses.expenseDate, ninetyDaysAgo));
    const monthlyExpenses = (expenseData[0]?.total || 0) / 3;

    // Generate projections
    const projections: RevenueProjection[] = [];
    const baseX = points.length;
    const now = new Date();

    for (let i = 1; i <= months; i++) {
        const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
        const projected = Math.max(0, slope * (baseX + i) + intercept);
        const confidence = Math.max(10, Math.min(90, r2 * 100 - i * 5));

        projections.push({
            month: monthStr,
            projectedRevenue: Math.round(projected * 100) / 100,
            projectedExpenses: Math.round(monthlyExpenses * 100) / 100,
            projectedProfit: Math.round((projected - monthlyExpenses) * 100) / 100,
            confidence: Math.round(confidence),
        });
    }

    return {
        domainId,
        domain: domainRecord[0]?.domain,
        projections,
        currentMonthlyRevenue: Math.round(currentMonthly * 100) / 100,
        currentMonthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        trendDirection: slope > 0.5 ? 'up' : slope < -0.5 ? 'down' : 'flat',
        monthlyGrowthRate: Math.round(monthlyGrowthRate * 10000) / 100,
    };
}

/**
 * Project portfolio-wide ROI over N months.
 */
export async function projectPortfolioROI(months: number = 12): Promise<{
    projections: RevenueProjection[];
    totalInvestment: number;
    projectedAnnualReturn: number;
    projectedROI: number;
}> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Get all snapshots across all domains
    const snapshots = await db.select({
        date: revenueSnapshots.snapshotDate,
        revenue: revenueSnapshots.totalRevenue,
    })
        .from(revenueSnapshots)
        .where(gte(revenueSnapshots.snapshotDate, ninetyDaysAgo))
        .orderBy(revenueSnapshots.snapshotDate);

    // Aggregate to monthly
    const monthlyRevenue = new Map<string, number>();
    for (const s of snapshots) {
        const date = new Date(s.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyRevenue.set(key, (monthlyRevenue.get(key) || 0) + Number(s.revenue || 0));
    }

    const sortedMonths = Array.from(monthlyRevenue.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const points = sortedMonths.map((entry, i) => ({ x: i, y: entry[1] }));
    const { slope, intercept, r2 } = linearRegression(points);

    // Get total investment
    const allDomains = await db.select({ purchasePrice: domains.purchasePrice }).from(domains);
    const totalInvestment = allDomains.reduce((sum, d) => sum + Number(d.purchasePrice || 0), 0);

    // Get monthly expenses
    const expenseData = await db.select({
        total: sql<number>`sum(${expenses.amount})::real`,
    }).from(expenses).where(gte(expenses.expenseDate, ninetyDaysAgo));
    const monthlyExpenses = (expenseData[0]?.total || 0) / 3;

    const projections: RevenueProjection[] = [];
    const baseX = points.length;
    const now = new Date();
    let totalProjectedProfit = 0;

    for (let i = 1; i <= months; i++) {
        const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;
        const projected = Math.max(0, slope * (baseX + i) + intercept);
        const profit = projected - monthlyExpenses;
        totalProjectedProfit += profit;
        const confidence = Math.max(10, Math.min(90, r2 * 100 - i * 3));

        projections.push({
            month: monthStr,
            projectedRevenue: Math.round(projected * 100) / 100,
            projectedExpenses: Math.round(monthlyExpenses * 100) / 100,
            projectedProfit: Math.round(profit * 100) / 100,
            confidence: Math.round(confidence),
        });
    }

    const projectedAnnualReturn = totalProjectedProfit * (12 / months);
    const projectedROI = totalInvestment > 0 ? (projectedAnnualReturn / totalInvestment) * 100 : 0;

    return {
        projections,
        totalInvestment: Math.round(totalInvestment * 100) / 100,
        projectedAnnualReturn: Math.round(projectedAnnualReturn * 100) / 100,
        projectedROI: Math.round(projectedROI * 10) / 10,
    };
}

/**
 * Estimate when a domain will break even on its purchase price.
 */
export async function estimateBreakevenDate(domainId: string): Promise<{
    breakevenDate: string | null;
    monthsToBreakeven: number | null;
    totalRevenueSoFar: number;
    purchasePrice: number;
    remainingToBreakeven: number;
}> {
    const domainRecord = await db.select({
        purchasePrice: domains.purchasePrice,
    }).from(domains).where(eq(domains.id, domainId)).limit(1);

    const purchasePrice = Number(domainRecord[0]?.purchasePrice || 0);

    const totalRevData = await db.select({
        total: sql<number>`sum(${revenueSnapshots.totalRevenue})::real`,
    }).from(revenueSnapshots).where(eq(revenueSnapshots.domainId, domainId));

    const totalRevenueSoFar = totalRevData[0]?.total || 0;
    const remaining = purchasePrice - totalRevenueSoFar;

    if (remaining <= 0) {
        return {
            breakevenDate: 'Already profitable',
            monthsToBreakeven: 0,
            totalRevenueSoFar,
            purchasePrice,
            remainingToBreakeven: 0,
        };
    }

    // Get recent monthly rate
    const forecast = await projectRevenue(domainId, 1);
    const monthlyRate = forecast.currentMonthlyRevenue;

    if (monthlyRate <= 0) {
        return {
            breakevenDate: null,
            monthsToBreakeven: null,
            totalRevenueSoFar,
            purchasePrice,
            remainingToBreakeven: remaining,
        };
    }

    const monthsToBreakeven = Math.ceil(remaining / monthlyRate);
    const breakevenDate = new Date();
    breakevenDate.setMonth(breakevenDate.getMonth() + monthsToBreakeven);

    return {
        breakevenDate: breakevenDate.toISOString().slice(0, 10),
        monthsToBreakeven,
        totalRevenueSoFar,
        purchasePrice,
        remainingToBreakeven: Math.round(remaining * 100) / 100,
    };
}
