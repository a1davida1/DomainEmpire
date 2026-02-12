/**
 * Financial forecasting API.
 * Returns revenue projections for a domain or the entire portfolio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { projectRevenue, projectPortfolioROI, estimateBreakevenDate } from '@/lib/analytics/forecasting';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    try {
        const domainId = request.nextUrl.searchParams.get('domainId');
        const monthsParam = parseInt(request.nextUrl.searchParams.get('months') || '6', 10);
        const months = isNaN(monthsParam) ? 6 : Math.min(24, Math.max(1, monthsParam));

        if (domainId) {
            const [forecast, breakeven] = await Promise.all([
                projectRevenue(domainId, months),
                estimateBreakevenDate(domainId),
            ]);
            return NextResponse.json({ forecast, breakeven });
        }

        const portfolio = await projectPortfolioROI(months);
        return NextResponse.json({ portfolio });
    } catch (error) {
        console.error('Forecast error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
