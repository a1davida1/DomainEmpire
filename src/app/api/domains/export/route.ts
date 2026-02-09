import { NextRequest, NextResponse } from 'next/server';
import { db, domains } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq } from 'drizzle-orm';

// GET /api/domains/export - Export domains to CSV
export async function GET(request: NextRequest) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const tier = searchParams.get('tier');
    const format = searchParams.get('format') || 'csv';

    try {
        let query = db.select().from(domains);

        if (status) {
            query = query.where(eq(domains.status, status as 'parked' | 'active' | 'redirect' | 'forsale' | 'defensive')) as typeof query;
        }
        if (tier) {
            query = query.where(eq(domains.tier, Number(tier))) as typeof query;
        }

        const results = await query;

        if (format === 'json') {
            return NextResponse.json({ domains: results, count: results.length });
        }

        // Generate CSV
        const headers = [
            'domain', 'tld', 'status', 'tier', 'niche', 'subNiche',
            'purchasePrice', 'purchaseDate', 'renewalPrice', 'renewalDate',
            'isDeployed', 'githubRepo', 'cloudflareProject',
            'estimatedFlipValueLow', 'estimatedFlipValueHigh',
            'createdAt'
        ];

        const csvRows = [headers.join(',')];
        for (const d of results) {
            const row = [
                d.domain,
                d.tld,
                d.status,
                d.tier || '',
                d.niche || '',
                d.subNiche || '',
                d.purchasePrice || '',
                d.purchaseDate?.toISOString().split('T')[0] || '',
                d.renewalPrice || '',
                d.renewalDate?.toISOString().split('T')[0] || '',
                d.isDeployed ? 'true' : 'false',
                d.githubRepo || '',
                d.cloudflareProject || '',
                d.estimatedFlipValueLow || '',
                d.estimatedFlipValueHigh || '',
                d.createdAt?.toISOString() || '',
            ];
            csvRows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        }

        const csv = csvRows.join('\n');

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="domains-export-${new Date().toISOString().split('T')[0]}.csv"`,
            },
        });
    } catch (error) {
        console.error('Export domains failed:', error);
        return NextResponse.json({ error: 'Failed to export domains' }, { status: 500 });
    }
}
