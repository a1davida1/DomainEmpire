import { NextRequest, NextResponse } from 'next/server';
import { db, domains, articles, contentQueue } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { eq, and, count } from 'drizzle-orm';

interface PageProps {
    params: Promise<{ id: string }>;
}

// GET /api/domains/[id]/health - Domain health check
export async function GET(request: NextRequest, { params }: PageProps) {
    const authError = await requireAuth(request);
    if (authError) return authError;

    const { id } = await params;

    try {
        // Get domain
        const domainResult = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
        if (domainResult.length === 0) {
            return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
        }
        const domain = domainResult[0];

        // Article stats
        const articleStats = await db
            .select({
                status: articles.status,
                count: count(),
            })
            .from(articles)
            .where(eq(articles.domainId, id))
            .groupBy(articles.status);

        // Content quality checks
        const qualityChecks = {
            hasNiche: !!domain.niche,
            hasContent: articleStats.some(s => s.status === 'published' && s.count > 0),
            isDeployed: domain.isDeployed || false,
            hasValuation: !!(domain.estimatedFlipValueLow || domain.estimatedFlipValueHigh),
            hasGithubRepo: !!domain.githubRepo,
            renewalSet: !!domain.renewalDate,
        };

        // Pending jobs
        const pendingJobs = await db
            .select({ count: count() })
            .from(contentQueue)
            .where(and(
                eq(contentQueue.domainId, id),
                eq(contentQueue.status, 'pending')
            ));

        // Calculate health score
        const checks = Object.values(qualityChecks);
        const passedChecks = checks.filter(Boolean).length;
        const healthScore = Math.round((passedChecks / checks.length) * 100);

        // Determine health status
        let status: 'healthy' | 'warning' | 'critical';
        if (healthScore >= 80) status = 'healthy';
        else if (healthScore >= 50) status = 'warning';
        else status = 'critical';

        // Recommendations
        const recommendations: string[] = [];
        if (!qualityChecks.hasNiche) recommendations.push('Add a niche classification');
        if (!qualityChecks.hasContent) recommendations.push('Publish at least one article');
        if (!qualityChecks.isDeployed) recommendations.push('Deploy the site');
        if (!qualityChecks.hasValuation) recommendations.push('Set estimated flip value');
        if (!qualityChecks.hasGithubRepo) recommendations.push('Link a GitHub repository');
        if (!qualityChecks.renewalSet) recommendations.push('Set renewal date reminder');

        return NextResponse.json({
            domain: domain.domain,
            healthScore,
            status,
            checks: qualityChecks,
            articles: Object.fromEntries(articleStats.map(s => [s.status, s.count])),
            pendingJobs: pendingJobs[0]?.count || 0,
            recommendations,
        });
    } catch (error) {
        console.error('Domain health check failed:', error);
        return NextResponse.json({ error: 'Failed to check domain health' }, { status: 500 });
    }
}
